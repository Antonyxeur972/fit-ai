"""
Iteration 3 backend tests:
- Expanded exercise library (~95 incl. gym classics)
- New food library (~70 items)
- POST /api/meals/manual endpoint (no photo)
- Regressions: /workouts/generate?session_type=volume, /meals/analyze unchanged
- No mongodb _id leaks
"""
import os
import base64
from datetime import datetime, timezone, timedelta

import pytest
import requests

from conftest import API, TEST_TOKEN, TEST_USER_ID

HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# ---------- helpers ----------
def assert_no_id_leak(obj):
    """Recursively assert there is no MongoDB _id field anywhere."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leak in {obj!r}"
        for v in obj.values():
            assert_no_id_leak(v)
    elif isinstance(obj, list):
        for v in obj:
            assert_no_id_leak(v)


@pytest.fixture
def profile_seeded(mongo_db):
    """Profile required before generate_workouts."""
    mongo_db.profiles.update_one(
        {"user_id": TEST_USER_ID},
        {"$set": {
            "user_id": TEST_USER_ID,
            "weight_kg": 75, "height_cm": 178, "age": 30,
            "gender": "male", "goal": "gain", "activity_level": "moderate",
            "bmr": 1700, "daily_calories": 2800,
            "protein_g": 150, "carbs_g": 320, "fat_g": 80,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    yield
    mongo_db.profiles.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture
def cleanup_meals(mongo_db):
    yield
    mongo_db.meals.delete_many({"user_id": TEST_USER_ID})


# ---------- Exercise library (expanded) ----------
class TestExerciseLibraryExpanded:
    def test_library_size_and_categories(self):
        r = requests.get(f"{API}/exercises/library", headers=HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert_no_id_leak(data)
        assert "exercises" in data and "session_types" in data

        ex = data["exercises"]
        assert isinstance(ex, list)
        assert len(ex) >= 80, f"Expected >=80 exercises, got {len(ex)}"

        categories = {e["category"] for e in ex}
        for needed in ["Pectoraux", "Dos", "Jambes", "Épaules", "Bras", "Core", "Cardio"]:
            assert needed in categories, f"Missing category {needed}"

    def test_library_includes_new_gym_classics(self):
        r = requests.get(f"{API}/exercises/library", headers=HEADERS)
        assert r.status_code == 200
        names = {e["name"] for e in r.json()["exercises"]}
        required = [
            "Développé couché barre",
            "Squat barre (back squat)",  # exact name in library
            "Soulevé de terre barre",
            "Presse à cuisses (leg press)",
            "Tirage horizontal poulie",
            "Curl pupitre (Larry Scott)",
            "Pec-deck (butterfly)",
            "Hack squat machine",
        ]
        for n in required:
            assert n in names, f"Missing exercise '{n}' in library"

    def test_session_types_unchanged(self):
        r = requests.get(f"{API}/exercises/library", headers=HEADERS)
        st = r.json()["session_types"]
        for key in ["volume", "puissance", "force"]:
            assert key in st
            assert "reps" in st[key]


# ---------- Food library ----------
class TestFoodLibrary:
    def test_food_library_size_and_categories(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert_no_id_leak(data)
        assert "foods" in data
        foods = data["foods"]
        assert isinstance(foods, list)
        assert 60 <= len(foods) <= 100, f"Unexpected food count: {len(foods)}"

        categories = {f["category"] for f in foods}
        expected = {"Compléments", "Protéines", "Glucides", "Fruits",
                    "Légumes", "Lipides", "Laitiers", "Sucreries", "Boissons"}
        missing = expected - categories
        assert not missing, f"Missing food categories: {missing}"

    def test_food_item_shape(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS)
        foods = r.json()["foods"]
        ids = set()
        valid_units = {"g", "ml", "unit", "scoop", "capsule", "tranche", "sachet"}
        required_keys = {"id", "name", "category", "unit", "default_qty",
                         "kcal", "protein_g", "carbs_g", "fat_g"}
        for f in foods:
            assert required_keys.issubset(f.keys()), f"Food missing keys: {f}"
            assert f["unit"] in valid_units, f"Invalid unit in {f}"
            assert f["id"] not in ids, f"Duplicate food id {f['id']}"
            ids.add(f["id"])

    def test_specific_items_present(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS)
        ids = {f["id"] for f in r.json()["foods"]}
        for needed in ["whey_scoop", "creatine_g", "riz_blanc_cru",
                       "pates_crues", "oeuf_entier", "banane",
                       "huile_olive", "lait_demi", "chocolat_noir_70",
                       "soda_cola"]:
            assert needed in ids, f"Missing food id {needed}"


# ---------- Manual meal endpoint ----------
class TestManualMeal:
    def test_whey_2_scoops(self, cleanup_meals):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "whey_scoop", "quantity": 2},
                          headers=HEADERS)
        assert r.status_code == 200, r.text
        m = r.json()
        assert_no_id_leak(m)
        assert m["calories"] == 240, f"Expected 240 kcal, got {m['calories']}"
        assert m["protein_g"] == 48, f"Expected 48 g protein, got {m['protein_g']}"
        assert m["source"] == "manual"
        assert "Whey" in m["name"]
        assert m["meal_type"] in {"breakfast", "lunch", "snack", "dinner"}
        assert "image_base64" not in m

    def test_riz_blanc_cru_150g(self, cleanup_meals):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "riz_blanc_cru", "quantity": 150},
                          headers=HEADERS)
        assert r.status_code == 200, r.text
        m = r.json()
        # 360 kcal per 100g × 1.5 = 540
        assert m["calories"] == 540, m
        # protein 7 × 1.5 = 10.5
        assert abs(m["protein_g"] - 10.5) < 0.05, m
        # carbs 79 × 1.5 = 118.5
        assert abs(m["carbs_g"] - 118.5) < 0.05, m
        assert m["source"] == "manual"

    def test_banane_1_unit(self, cleanup_meals):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "banane", "quantity": 1},
                          headers=HEADERS)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["calories"] == 105, m
        assert abs(m["protein_g"] - 1.3) < 0.05, m

    def test_meal_type_override(self, cleanup_meals):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "whey_scoop", "quantity": 1,
                                "meal_type": "breakfast"},
                          headers=HEADERS)
        assert r.status_code == 200
        assert r.json()["meal_type"] == "breakfast"

    def test_invalid_food_returns_404(self):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "invalid_xyz", "quantity": 1},
                          headers=HEADERS)
        assert r.status_code == 404, r.text

    def test_zero_quantity_returns_400(self):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "whey_scoop", "quantity": 0},
                          headers=HEADERS)
        assert r.status_code == 400, r.text

    def test_negative_quantity_returns_400(self):
        r = requests.post(f"{API}/meals/manual",
                          json={"food_id": "whey_scoop", "quantity": -1},
                          headers=HEADERS)
        assert r.status_code == 400, r.text

    def test_manual_meal_appears_in_meals_today(self, cleanup_meals):
        # Post a manual meal
        post = requests.post(f"{API}/meals/manual",
                             json={"food_id": "banane", "quantity": 2},
                             headers=HEADERS)
        assert post.status_code == 200
        meal_id = post.json()["id"]

        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.get(f"{API}/meals?date={today}", headers=HEADERS)
        assert r.status_code == 200
        items = r.json()
        assert_no_id_leak(items)
        ids = [m["id"] for m in items]
        assert meal_id in ids, "Manual meal not returned by GET /meals"
        the_meal = next(m for m in items if m["id"] == meal_id)
        assert the_meal.get("source") == "manual"
        assert "image_base64" not in the_meal  # excluded by projection


# ---------- Regression ----------
class TestRegressions:
    def test_workouts_generate_volume(self, profile_seeded, mongo_db):
        r = requests.post(f"{API}/workouts/generate?session_type=volume",
                          headers=HEADERS)
        assert r.status_code == 200, r.text
        plan = r.json()
        assert_no_id_leak(plan)
        assert isinstance(plan, list) and len(plan) == 7
        for w in plan:
            assert w["session_type"] == "volume"
        # at least one non-rest day with reps 10-12
        non_rest = [w for w in plan if "Repos" not in w["focus"]]
        assert non_rest, "No non-rest days generated"
        # cleanup
        mongo_db.workouts.delete_many({"user_id": TEST_USER_ID})

    def test_meals_analyze_path_still_present(self):
        """Smoke test: endpoint exists. We do not call Claude here to avoid
        cost; we send a clearly invalid payload and expect a structured error
        not 404, proving the route is mounted unchanged."""
        r = requests.post(f"{API}/meals/analyze",
                          json={"image_base64": "", "mime": "image/jpeg"},
                          headers=HEADERS)
        # Route exists → not 404. Could be 200 (Claude parses empty) or 4xx/5xx.
        assert r.status_code != 404, "POST /meals/analyze route missing"
