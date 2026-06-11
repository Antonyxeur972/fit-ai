"""
Iteration 2: New FIT AI features.
Covers:
 - workouts/generate session_type (volume / puissance / force) + reps mapping
 - exercises/library endpoint
 - PUT /workouts/{id} edit + persistence
 - workouts/{id}/perf with Epley 1RM
 - perf/recent with personal_bests
 - activity/steps quick add (increments)
 - meals/analyze meal_type auto + explicit override
 - meals history (compliance per day)
 - meal lifecycle archive(>7d) / delete(>14d) + daily_compliance snapshot
 - DELETE /meals/older-than/{days}
 - GET /compliance/history
 - No mongo _id leakage anywhere
"""
from datetime import datetime, timezone, timedelta
import pytest


def _auth(token="test_session_token_abc"):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Helpers --------------------------------------------------------------------

def _ensure_profile(api_client, api_url, headers):
    api_client.put(
        f"{api_url}/profile",
        json={
            "weight_kg": 75.0,
            "height_cm": 178.0,
            "age": 30,
            "gender": "male",
            "goal": "maintain",
            "activity_level": "moderate",
        },
        headers=headers,
        timeout=20,
    )


def _no_id(obj):
    if isinstance(obj, dict):
        assert "_id" not in obj
        for v in obj.values():
            _no_id(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_id(v)


# 1. Workouts generation with session_type ----------------------------------
class TestSessionType:
    def test_default_volume_reps(self, api_client, api_url):
        h = _auth()
        _ensure_profile(api_client, api_url, h)
        r = api_client.post(f"{api_url}/workouts/generate", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        plan = r.json()
        assert len(plan) == 7
        # take a non-rest day; reps should be "10-12"
        sample = next(
            (w for w in plan if "Repos" not in w["focus"] and w["exercises"]), None
        )
        assert sample is not None
        # at least one exercise carries reps 10-12
        assert any(e.get("reps") == "10-12" for e in sample["exercises"])
        for w in plan:
            assert w.get("session_type") == "volume"
        _no_id(plan)

    def test_puissance_reps_6_8(self, api_client, api_url):
        h = _auth()
        r = api_client.post(
            f"{api_url}/workouts/generate?session_type=puissance",
            headers=h,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        plan = r.json()
        assert len(plan) == 7
        for w in plan:
            assert w.get("session_type") == "puissance"
        sample = next(
            (w for w in plan if "Repos" not in w["focus"] and w["exercises"]), None
        )
        assert any(e.get("reps") == "6-8" for e in sample["exercises"])

    def test_force_reps_3_6(self, api_client, api_url):
        h = _auth()
        r = api_client.post(
            f"{api_url}/workouts/generate?session_type=force", headers=h, timeout=30
        )
        assert r.status_code == 200, r.text
        plan = r.json()
        sample = next(
            (w for w in plan if "Repos" not in w["focus"] and w["exercises"]), None
        )
        assert any(e.get("reps") == "3-6" for e in sample["exercises"])
        for w in plan:
            assert w["session_type"] == "force"


# 2. Exercise library --------------------------------------------------------
class TestExerciseLibrary:
    def test_library_groups_and_session_types(self, api_client, api_url):
        h = _auth()
        r = api_client.get(f"{api_url}/exercises/library", headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "exercises" in data and isinstance(data["exercises"], list)
        assert len(data["exercises"]) >= 20
        # All have category - i.e. groupable
        cats = {e["category"] for e in data["exercises"]}
        assert {"Pectoraux", "Dos", "Jambes"}.issubset(cats)
        # session_types dict has all 3
        st = data["session_types"]
        for k in ["volume", "puissance", "force"]:
            assert k in st
            assert "reps" in st[k]
        _no_id(data)


# 3. PUT /workouts/{id} edit -------------------------------------------------
class TestWorkoutEdit:
    def test_put_workout_persists(self, api_client, api_url):
        h = _auth()
        # ensure today has a workout
        api_client.post(f"{api_url}/workouts/generate", headers=h, timeout=30)
        today = api_client.get(f"{api_url}/workouts/today", headers=h).json()
        assert today and today.get("id")
        wid = today["id"]
        new_ex = [
            {"name": "Squat", "sets": 5, "reps": "5", "rest_s": 120, "checked": True},
            {"name": "Pompes", "sets": 4, "reps": "8", "rest_s": 90, "checked": True},
        ]
        r = api_client.put(
            f"{api_url}/workouts/{wid}",
            json={"exercises": new_ex, "session_type": "force"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["session_type"] == "force"
        assert len(updated["exercises"]) == 2
        assert updated["exercises"][0]["name"] == "Squat"
        # GET reflects
        again = api_client.get(f"{api_url}/workouts/today", headers=h).json()
        assert again["session_type"] == "force"
        assert len(again["exercises"]) == 2
        _no_id(updated)


# 4. Performance logging + Epley 1RM ----------------------------------------
class TestPerf:
    perf_id = None

    def test_log_perf_epley(self, api_client, api_url):
        h = _auth()
        api_client.post(f"{api_url}/workouts/generate", headers=h, timeout=30)
        today = api_client.get(f"{api_url}/workouts/today", headers=h).json()
        wid = today["id"]

        r = api_client.post(
            f"{api_url}/workouts/{wid}/perf",
            json={
                "workout_id": wid,
                "exercise_name": "Squat",
                "weight_kg": 80.0,
                "reps": 5,
                "sets": 3,
            },
            headers=h,
        )
        assert r.status_code == 200, r.text
        p = r.json()
        # Epley: 80 * (1 + 5/30) = 80 * 1.1666... = 93.33 -> rounded 93.3
        assert abs(p["est_1rm"] - 93.3) < 0.05, p
        assert "_id" not in p
        TestPerf.perf_id = p["id"]

    def test_log_perf_1rep_is_weight(self, api_client, api_url):
        h = _auth()
        today = api_client.get(f"{api_url}/workouts/today", headers=h).json()
        wid = today["id"]
        r = api_client.post(
            f"{api_url}/workouts/{wid}/perf",
            json={
                "workout_id": wid,
                "exercise_name": "Soulevé de terre",
                "weight_kg": 100.0,
                "reps": 1,
                "sets": 1,
            },
            headers=h,
        )
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["est_1rm"] == 100.0

    def test_perf_recent_with_pb(self, api_client, api_url):
        h = _auth()
        # Add another Squat lift with lower est to verify max picks the right one
        today = api_client.get(f"{api_url}/workouts/today", headers=h).json()
        wid = today["id"]
        api_client.post(
            f"{api_url}/workouts/{wid}/perf",
            json={
                "workout_id": wid,
                "exercise_name": "Squat",
                "weight_kg": 60.0,
                "reps": 8,
                "sets": 3,
            },
            headers=h,
        )
        r = api_client.get(f"{api_url}/perf/recent", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "personal_bests" in body
        assert len(body["items"]) >= 3
        # personal_best for Squat should be the 93.3 one
        squat_pb = next(
            (p for p in body["personal_bests"] if p["exercise_name"] == "Squat"), None
        )
        assert squat_pb is not None
        assert abs(squat_pb["est_1rm"] - 93.3) < 0.05
        _no_id(body)


# 5. Quick add steps ---------------------------------------------------------
class TestStepsQuickAdd:
    def test_steps_increment(self, api_client, api_url, mongo_db):
        h = _auth()
        today = datetime.now(timezone.utc).date().isoformat()
        # reset today's activity to clean baseline
        mongo_db.activity.delete_many({"user_id": "user_test_001", "date": today})

        r1 = api_client.post(
            f"{api_url}/activity/steps",
            json={"steps": 3500},
            headers=h,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["steps"] == 3500

        r2 = api_client.post(
            f"{api_url}/activity/steps",
            json={"steps": 3500},
            headers=h,
        )
        assert r2.status_code == 200
        assert r2.json()["steps"] == 7000

        g = api_client.get(
            f"{api_url}/activity", params={"date": today}, headers=h
        ).json()
        assert g["steps"] == 7000
        _no_id(g)


# 6. Meal type (auto + explicit) --------------------------------------------
class TestMealType:
    @pytest.fixture(scope="class")
    def meal_b64(self):
        import base64
        with open("/tmp/meal.jpg", "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")

    def test_meal_auto_meal_type(self, api_client, api_url, meal_b64):
        h = _auth()
        r = api_client.post(
            f"{api_url}/meals/analyze",
            json={"image_base64": meal_b64, "mime": "image/jpeg"},
            headers=h,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        m = r.json()
        assert "meal_type" in m
        assert m["meal_type"] in {"breakfast", "lunch", "snack", "dinner"}
        # Recompute expected
        h_now = datetime.now(timezone.utc).hour
        expected = (
            "breakfast" if 5 <= h_now < 11
            else "lunch" if 11 <= h_now < 15
            else "snack" if 15 <= h_now < 19
            else "dinner"
        )
        assert m["meal_type"] == expected
        _no_id(m)

    def test_meal_explicit_meal_type_dinner(self, api_client, api_url, meal_b64):
        h = _auth()
        r = api_client.post(
            f"{api_url}/meals/analyze",
            json={"image_base64": meal_b64, "mime": "image/jpeg", "meal_type": "dinner"},
            headers=h,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        assert r.json()["meal_type"] == "dinner"


# 7. Meals history with daily compliance ------------------------------------
class TestMealsHistory:
    def test_history_shape(self, api_client, api_url):
        h = _auth()
        r = api_client.get(f"{api_url}/meals", params={"history": "true"}, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data and isinstance(data["days"], list)
        assert len(data["days"]) >= 1
        # sort desc
        dates = [d["date"] for d in data["days"]]
        assert dates == sorted(dates, reverse=True)
        first = data["days"][0]
        assert "compliance" in first and "meals" in first
        for k in ["compliance_pct", "target", "consumed", "meals_count"]:
            assert k in first["compliance"], f"missing {k} in compliance"
        _no_id(data)


# 8. Lifecycle: archive >7d, delete >14d + snapshot --------------------------
class TestMealLifecycle:
    def test_archive_between_7_and_14_days(self, api_client, api_url, mongo_db):
        h = _auth()
        today = datetime.now(timezone.utc).date()
        old_date = (today - timedelta(days=10)).isoformat()
        meal_id = "meal_TEST_archive_10d"
        mongo_db.meals.delete_many({"id": meal_id})
        mongo_db.meals.insert_one(
            {
                "id": meal_id,
                "user_id": "user_test_001",
                "date": old_date,
                "created_at": datetime.now(timezone.utc) - timedelta(days=10),
                "name": "TEST old meal",
                "calories": 500,
                "protein_g": 30,
                "carbs_g": 50,
                "fat_g": 15,
                "meal_type": "lunch",
            }
        )
        # Trigger cleanup via GET /meals
        r_default = api_client.get(f"{api_url}/meals", headers=h)
        assert r_default.status_code == 200
        # Default excludes archived
        assert not any(m["id"] == meal_id for m in r_default.json())

        # include_archived=true should now show it
        r_arch = api_client.get(
            f"{api_url}/meals",
            params={"include_archived": "true"},
            headers=h,
        )
        assert r_arch.status_code == 200
        found = next((m for m in r_arch.json() if m["id"] == meal_id), None)
        assert found is not None, "archived meal should be included"
        assert found.get("archived") is True

        mongo_db.meals.delete_many({"id": meal_id})

    def test_delete_older_than_14d_with_snapshot(
        self, api_client, api_url, mongo_db
    ):
        h = _auth()
        # Ensure profile (snapshot uses target)
        _ensure_profile(api_client, api_url, h)
        today = datetime.now(timezone.utc).date()
        old_date = (today - timedelta(days=16)).isoformat()
        meal_id = "meal_TEST_delete_16d"
        mongo_db.meals.delete_many({"id": meal_id})
        mongo_db.daily_compliance.delete_many(
            {"user_id": "user_test_001", "date": old_date}
        )
        mongo_db.meals.insert_one(
            {
                "id": meal_id,
                "user_id": "user_test_001",
                "date": old_date,
                "created_at": datetime.now(timezone.utc) - timedelta(days=16),
                "name": "TEST very old meal",
                "calories": 800,
                "protein_g": 40,
                "carbs_g": 80,
                "fat_g": 25,
                "meal_type": "dinner",
            }
        )
        # Trigger lifecycle
        r = api_client.get(f"{api_url}/meals", headers=h)
        assert r.status_code == 200
        # Meal should be gone
        assert (
            mongo_db.meals.find_one({"id": meal_id}) is None
        ), "old meal should be deleted"
        # Snapshot exists with compliance_pct
        snap = mongo_db.daily_compliance.find_one(
            {"user_id": "user_test_001", "date": old_date}
        )
        assert snap is not None, "compliance snapshot must be created"
        assert "compliance_pct" in snap
        assert snap["consumed"] == 800

        mongo_db.daily_compliance.delete_many(
            {"user_id": "user_test_001", "date": old_date}
        )


# 9. DELETE /meals/older-than/{days} ----------------------------------------
class TestDeleteOlderThan:
    def test_purge_and_snapshot(self, api_client, api_url, mongo_db):
        h = _auth()
        _ensure_profile(api_client, api_url, h)
        today = datetime.now(timezone.utc).date()
        old_date = (today - timedelta(days=5)).isoformat()
        meal_id = "meal_TEST_purge_5d"
        mongo_db.meals.delete_many({"id": meal_id})
        mongo_db.daily_compliance.delete_many(
            {"user_id": "user_test_001", "date": old_date}
        )
        mongo_db.meals.insert_one(
            {
                "id": meal_id,
                "user_id": "user_test_001",
                "date": old_date,
                "created_at": datetime.now(timezone.utc) - timedelta(days=5),
                "name": "TEST purge",
                "calories": 600,
                "protein_g": 25,
                "carbs_g": 60,
                "fat_g": 20,
                "meal_type": "lunch",
            }
        )
        r = api_client.delete(f"{api_url}/meals/older-than/3", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted"] >= 1
        assert body["snapshots"] >= 1
        # snapshot persisted
        snap = mongo_db.daily_compliance.find_one(
            {"user_id": "user_test_001", "date": old_date}
        )
        assert snap is not None
        assert "compliance_pct" in snap
        mongo_db.daily_compliance.delete_many(
            {"user_id": "user_test_001", "date": old_date}
        )


# 10. GET /compliance/history ----------------------------------------------
class TestComplianceHistory:
    def test_history_sorted_desc(self, api_client, api_url, mongo_db):
        # Seed two snapshots
        now = datetime.now(timezone.utc)
        d1 = (now - timedelta(days=20)).date().isoformat()
        d2 = (now - timedelta(days=25)).date().isoformat()
        for d in (d1, d2):
            mongo_db.daily_compliance.update_one(
                {"user_id": "user_test_001", "date": d},
                {
                    "$set": {
                        "user_id": "user_test_001",
                        "date": d,
                        "target": 2000,
                        "consumed": 1900,
                        "compliance_pct": 95,
                        "meals_count": 3,
                        "snapshot_at": now,
                    }
                },
                upsert=True,
            )
        h = _auth()
        r = api_client.get(f"{api_url}/compliance/history", headers=h)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 2
        # dates desc
        dates = [i["date"] for i in items]
        assert dates == sorted(dates, reverse=True)
        for it in items:
            assert "_id" not in it
            assert "compliance_pct" in it
        # Cleanup our seeded snapshots
        mongo_db.daily_compliance.delete_many(
            {"user_id": "user_test_001", "date": {"$in": [d1, d2]}}
        )
