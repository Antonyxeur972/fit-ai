"""Phase 4 backend tests.

Coverage:
- PUT /api/users/me/silhouette (clamp + sex normalization)
- POST /api/workouts/estimate-1rm (Epley, exercise_perf insert, force_metrics snapshot)
- GET /api/auth/me (silhouette + force_metrics fields)
- POST /api/transformations (no AI; doc stored without ai_feedback)
- DELETE /api/transformations/{id} (only caller's photo; 404 on other's)
- Regression: POST /api/exercises/ai-add returns required keys
"""
import os
import requests
import pytest
from datetime import datetime, timezone, timedelta

from conftest import API, TEST_USER_ID, TEST_TOKEN  # type: ignore


# Use a tiny dummy base64 string (valid for our backend which just stores it)
DUMMY_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# --- helpers ---
def _seed_profile_75kg_male(mongo_db):
    """Ensure user has a profile so 1RM ratio can be computed."""
    now = datetime.now(timezone.utc)
    mongo_db.profiles.update_one(
        {"user_id": TEST_USER_ID},
        {
            "$set": {
                "user_id": TEST_USER_ID,
                "weight_kg": 75.0,
                "height_cm": 180.0,
                "age": 30,
                "gender": "male",
                "goal": "gain",
                "activity_level": "moderate",
                "daily_calories": 2500,
                "protein_g": 150,
                "carbs_g": 250,
                "fat_g": 80,
                "bmr": 1700,
                "updated_at": now,
            }
        },
        upsert=True,
    )


# --- Silhouette ---
class TestSilhouette:
    def test_silhouette_normal(self, auth_headers, mongo_db):
        r = requests.put(f"{API}/users/me/silhouette",
                         headers=auth_headers, json={"sex": "male", "level": 3})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["silhouette"] == {"sex": "male", "level": 3}
        # GET to verify persistence
        r2 = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json()["silhouette"] == {"sex": "male", "level": 3}

    def test_silhouette_level_clamp_low(self, auth_headers):
        r = requests.put(f"{API}/users/me/silhouette",
                         headers=auth_headers, json={"sex": "male", "level": 0})
        assert r.status_code == 200, r.text
        assert r.json()["silhouette"]["level"] == 1

    def test_silhouette_level_clamp_high(self, auth_headers):
        r = requests.put(f"{API}/users/me/silhouette",
                         headers=auth_headers, json={"sex": "female", "level": 99})
        assert r.status_code == 200, r.text
        body = r.json()["silhouette"]
        assert body["level"] == 5
        assert body["sex"] == "female"

    def test_silhouette_sex_F_normalized(self, auth_headers):
        r = requests.put(f"{API}/users/me/silhouette",
                         headers=auth_headers, json={"sex": "F", "level": 2})
        assert r.status_code == 200, r.text
        assert r.json()["silhouette"]["sex"] == "female"

    def test_silhouette_sex_M_normalized(self, auth_headers):
        r = requests.put(f"{API}/users/me/silhouette",
                         headers=auth_headers, json={"sex": "M", "level": 4})
        assert r.status_code == 200, r.text
        assert r.json()["silhouette"]["sex"] == "male"

    def test_silhouette_unauth(self):
        r = requests.put(f"{API}/users/me/silhouette",
                         json={"sex": "male", "level": 3})
        assert r.status_code == 401


# --- Estimate 1RM ---
class TestEstimate1RM:
    def test_estimate_1rm_full_payload(self, auth_headers, mongo_db):
        _seed_profile_75kg_male(mongo_db)
        # Clean previous perf rows for clean assertion
        mongo_db.exercise_perf.delete_many({"user_id": TEST_USER_ID, "source": "estimate"})
        payload = {
            "squat_kg": 100, "squat_reps": 5,
            "bench_kg": 80, "bench_reps": 5,
            "deadlift_kg": 140, "deadlift_reps": 3,
            "ohp_kg": 50, "ohp_reps": 5,
        }
        r = requests.post(f"{API}/workouts/estimate-1rm",
                          headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # 4 items returned
        assert isinstance(data.get("items"), list)
        assert len(data["items"]) == 4
        names = {it["exercise"] for it in data["items"]}
        assert any("Squat" in n for n in names)
        assert any("couché" in n for n in names)
        assert any("Soulevé" in n for n in names)
        assert any("militaire" in n for n in names)
        # Epley check: 100 * (1 + 5/30) ≈ 116.7
        sq = next(it for it in data["items"] if "Squat" in it["exercise"])
        assert abs(sq["est_1rm"] - round(100 * (1 + 5 / 30), 1)) < 0.2

        # Snapshot keys per request: squat/bench/deadlift/ohp + at
        snap = data["snapshot"]
        assert "at" in snap
        for k in ("squat", "bench", "deadlift", "ohp"):
            assert k in snap, (
                f"Missing snapshot key '{k}'. Got keys={list(snap.keys())}. "
                "BUG: server overrides the slug with name.split(' ')[0].lower(), "
                "yielding 'développé'/'soulevé' (and a key collision for bench/ohp)."
            )

        # exercise_perf has 4 inserted rows for this user
        rows = list(mongo_db.exercise_perf.find(
            {"user_id": TEST_USER_ID, "source": "estimate"}))
        assert len(rows) == 4
        for row in rows:
            assert row.get("est_1rm") and row["est_1rm"] > 0

        # user.force_metrics persisted
        u = mongo_db.users.find_one({"user_id": TEST_USER_ID})
        assert u.get("force_metrics") is not None
        for k in ("squat", "bench", "deadlift", "ohp"):
            assert k in u["force_metrics"], (
                f"user.force_metrics missing '{k}'. Keys={list(u['force_metrics'].keys())}"
            )

    def test_estimate_1rm_partial_payload(self, auth_headers, mongo_db):
        _seed_profile_75kg_male(mongo_db)
        r = requests.post(f"{API}/workouts/estimate-1rm",
                          headers=auth_headers,
                          json={"bench_kg": 80, "bench_reps": 5})
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["items"]) == 1
        assert "couché" in data["items"][0]["exercise"]

    def test_estimate_1rm_empty_body(self, auth_headers):
        r = requests.post(f"{API}/workouts/estimate-1rm",
                          headers=auth_headers, json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["items"] == []

    def test_estimate_1rm_unauth(self):
        r = requests.post(f"{API}/workouts/estimate-1rm", json={})
        assert r.status_code == 401


# --- /auth/me extended fields ---
class TestAuthMeFields:
    def test_auth_me_returns_silhouette_and_force_metrics_keys(
        self, auth_headers, mongo_db
    ):
        # Ensure both fields exist (set silhouette + estimate 1RM)
        requests.put(f"{API}/users/me/silhouette",
                     headers=auth_headers, json={"sex": "male", "level": 3})
        _seed_profile_75kg_male(mongo_db)
        requests.post(f"{API}/workouts/estimate-1rm",
                      headers=auth_headers,
                      json={"squat_kg": 100, "squat_reps": 5})
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "silhouette" in body
        assert "force_metrics" in body
        assert body["silhouette"] is not None
        assert body["force_metrics"] is not None

    def test_auth_me_returns_null_when_unset(self, auth_headers, mongo_db):
        # Clear silhouette + force_metrics
        mongo_db.users.update_one(
            {"user_id": TEST_USER_ID},
            {"$unset": {"silhouette": "", "force_metrics": ""}},
        )
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["silhouette"] is None
        assert body["force_metrics"] is None


# --- Transformations ---
class TestTransformations:
    def test_create_transformation_no_ai_feedback(self, auth_headers, mongo_db):
        mongo_db.transformations.delete_many({"user_id": TEST_USER_ID})
        r = requests.post(f"{API}/transformations",
                          headers=auth_headers,
                          json={"image_base64": DUMMY_B64, "view": "front"})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert "id" in doc
        assert doc.get("view") == "front"
        # No AI feedback returned
        assert doc.get("ai_feedback") in (None, "")
        # DB row must not contain ai_feedback
        db_doc = mongo_db.transformations.find_one({"id": doc["id"]})
        assert db_doc is not None
        assert "ai_feedback" not in db_doc

    def test_create_transformation_view_back(self, auth_headers):
        r = requests.post(f"{API}/transformations",
                          headers=auth_headers,
                          json={"image_base64": DUMMY_B64, "view": "back"})
        assert r.status_code == 200, r.text
        assert r.json()["view"] == "back"

    def test_delete_own_transformation(self, auth_headers):
        # Create then delete
        r = requests.post(f"{API}/transformations",
                          headers=auth_headers,
                          json={"image_base64": DUMMY_B64, "view": "side"})
        assert r.status_code == 200
        tid = r.json()["id"]
        d = requests.delete(f"{API}/transformations/{tid}", headers=auth_headers)
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

    def test_delete_other_users_transformation_returns_404(
        self, auth_headers, mongo_db
    ):
        # Insert a photo owned by someone else
        other_id = "transfo_other_999"
        mongo_db.transformations.insert_one({
            "id": other_id,
            "user_id": "another_user_xyz",
            "date": "2026-01-01",
            "created_at": datetime.now(timezone.utc),
            "image_base64": DUMMY_B64,
            "view": "front",
        })
        try:
            d = requests.delete(f"{API}/transformations/{other_id}",
                                headers=auth_headers)
            assert d.status_code == 404
            # Confirm not deleted
            still = mongo_db.transformations.find_one({"id": other_id})
            assert still is not None
        finally:
            mongo_db.transformations.delete_one({"id": other_id})

    def test_delete_nonexistent_transformation_404(self, auth_headers):
        d = requests.delete(f"{API}/transformations/transfo_nope_xxx",
                            headers=auth_headers)
        assert d.status_code == 404


# --- Regression: ai-add ---
class TestAiAddRegression:
    def test_ai_add_returns_required_keys(self, auth_headers):
        r = requests.post(f"{API}/exercises/ai-add",
                          headers=auth_headers,
                          json={"description": "farmer carry haltères"})
        # AI may sometimes fail (502/422). Treat non-200 as flaky but report.
        if r.status_code != 200:
            pytest.skip(f"AI not available (status={r.status_code}): {r.text[:200]}")
        data = r.json()
        for key in ("name", "category", "equipment",
                    "recommended_reps", "recommended_rest_s"):
            assert key in data, f"Missing key '{key}' in ai-add response: {list(data.keys())}"
        assert isinstance(data["recommended_rest_s"], int)
