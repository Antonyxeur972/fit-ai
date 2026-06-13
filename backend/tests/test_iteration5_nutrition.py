"""Iteration 5 — Nutrition AI search, manual_ai meals, recent foods, date validation,
expanded food library, and meals?date past-day fetch."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

from conftest import API, TEST_TOKEN, TEST_USER_ID


HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# ---------- Helpers ----------

def _cleanup(mongo_db):
    mongo_db.meals.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture(autouse=True)
def _isolate(mongo_db):
    _cleanup(mongo_db)
    yield
    _cleanup(mongo_db)


# ---------- 1. POST /api/foods/ai-search ----------

class TestAiFoodSearch:
    def test_ai_search_short_query_returns_empty(self):
        r = requests.post(f"{API}/foods/ai-search", json={"query": "a"}, headers=HEADERS, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body == {"suggestions": []}

    def test_ai_search_empty_query_returns_empty(self):
        r = requests.post(f"{API}/foods/ai-search", json={"query": ""}, headers=HEADERS, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"suggestions": []}

    def test_ai_search_known_food_returns_suggestions(self):
        # Ratatouille — should be recognized by Claude
        r = requests.post(f"{API}/foods/ai-search", json={"query": "ratatouille"}, headers=HEADERS, timeout=45)
        assert r.status_code == 200
        body = r.json()
        assert "suggestions" in body
        sugg = body["suggestions"]
        assert isinstance(sugg, list)
        assert 1 <= len(sugg) <= 3, f"Expected 1-3 suggestions, got {len(sugg)}"
        s = sugg[0]
        for k in ("id", "name", "category", "unit", "default_qty", "kcal",
                  "protein_g", "carbs_g", "fat_g", "portion_label", "source"):
            assert k in s, f"Missing key: {k}"
        assert s["source"] == "ai"
        assert s["unit"] in ("g", "ml", "unit")
        assert s["kcal"] > 0
        assert isinstance(s["protein_g"], (int, float))

    def test_ai_search_requires_auth(self):
        r = requests.post(f"{API}/foods/ai-search", json={"query": "pizza"}, timeout=10)
        assert r.status_code in (401, 403)


# ---------- 2. POST /api/meals/manual_ai ----------

class TestManualAiMeal:
    def test_manual_ai_persists_meal_with_ai_source_and_snapshot(self, mongo_db):
        payload = {
            "name": "Ratatouille maison",
            "category": "Plats préparés",
            "quantity": 250,
            "unit": "g",
            "kcal_per_unit": 70.0,
            "protein_g_per_unit": 2.0,
            "carbs_g_per_unit": 8.0,
            "fat_g_per_unit": 3.5,
            "meal_type": "lunch",
        }
        r = requests.post(f"{API}/meals/manual_ai", json=payload, headers=HEADERS, timeout=15)
        assert r.status_code == 200, r.text
        meal = r.json()
        assert meal["source"] == "ai"
        assert meal["name"] == "Ratatouille maison"
        assert meal["meal_type"] == "lunch"
        assert "ai_food_snapshot" in meal
        snap = meal["ai_food_snapshot"]
        assert snap["name"] == "Ratatouille maison"
        assert snap["kcal_per_unit"] == 70.0
        # Macros = per-100g * 2.5
        assert meal["calories"] == round(70.0 * 2.5)
        assert meal["protein_g"] == round(2.0 * 2.5, 1)
        assert meal["carbs_g"] == round(8.0 * 2.5, 1)
        assert meal["fat_g"] == round(3.5 * 2.5, 1)
        # Persistence check
        stored = mongo_db.meals.find_one({"id": meal["id"]})
        assert stored is not None
        assert stored["source"] == "ai"
        assert stored["ai_food_snapshot"]["name"] == "Ratatouille maison"
        # No _id leak
        assert "_id" not in meal

    def test_manual_ai_unit_per_unit_no_100_ratio(self):
        # unit="unit" => raw multiply, not /100
        payload = {
            "name": "Cookie maison",
            "quantity": 2,
            "unit": "unit",
            "kcal_per_unit": 200.0,
            "protein_g_per_unit": 3.0,
            "carbs_g_per_unit": 25.0,
            "fat_g_per_unit": 10.0,
        }
        r = requests.post(f"{API}/meals/manual_ai", json=payload, headers=HEADERS, timeout=15)
        assert r.status_code == 200
        meal = r.json()
        assert meal["calories"] == 400  # 200 * 2
        assert meal["protein_g"] == 6.0

    def test_manual_ai_rejects_date_older_than_14_days(self):
        old = (datetime.now(timezone.utc).date() - timedelta(days=20)).isoformat()
        payload = {
            "name": "Test Old",
            "quantity": 100,
            "unit": "g",
            "kcal_per_unit": 100.0,
            "protein_g_per_unit": 5.0,
            "carbs_g_per_unit": 10.0,
            "fat_g_per_unit": 2.0,
            "date": old,
        }
        r = requests.post(f"{API}/meals/manual_ai", json=payload, headers=HEADERS, timeout=15)
        assert r.status_code == 400
        assert "14" in r.text or "derniers" in r.text

    def test_manual_ai_rejects_quantity_zero(self):
        payload = {
            "name": "Bad", "quantity": 0, "unit": "g",
            "kcal_per_unit": 10.0, "protein_g_per_unit": 1.0,
            "carbs_g_per_unit": 1.0, "fat_g_per_unit": 1.0,
        }
        r = requests.post(f"{API}/meals/manual_ai", json=payload, headers=HEADERS, timeout=15)
        assert r.status_code == 400

    def test_manual_ai_accepts_past_date_within_14_days(self, mongo_db):
        past = (datetime.now(timezone.utc).date() - timedelta(days=5)).isoformat()
        payload = {
            "name": "Salade",
            "quantity": 200, "unit": "g",
            "kcal_per_unit": 50.0, "protein_g_per_unit": 2.0,
            "carbs_g_per_unit": 5.0, "fat_g_per_unit": 1.0,
            "date": past,
        }
        r = requests.post(f"{API}/meals/manual_ai", json=payload, headers=HEADERS, timeout=15)
        assert r.status_code == 200
        assert r.json()["date"] == past


# ---------- 3. GET /api/foods/recent ----------

class TestFoodsRecent:
    def _create_manual_ai(self, name, qty=100, days_ago=0):
        d = (datetime.now(timezone.utc).date() - timedelta(days=days_ago)).isoformat()
        r = requests.post(
            f"{API}/meals/manual_ai",
            json={
                "name": name, "quantity": qty, "unit": "g",
                "kcal_per_unit": 100.0, "protein_g_per_unit": 5.0,
                "carbs_g_per_unit": 10.0, "fat_g_per_unit": 2.0,
                "date": d,
            },
            headers=HEADERS, timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_recent_empty_when_no_meals(self):
        r = requests.get(f"{API}/foods/recent", headers=HEADERS, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body == {"items": []}

    def test_recent_returns_distinct_with_counts(self):
        # Create 3 meals: 2 with same name
        self._create_manual_ai("Poulet rôti", qty=150)
        self._create_manual_ai("Poulet rôti", qty=180)
        self._create_manual_ai("Riz basmati", qty=120)

        r = requests.get(f"{API}/foods/recent", headers=HEADERS, timeout=10)
        assert r.status_code == 200
        items = r.json()["items"]
        names = [it["name"] for it in items]
        assert "Poulet rôti" in names
        assert "Riz basmati" in names
        # Distinct
        assert len(names) == len(set(names))
        # count for Poulet rôti must be 2
        poulet = next(i for i in items if i["name"] == "Poulet rôti")
        assert poulet["count"] == 2
        # Shape
        for k in ("name", "count", "source", "quantity", "unit", "calories",
                  "protein_g", "carbs_g", "fat_g", "ai_snapshot"):
            assert k in poulet, f"missing key {k}"
        assert poulet["source"] == "ai"
        assert poulet["ai_snapshot"] is not None
        assert poulet["ai_snapshot"]["kcal_per_unit"] == 100.0

    def test_recent_limited_to_12(self):
        for i in range(15):
            self._create_manual_ai(f"Aliment {i}")
        r = requests.get(f"{API}/foods/recent", headers=HEADERS, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["items"]) == 12


# ---------- 4. POST /api/meals/manual date validation ----------

class TestManualMealDateValidation:
    def test_manual_rejects_date_older_than_14_days(self):
        old = (datetime.now(timezone.utc).date() - timedelta(days=20)).isoformat()
        # Use a real food_id from the library
        lib = requests.get(f"{API}/foods/library", headers=HEADERS).json()["foods"]
        food_id = lib[0]["id"]
        payload = {"food_id": food_id, "quantity": 100, "date": old}
        r = requests.post(f"{API}/meals/manual", json=payload, headers=HEADERS, timeout=10)
        assert r.status_code == 400
        # French message
        assert "14 derniers jours" in r.text or "14" in r.text

    def test_manual_accepts_date_exactly_14_days_back(self):
        lib = requests.get(f"{API}/foods/library", headers=HEADERS).json()["foods"]
        food_id = lib[0]["id"]
        d14 = (datetime.now(timezone.utc).date() - timedelta(days=14)).isoformat()
        r = requests.post(
            f"{API}/meals/manual",
            json={"food_id": food_id, "quantity": 100, "date": d14},
            headers=HEADERS, timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["date"] == d14

    def test_manual_rejects_future_date(self):
        lib = requests.get(f"{API}/foods/library", headers=HEADERS).json()["foods"]
        food_id = lib[0]["id"]
        future = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
        r = requests.post(
            f"{API}/meals/manual",
            json={"food_id": food_id, "quantity": 100, "date": future},
            headers=HEADERS, timeout=10,
        )
        assert r.status_code == 400


# ---------- 5. GET /api/foods/library expanded ----------

class TestFoodsLibrary:
    def test_library_has_116_items(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS, timeout=10)
        assert r.status_code == 200
        foods = r.json()["foods"]
        assert len(foods) >= 110, f"expected ~116, got {len(foods)}"

    def test_library_contains_expected_categories(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS, timeout=10)
        foods = r.json()["foods"]
        cats = {f["category"] for f in foods}
        for c in ("Plats préparés", "Snacks", "Glucides", "Protéines", "Légumes", "Boissons"):
            assert c in cats, f"Missing category: {c}"

    def test_library_items_have_macros(self):
        r = requests.get(f"{API}/foods/library", headers=HEADERS, timeout=10)
        foods = r.json()["foods"]
        for f in foods[:5]:
            for k in ("id", "name", "category", "unit", "kcal",
                      "protein_g", "carbs_g", "fat_g"):
                assert k in f, f"Food missing key {k}: {f}"


# ---------- 6. GET /api/meals?date&include_archived ----------

class TestMealsByDate:
    def test_meals_by_past_date_returns_archived(self, mongo_db):
        # Create meal 10 days ago via manual_ai
        past = (datetime.now(timezone.utc).date() - timedelta(days=10)).isoformat()
        r = requests.post(
            f"{API}/meals/manual_ai",
            json={
                "name": "Repas passé", "quantity": 100, "unit": "g",
                "kcal_per_unit": 80.0, "protein_g_per_unit": 3.0,
                "carbs_g_per_unit": 5.0, "fat_g_per_unit": 2.0,
                "date": past,
            }, headers=HEADERS, timeout=15,
        )
        assert r.status_code == 200
        # Manually flag as archived (lifecycle archives >7d)
        mongo_db.meals.update_many(
            {"user_id": TEST_USER_ID, "date": past},
            {"$set": {"archived": True}},
        )

        # Without include_archived → empty
        r1 = requests.get(f"{API}/meals?date={past}", headers=HEADERS, timeout=10)
        assert r1.status_code == 200
        assert all(not m.get("archived") for m in r1.json())

        # With include_archived → should return the meal
        r2 = requests.get(f"{API}/meals?date={past}&include_archived=true", headers=HEADERS, timeout=10)
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) >= 1
        assert any(m["name"] == "Repas passé" for m in items)
        # No _id leak, no image_base64
        for m in items:
            assert "_id" not in m
            assert "image_base64" not in m
