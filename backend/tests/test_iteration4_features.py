"""Iteration 4 backend tests:
- Transformations: new `view` field (front/back/side) persists & returns
- Dashboard week-macros endpoint structure
- PUT /auth/me name update
- /favorites POST/GET/DELETE roundtrip
"""
import pytest
import requests
from conftest import API, TEST_USER_ID


# ---------- TRANSFORMATIONS view field ----------
class TestTransformationsView:
    @pytest.fixture(autouse=True)
    def cleanup(self, mongo_db):
        yield
        mongo_db.transformations.delete_many({"user_id": TEST_USER_ID})

    def _post(self, auth_headers, person_image_b64, view):
        return requests.post(
            f"{API}/transformations",
            headers=auth_headers,
            json={"image_base64": person_image_b64, "mime": "image/jpeg", "view": view},
            timeout=120,
        )

    def test_post_with_view_front(self, auth_headers, person_image_b64):
        r = self._post(auth_headers, person_image_b64, "front")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["view"] == "front"
        assert "id" in data
        assert "_id" not in data

    def test_post_with_view_back(self, auth_headers, person_image_b64):
        r = self._post(auth_headers, person_image_b64, "back")
        assert r.status_code == 200
        assert r.json()["view"] == "back"

    def test_post_with_view_side(self, auth_headers, person_image_b64):
        r = self._post(auth_headers, person_image_b64, "side")
        assert r.status_code == 200
        assert r.json()["view"] == "side"

    def test_post_default_view_when_omitted(self, auth_headers, person_image_b64):
        r = requests.post(
            f"{API}/transformations",
            headers=auth_headers,
            json={"image_base64": person_image_b64, "mime": "image/jpeg"},
            timeout=120,
        )
        assert r.status_code == 200
        assert r.json()["view"] == "front"

    def test_view_is_normalized_lowercase(self, auth_headers, person_image_b64):
        r = self._post(auth_headers, person_image_b64, "BACK")
        assert r.status_code == 200
        assert r.json()["view"] == "back"

    def test_get_returns_view_field_on_each_item(self, auth_headers, person_image_b64):
        # Seed two views
        self._post(auth_headers, person_image_b64, "front")
        self._post(auth_headers, person_image_b64, "back")
        r = requests.get(f"{API}/transformations", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2
        views = {it.get("view") for it in items}
        assert "front" in views
        assert "back" in views
        for it in items:
            assert "view" in it
            assert "_id" not in it


# ---------- DASHBOARD week-macros ----------
class TestDashboardWeekMacros:
    def test_endpoint_returns_expected_shape(self, auth_headers):
        r = requests.get(f"{API}/dashboard/week-macros", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data and isinstance(data["days"], list)
        assert "avg" in data and "targets" in data
        assert "tracked_days" in data
        # 7-day window
        assert len(data["days"]) == 7
        for d in data["days"]:
            for k in ("date", "calories", "protein_g", "carbs_g", "fat_g"):
                assert k in d
        for k in ("calories", "protein_g", "carbs_g", "fat_g"):
            assert k in data["avg"]
            assert k in data["targets"]


# ---------- PUT /auth/me name update ----------
class TestAuthMeUpdate:
    def test_put_name_updates_user(self, auth_headers, mongo_db):
        new_name = "TEST_Updated_Name"
        r = requests.put(
            f"{API}/auth/me",
            headers=auth_headers,
            json={"name": new_name},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify via GET
        g = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        assert g.json()["name"] == new_name
        # Restore
        requests.put(f"{API}/auth/me", headers=auth_headers, json={"name": "Test User"}, timeout=15)


# ---------- FAVORITES CRUD ----------
class TestFavorites:
    @pytest.fixture(autouse=True)
    def cleanup(self, mongo_db):
        mongo_db.favorites.delete_many({"user_id": TEST_USER_ID})
        yield
        mongo_db.favorites.delete_many({"user_id": TEST_USER_ID})

    def test_create_list_delete_favorite(self, auth_headers):
        # Create
        r = requests.post(
            f"{API}/favorites",
            headers=auth_headers,
            json={"food_id": "whey_scoop", "quantity": 2},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        fav = r.json()
        assert "id" in fav
        fav_id = fav["id"]

        # List
        lst = requests.get(f"{API}/favorites", headers=auth_headers, timeout=15)
        assert lst.status_code == 200
        items = lst.json()
        assert any(f["id"] == fav_id for f in items)
        item = next(f for f in items if f["id"] == fav_id)
        assert item["food_id"] == "whey_scoop"
        assert item["quantity"] == 2
        assert "food" in item
        assert "macros_preview" in item
        assert item["macros_preview"]["calories"] > 0
        assert "_id" not in item

        # Delete
        d = requests.delete(f"{API}/favorites/{fav_id}", headers=auth_headers, timeout=15)
        assert d.status_code in (200, 204)

        # Verify gone
        lst2 = requests.get(f"{API}/favorites", headers=auth_headers, timeout=15)
        assert all(f["id"] != fav_id for f in lst2.json())

    def test_create_favorite_invalid_food_404(self, auth_headers):
        r = requests.post(
            f"{API}/favorites",
            headers=auth_headers,
            json={"food_id": "doesnt_exist", "quantity": 1},
            timeout=15,
        )
        assert r.status_code == 404
