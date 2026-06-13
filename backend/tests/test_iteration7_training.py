"""
Iteration 7 — TRAINING new features tests.
Covers:
  - POST /api/workouts/cycle/generate (weeks clamp, pattern override, defaults)
  - GET  /api/workouts/calendar (current month, specific month, invalid month)
  - GET  /api/workouts/history (only completed, limit clamp)
  - Backwards-compat: /workouts/week, /workouts/today, /workouts/{id}/complete,
    /workouts/{id}/perf, /perf/recent
Does NOT touch nutrition endpoints.
"""
import pytest
import requests
from datetime import date, timedelta

from conftest import API, TEST_USER_ID


# --- Setup: ensure profile exists for the test user ---
@pytest.fixture(scope="module", autouse=True)
def ensure_profile(auth_headers_module):
    """Profile is required to generate workouts."""
    payload = {
        "weight_kg": 75.0,
        "height_cm": 180.0,
        "age": 30,
        "gender": "male",
        "goal": "maintain",
        "activity_level": "moderate",
    }
    r = requests.put(f"{API}/profile", json=payload, headers=auth_headers_module)
    assert r.status_code == 200, f"profile setup failed: {r.status_code} {r.text}"


@pytest.fixture(scope="module")
def auth_headers_module():
    return {
        "Authorization": "Bearer test_session_token_abc",
        "Content-Type": "application/json",
    }


# ============================================================
# CYCLE GENERATE
# ============================================================
class TestCycleGenerate:
    def test_cycle_generate_default_4_weeks_default_pattern(self, auth_headers_module):
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=4", headers=auth_headers_module)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["weeks"] == 4
        assert data["pattern"] == ["volume", "volume", "force", "puissance"]
        # 4 weeks * 7 days = 28 workouts
        assert data["total_workouts"] == 28

    def test_cycle_generate_1_week(self, auth_headers_module):
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=1", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert data["weeks"] == 1
        assert data["total_workouts"] == 7

    def test_cycle_generate_8_weeks(self, auth_headers_module):
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=8", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert data["weeks"] == 8
        assert data["total_workouts"] == 56

    def test_cycle_generate_clamps_to_8(self, auth_headers_module):
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=10", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert data["weeks"] == 8, "weeks must clamp to 8"
        assert data["total_workouts"] == 56

    def test_cycle_generate_custom_pattern(self, auth_headers_module):
        r = requests.post(
            f"{API}/workouts/cycle/generate?weeks=4&pattern=force,puissance,volume,volume",
            headers=auth_headers_module,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["pattern"] == ["force", "puissance", "volume", "volume"]

    def test_cycle_workouts_have_cycle_fields(self, auth_headers_module):
        # Generate a clean cycle
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=2", headers=auth_headers_module)
        assert r.status_code == 200

        # Verify generated workouts via /workouts/week
        wk = requests.get(f"{API}/workouts/week", headers=auth_headers_module)
        assert wk.status_code == 200
        workouts = wk.json()
        assert len(workouts) > 0
        # Each generated workout must have cycle_week_index + cycle_session_type
        for w in workouts:
            assert "cycle_week_index" in w, f"missing cycle_week_index in {w}"
            assert "cycle_session_type" in w, f"missing cycle_session_type in {w}"
            assert w["cycle_session_type"] in ("volume", "puissance", "force")

    def test_cycle_generate_requires_auth(self):
        r = requests.post(f"{API}/workouts/cycle/generate?weeks=4")
        assert r.status_code == 401

    def test_cycle_generate_invalid_pattern_falls_back_to_default(self, auth_headers_module):
        r = requests.post(
            f"{API}/workouts/cycle/generate?weeks=2&pattern=xxx,yyy",
            headers=auth_headers_module,
        )
        assert r.status_code == 200
        data = r.json()
        # All entries invalid → falls back to default pattern
        assert data["pattern"] == ["volume", "volume", "force", "puissance"]


# ============================================================
# CALENDAR
# ============================================================
class TestCalendar:
    def test_calendar_current_month_default(self, auth_headers_module):
        # First ensure we have a cycle
        requests.post(f"{API}/workouts/cycle/generate?weeks=4", headers=auth_headers_module)
        r = requests.get(f"{API}/workouts/calendar", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert "month" in data
        assert "days" in data
        # month is YYYY-MM current
        today = date.today()
        assert data["month"] == f"{today.year:04d}-{today.month:02d}"
        # Should have at least one day populated (today is in cycle)
        assert len(data["days"]) > 0
        # Validate structure of each day
        for d, info in data["days"].items():
            assert info["session_type"] in ("volume", "force", "puissance"), (
                f"Invalid session_type {info['session_type']} for {d}"
            )
            assert "id" in info
            assert "completed" in info
            assert "focus" in info
            assert "exercises_count" in info
            assert isinstance(info["exercises_count"], int)

    def test_calendar_specific_month(self, auth_headers_module):
        today = date.today()
        month_str = f"{today.year:04d}-{today.month:02d}"
        r = requests.get(
            f"{API}/workouts/calendar?month={month_str}",
            headers=auth_headers_module,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["month"] == month_str

    def test_calendar_invalid_month_format(self, auth_headers_module):
        r = requests.get(
            f"{API}/workouts/calendar?month=2025-13",
            headers=auth_headers_module,
        )
        assert r.status_code == 400

    def test_calendar_garbage_month(self, auth_headers_module):
        r = requests.get(
            f"{API}/workouts/calendar?month=foobar",
            headers=auth_headers_module,
        )
        assert r.status_code == 400

    def test_calendar_requires_auth(self):
        r = requests.get(f"{API}/workouts/calendar")
        assert r.status_code == 401

    def test_calendar_far_future_empty_month(self, auth_headers_module):
        r = requests.get(
            f"{API}/workouts/calendar?month=2099-06",
            headers=auth_headers_module,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["month"] == "2099-06"
        assert data["days"] == {}


# ============================================================
# HISTORY
# ============================================================
class TestHistory:
    def test_history_empty_initially(self, auth_headers_module, mongo_db):
        # Wipe completion state to start fresh
        mongo_db.workouts.update_many(
            {"user_id": TEST_USER_ID},
            {"$set": {"completed": False}},
        )
        r = requests.get(f"{API}/workouts/history", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 0

    def test_history_returns_only_completed(self, auth_headers_module):
        # Generate cycle, mark some complete, fetch history
        requests.post(f"{API}/workouts/cycle/generate?weeks=2", headers=auth_headers_module)
        wk = requests.get(f"{API}/workouts/week", headers=auth_headers_module).json()
        assert len(wk) > 0
        # complete first 3 workouts
        completed_ids = []
        for w in wk[:3]:
            cr = requests.post(
                f"{API}/workouts/{w['id']}/complete",
                headers=auth_headers_module,
            )
            assert cr.status_code == 200, cr.text
            completed_ids.append(w["id"])

        r = requests.get(f"{API}/workouts/history", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 3
        for item in data:
            assert item["id"] in completed_ids
            assert "date" in item
            assert "focus" in item
            assert item["session_type"] in ("volume", "force", "puissance")
            assert "duration_min" in item
            assert "exercises" in item
            assert "performances" in item
            assert isinstance(item["exercises"], list)
            assert isinstance(item["performances"], list)

    def test_history_sorted_desc_by_date(self, auth_headers_module):
        r = requests.get(f"{API}/workouts/history", headers=auth_headers_module)
        assert r.status_code == 200
        dates = [item["date"] for item in r.json()]
        assert dates == sorted(dates, reverse=True), "history must be sorted desc by date"

    def test_history_limit_clamps_to_100(self, auth_headers_module):
        # limit=500 should not crash; max 100 returned
        r = requests.get(f"{API}/workouts/history?limit=500", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert len(data) <= 100

    def test_history_limit_respected(self, auth_headers_module):
        r = requests.get(f"{API}/workouts/history?limit=2", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        assert len(data) <= 2

    def test_history_requires_auth(self):
        r = requests.get(f"{API}/workouts/history")
        assert r.status_code == 401


# ============================================================
# BACKWARDS COMPAT
# ============================================================
class TestBackwardsCompat:
    def test_workouts_week_still_works(self, auth_headers_module):
        r = requests.get(f"{API}/workouts/week", headers=auth_headers_module)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_workouts_today_still_works(self, auth_headers_module):
        # Make sure today's workout exists
        requests.post(f"{API}/workouts/cycle/generate?weeks=1", headers=auth_headers_module)
        r = requests.get(f"{API}/workouts/today", headers=auth_headers_module)
        assert r.status_code == 200
        data = r.json()
        # should be a dict with today's workout (possibly empty if no workout for today)
        assert isinstance(data, dict)
        if data:
            assert data["date"] == date.today().isoformat()

    def test_complete_perf_and_recent(self, auth_headers_module):
        # Generate cycle, take a workout, log perf, fetch recent
        requests.post(f"{API}/workouts/cycle/generate?weeks=1", headers=auth_headers_module)
        wk = requests.get(f"{API}/workouts/week", headers=auth_headers_module).json()
        assert len(wk) > 0
        w0 = wk[0]
        # log a perf
        perf = {
            "workout_id": w0["id"],
            "exercise_name": "Pompes",
            "weight_kg": 0.0,
            "reps": 15,
            "sets": 3,
        }
        pr = requests.post(
            f"{API}/workouts/{w0['id']}/perf",
            json=perf,
            headers=auth_headers_module,
        )
        assert pr.status_code in (200, 201), pr.text

        # mark complete
        cr = requests.post(
            f"{API}/workouts/{w0['id']}/complete",
            headers=auth_headers_module,
        )
        assert cr.status_code == 200

        # recent
        rr = requests.get(f"{API}/perf/recent", headers=auth_headers_module)
        assert rr.status_code == 200
        recent = rr.json()
        # accepts list or dict-with-records
        assert recent is not None
