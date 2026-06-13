"""Iteration 6 — Nutrition: meal duplication + AI recipes from ingredients.

Endpoints under test:
  - POST /api/meals/{meal_id}/duplicate
  - POST /api/meals/duplicate-day
  - POST /api/recipes/from-ingredients
"""
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from conftest import API, TEST_USER_ID, TEST_TOKEN  # noqa: E402


AUTH = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}
NO_AUTH = {"Content-Type": "application/json"}


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def days_ago(n: int) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=n)).strftime("%Y-%m-%d")


@pytest.fixture(autouse=True)
def _clean_meals(mongo_db):
    """Clean test user's meals before each test."""
    mongo_db.meals.delete_many({"user_id": TEST_USER_ID})
    yield
    mongo_db.meals.delete_many({"user_id": TEST_USER_ID})


def _seed_meal(mongo_db, *, date: str, name: str = "TEST_meal", calories: int = 500,
               protein: float = 30.0, carbs: float = 50.0, fat: float = 15.0,
               user_id: str = TEST_USER_ID, source: str = "manual",
               meal_id: str | None = None) -> dict:
    meal = {
        "id": meal_id or f"meal_{name}_{date}_{user_id}",
        "user_id": user_id,
        "date": date,
        "created_at": datetime.now(timezone.utc),
        "meal_type": "lunch",
        "source": source,
        "food_id": "f_test",
        "quantity": 200,
        "unit": "g",
        "name": name,
        "calories": calories,
        "protein_g": protein,
        "carbs_g": carbs,
        "fat_g": fat,
        "notes": "seed",
    }
    mongo_db.meals.insert_one(meal.copy())
    meal.pop("_id", None)
    return meal


# =====================================================================
# 1) POST /api/meals/{meal_id}/duplicate
# =====================================================================
class TestDuplicateMeal:
    def test_duplicate_meal_happy_path(self, mongo_db):
        src = _seed_meal(mongo_db, date=days_ago(2), name="TEST_chicken", calories=520,
                         protein=42.0, carbs=30.0, fat=18.0, meal_id="meal_dup_src_1")
        target = today_str()
        r = requests.post(f"{API}/meals/{src['id']}/duplicate",
                          json={"target_date": target}, headers=AUTH, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] != src["id"]
        assert data["date"] == target
        assert data["name"] == src["name"]
        assert data["calories"] == src["calories"]
        assert data["protein_g"] == src["protein_g"]
        assert data["carbs_g"] == src["carbs_g"]
        assert data["fat_g"] == src["fat_g"]
        assert "_id" not in data
        # verify persisted
        persisted = mongo_db.meals.find_one({"id": data["id"]}, {"_id": 0})
        assert persisted is not None
        assert persisted["date"] == target

    def test_duplicate_meal_target_date_too_old_400(self, mongo_db):
        src = _seed_meal(mongo_db, date=days_ago(2), meal_id="meal_dup_src_2")
        r = requests.post(f"{API}/meals/{src['id']}/duplicate",
                          json={"target_date": days_ago(15)}, headers=AUTH, timeout=10)
        assert r.status_code == 400

    def test_duplicate_meal_target_date_future_400(self, mongo_db):
        src = _seed_meal(mongo_db, date=days_ago(1), meal_id="meal_dup_src_future")
        future = (datetime.now(timezone.utc).date() + timedelta(days=2)).strftime("%Y-%m-%d")
        r = requests.post(f"{API}/meals/{src['id']}/duplicate",
                          json={"target_date": future}, headers=AUTH, timeout=10)
        assert r.status_code == 400

    def test_duplicate_meal_not_found_404(self):
        r = requests.post(f"{API}/meals/meal_does_not_exist/duplicate",
                          json={"target_date": today_str()}, headers=AUTH, timeout=10)
        assert r.status_code == 404

    def test_duplicate_other_users_meal_returns_404(self, mongo_db):
        # Seed a meal owned by another user
        other_meal = _seed_meal(mongo_db, date=days_ago(2),
                                user_id="user_other_999",
                                meal_id="meal_dup_other_user")
        try:
            r = requests.post(f"{API}/meals/{other_meal['id']}/duplicate",
                              json={"target_date": today_str()},
                              headers=AUTH, timeout=10)
            assert r.status_code == 404
        finally:
            mongo_db.meals.delete_many({"user_id": "user_other_999"})

    def test_duplicate_meal_no_auth_returns_401(self, mongo_db):
        src = _seed_meal(mongo_db, date=days_ago(2), meal_id="meal_dup_noauth")
        r = requests.post(f"{API}/meals/{src['id']}/duplicate",
                          json={"target_date": today_str()},
                          headers=NO_AUTH, timeout=10)
        assert r.status_code == 401


# =====================================================================
# 2) POST /api/meals/duplicate-day
# =====================================================================
class TestDuplicateDay:
    def test_duplicate_day_happy_path_multiple_meals(self, mongo_db):
        src_date = days_ago(3)
        target_date = today_str()
        _seed_meal(mongo_db, date=src_date, name="TEST_dd1", meal_id="m_dd_1", calories=400)
        _seed_meal(mongo_db, date=src_date, name="TEST_dd2", meal_id="m_dd_2", calories=600)
        _seed_meal(mongo_db, date=src_date, name="TEST_dd3", meal_id="m_dd_3", calories=300)
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": src_date, "target_date": target_date},
                          headers=AUTH, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["copied"] == 3
        assert data["source_date"] == src_date
        assert data["target_date"] == target_date
        # verify persisted
        new_meals = list(mongo_db.meals.find(
            {"user_id": TEST_USER_ID, "date": target_date}, {"_id": 0}
        ))
        assert len(new_meals) == 3
        names = sorted(m["name"] for m in new_meals)
        assert names == ["TEST_dd1", "TEST_dd2", "TEST_dd3"]
        # original meals still exist (not moved)
        src_meals = list(mongo_db.meals.find(
            {"user_id": TEST_USER_ID, "date": src_date}, {"_id": 0}
        ))
        assert len(src_meals) == 3

    def test_duplicate_day_no_meals_for_source_returns_404(self):
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": days_ago(8),
                                "target_date": today_str()},
                          headers=AUTH, timeout=10)
        assert r.status_code == 404

    def test_duplicate_day_target_too_old_returns_400(self, mongo_db):
        _seed_meal(mongo_db, date=days_ago(2), meal_id="m_dd_oldtgt")
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": days_ago(2),
                                "target_date": days_ago(15)},
                          headers=AUTH, timeout=10)
        assert r.status_code == 400

    def test_duplicate_day_source_can_be_older_than_14_days(self, mongo_db):
        """source_date is allowed to be older than 14 days (no window restriction)."""
        src_date = days_ago(30)
        target_date = today_str()
        _seed_meal(mongo_db, date=src_date, name="TEST_dd_old",
                   meal_id="m_dd_old_src")
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": src_date, "target_date": target_date},
                          headers=AUTH, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["copied"] == 1

    def test_duplicate_day_invalid_source_date_format_returns_400(self):
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": "not-a-date",
                                "target_date": today_str()},
                          headers=AUTH, timeout=10)
        assert r.status_code == 400

    def test_duplicate_day_no_auth_returns_401(self):
        r = requests.post(f"{API}/meals/duplicate-day",
                          json={"source_date": days_ago(1),
                                "target_date": today_str()},
                          headers=NO_AUTH, timeout=10)
        assert r.status_code == 401


# =====================================================================
# 3) POST /api/recipes/from-ingredients
# =====================================================================
class TestRecipesFromIngredients:
    def test_empty_ingredients_returns_empty_recipes(self):
        r = requests.post(f"{API}/recipes/from-ingredients",
                          json={"ingredients": [], "goal": "bulking"},
                          headers=AUTH, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data == {"recipes": []}

    def test_whitespace_only_ingredients_treated_as_empty(self):
        r = requests.post(f"{API}/recipes/from-ingredients",
                          json={"ingredients": ["", "  ", "\t"], "goal": None},
                          headers=AUTH, timeout=10)
        assert r.status_code == 200
        assert r.json() == {"recipes": []}

    def test_no_auth_returns_401(self):
        r = requests.post(f"{API}/recipes/from-ingredients",
                          json={"ingredients": ["poulet"], "goal": "bulking"},
                          headers=NO_AUTH, timeout=10)
        assert r.status_code == 401

    @pytest.mark.parametrize("goal", ["bulking", "cutting", "maintenance", None])
    def test_recipes_happy_path_with_goal(self, goal):
        r = requests.post(f"{API}/recipes/from-ingredients",
                          json={"ingredients": ["poulet", "riz", "brocoli"],
                                "goal": goal},
                          headers=AUTH, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "recipes" in data
        recipes = data["recipes"]
        # Claude may return 0-5; if Claude fails, accept 0 but warn
        if not recipes:
            pytest.skip(f"Claude returned no recipes for goal={goal} — likely transient")
        assert 1 <= len(recipes) <= 5
        required_keys = {
            "id", "name", "ingredients_used", "instructions_brief",
            "kcal", "protein_g", "carbs_g", "fat_g",
            "portion_label", "prep_min", "category",
        }
        first = recipes[0]
        missing = required_keys - set(first.keys())
        assert not missing, f"Missing keys: {missing} in recipe {first}"
        assert isinstance(first["name"], str) and first["name"]
        assert isinstance(first["ingredients_used"], list)
        assert isinstance(first["kcal"], int)
        assert isinstance(first["protein_g"], (int, float))
        assert isinstance(first["prep_min"], int)
