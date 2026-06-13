"""Phase 5 (engagement) backend tests.

Coverage:
- Mascot PUT (valid animals, 400 invalid, persistence)
- Notif prefs PUT (cap 8, clamp hours/minutes, enabled respected, days sanitized)
- /auth/me exposes mascot + notif_prefs + silhouette + force_metrics
- Points summary: level/evolution/points_total/points_today/points_in_level/level_span/streak/recent
- Workout complete: +20, idempotent, PR detection vs previous est_1rm, streak_bonus
- Dashboard day: protein_target_hit, calories_on_track, combo_bonus
- Challenge check-day: +15 on non-rest days
- Transformations POST honors taken_at, falls back; DELETE still works
"""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# --- BASE_URL: prefer frontend public URL ---
BASE_URL = None
try:
    with open(Path(__file__).resolve().parents[2] / "frontend" / ".env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
except Exception:
    pass
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")

API = f"{BASE_URL}/api"

TEST_USER_ID = "user_test_001"
TEST_TOKEN = "test_session_token_abc"
AUTH = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# --- direct Mongo helpers (Phase 5 needs seed control on points_events, workouts, exercise_perf) ---
@pytest.fixture(scope="module")
def db():
    client = MongoClient(os.environ["MONGO_URL"])
    yield client[os.environ["DB_NAME"]]
    client.close()


def today_str():
    return datetime.now(timezone.utc).date().isoformat()


def yesterday_str():
    return (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


@pytest.fixture(autouse=True)
def _clean_engagement_collections(db):
    """Wipe Phase-5 mutable state before every test for determinism."""
    db.points_events.delete_many({"user_id": TEST_USER_ID})
    db.workouts.delete_many({"user_id": TEST_USER_ID})
    db.exercise_perf.delete_many({"user_id": TEST_USER_ID})
    db.challenges.delete_many({"user_id": TEST_USER_ID})
    db.transformations.delete_many({"user_id": TEST_USER_ID})
    db.meals.delete_many({"user_id": TEST_USER_ID})
    db.activity.delete_many({"user_id": TEST_USER_ID})
    # Reset engagement fields on user
    db.users.update_one(
        {"user_id": TEST_USER_ID},
        {"$unset": {"mascot": "", "notif_prefs": "", "silhouette": "", "force_metrics": ""}},
    )
    yield


# ============================================================
# 1. MASCOT
# ============================================================
class TestMascot:
    def test_put_mascot_valid_all_five(self, db):
        for animal in ["lion", "tigre", "loup", "ours", "aigle"]:
            r = requests.put(f"{API}/users/me/mascot", json={"animal": animal}, headers=AUTH)
            assert r.status_code == 200, f"{animal}: {r.text}"
            assert r.json()["mascot"]["animal"] == animal
        # Persistence
        u = db.users.find_one({"user_id": TEST_USER_ID})
        assert u["mascot"]["animal"] == "aigle"
        assert "chosen_at" in u["mascot"]

    def test_put_mascot_invalid_400(self):
        r = requests.put(f"{API}/users/me/mascot", json={"animal": "dragon"}, headers=AUTH)
        assert r.status_code == 400

    def test_put_mascot_case_insensitive(self, db):
        r = requests.put(f"{API}/users/me/mascot", json={"animal": "LION"}, headers=AUTH)
        assert r.status_code == 200
        assert db.users.find_one({"user_id": TEST_USER_ID})["mascot"]["animal"] == "lion"

    def test_put_mascot_unauth(self):
        r = requests.put(f"{API}/users/me/mascot", json={"animal": "lion"})
        assert r.status_code in (401, 403)


# ============================================================
# 2. NOTIF PREFS
# ============================================================
class TestNotifPrefs:
    def test_caps_to_8_reminders(self, db):
        reminders = [{"kind": "workout", "hour": 19, "minute": 0, "enabled": True} for _ in range(12)]
        r = requests.put(f"{API}/users/me/notif-prefs", json={"reminders": reminders}, headers=AUTH)
        assert r.status_code == 200, r.text
        out = r.json()["notif_prefs"]["reminders"]
        assert len(out) == 8
        # Persistence
        u = db.users.find_one({"user_id": TEST_USER_ID})
        assert len(u["notif_prefs"]["reminders"]) == 8

    def test_clamps_hour_minute(self):
        reminders = [
            {"kind": "workout", "hour": 99, "minute": -5, "enabled": True},
            {"kind": "protein", "hour": -3, "minute": 200, "enabled": True},
        ]
        r = requests.put(f"{API}/users/me/notif-prefs", json={"reminders": reminders}, headers=AUTH)
        assert r.status_code == 200, r.text
        out = r.json()["notif_prefs"]["reminders"]
        assert out[0]["hour"] == 23 and out[0]["minute"] == 0
        assert out[1]["hour"] == 0 and out[1]["minute"] == 59

    def test_enabled_false_respected(self):
        reminders = [{"kind": "workout", "hour": 8, "minute": 0, "enabled": False}]
        r = requests.put(f"{API}/users/me/notif-prefs", json={"reminders": reminders}, headers=AUTH)
        assert r.status_code == 200
        assert r.json()["notif_prefs"]["reminders"][0]["enabled"] is False

    def test_days_of_week_sanitized(self):
        reminders = [
            {"kind": "workout", "hour": 10, "minute": 0, "enabled": True,
             "days_of_week": [0, 0, 1, 9, -1, 6, 3, 3]}
        ]
        r = requests.put(f"{API}/users/me/notif-prefs", json={"reminders": reminders}, headers=AUTH)
        assert r.status_code == 200
        days = r.json()["notif_prefs"]["reminders"][0]["days_of_week"]
        # de-duplicated + clamped to 0..6 + sorted
        assert days == sorted(set(days))
        assert all(0 <= d <= 6 for d in days)
        # 9 should clamp to 6, -1 to 0 -> set ends up {0,1,3,6}
        assert set(days) == {0, 1, 3, 6}

    def test_default_days_when_missing(self):
        r = requests.put(
            f"{API}/users/me/notif-prefs",
            json={"reminders": [{"kind": "workout", "hour": 7, "minute": 30, "enabled": True}]},
            headers=AUTH,
        )
        assert r.status_code == 200
        assert r.json()["notif_prefs"]["reminders"][0]["days_of_week"] == [0, 1, 2, 3, 4, 5, 6]


# ============================================================
# 3. /auth/me exposes new fields
# ============================================================
class TestAuthMeFields:
    def test_returns_all_phase5_fields(self, db):
        # Seed mascot + notif + silhouette + force_metrics
        db.users.update_one(
            {"user_id": TEST_USER_ID},
            {"$set": {
                "mascot": {"animal": "loup", "chosen_at": "x"},
                "notif_prefs": {"reminders": []},
                "silhouette": {"sex": "male", "level": 3},
                "force_metrics": {"at": "x", "squat": 100},
            }},
        )
        r = requests.get(f"{API}/auth/me", headers=AUTH)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("mascot", "notif_prefs", "silhouette", "force_metrics"):
            assert k in data, f"missing {k}"
        assert data["mascot"]["animal"] == "loup"
        assert data["silhouette"]["level"] == 3

    def test_fields_null_when_unset(self):
        r = requests.get(f"{API}/auth/me", headers=AUTH)
        assert r.status_code == 200
        data = r.json()
        assert data.get("mascot") is None
        assert data.get("notif_prefs") is None


# ============================================================
# 4. POINTS SUMMARY
# ============================================================
class TestPointsSummary:
    def test_empty_state(self):
        r = requests.get(f"{API}/points/summary", headers=AUTH)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("level", "evolution", "points_total", "points_today",
                  "points_in_level", "level_span", "streak_days", "recent"):
            assert k in d, f"missing field {k}"
        assert d["points_total"] == 0
        assert d["points_today"] == 0
        assert d["level"] == 1
        assert d["evolution"] == 1
        assert d["streak_days"] == 0
        assert d["recent"] == []

    def test_evolution_mapping(self, db):
        # Insert enough points to push level to ~4-7 then ~8-10
        # level thresholds use 50*(i^1.25) cumulative starting i=1
        # Just insert a lot of points and verify evolution mapping holds for whatever level
        for i in range(20):
            db.points_events.insert_one({
                "id": f"pt_test_{i}",
                "user_id": TEST_USER_ID,
                "date": today_str(),
                "reason": "workout_completed",
                "key": f"seed_{i}",
                "amount": 100,
                "meta": {},
                "created_at": datetime.now(timezone.utc),
            })
        r = requests.get(f"{API}/points/summary", headers=AUTH)
        d = r.json()
        lvl = d["level"]
        expected_evo = 1 if lvl <= 3 else (2 if lvl <= 7 else 3)
        assert d["evolution"] == expected_evo
        assert 1 <= lvl <= 10
        assert d["points_total"] == 2000
        assert d["points_today"] == 2000
        assert len(d["recent"]) == 5  # capped to 5

    def test_streak_days(self, db):
        # Insert workout_completed for today, yesterday, and 2 days ago
        for offset in (0, 1, 2):
            d_str = (datetime.now(timezone.utc).date() - timedelta(days=offset)).isoformat()
            db.points_events.insert_one({
                "id": f"pt_streak_{offset}",
                "user_id": TEST_USER_ID,
                "date": d_str,
                "reason": "workout_completed",
                "key": f"k_{offset}",
                "amount": 20,
                "meta": {},
                "created_at": datetime.now(timezone.utc),
            })
        r = requests.get(f"{API}/points/summary", headers=AUTH)
        assert r.json()["streak_days"] == 3


# ============================================================
# 5. WORKOUT COMPLETE → POINTS + PR + STREAK
# ============================================================
class TestWorkoutComplete:
    def _seed_workout(self, db, completed=False, wid="wk_phase5_test"):
        db.workouts.insert_one({
            "id": wid,
            "user_id": TEST_USER_ID,
            "date": today_str(),
            "title": "Test",
            "focus": "test",
            "duration_min": 30,
            "exercises": [],
            "completed": completed,
            "created_at": datetime.now(timezone.utc),
        })
        return wid

    def test_complete_awards_20_idempotent(self, db):
        wid = self._seed_workout(db)
        r1 = requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        assert r2.status_code == 200
        # only one workout_completed event
        events = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "workout_completed"}))
        assert len(events) == 1
        assert events[0]["amount"] == 20

    def test_complete_pr_detection(self, db):
        wid = self._seed_workout(db, wid="wk_pr_test")
        # Previous perf with est_1rm=100
        db.exercise_perf.insert_one({
            "id": "perf_prev",
            "user_id": TEST_USER_ID,
            "exercise_name": "Squat barre arrière",
            "est_1rm": 100.0,
            "workout_id": "old_wk",
            "created_at": datetime.now(timezone.utc) - timedelta(days=5),
        })
        # New perf in this workout with est_1rm=110 → PR
        db.exercise_perf.insert_one({
            "id": "perf_new_pr",
            "user_id": TEST_USER_ID,
            "exercise_name": "Squat barre arrière",
            "est_1rm": 110.0,
            "workout_id": wid,
            "created_at": datetime.now(timezone.utc),
        })
        # Non-PR exercise
        db.exercise_perf.insert_one({
            "id": "perf_other_old",
            "user_id": TEST_USER_ID,
            "exercise_name": "Développé couché",
            "est_1rm": 80.0,
            "workout_id": "old",
            "created_at": datetime.now(timezone.utc) - timedelta(days=5),
        })
        db.exercise_perf.insert_one({
            "id": "perf_other_nopr",
            "user_id": TEST_USER_ID,
            "exercise_name": "Développé couché",
            "est_1rm": 80.2,  # delta < 0.5
            "workout_id": wid,
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        assert r.status_code == 200, r.text
        prs = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "pr_beaten"}))
        assert len(prs) == 1, f"expected 1 PR, got {len(prs)}: {prs}"
        assert "Squat barre arrière" in prs[0]["key"]
        assert prs[0]["amount"] == 25

    def test_pr_not_awarded_twice_same_exercise_same_workout(self, db):
        wid = self._seed_workout(db, wid="wk_pr_idem")
        db.exercise_perf.insert_one({
            "id": "perf_first",
            "user_id": TEST_USER_ID,
            "exercise_name": "Squat",
            "est_1rm": 120.0,
            "workout_id": wid,
            "created_at": datetime.now(timezone.utc),
        })
        requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        prs = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "pr_beaten"}))
        assert len(prs) == 1

    def test_streak_bonus(self, db):
        # Seed a workout_completed event yesterday
        db.points_events.insert_one({
            "id": "pt_yest",
            "user_id": TEST_USER_ID,
            "date": yesterday_str(),
            "reason": "workout_completed",
            "key": "wk_yesterday",
            "amount": 20,
            "meta": {},
            "created_at": datetime.now(timezone.utc) - timedelta(days=1),
        })
        wid = self._seed_workout(db, wid="wk_streak")
        r = requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        assert r.status_code == 200
        streak = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "streak_bonus"}))
        assert len(streak) == 1
        assert streak[0]["amount"] == 5

    def test_no_streak_bonus_when_no_yesterday(self, db):
        wid = self._seed_workout(db, wid="wk_nostreak")
        requests.post(f"{API}/workouts/{wid}/complete", headers=AUTH)
        streak = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "streak_bonus"}))
        assert len(streak) == 0


# ============================================================
# 6. DASHBOARD DAY → DAILY POINTS + COMBO
# ============================================================
class TestDashboardDailyPoints:
    def _seed_profile(self, db, calories=2000, protein=140):
        db.profiles.update_one(
            {"user_id": TEST_USER_ID},
            {"$set": {
                "user_id": TEST_USER_ID,
                "daily_calories": calories,
                "protein_g": protein,
                "carbs_g": 200,
                "fat_g": 60,
                "weight_kg": 75,
                "bmr": 1600,
            }},
            upsert=True,
        )

    def _seed_meal(self, db, protein_g=0, calories=0):
        db.meals.insert_one({
            "id": f"meal_{datetime.now(timezone.utc).timestamp()}",
            "user_id": TEST_USER_ID,
            "date": today_str(),
            "protein_g": protein_g,
            "calories": calories,
            "carbs_g": 0,
            "fat_g": 0,
            "created_at": datetime.now(timezone.utc),
        })

    def test_protein_target_hit(self, db):
        self._seed_profile(db, protein=100)
        self._seed_meal(db, protein_g=95)  # >= 95% of 100
        r = requests.get(f"{API}/dashboard/day", headers=AUTH)
        assert r.status_code == 200, r.text
        events = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "protein_target_hit"}))
        assert len(events) == 1
        assert events[0]["amount"] == 10
        # Idempotent
        requests.get(f"{API}/dashboard/day", headers=AUTH)
        events2 = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "protein_target_hit"}))
        assert len(events2) == 1

    def test_protein_not_awarded_under_95(self, db):
        self._seed_profile(db, protein=100)
        self._seed_meal(db, protein_g=80)  # 80% < 95%
        requests.get(f"{API}/dashboard/day", headers=AUTH)
        assert db.points_events.count_documents(
            {"user_id": TEST_USER_ID, "reason": "protein_target_hit"}
        ) == 0

    def test_calories_on_track(self, db):
        self._seed_profile(db, calories=2000)
        self._seed_meal(db, calories=2000)  # exactly target
        r = requests.get(f"{API}/dashboard/day", headers=AUTH)
        assert r.status_code == 200
        events = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "calories_on_track"}))
        assert len(events) == 1
        assert events[0]["amount"] == 10

    def test_calories_outside_7pct_no_award(self, db):
        self._seed_profile(db, calories=2000)
        self._seed_meal(db, calories=1700)  # 15% off
        requests.get(f"{API}/dashboard/day", headers=AUTH)
        assert db.points_events.count_documents(
            {"user_id": TEST_USER_ID, "reason": "calories_on_track"}
        ) == 0

    def test_combo_bonus_3_distinct_reasons(self, db):
        self._seed_profile(db, calories=2000, protein=100)
        # Already complete one workout to get workout_completed
        db.workouts.insert_one({
            "id": "wk_combo",
            "user_id": TEST_USER_ID,
            "date": today_str(),
            "title": "T",
            "focus": "f",
            "duration_min": 30,
            "exercises": [],
            "completed": False,
            "created_at": datetime.now(timezone.utc),
        })
        requests.post(f"{API}/workouts/wk_combo/complete", headers=AUTH)
        # Now meal hitting both protein + calories targets
        self._seed_meal(db, protein_g=100, calories=2000)
        r = requests.get(f"{API}/dashboard/day", headers=AUTH)
        assert r.status_code == 200
        combos = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "combo_bonus"}))
        assert len(combos) == 1
        assert combos[0]["amount"] == 20
        # key uses combo_<date>
        assert combos[0]["key"] == f"combo_{today_str()}"


# ============================================================
# 7. CHALLENGE CHECK-DAY → +15
# ============================================================
class TestChallengeCheckDay:
    def test_challenge_day_awards_15(self, db):
        # Start a challenge (this uses internal blueprints)
        r = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=AUTH)
        assert r.status_code == 200, r.text
        ch_id = r.json()["id"]
        days = r.json()["days"]
        # find first non-rest day
        first_non_rest = next(i for i, d in enumerate(days) if not d.get("is_rest"))
        rc = requests.post(
            f"{API}/challenges/{ch_id}/check-day",
            json={"day_index": first_non_rest},
            headers=AUTH,
        )
        assert rc.status_code == 200, rc.text
        events = list(db.points_events.find({"user_id": TEST_USER_ID, "reason": "challenge_day"}))
        assert len(events) == 1
        assert events[0]["amount"] == 15

    def test_rest_day_no_award(self, db):
        r = requests.post(f"{API}/challenges/start", json={"type": "pushups"}, headers=AUTH)
        ch_id = r.json()["id"]
        days = r.json()["days"]
        rest_idx = next((i for i, d in enumerate(days) if d.get("is_rest")), None)
        if rest_idx is None:
            pytest.skip("No rest day in this challenge plan")
        requests.post(
            f"{API}/challenges/{ch_id}/check-day",
            json={"day_index": rest_idx},
            headers=AUTH,
        )
        assert db.points_events.count_documents(
            {"user_id": TEST_USER_ID, "reason": "challenge_day"}
        ) == 0


# ============================================================
# 8. TRANSFORMATIONS taken_at
# ============================================================
TINY_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class TestTransformationsTakenAt:
    def test_taken_at_valid(self, db):
        r = requests.post(
            f"{API}/transformations",
            json={"image_base64": TINY_B64, "taken_at": "2024-06-15", "weight_kg": 70},
            headers=AUTH,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["date"] == "2024-06-15"
        assert "ai_feedback" not in doc or doc.get("ai_feedback") is None

    def test_taken_at_invalid_falls_back_today(self, db):
        r = requests.post(
            f"{API}/transformations",
            json={"image_base64": TINY_B64, "taken_at": "not-a-date"},
            headers=AUTH,
        )
        assert r.status_code == 200
        assert r.json()["date"] == today_str()

    def test_taken_at_missing_uses_today(self, db):
        r = requests.post(
            f"{API}/transformations",
            json={"image_base64": TINY_B64},
            headers=AUTH,
        )
        assert r.status_code == 200
        assert r.json()["date"] == today_str()

    def test_delete_transformation_still_works(self, db):
        r = requests.post(
            f"{API}/transformations",
            json={"image_base64": TINY_B64},
            headers=AUTH,
        )
        tid = r.json()["id"]
        d = requests.delete(f"{API}/transformations/{tid}", headers=AUTH)
        assert d.status_code == 200
        # verify gone
        g = requests.delete(f"{API}/transformations/{tid}", headers=AUTH)
        assert g.status_code == 404
