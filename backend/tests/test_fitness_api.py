"""Backend API integration tests for Performance Fitness app."""
from datetime import datetime, timezone


# --- Health & Root ---
class TestRoot:
    def test_root_ok(self, api_client, api_url):
        r = api_client.get(f"{api_url}/")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"


# --- AUTH ---
class TestAuth:
    def test_me_without_token_401(self, api_client, api_url):
        r = api_client.get(f"{api_url}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token_401(self, api_client, api_url):
        r = api_client.get(
            f"{api_url}/auth/me", headers={"Authorization": "Bearer nope_invalid"}
        )
        assert r.status_code == 401

    def test_me_valid_token(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == "user_test_001"
        assert data["email"] == "TEST_fitness@example.com"
        assert "onboarded" in data
        # No mongo _id leakage
        assert "_id" not in data


# --- PROFILE ---
class TestProfile:
    def test_put_profile_computes_targets(self, api_client, api_url, auth_headers):
        payload = {
            "weight_kg": 75.0,
            "height_cm": 178.0,
            "age": 30,
            "gender": "male",
            "goal": "lose",
            "activity_level": "moderate",
        }
        r = api_client.put(f"{api_url}/profile", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        prof = r.json()
        for k in ["daily_calories", "bmr", "protein_g", "carbs_g", "fat_g"]:
            assert k in prof and prof[k] > 0, f"missing/zero {k} -> {prof}"
        assert prof["weight_kg"] == 75.0
        assert "_id" not in prof
        # Verify onboarded flag flipped
        me = api_client.get(f"{api_url}/auth/me", headers=auth_headers).json()
        assert me["onboarded"] is True

    def test_get_profile_persisted(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/profile", headers=auth_headers)
        assert r.status_code == 200
        prof = r.json()
        assert prof.get("weight_kg") == 75.0
        assert prof.get("daily_calories", 0) > 0
        assert "_id" not in prof


# --- MEALS (uses Claude vision) ---
class TestMeals:
    meal_id = None

    def test_analyze_meal(self, api_client, api_url, auth_headers, meal_image_b64):
        r = api_client.post(
            f"{api_url}/meals/analyze",
            json={"image_base64": meal_image_b64, "mime": "image/jpeg"},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and data["id"].startswith("meal_")
        assert isinstance(data["name"], str) and data["name"]
        for k in ["calories", "protein_g", "carbs_g", "fat_g"]:
            assert isinstance(data[k], int)
        # calories should be plausible (>0)
        assert data["calories"] > 0
        assert "_id" not in data
        TestMeals.meal_id = data["id"]

    def test_list_meals_today_excludes_image(self, api_client, api_url, auth_headers):
        today = datetime.now(timezone.utc).date().isoformat()
        r = api_client.get(
            f"{api_url}/meals", params={"date": today}, headers=auth_headers
        )
        assert r.status_code == 200, r.text
        meals = r.json()
        assert isinstance(meals, list) and len(meals) >= 1
        for m in meals:
            assert "image_base64" not in m
            assert "_id" not in m
        assert any(m["id"] == TestMeals.meal_id for m in meals)

    def test_delete_meal(self, api_client, api_url, auth_headers):
        assert TestMeals.meal_id, "no meal id from previous test"
        r = api_client.delete(
            f"{api_url}/meals/{TestMeals.meal_id}", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.json().get("deleted") == 1
        # Verify removal
        g = api_client.get(
            f"{api_url}/meals/{TestMeals.meal_id}", headers=auth_headers
        )
        assert g.status_code == 404


# --- ACTIVITY ---
class TestActivity:
    def test_upsert_and_get_activity(self, api_client, api_url, auth_headers):
        today = datetime.now(timezone.utc).date().isoformat()
        r = api_client.post(
            f"{api_url}/activity",
            json={"date": today, "steps": 8000, "cardio_minutes": 25, "cardio_type": "run"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["steps"] == 8000
        assert "_id" not in body

        g = api_client.get(
            f"{api_url}/activity", params={"date": today}, headers=auth_headers
        )
        assert g.status_code == 200
        gdata = g.json()
        assert gdata["steps"] == 8000
        assert gdata["cardio_minutes"] == 25
        assert "_id" not in gdata


# --- WORKOUTS ---
class TestWorkouts:
    workout_id = None

    def test_generate_requires_profile(self, api_client, api_url, mongo_db):
        # Temporarily make another user (no profile) - reuse main user since it
        # already has profile from TestProfile. We'll create a transient user.
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        mongo_db.users.insert_one(
            {
                "user_id": "user_noprofile_xyz",
                "email": "TEST_noprof@example.com",
                "name": "NP",
                "created_at": now,
                "onboarded": False,
            }
        )
        mongo_db.user_sessions.insert_one(
            {
                "session_token": "tok_noprof_xyz",
                "user_id": "user_noprofile_xyz",
                "expires_at": now + timedelta(days=1),
                "created_at": now,
            }
        )
        try:
            r = api_client.post(
                f"{api_url}/workouts/generate",
                headers={"Authorization": "Bearer tok_noprof_xyz"},
            )
            assert r.status_code == 400, r.text
        finally:
            mongo_db.users.delete_one({"user_id": "user_noprofile_xyz"})
            mongo_db.user_sessions.delete_one({"session_token": "tok_noprof_xyz"})

    def test_generate_week_plan(self, api_client, api_url, auth_headers):
        r = api_client.post(f"{api_url}/workouts/generate", headers=auth_headers)
        assert r.status_code == 200, r.text
        plan = r.json()
        assert isinstance(plan, list) and len(plan) == 7
        for w in plan:
            assert "id" in w and "date" in w and "focus" in w
            assert "_id" not in w

    def test_get_week(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/workouts/week", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 7
        for w in items:
            assert "_id" not in w

    def test_get_today_and_complete(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/workouts/today", headers=auth_headers)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w and w.get("id"), f"Expected workout today, got: {w}"
        assert "_id" not in w
        TestWorkouts.workout_id = w["id"]

        c = api_client.post(
            f"{api_url}/workouts/{TestWorkouts.workout_id}/complete",
            headers=auth_headers,
        )
        assert c.status_code == 200
        # Verify completion
        again = api_client.get(f"{api_url}/workouts/today", headers=auth_headers).json()
        assert again.get("completed") is True


# --- TRANSFORMATIONS ---
class TestTransformations:
    def test_add_transformation(self, api_client, api_url, auth_headers, person_image_b64):
        r = api_client.post(
            f"{api_url}/transformations",
            json={"image_base64": person_image_b64, "mime": "image/jpeg", "weight_kg": 74.5},
            headers=auth_headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"].startswith("transfo_")
        assert isinstance(data.get("ai_feedback"), str) and data["ai_feedback"]
        assert "_id" not in data

    def test_list_transformations(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/transformations", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        for it in items:
            assert "_id" not in it


# --- DASHBOARD ---
class TestDashboard:
    def test_dashboard_day(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/dashboard/day", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in [
            "target_calories",
            "consumed_calories",
            "macros",
            "burned",
            "activity",
            "balance",
        ]:
            assert k in data, f"missing {k}"
        for k in ["bmr", "steps", "cardio", "workout", "total"]:
            assert k in data["burned"]
        # workout should have been counted (we completed it)
        assert data["burned"]["workout"] > 0
        assert data["activity"]["steps"] == 8000
        assert "_id" not in data

    def test_dashboard_week(self, api_client, api_url, auth_headers):
        r = api_client.get(f"{api_url}/dashboard/week", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data and len(data["days"]) == 7
        assert "avg_consumed" in data
        assert "target" in data


# --- LOGOUT (last) ---
class TestLogout:
    def test_logout_invalidates(self, api_client, api_url, auth_headers, mongo_db):
        r = api_client.post(f"{api_url}/auth/logout", headers=auth_headers)
        assert r.status_code == 200
        me = api_client.get(f"{api_url}/auth/me", headers=auth_headers)
        assert me.status_code == 401
        # Reseed session so cleanup fixture works regardless
        from datetime import timedelta
        mongo_db.user_sessions.update_one(
            {"session_token": "test_session_token_abc"},
            {
                "$set": {
                    "session_token": "test_session_token_abc",
                    "user_id": "user_test_001",
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
