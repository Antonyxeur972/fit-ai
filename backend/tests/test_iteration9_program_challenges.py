"""
Iteration 9 backend tests - Program (block_weeks, home split, goal, accelerate,
travel-mode, resume) + Challenges (start, blueprints, active, check-day, abandon, get).

Reuses conftest.py: seed_user (user_test_001), API base URL, auth_headers.
"""
import math
from datetime import datetime, timezone, timedelta

import pytest
import requests
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from conftest import API, TEST_USER_ID, TEST_TOKEN  # type: ignore


HDRS = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# --------- Helpers / Fixtures ---------

@pytest.fixture(autouse=True, scope="module")
def _clean_module(mongo_db):
    """Clean programs and challenges for the test user before & after this module."""
    mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
    mongo_db.challenges.delete_many({"user_id": TEST_USER_ID})
    mongo_db.workouts.delete_many({"user_id": TEST_USER_ID, "source": "challenge"})
    # Make sure profile exists with activity_level=moderate (level 2)
    mongo_db.profiles.update_one(
        {"user_id": TEST_USER_ID},
        {"$set": {
            "user_id": TEST_USER_ID,
            "age": 30, "gender": "male", "height_cm": 178, "weight_kg": 75,
            "goal": "muscle", "activity_level": "moderate",
        }},
        upsert=True,
    )
    yield
    mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
    mongo_db.challenges.delete_many({"user_id": TEST_USER_ID})
    mongo_db.workouts.delete_many({"user_id": TEST_USER_ID, "source": "challenge"})


def _create_program(payload):
    r = requests.post(f"{API}/program/create", json=payload, headers=HDRS, timeout=20)
    return r


# --------- 1. POST /api/program/create — block_weeks, goal, home, is_recommended ---------

class TestProgramCreate:
    def test_block_weeks_sequence_order(self):
        """block_weeks={volume:2, puissance:1, force:2} → weeks pattern [v,v,p,f,f,v,v,...]"""
        r = _create_program({
            "weeks": 8, "frequency": 3, "split": "ppl",
            "goal_label": "Hypertrophie", "goal": "muscle",
            "block_weeks": {"volume": 2, "puissance": 1, "force": 2},
        })
        assert r.status_code == 200, r.text
        prog = r.json()
        assert prog["block_weeks"] == {"volume": 2, "puissance": 1, "force": 2}
        assert prog["goal"] == "muscle"
        # first 7 weeks pattern (cycle len = 5)
        types = [w["session_type"] for w in prog["weeks"]]
        # Spec: ORDER MUST be Volume → Puissance → Force (not old V/V/F/P)
        expected = ["volume", "volume", "puissance", "force", "force",
                    "volume", "volume", "puissance"][:8]
        assert types == expected, f"Got {types}"

    def test_block_weeks_clamp_1_to_3(self):
        r = _create_program({
            "weeks": 6, "frequency": 3, "split": "ppl",
            "block_weeks": {"volume": 0, "puissance": 10, "force": -5},
        })
        assert r.status_code == 200
        types = [w["session_type"] for w in r.json()["weeks"]]
        # 0→1, 10→3, -5→1 ; pattern = [v, p,p,p, f]  (5 weeks)
        assert types[:5] == ["volume", "puissance", "puissance", "puissance", "force"]

    def test_split_home_uses_home_focuses(self):
        r = _create_program({
            "weeks": 4, "frequency": 3, "split": "home",
            "goal": "muscle",
            "block_weeks": {"volume": 1, "puissance": 1, "force": 1},
        })
        assert r.status_code == 200
        prog = r.json()
        assert prog["split"] == "home"
        focuses = [d["focus"] for d in prog["weeks"][0]["days"]]
        assert focuses == ["HomePush", "HomePull", "HomeLegs"]
        # Exercises must look bodyweight
        names = [e["name"] for d in prog["weeks"][0]["days"] for e in d["exercises"]]
        assert any("Pompes" in n for n in names)

    def test_split_home_freq5_includes_core_fullbody(self):
        r = _create_program({"weeks": 4, "frequency": 5, "split": "home"})
        assert r.status_code == 200
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert focuses == ["HomePush", "HomePull", "HomeLegs", "HomeCore", "HomeFullBody"]

    def test_split_home_freq7_ends_with_cardio(self):
        r = _create_program({"weeks": 4, "frequency": 7, "split": "home"})
        assert r.status_code == 200
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert focuses[-1] == "Cardio"
        assert "HomeCore" in focuses and "HomeFullBody" in focuses

    def test_is_recommended_flag_present(self):
        r = _create_program({
            "weeks": 4, "frequency": 3, "split": "ppl",
            "goal": "muscle",
        })
        assert r.status_code == 200
        ex_list = [e for d in r.json()["weeks"][0]["days"] for e in d["exercises"]]
        assert all("is_recommended" in e for e in ex_list)
        # At least one recommended for goal=muscle (e.g. Squat barre arrière is in PPL Legs)
        assert any(e["is_recommended"] is True for e in ex_list), \
            f"No recommended ex found: {[e['name'] for e in ex_list]}"

    def test_goal_field_persisted(self):
        r = _create_program({
            "weeks": 4, "frequency": 3, "split": "ppl",
            "goal": "strength",
        })
        assert r.status_code == 200
        assert r.json()["goal"] == "strength"


# --------- 2. POST /api/program/{id}/accelerate ---------

class TestAccelerate:
    @pytest.fixture
    def program_id(self):
        r = _create_program({
            "weeks": 6, "frequency": 3, "split": "ppl", "goal": "muscle",
            "block_weeks": {"volume": 1, "puissance": 1, "force": 1},
        })
        assert r.status_code == 200
        return r.json()["id"]

    def test_accelerate_bumps_sets_from_current_week(self, program_id, mongo_db):
        # Force current_week to 3
        mongo_db.programs.update_one({"id": program_id}, {"$set": {"current_week": 3}})
        # Snapshot sets at week 1 (untouched) & week 3
        prog_before = mongo_db.programs.find_one({"id": program_id})
        sets_w1_before = prog_before["weeks"][0]["days"][0]["exercises"][0]["sets"]
        sets_w3_before = prog_before["weeks"][2]["days"][0]["exercises"][0]["sets"]

        r = requests.post(f"{API}/program/{program_id}/accelerate", headers=HDRS, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["accelerated_count"] == 1
        assert body["exercises_bumped"] > 0

        prog_after = mongo_db.programs.find_one({"id": program_id})
        sets_w1_after = prog_after["weeks"][0]["days"][0]["exercises"][0]["sets"]
        sets_w3_after = prog_after["weeks"][2]["days"][0]["exercises"][0]["sets"]
        assert sets_w1_after == sets_w1_before, "Week 1 (past) should be untouched"
        assert sets_w3_after == sets_w3_before + 1, "Current week should be bumped +1"

    def test_accelerate_caps_at_6(self, program_id, mongo_db):
        # Pre-set all exercises at sets=6
        prog = mongo_db.programs.find_one({"id": program_id})
        for w in prog["weeks"]:
            for d in w["days"]:
                for e in d["exercises"]:
                    e["sets"] = 6
        mongo_db.programs.update_one({"id": program_id}, {"$set": {"weeks": prog["weeks"]}})

        r = requests.post(f"{API}/program/{program_id}/accelerate", headers=HDRS, timeout=10)
        assert r.status_code == 200
        prog_after = mongo_db.programs.find_one({"id": program_id})
        all_sets = [e["sets"] for w in prog_after["weeks"] for d in w["days"] for e in d["exercises"]]
        assert max(all_sets) == 6, "Sets capped at 6"

    def test_accelerate_404_unknown(self):
        r = requests.post(f"{API}/program/prog_nope_x/accelerate", headers=HDRS, timeout=10)
        assert r.status_code == 404


# --------- 3 & 4. travel-mode + resume ---------

class TestTravelMode:
    def test_travel_pauses_and_creates_home_program(self, mongo_db):
        # Create a base ppl program
        r = _create_program({"weeks": 8, "frequency": 5, "split": "ppl", "goal": "muscle"})
        assert r.status_code == 200
        base_id = r.json()["id"]

        r = requests.post(f"{API}/program/travel-mode", json={"days": 14}, headers=HDRS, timeout=10)
        assert r.status_code == 200, r.text
        travel = r.json()
        assert travel["is_travel"] is True
        assert travel["split"] == "home"
        assert travel["active"] is True
        assert travel["paused_program_id"] == base_id
        # Travel weeks = ceil(14/7) = 2
        assert travel["weeks_total"] == 2

        # Base program is paused
        base = mongo_db.programs.find_one({"id": base_id})
        assert base["active"] is False
        assert base["paused_for_travel"] is True

    def test_travel_clamps_days_3_90(self):
        r = requests.post(f"{API}/program/travel-mode", json={"days": 200}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        # 90 days → ceil(90/7) = 13 weeks
        assert r.json()["weeks_total"] == math.ceil(90 / 7)

        r = requests.post(f"{API}/program/travel-mode", json={"days": 1}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        # 3 days clamp → ceil(3/7) = 1
        assert r.json()["weeks_total"] == 1

    def test_travel_focus_sequences(self):
        # 3 days → 1 week travel, freq 3 home → [HomePush, HomePull, HomeLegs]
        r = requests.post(f"{API}/program/travel-mode", json={"days": 3}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert focuses == ["HomePush", "HomePull", "HomeLegs"]

    def test_resume_reactivates_paused(self, mongo_db):
        # Build clean state: base + travel
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        r = _create_program({"weeks": 4, "frequency": 3, "split": "ppl"})
        base_id = r.json()["id"]
        r2 = requests.post(f"{API}/program/travel-mode", json={"days": 7}, headers=HDRS, timeout=10)
        travel_id = r2.json()["id"]

        # Resume
        r3 = requests.post(f"{API}/program/resume", headers=HDRS, timeout=10)
        assert r3.status_code == 200, r3.text
        body = r3.json()
        assert body["ok"] is True
        assert body["resumed"] == base_id
        assert body["travel_ended"] == travel_id

        # Verify in DB
        base = mongo_db.programs.find_one({"id": base_id})
        travel = mongo_db.programs.find_one({"id": travel_id})
        assert base["active"] is True
        assert base.get("paused_for_travel") is False
        assert travel["active"] is False

    def test_resume_404_when_nothing(self, mongo_db):
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        r = requests.post(f"{API}/program/resume", headers=HDRS, timeout=10)
        assert r.status_code == 404


# --------- 5/6/7. Challenges: start + active + blueprints ---------

class TestChallengeStart:
    def test_blueprints_returns_three(self):
        r = requests.get(f"{API}/challenges/blueprints", headers=HDRS, timeout=10)
        assert r.status_code == 200
        items = r.json()["items"]
        types = {b["type"] for b in items}
        assert types == {"pushups", "abs", "squats"}
        for b in items:
            for k in ("type", "name", "muscle", "icon", "exercise"):
                assert k in b

    def test_start_returns_30_days(self, mongo_db):
        mongo_db.challenges.delete_many({"user_id": TEST_USER_ID})
        r = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=HDRS, timeout=10)
        assert r.status_code == 200, r.text
        ch = r.json()
        assert ch["type"] == "pushups"
        assert ch["active"] is True
        assert len(ch["days"]) == 30
        # ~8 rest days
        rest = [d for d in ch["days"] if d["is_rest"]]
        assert len(rest) == 8
        for d in ch["days"]:
            for k in ("day_index", "is_rest", "target_reps", "label", "completed"):
                assert k in d
        # Linear progression: day 30 target ~= 4x day 1
        non_rest = [d for d in ch["days"] if not d["is_rest"]]
        first_target = ch["days"][0]["target_reps"] if not ch["days"][0]["is_rest"] else non_rest[0]["target_reps"]
        last_target = ch["days"][29]["target_reps"] if not ch["days"][29]["is_rest"] else non_rest[-1]["target_reps"]
        # day 1 = base, day 30 = base*4 (allowing rounding tolerance)
        ratio = last_target / max(1, first_target)
        assert 3.5 <= ratio <= 4.5, f"Expected ~4x progression, got {ratio:.2f}"

    def test_level_from_profile_moderate_is_2(self, mongo_db):
        # moderate => level 2 → base 20 → day 0 = 20
        mongo_db.challenges.delete_many({"user_id": TEST_USER_ID, "type": "abs"})
        r = requests.post(f"{API}/challenges/start", json={"type": "abs"}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        ch = r.json()
        assert ch["level"] == 2
        assert ch["days"][0]["target_reps"] == 20

    def test_start_auto_deactivates_prior_same_type(self, mongo_db):
        # Start pushups twice
        r1 = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=HDRS, timeout=10)
        old_id = r1.json()["id"]
        r2 = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=HDRS, timeout=10)
        new_id = r2.json()["id"]
        assert old_id != new_id
        old = mongo_db.challenges.find_one({"id": old_id})
        assert old["active"] is False

    def test_active_returns_list(self):
        r = requests.get(f"{API}/challenges/active", headers=HDRS, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert all(c["active"] is True for c in body["items"])

    def test_start_bad_type(self):
        r = requests.post(f"{API}/challenges/start", json={"type": "burpees"}, headers=HDRS, timeout=10)
        assert r.status_code == 400


# --------- 8/9/10. check-day, abandon, get ---------

class TestChallengeCheckDay:
    @pytest.fixture
    def challenge_id(self, mongo_db):
        mongo_db.challenges.delete_many({"user_id": TEST_USER_ID})
        mongo_db.workouts.delete_many({"user_id": TEST_USER_ID, "source": "challenge"})
        r = requests.post(f"{API}/challenges/start", json={"type": "squats"}, headers=HDRS, timeout=10)
        return r.json()["id"]

    def test_check_first_day_updates_streak_and_workout(self, challenge_id, mongo_db):
        r = requests.post(
            f"{API}/challenges/{challenge_id}/check-day",
            json={"day_index": 0}, headers=HDRS, timeout=10,
        )
        assert r.status_code == 200, r.text
        ch = r.json()["challenge"]
        assert ch["days"][0]["completed"] is True
        assert ch["streak"] >= 1
        assert ch["completed_count"] == 1

        # Workout inserted with source=challenge
        wk = mongo_db.workouts.find_one({
            "user_id": TEST_USER_ID, "source": "challenge", "challenge_id": challenge_id,
        })
        assert wk is not None
        assert wk["completed"] is True

    def test_idempotent_when_already_done(self, challenge_id):
        requests.post(f"{API}/challenges/{challenge_id}/check-day",
                      json={"day_index": 0}, headers=HDRS, timeout=10)
        r = requests.post(f"{API}/challenges/{challenge_id}/check-day",
                          json={"day_index": 0}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body.get("already_done") is True

    def test_rest_day_cannot_be_checked(self, challenge_id, mongo_db):
        # squats rest_days: [3, 6, 10, 13, 17, 20, 24, 27]
        ch = mongo_db.challenges.find_one({"id": challenge_id})
        rest_day_idx = next(d["day_index"] for d in ch["days"] if d["is_rest"])
        # Count workouts before
        before = mongo_db.workouts.count_documents(
            {"user_id": TEST_USER_ID, "source": "challenge", "challenge_id": challenge_id}
        )
        r = requests.post(f"{API}/challenges/{challenge_id}/check-day",
                          json={"day_index": rest_day_idx}, headers=HDRS, timeout=10)
        # Should succeed but NOT insert a workout
        assert r.status_code == 200
        after = mongo_db.workouts.count_documents(
            {"user_id": TEST_USER_ID, "source": "challenge", "challenge_id": challenge_id}
        )
        assert after == before, "Rest day must not create a workout entry"

    def test_auto_completes_when_all_non_rest_done(self, challenge_id, mongo_db):
        # Mark all non-rest days as completed via DB then trigger last one via API
        ch = mongo_db.challenges.find_one({"id": challenge_id})
        non_rest = [d["day_index"] for d in ch["days"] if not d["is_rest"]]
        last = non_rest[-1]
        for idx in non_rest[:-1]:
            ch_days_idx = next(i for i, d in enumerate(ch["days"]) if d["day_index"] == idx)
            ch["days"][ch_days_idx]["completed"] = True
        mongo_db.challenges.update_one({"id": challenge_id}, {"$set": {"days": ch["days"]}})
        r = requests.post(f"{API}/challenges/{challenge_id}/check-day",
                          json={"day_index": last}, headers=HDRS, timeout=10)
        assert r.status_code == 200
        refreshed = mongo_db.challenges.find_one({"id": challenge_id})
        assert refreshed["active"] is False
        assert refreshed.get("completed_at") is not None

    def test_invalid_day_index(self, challenge_id):
        r = requests.post(f"{API}/challenges/{challenge_id}/check-day",
                          json={"day_index": 99}, headers=HDRS, timeout=10)
        assert r.status_code == 400


class TestChallengeAbandonAndGet:
    def test_get_returns_full(self, mongo_db):
        mongo_db.challenges.delete_many({"user_id": TEST_USER_ID, "type": "pushups"})
        r = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=HDRS, timeout=10)
        cid = r.json()["id"]
        g = requests.get(f"{API}/challenges/{cid}", headers=HDRS, timeout=10)
        assert g.status_code == 200
        assert g.json()["id"] == cid
        assert "_id" not in g.json()

    def test_abandon_soft_deactivates(self, mongo_db):
        r = requests.post(f"{API}/challenges/start", json={"type": "abs"}, headers=HDRS, timeout=10)
        cid = r.json()["id"]
        d = requests.delete(f"{API}/challenges/{cid}", headers=HDRS, timeout=10)
        assert d.status_code == 200
        ch = mongo_db.challenges.find_one({"id": cid})
        assert ch["active"] is False
        assert ch.get("abandoned_at") is not None

    def test_get_404(self):
        r = requests.get(f"{API}/challenges/nope_xxx", headers=HDRS, timeout=10)
        assert r.status_code == 404

    def test_delete_404(self):
        r = requests.delete(f"{API}/challenges/nope_xxx", headers=HDRS, timeout=10)
        assert r.status_code == 404


# --------- Auth ---------

class TestAuthGuard:
    def test_program_create_requires_auth(self):
        r = requests.post(f"{API}/program/create",
                          json={"weeks": 4, "frequency": 3, "split": "ppl"}, timeout=10)
        assert r.status_code == 401

    def test_challenge_start_requires_auth(self):
        r = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, timeout=10)
        assert r.status_code == 401
