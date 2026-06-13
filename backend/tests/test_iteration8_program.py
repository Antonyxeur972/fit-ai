"""
Iteration 8 — TRAINING phase 2 bis (Program + AI exercise).
Covers:
  - POST /api/program/create (weeks clamp, frequency, split validation, focus sequences,
    cycle pattern, deactivation of prior active program)
  - GET  /api/program/current (auto-compute current_week, null when none)
  - PUT  /api/program/{id}/week/{w}/day/{d} (update day, 404s)
  - DELETE /api/program/{id} (soft-deactivate)
  - POST /api/exercises/ai-add (validation, persistence, auth)
  - GET  /api/exercises/user-added

Does NOT touch nutrition endpoints.
"""
import pytest
import requests

from conftest import API, TEST_USER_ID


# ---- Common ----
@pytest.fixture(scope="module")
def auth_headers_m():
    return {
        "Authorization": "Bearer test_session_token_abc",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module", autouse=True)
def clean_programs_before(mongo_db):
    """Wipe any prior programs/user_exercises for clean run."""
    mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
    mongo_db.user_exercises.delete_many({"user_id": TEST_USER_ID})
    yield
    mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
    mongo_db.user_exercises.delete_many({"user_id": TEST_USER_ID})


def _create_program(headers, **overrides):
    body = {
        "weeks": 8,
        "frequency": 5,
        "split": "ppl",
        "goal_label": "Hypertrophie",
    }
    body.update(overrides)
    r = requests.post(f"{API}/program/create", json=body, headers=headers)
    return r


# ============================================================
# PROGRAM CREATE
# ============================================================
class TestProgramCreate:
    def test_create_default_ppl_5(self, auth_headers_m):
        r = _create_program(auth_headers_m)
        assert r.status_code == 200, r.text
        p = r.json()
        # Shape
        for k in (
            "id", "name", "goal_label", "weeks_total", "frequency", "split",
            "cycle_pattern", "started_at", "active", "current_week", "weeks",
        ):
            assert k in p, f"missing field {k}"
        assert p["weeks_total"] == 8
        assert p["frequency"] == 5
        assert p["split"] == "ppl"
        assert p["active"] is True
        assert p["current_week"] == 1
        assert p["goal_label"] == "Hypertrophie"
        assert len(p["weeks"]) == 8
        # Each week structure
        w1 = p["weeks"][0]
        assert w1["week_index"] == 1
        assert "session_type" in w1
        assert "days" in w1 and len(w1["days"]) == 5
        for d in w1["days"]:
            assert "day_index" in d
            assert "focus" in d
            assert isinstance(d["exercises"], list)

    def test_ppl_3_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=3, split="ppl", weeks=4)
        assert r.status_code == 200, r.text
        p = r.json()
        focuses = [d["focus"] for d in p["weeks"][0]["days"]]
        assert focuses == ["Push", "Pull", "Legs"]

    def test_ppl_5_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=5, split="ppl", weeks=4)
        assert r.status_code == 200, r.text
        p = r.json()
        focuses = [d["focus"] for d in p["weeks"][0]["days"]]
        assert focuses == ["Push", "Pull", "Legs", "Push", "Pull"]

    def test_ppl_7_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=7, split="ppl", weeks=4)
        assert r.status_code == 200, r.text
        p = r.json()
        focuses = [d["focus"] for d in p["weeks"][0]["days"]]
        assert focuses == ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Repos actif"]

    def test_fullbody_3_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=3, split="fullbody", weeks=4)
        assert r.status_code == 200, r.text
        p = r.json()
        focuses = [d["focus"] for d in p["weeks"][0]["days"]]
        assert focuses == ["FullBody"] * 3

    def test_fullbody_5_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=5, split="fullbody", weeks=4)
        assert r.status_code == 200
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert focuses == ["FullBody"] * 5

    def test_fullbody_7_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=7, split="fullbody", weeks=4)
        assert r.status_code == 200
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        # Spec: "mostly FullBody focuses". Implementation: 6 FullBody + 1 Cardio
        assert focuses.count("FullBody") >= 5

    def test_split_5_focus_sequence(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=5, split="split", weeks=4)
        assert r.status_code == 200, r.text
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert focuses == ["Pectoraux", "Dos", "Épaules", "Bras", "Jambes"]

    def test_split_7_includes_core_and_cardio(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=7, split="split", weeks=4)
        assert r.status_code == 200, r.text
        focuses = [d["focus"] for d in r.json()["weeks"][0]["days"]]
        assert "Core" in focuses
        assert "Cardio" in focuses

    def test_weeks_clamp_lower(self, auth_headers_m):
        r = _create_program(auth_headers_m, weeks=1)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["weeks_total"] == 4, "weeks < 4 should clamp to 4"

    def test_weeks_clamp_upper(self, auth_headers_m):
        r = _create_program(auth_headers_m, weeks=99)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["weeks_total"] == 24, "weeks > 24 should clamp to 24"

    def test_invalid_split_falls_back_to_ppl(self, auth_headers_m):
        r = _create_program(auth_headers_m, split="garbage")
        assert r.status_code == 200, r.text
        assert r.json()["split"] == "ppl"

    def test_invalid_frequency_falls_back_to_3(self, auth_headers_m):
        r = _create_program(auth_headers_m, frequency=4)
        assert r.status_code == 200, r.text
        assert r.json()["frequency"] == 3

    def test_default_cycle_pattern_alternates(self, auth_headers_m):
        """Week 1 volume, 2 volume, 3 force, 4 puissance, 5 volume (repeat)."""
        r = _create_program(auth_headers_m, weeks=8, frequency=5, split="ppl")
        assert r.status_code == 200, r.text
        p = r.json()
        types = [w["session_type"] for w in p["weeks"]]
        expected = ["volume", "volume", "force", "puissance"] * 2
        assert types == expected, f"Expected {expected} got {types}"

    def test_deactivates_prior_program(self, auth_headers_m, mongo_db):
        # Create first
        r1 = _create_program(auth_headers_m, weeks=4)
        assert r1.status_code == 200
        first_id = r1.json()["id"]
        # Create second
        r2 = _create_program(auth_headers_m, weeks=8)
        assert r2.status_code == 200
        # First must now be inactive
        first = mongo_db.programs.find_one({"id": first_id})
        assert first["active"] is False
        # Only the latest is active
        active_count = mongo_db.programs.count_documents(
            {"user_id": TEST_USER_ID, "active": True}
        )
        assert active_count == 1

    def test_requires_auth(self):
        r = requests.post(
            f"{API}/program/create",
            json={"weeks": 8, "frequency": 5, "split": "ppl"},
        )
        assert r.status_code == 401


# ============================================================
# PROGRAM CURRENT
# ============================================================
class TestProgramCurrent:
    def test_get_current_after_create(self, auth_headers_m):
        _create_program(auth_headers_m, weeks=8, frequency=5, split="ppl")
        r = requests.get(f"{API}/program/current", headers=auth_headers_m)
        assert r.status_code == 200
        body = r.json()
        assert "program" in body
        p = body["program"]
        assert p is not None
        assert p["active"] is True
        assert p["weeks_total"] == 8
        assert isinstance(p["current_week"], int)
        assert 1 <= p["current_week"] <= 8

    def test_returns_null_when_none(self, auth_headers_m, mongo_db):
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        r = requests.get(f"{API}/program/current", headers=auth_headers_m)
        assert r.status_code == 200
        assert r.json() == {"program": None}

    def test_offset_naive_started_at_does_not_crash(
        self, auth_headers_m, mongo_db
    ):
        from datetime import datetime as _dt
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        # Insert program with offset-naive started_at
        mongo_db.programs.insert_one({
            "id": "prog_naive_test",
            "user_id": TEST_USER_ID,
            "name": "naive",
            "goal_label": "Hypertrophie",
            "weeks_total": 8,
            "frequency": 5,
            "split": "ppl",
            "cycle_pattern": ["volume", "volume", "force", "puissance"],
            "started_at": _dt.utcnow(),  # naive
            "active": True,
            "current_week": 1,
            "weeks": [],
            "created_at": _dt.utcnow(),
        })
        r = requests.get(f"{API}/program/current", headers=auth_headers_m)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["program"] is not None

    def test_requires_auth(self):
        r = requests.get(f"{API}/program/current")
        assert r.status_code == 401


# ============================================================
# PROGRAM UPDATE DAY
# ============================================================
class TestProgramUpdateDay:
    @pytest.fixture
    def program_id(self, auth_headers_m, mongo_db):
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        r = _create_program(auth_headers_m, weeks=4, frequency=5, split="ppl")
        assert r.status_code == 200
        return r.json()["id"]

    def test_update_day_success(self, auth_headers_m, program_id):
        body = {
            "focus": "Push (custom)",
            "exercises": [
                {"name": "Bench Press", "sets": 4, "reps": "8", "rest_s": 90},
                {"name": "Incline DB", "sets": 3, "reps": "10", "rest_s": 75},
            ],
        }
        r = requests.put(
            f"{API}/program/{program_id}/week/1/day/0",
            json=body,
            headers=auth_headers_m,
        )
        assert r.status_code == 200, r.text
        day = r.json()
        assert day["focus"] == "Push (custom)"
        assert len(day["exercises"]) == 2
        assert day["exercises"][0]["name"] == "Bench Press"
        assert day["exercises"][0]["sets"] == 4

        # Verify persistence via GET /program/current
        cur = requests.get(f"{API}/program/current", headers=auth_headers_m)
        assert cur.status_code == 200
        p = cur.json()["program"]
        w1 = next(w for w in p["weeks"] if w["week_index"] == 1)
        d0 = next(d for d in w1["days"] if d["day_index"] == 0)
        assert d0["focus"] == "Push (custom)"
        assert len(d0["exercises"]) == 2

    def test_update_day_404_program(self, auth_headers_m):
        r = requests.put(
            f"{API}/program/prog_nonexistent/week/1/day/0",
            json={"exercises": []},
            headers=auth_headers_m,
        )
        assert r.status_code == 404

    def test_update_day_404_week(self, auth_headers_m, program_id):
        r = requests.put(
            f"{API}/program/{program_id}/week/99/day/0",
            json={"exercises": []},
            headers=auth_headers_m,
        )
        assert r.status_code == 404

    def test_update_day_404_day(self, auth_headers_m, program_id):
        r = requests.put(
            f"{API}/program/{program_id}/week/1/day/99",
            json={"exercises": []},
            headers=auth_headers_m,
        )
        assert r.status_code == 404

    def test_update_day_requires_auth(self, program_id):
        r = requests.put(
            f"{API}/program/{program_id}/week/1/day/0",
            json={"exercises": []},
        )
        assert r.status_code == 401


# ============================================================
# PROGRAM DELETE (soft deactivate)
# ============================================================
class TestProgramDelete:
    def test_delete_deactivates(self, auth_headers_m, mongo_db):
        mongo_db.programs.delete_many({"user_id": TEST_USER_ID})
        r = _create_program(auth_headers_m, weeks=4)
        pid = r.json()["id"]

        d = requests.delete(f"{API}/program/{pid}", headers=auth_headers_m)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # GET current returns null
        cur = requests.get(f"{API}/program/current", headers=auth_headers_m)
        assert cur.status_code == 200
        assert cur.json() == {"program": None}

        # DB record exists but active=False
        rec = mongo_db.programs.find_one({"id": pid})
        assert rec is not None
        assert rec["active"] is False

    def test_delete_404_when_missing(self, auth_headers_m):
        r = requests.delete(
            f"{API}/program/prog_nope_xxx", headers=auth_headers_m
        )
        assert r.status_code == 404

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/program/whatever")
        assert r.status_code == 401


# ============================================================
# AI EXERCISE ADD
# ============================================================
class TestAiExerciseAdd:
    def test_add_via_ai_success(self, auth_headers_m, mongo_db):
        r = requests.post(
            f"{API}/exercises/ai-add",
            json={"description": "farmer carry haltères"},
            headers=auth_headers_m,
        )
        assert r.status_code == 200, r.text
        ex = r.json()
        for k in (
            "id", "name", "category", "equipment", "muscles_targeted",
            "recommended_reps", "recommended_rest_s", "source",
        ):
            assert k in ex, f"missing {k}"
        assert ex["source"] == "ai"
        assert ex["name"].strip() != ""
        assert isinstance(ex["muscles_targeted"], list)
        assert isinstance(ex["recommended_rest_s"], int)

        # Persisted
        doc = mongo_db.user_exercises.find_one({"id": ex["id"]})
        assert doc is not None
        assert doc["user_id"] == TEST_USER_ID

    def test_add_via_ai_empty_description_400(self, auth_headers_m):
        r = requests.post(
            f"{API}/exercises/ai-add",
            json={"description": ""},
            headers=auth_headers_m,
        )
        assert r.status_code == 400

    def test_add_via_ai_too_short_400(self, auth_headers_m):
        r = requests.post(
            f"{API}/exercises/ai-add",
            json={"description": "ab"},
            headers=auth_headers_m,
        )
        assert r.status_code == 400

    def test_add_via_ai_unrecognized_422(self, auth_headers_m):
        r = requests.post(
            f"{API}/exercises/ai-add",
            json={"description": "zzzqqqxxx jabberwocky bandersnatch nonsense"},
            headers=auth_headers_m,
        )
        # Claude usually returns empty name -> 422. We allow 200 only if model is overzealous.
        assert r.status_code in (200, 422), r.text

    def test_add_via_ai_requires_auth(self):
        r = requests.post(
            f"{API}/exercises/ai-add",
            json={"description": "farmer carry haltères"},
        )
        assert r.status_code == 401


# ============================================================
# GET /api/exercises/user-added
# ============================================================
class TestUserAddedExercises:
    def test_list_user_added(self, auth_headers_m, mongo_db):
        # Insert two via direct DB to control state
        mongo_db.user_exercises.delete_many({"user_id": TEST_USER_ID})
        from datetime import datetime, timezone
        for i in range(2):
            mongo_db.user_exercises.insert_one({
                "id": f"ai_exseed_{i}",
                "user_id": TEST_USER_ID,
                "name": f"TEST_Exercise_{i}",
                "category": "Bras",
                "equipment": "Haltères",
                "muscles_targeted": ["biceps"],
                "recommended_reps": "10",
                "recommended_rest_s": 60,
                "source": "ai",
                "created_at": datetime.now(timezone.utc),
            })
        r = requests.get(f"{API}/exercises/user-added", headers=auth_headers_m)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert isinstance(body["items"], list)
        names = [i["name"] for i in body["items"]]
        assert "TEST_Exercise_0" in names
        assert "TEST_Exercise_1" in names
        # No _id leaked
        for it in body["items"]:
            assert "_id" not in it

    def test_list_user_added_requires_auth(self):
        r = requests.get(f"{API}/exercises/user-added")
        assert r.status_code == 401
