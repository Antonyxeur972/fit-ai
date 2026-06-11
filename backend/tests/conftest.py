"""Shared fixtures for backend tests."""
import os
import base64
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
# Force-use the public URL configured by frontend env, fallback to local
try:
    with open(Path(__file__).resolve().parents[2] / "frontend" / ".env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
except Exception:
    pass

API = f"{BASE_URL}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

TEST_USER_ID = "user_test_001"
TEST_EMAIL = "TEST_fitness@example.com"
TEST_TOKEN = "test_session_token_abc"


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session", autouse=True)
def seed_user(mongo_db):
    """Seed test user + session before suite, cleanup after."""
    now = datetime.now(timezone.utc)
    mongo_db.users.update_one(
        {"user_id": TEST_USER_ID},
        {
            "$set": {
                "user_id": TEST_USER_ID,
                "email": TEST_EMAIL,
                "name": "Test User",
                "picture": None,
                "created_at": now,
                "onboarded": False,
            }
        },
        upsert=True,
    )
    mongo_db.user_sessions.update_one(
        {"session_token": TEST_TOKEN},
        {
            "$set": {
                "session_token": TEST_TOKEN,
                "user_id": TEST_USER_ID,
                "expires_at": now + timedelta(days=7),
                "created_at": now,
            }
        },
        upsert=True,
    )
    yield
    # Cleanup
    mongo_db.users.delete_many({"user_id": TEST_USER_ID})
    mongo_db.user_sessions.delete_many({"user_id": TEST_USER_ID})
    mongo_db.profiles.delete_many({"user_id": TEST_USER_ID})
    mongo_db.meals.delete_many({"user_id": TEST_USER_ID})
    mongo_db.activity.delete_many({"user_id": TEST_USER_ID})
    mongo_db.workouts.delete_many({"user_id": TEST_USER_ID})
    mongo_db.transformations.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def meal_image_b64():
    with open("/tmp/meal.jpg", "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


@pytest.fixture(scope="session")
def person_image_b64():
    with open("/tmp/person.jpg", "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API
