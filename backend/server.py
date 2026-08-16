"""
Performance Fitness App - Backend
FastAPI + MongoDB + Emergent Google Auth + Claude Sonnet 4.5 vision
"""
import os
import uuid
import json
import re
import hashlib
import hmac
import logging
import secrets
import unicodedata
from pathlib import Path
from datetime import datetime, timezone, timedelta, date as dt_date
from typing import List, Optional, Dict, Any, Set
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from anthropic import AsyncAnthropic

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from legal_pages import (
    delete_account_html,
    legal_home_html,
    privacy_html,
    privacy_request_html,
    terms_html,
)

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
anthropic_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
AI_DAILY_LIMIT = int(os.environ.get("FITAI_AI_DAILY_LIMIT", "20"))
AI_MONTHLY_LIMIT = int(os.environ.get("FITAI_AI_MONTHLY_LIMIT", "300"))
AI_ESTIMATED_CENTS_PER_CALL = float(os.environ.get("FITAI_AI_ESTIMATED_CENTS_PER_CALL", "3"))
ALGORITHM_ONLY_AI = os.environ.get("FITAI_ALGORITHM_ONLY", "").lower() in {"1", "true", "yes", "on"}
PLAY_REVIEW_USERNAME = os.environ.get(
    "FITAI_PLAY_REVIEW_USERNAME", "fitai"
).strip()
PLAY_REVIEW_PASSWORD_HASH = os.environ.get(
    "FITAI_PLAY_REVIEW_PASSWORD_HASH",
    "2f3d1df9c7cfecf36f42b1ea4d35456f0ba55ccd8ab5b586c9b2cda33d1db191",
).strip().lower()
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("FITAI_CORS_ORIGINS", "*").split(",")
    if origin.strip()
] or ["*"]

import certifi
client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client[DB_NAME]

app = FastAPI(title="Performance Fitness API")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        response.headers["Cache-Control"] = "no-store"
    if request.url.path in {"/legal", "/privacy", "/terms", "/delete-account", "/privacy-request"}:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'self'; form-action 'self'"
        )
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/legal", response_class=HTMLResponse)
async def legal_home():
    return HTMLResponse(legal_home_html())


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    return HTMLResponse(privacy_html())


@app.get("/terms", response_class=HTMLResponse)
async def terms_of_use():
    return HTMLResponse(terms_html())


@app.get("/delete-account", response_class=HTMLResponse)
async def delete_account_page():
    return HTMLResponse(delete_account_html())


@app.get("/privacy-request", response_class=HTMLResponse)
async def privacy_request_page(type: str = "other"):
    return HTMLResponse(privacy_request_html(type))


@app.get("/legal-background", response_class=FileResponse)
async def legal_background():
    return FileResponse(ROOT_DIR / "static" / "legal-background.jpg", media_type="image/jpeg")

api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("fitness")


# --- Helpers ---
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_local() -> datetime:
    tz_name = os.environ.get("FITAI_TIMEZONE", "Europe/Paris")
    if ZoneInfo:
        return datetime.now(ZoneInfo(tz_name))
    return datetime.now(timezone(timedelta(hours=int(os.environ.get("FITAI_UTC_OFFSET", "1")))))


def today_str() -> str:
    return now_local().date().isoformat()


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def strip_id(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def normalize_code(code: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9_-]", "", (code or "").upper().strip())
    return cleaned[:24]


def ai_feature_limit(feature: str) -> int:
    key = "FITAI_AI_LIMIT_" + re.sub(r"[^A-Z0-9]+", "_", feature.upper()).strip("_")
    return int(os.environ.get(key, "0") or 0)


async def record_ai_usage(user_id: str, feature: str, units: int = 1) -> Dict[str, Any]:
    if ALGORITHM_ONLY_AI:
        return {
            "allowed": False,
            "algorithm_only": True,
            "daily_used": 0,
            "monthly_used": 0,
        }
    day = today_str()
    month = day[:7]
    daily_used = await db.ai_usage.count_documents({"user_id": user_id, "date": day})
    monthly_used = await db.ai_usage.count_documents({"user_id": user_id, "month": month})
    feature_limit = ai_feature_limit(feature)
    feature_used = 0
    if feature_limit:
        feature_used = await db.ai_usage.count_documents({"user_id": user_id, "date": day, "feature": feature})
    if daily_used + units > AI_DAILY_LIMIT:
        raise HTTPException(429, "Limite IA quotidienne atteinte. Réessaie demain.")
    if monthly_used + units > AI_MONTHLY_LIMIT:
        raise HTTPException(429, "Limite IA mensuelle atteinte.")
    if feature_limit and feature_used + units > feature_limit:
        raise HTTPException(429, "Limite IA atteinte pour cette fonction aujourd'hui.")
    doc = {
        "id": new_id("aiu"),
        "user_id": user_id,
        "feature": feature,
        "units": units,
        "estimated_cost_cents": round(AI_ESTIMATED_CENTS_PER_CALL * units, 3),
        "date": day,
        "month": month,
        "created_at": now_utc(),
        "model": CLAUDE_MODEL,
    }
    await db.ai_usage.insert_one(doc)
    return {
        "allowed": True,
        "algorithm_only": False,
        "daily_used": daily_used + units,
        "monthly_used": monthly_used + units,
        "doc": doc,
    }


async def get_current_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# --- Models ---
class SessionLoginRequest(BaseModel):
    session_id: str


class ReviewLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=200)


class AuthMeResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    onboarded: bool = False


class ProfileIn(BaseModel):
    weight_kg: float = Field(ge=30, le=350)
    height_cm: float = Field(ge=120, le=230)
    age: int = Field(ge=18, le=100)
    gender: str  # "male" | "female"
    goal: str  # "lose" | "gain" | "maintain"
    activity_level: str = "moderate"  # sedentary | light | moderate | active | very_active
    waist_cm: Optional[float] = None
    neck_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    health_data_consent: Optional[bool] = None
    legal_version: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None


class PrivacyRequestIn(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    request_type: str = Field(default="other", max_length=32)
    message: Optional[str] = Field(default=None, max_length=1500)
    confirmation: bool = False
    website: Optional[str] = Field(default=None, max_length=200)


class FavoriteIn(BaseModel):
    food_id: str
    quantity: float
    label: Optional[str] = None  # custom name, e.g. "Porridge du matin"


class Profile(ProfileIn):
    user_id: str
    daily_calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    bmr: int
    updated_at: datetime


class Meal(BaseModel):
    id: str
    user_id: str
    date: str
    created_at: datetime
    image_base64: Optional[str] = None
    name: str
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    notes: Optional[str] = None


class MealAnalyzeRequest(BaseModel):
    image_base64: str  # raw base64, no data prefix
    mime: str = "image/jpeg"
    meal_type: Optional[str] = None  # breakfast | lunch | dinner | snack
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today


class ManualMealRequest(BaseModel):
    food_id: str
    quantity: float
    meal_type: Optional[str] = None
    name_override: Optional[str] = None
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today


class AiFoodSearchRequest(BaseModel):
    query: str


class ManualAiMealRequest(BaseModel):
    name: str
    category: Optional[str] = "Plats préparés"
    quantity: float
    unit: str = "g"  # "g" | "ml" | "unit"
    kcal_per_unit: float  # per 100g/100ml OR per 1 unit
    protein_g_per_unit: float
    carbs_g_per_unit: float
    fat_g_per_unit: float
    meal_type: Optional[str] = None
    date: Optional[str] = None


class MealUpdateRequest(BaseModel):
    date: Optional[str] = None
    meal_type: Optional[str] = None


class ActivityIn(BaseModel):
    date: str
    steps: int = 0
    cardio_minutes: int = 0
    cardio_type: Optional[str] = None


class StepsIn(BaseModel):
    date: Optional[str] = None
    steps: int


class ExercisePerf(BaseModel):
    workout_id: str
    exercise_name: str
    weight_kg: float
    reps: int
    sets: int = 1
    notes: Optional[str] = None


class WorkoutUpdate(BaseModel):
    session_type: Optional[str] = None  # volume | puissance | force
    focus: Optional[str] = None
    duration_min: Optional[int] = None
    exercises: Optional[List[Dict[str, Any]]] = None


class WorkoutCreateManual(BaseModel):
    date: str
    title: Optional[str] = "Séance ajoutée"
    session_type: Optional[str] = "volume"
    focus: Optional[str] = "Séance ajoutée"
    duration_min: Optional[int] = 45
    exercises: Optional[List[Dict[str, Any]]] = None
    completed: bool = True


class TransformationPhoto(BaseModel):
    id: str
    user_id: str
    date: str
    created_at: datetime
    image_base64: str
    weight_kg: Optional[float] = None
    ai_feedback: Optional[str] = None


class TransformationIn(BaseModel):
    image_base64: str
    mime: str = "image/jpeg"
    weight_kg: Optional[float] = None
    view: Optional[str] = "front"  # legacy field, no longer rendered
    taken_at: Optional[str] = None  # YYYY-MM-DD (user-chosen date)


class DuplicateMealRequest(BaseModel):
    target_date: str  # YYYY-MM-DD


class DuplicateDayRequest(BaseModel):
    source_date: str
    target_date: str


class RecipeFromIngredientsRequest(BaseModel):
    ingredients: List[str]
    goal: Optional[str] = None  # "cutting" | "bulking" | "maintenance" | None


class ProgramCreateRequest(BaseModel):
    weeks: int  # 4-24
    frequency: int  # 2..7
    split: str  # "ppl" | "fullbody" | "split" | "upper_lower" | "home"
    goal_label: Optional[str] = "Hypertrophie"
    goal: Optional[str] = None  # "muscle" | "strength" | "fat_loss" | "endurance"
    cycle_pattern: Optional[List[str]] = None  # legacy
    block_weeks: Optional[Dict[str, int]] = None  # {"volume": 2, "puissance": 1, "force": 2}
    training_days: Optional[List[int]] = None  # weekdays 0=Mon..6=Sun, len == frequency
    training_times: Optional[Dict[str, str]] = None  # {"0": "18:30", ...} by weekday


class ProgramDayUpdate(BaseModel):
    focus: Optional[str] = None
    exercises: List[Dict[str, Any]]


class ProgramDayCreate(BaseModel):
    focus: Optional[str] = None
    exercises: Optional[List[Dict[str, Any]]] = None
    session_type: Optional[str] = None


class ProgramDayWorkoutRequest(BaseModel):
    program_id: Optional[str] = None
    week_index: Optional[int] = None
    day_index: Optional[int] = None
    date: Optional[str] = None


class AiExerciseRequest(BaseModel):
    description: str


class TravelModeRequest(BaseModel):
    days: int  # length of trip
    goal_label: Optional[str] = "Maintien"


class SilhouetteRequest(BaseModel):
    sex: str  # "male" | "female"
    level: int  # 1..5  (1 = très mince ; 5 = très musclé)


class Estimate1RMRequest(BaseModel):
    squat_kg: Optional[float] = None
    squat_reps: Optional[int] = None
    bench_kg: Optional[float] = None
    bench_reps: Optional[int] = None
    deadlift_kg: Optional[float] = None
    deadlift_reps: Optional[int] = None
    ohp_kg: Optional[float] = None  # développé militaire
    ohp_reps: Optional[int] = None


class MascotRequest(BaseModel):
    animal: str  # lion | tigre | loup | ours | aigle


class NotifReminder(BaseModel):
    id: Optional[str] = None
    kind: str  # "workout" | "protein"
    hour: int = 19
    minute: int = 0
    enabled: bool = True
    days_of_week: Optional[List[int]] = None  # 0=Mon..6=Sun, None=all days
    label: Optional[str] = None


class NotifPrefsRequest(BaseModel):
    reminders: List[NotifReminder]


class ChallengeStartRequest(BaseModel):
    type: str  # pushups | abs | squats | plank | steps10k | running (+ aliases)


class ChallengeCheckDayRequest(BaseModel):
    day_index: int  # 0-29


class SleepLogRequest(BaseModel):
    date: Optional[str] = None
    hours: float


class WeightLogRequest(BaseModel):
    weight_kg: float
    date: Optional[str] = None


class AffiliateCreateRequest(BaseModel):
    code: Optional[str] = None
    display_name: Optional[str] = None
    commission_percent: float = 20
    flat_fee_cents: int = 0


class AffiliateApplyRequest(BaseModel):
    code: str


class WorkoutSession(BaseModel):
    id: str
    user_id: str
    date: str
    title: str
    focus: str
    duration_min: int
    exercises: List[Dict[str, Any]]
    completed: bool = False


# --- Macro & calorie computation ---
def compute_targets(p: ProfileIn) -> Dict[str, int]:
    # Mifflin-St Jeor
    if p.gender.lower().startswith("m"):
        bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + 5
    else:
        bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age - 161
    factors = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    tdee = bmr * factors.get(p.activity_level, 1.55)
    height_m = max(1.2, p.height_cm / 100)
    bmi = p.weight_kg / (height_m * height_m)

    if p.goal == "lose":
        # Bigger deficit only when the starting point allows it; otherwise keep energy high.
        deficit_pct = 0.18 if bmi >= 27 else 0.14
        cals = tdee * (1 - deficit_pct)
        protein_factor = 2.15
        fat_ratio = 0.28
    elif p.goal == "gain":
        # Lean bulk: enough surplus to progress without pushing calories too high.
        surplus_pct = 0.10 if bmi < 24 else 0.07
        cals = tdee * (1 + surplus_pct)
        protein_factor = 2.0
        fat_ratio = 0.25
    else:
        # Maintenance / recomposition: slight nudge toward stable adherence.
        cals = tdee * (0.98 if bmi >= 26 else 1.0)
        protein_factor = 1.9
        fat_ratio = 0.26

    floor = 1500 if p.gender.lower().startswith("m") else 1250
    ceiling = max(floor + 250, tdee * 1.18)
    cals = int(max(floor, min(ceiling, round(cals))))
    # Macros: protein by objective, fat floor by objective, rest carbs
    protein_g = round(p.weight_kg * protein_factor)
    fat_g = round((cals * fat_ratio) / 9)
    carbs_g = max(0, round((cals - protein_g * 4 - fat_g * 9) / 4))
    return {
        "bmr": round(bmr),
        "daily_calories": int(cals),
        "protein_g": int(protein_g),
        "carbs_g": int(carbs_g),
        "fat_g": int(fat_g),
    }


# --- Exercise library ---
EXERCISE_LIBRARY: List[Dict[str, Any]] = [
    # Pectoraux — poids du corps
    {"id": "pompes", "name": "Pompes", "category": "Pectoraux", "equipment": "Poids du corps"},
    {"id": "pompes_inclinees", "name": "Pompes inclinées", "category": "Pectoraux", "equipment": "Poids du corps"},
    {"id": "pompes_diamant", "name": "Pompes diamant", "category": "Pectoraux", "equipment": "Poids du corps"},
    {"id": "pompes_declinees", "name": "Pompes déclinées (pieds surélevés)", "category": "Pectoraux", "equipment": "Poids du corps"},
    # Pectoraux — salle
    {"id": "develop_couche_barre", "name": "Développé couché barre", "category": "Pectoraux", "equipment": "Barre + banc"},
    {"id": "develop_couche_halt", "name": "Développé couché haltères", "category": "Pectoraux", "equipment": "Haltères + banc"},
    {"id": "develop_incline_barre", "name": "Développé incliné barre", "category": "Pectoraux", "equipment": "Barre + banc incliné"},
    {"id": "develop_incline_halt", "name": "Développé incliné haltères", "category": "Pectoraux", "equipment": "Haltères + banc incliné"},
    {"id": "develop_decline", "name": "Développé décliné", "category": "Pectoraux", "equipment": "Banc décliné"},
    {"id": "ecarte_couche", "name": "Écarté couché haltères", "category": "Pectoraux", "equipment": "Haltères"},
    {"id": "ecarte_incline", "name": "Écarté incliné haltères", "category": "Pectoraux", "equipment": "Haltères"},
    {"id": "ecarte_poulie", "name": "Écarté poulie (cross-over)", "category": "Pectoraux", "equipment": "Poulie vis-à-vis"},
    {"id": "pec_deck", "name": "Pec-deck (butterfly)", "category": "Pectoraux", "equipment": "Machine pec-deck"},
    {"id": "dips_pectoraux", "name": "Dips lestés (penché avant)", "category": "Pectoraux", "equipment": "Barres parallèles"},
    {"id": "pullover_halt", "name": "Pull-over haltère", "category": "Pectoraux", "equipment": "Haltère + banc"},

    # Dos — poids du corps
    {"id": "tractions", "name": "Tractions pronation", "category": "Dos", "equipment": "Barre fixe"},
    {"id": "tractions_supi", "name": "Tractions supination (chin-up)", "category": "Dos", "equipment": "Barre fixe"},
    {"id": "tractions_lestees", "name": "Tractions lestées", "category": "Dos", "equipment": "Barre + ceinture lest"},
    {"id": "rowing_renverse", "name": "Rowing renversé (inverted row)", "category": "Dos", "equipment": "Barre basse / TRX"},
    {"id": "superman", "name": "Superman", "category": "Dos", "equipment": "Poids du corps"},
    # Dos — salle
    {"id": "souleve_de_terre", "name": "Soulevé de terre barre", "category": "Dos", "equipment": "Barre olympique"},
    {"id": "souleve_de_terre_roumain", "name": "Soulevé de terre roumain", "category": "Dos", "equipment": "Barre / haltères"},
    {"id": "rowing_barre", "name": "Rowing barre (Yates / Pendlay)", "category": "Dos", "equipment": "Barre"},
    {"id": "rowing_halt", "name": "Rowing haltère unilatéral", "category": "Dos", "equipment": "Haltère + banc"},
    {"id": "rowing_t_bar", "name": "Rowing T-bar", "category": "Dos", "equipment": "T-bar"},
    {"id": "tirage_horiz", "name": "Tirage horizontal poulie", "category": "Dos", "equipment": "Poulie basse"},
    {"id": "tirage_vert", "name": "Tirage vertical poulie", "category": "Dos", "equipment": "Poulie haute (lat pulldown)"},
    {"id": "tirage_nuque", "name": "Tirage nuque poulie", "category": "Dos", "equipment": "Poulie haute"},
    {"id": "shrugs_barre", "name": "Shrugs (trapèzes)", "category": "Dos", "equipment": "Barre / haltères"},
    {"id": "good_morning", "name": "Good morning barre", "category": "Dos", "equipment": "Barre"},
    {"id": "hyper_ext", "name": "Hyperextensions lombaires", "category": "Dos", "equipment": "Banc hyperextension"},

    # Jambes — poids du corps
    {"id": "squat_pdc", "name": "Squat poids du corps", "category": "Jambes", "equipment": "Poids du corps"},
    {"id": "squat_bulgare", "name": "Squat bulgare (split squat)", "category": "Jambes", "equipment": "Banc / chaise"},
    {"id": "pistol_squat", "name": "Pistol squat", "category": "Jambes", "equipment": "Poids du corps"},
    {"id": "fentes", "name": "Fentes alternées", "category": "Jambes", "equipment": "Poids du corps / haltères"},
    {"id": "hip_thrust_pdc", "name": "Hip thrust (canapé)", "category": "Jambes", "equipment": "Canapé / box"},
    {"id": "mollets_pdc", "name": "Mollets debout", "category": "Jambes", "equipment": "Poids du corps"},
    {"id": "squat_saute", "name": "Squat sauté", "category": "Jambes", "equipment": "Poids du corps"},
    # Jambes — salle
    {"id": "squat_barre", "name": "Squat barre (back squat)", "category": "Jambes", "equipment": "Barre + rack"},
    {"id": "front_squat", "name": "Front squat", "category": "Jambes", "equipment": "Barre + rack"},
    {"id": "hack_squat", "name": "Hack squat machine", "category": "Jambes", "equipment": "Machine hack squat"},
    {"id": "leg_press", "name": "Presse à cuisses (leg press)", "category": "Jambes", "equipment": "Machine leg press"},
    {"id": "leg_extension", "name": "Leg extension (quadriceps)", "category": "Jambes", "equipment": "Machine"},
    {"id": "leg_curl", "name": "Leg curl (ischios)", "category": "Jambes", "equipment": "Machine"},
    {"id": "hip_thrust_barre", "name": "Hip thrust barre", "category": "Jambes", "equipment": "Barre + banc"},
    {"id": "fentes_marchees", "name": "Fentes marchées haltères", "category": "Jambes", "equipment": "Haltères"},
    {"id": "step_up_box", "name": "Step-up sur box", "category": "Jambes", "equipment": "Box + haltères"},
    {"id": "mollets_machine", "name": "Mollets assis machine", "category": "Jambes", "equipment": "Machine mollets"},
    {"id": "mollets_debout_barre", "name": "Mollets debout barre", "category": "Jambes", "equipment": "Barre / smith"},
    {"id": "adducteurs", "name": "Adducteurs machine", "category": "Jambes", "equipment": "Machine"},
    {"id": "abducteurs", "name": "Abducteurs machine", "category": "Jambes", "equipment": "Machine"},

    # Épaules — poids du corps
    {"id": "pike_pushup", "name": "Pike push-up", "category": "Épaules", "equipment": "Poids du corps"},
    {"id": "handstand_pushup", "name": "Handstand push-up", "category": "Épaules", "equipment": "Mur"},
    # Épaules — salle
    {"id": "develop_militaire_barre", "name": "Développé militaire barre", "category": "Épaules", "equipment": "Barre"},
    {"id": "develop_militaire_halt", "name": "Développé militaire haltères", "category": "Épaules", "equipment": "Haltères"},
    {"id": "develop_arnold", "name": "Développé Arnold", "category": "Épaules", "equipment": "Haltères"},
    {"id": "elev_lat_halt", "name": "Élévations latérales haltères", "category": "Épaules", "equipment": "Haltères"},
    {"id": "elev_lat_poulie", "name": "Élévations latérales poulie", "category": "Épaules", "equipment": "Poulie basse"},
    {"id": "elev_front", "name": "Élévations frontales", "category": "Épaules", "equipment": "Haltères / disque"},
    {"id": "oiseau_halt", "name": "Oiseau haltères (rear delts)", "category": "Épaules", "equipment": "Haltères"},
    {"id": "oiseau_poulie", "name": "Oiseau poulie", "category": "Épaules", "equipment": "Poulie"},
    {"id": "face_pull", "name": "Face pull poulie/élastique", "category": "Épaules", "equipment": "Poulie haute / élastique"},
    {"id": "upright_row", "name": "Rowing menton (upright row)", "category": "Épaules", "equipment": "Barre / haltères"},

    # Bras — biceps & triceps salle
    {"id": "curl_barre", "name": "Curl barre droite", "category": "Bras", "equipment": "Barre"},
    {"id": "curl_ez", "name": "Curl barre EZ", "category": "Bras", "equipment": "Barre EZ"},
    {"id": "curl_halt", "name": "Curl haltères (alterné)", "category": "Bras", "equipment": "Haltères"},
    {"id": "curl_marteau", "name": "Curl marteau", "category": "Bras", "equipment": "Haltères"},
    {"id": "curl_pupitre", "name": "Curl pupitre (Larry Scott)", "category": "Bras", "equipment": "Banc Scott"},
    {"id": "curl_concentre", "name": "Curl concentré", "category": "Bras", "equipment": "Haltère"},
    {"id": "curl_poulie", "name": "Curl poulie basse", "category": "Bras", "equipment": "Poulie"},
    {"id": "curl_inverse", "name": "Curl inversé (pronation)", "category": "Bras", "equipment": "Barre"},
    {"id": "dips_triceps", "name": "Dips triceps lestés", "category": "Bras", "equipment": "Barres parallèles"},
    {"id": "skull_crushers", "name": "Skull crushers (extension barre EZ)", "category": "Bras", "equipment": "Barre EZ + banc"},
    {"id": "ext_triceps_halt", "name": "Extension triceps haltère (vertical)", "category": "Bras", "equipment": "Haltère"},
    {"id": "ext_triceps_poulie", "name": "Extension triceps poulie haute", "category": "Bras", "equipment": "Poulie haute"},
    {"id": "ext_triceps_corde", "name": "Triceps corde poulie", "category": "Bras", "equipment": "Poulie + corde"},
    {"id": "kickback", "name": "Kick-back haltère", "category": "Bras", "equipment": "Haltère"},

    # Core — gainage + machines
    {"id": "planche", "name": "Planche", "category": "Core", "equipment": "Poids du corps"},
    {"id": "planche_lat", "name": "Planche latérale", "category": "Core", "equipment": "Poids du corps"},
    {"id": "crunchs", "name": "Crunchs au sol", "category": "Core", "equipment": "Poids du corps"},
    {"id": "russian_twist", "name": "Russian twist (lesté)", "category": "Core", "equipment": "Disque / kettlebell"},
    {"id": "leg_raises", "name": "Leg raises suspendu", "category": "Core", "equipment": "Barre fixe"},
    {"id": "knee_raises", "name": "Relevés de genoux", "category": "Core", "equipment": "Chaise romaine"},
    {"id": "mountain_climbers", "name": "Mountain climbers", "category": "Core", "equipment": "Poids du corps"},
    {"id": "hollow_hold", "name": "Hollow hold", "category": "Core", "equipment": "Poids du corps"},
    {"id": "ab_wheel", "name": "Ab wheel (roue abdominale)", "category": "Core", "equipment": "Roue abdo"},
    {"id": "cable_crunch", "name": "Crunch poulie haute (à genoux)", "category": "Core", "equipment": "Poulie haute + corde"},
    {"id": "dragon_flag", "name": "Dragon flag", "category": "Core", "equipment": "Banc"},

    # Cardio
    {"id": "burpees", "name": "Burpees", "category": "Cardio", "equipment": "Poids du corps"},
    {"id": "jumping_jacks", "name": "Jumping jacks", "category": "Cardio", "equipment": "Poids du corps"},
    {"id": "high_knees", "name": "High knees", "category": "Cardio", "equipment": "Poids du corps"},
    {"id": "skater_jumps", "name": "Skater jumps", "category": "Cardio", "equipment": "Poids du corps"},
    {"id": "corde_a_sauter", "name": "Corde à sauter", "category": "Cardio", "equipment": "Corde"},
    {"id": "rameur", "name": "Rameur", "category": "Cardio", "equipment": "Machine rameur"},
    {"id": "velo_assault", "name": "Vélo assault / spinning", "category": "Cardio", "equipment": "Vélo"},
    {"id": "elliptique", "name": "Vélo elliptique", "category": "Cardio", "equipment": "Elliptique"},
    {"id": "tapis_course", "name": "Tapis de course", "category": "Cardio", "equipment": "Tapis"},
    {"id": "stairmaster", "name": "Stairmaster (escalier)", "category": "Cardio", "equipment": "Machine escalier"},
]

SESSION_TYPES: Dict[str, Dict[str, Any]] = {
    "volume": {"label": "Volume", "reps": "10-12", "sets": 4, "rest_s": 60, "desc": "Hypertrophie, prise de masse"},
    "puissance": {"label": "Puissance", "reps": "6-8", "sets": 4, "rest_s": 90, "desc": "Force-vitesse, explosivité"},
    "force": {"label": "Force", "reps": "3-6", "sets": 5, "rest_s": 150, "desc": "Force maximale, charges lourdes"},
}


# --- Food library (manual meal entry, when no photo) ---
# unit = "g" → macros are per 100 g, default_qty 100. User adjusts qty in grams.
# unit = "ml" → macros per 100 ml.
# unit = "unit" / "scoop" / "tranche" / "sachet" → macros per 1 piece, default_qty 1.
FOOD_LIBRARY: List[Dict[str, Any]] = [
    # --- Compléments ---
    {"id": "whey_scoop", "name": "Whey (1 scoop ~30g)", "category": "Compléments", "unit": "scoop", "default_qty": 1,
     "kcal": 120, "protein_g": 24, "carbs_g": 3, "fat_g": 1.5},
    {"id": "caseine_scoop", "name": "Caséine (1 scoop ~30g)", "category": "Compléments", "unit": "scoop", "default_qty": 1,
     "kcal": 110, "protein_g": 24, "carbs_g": 2, "fat_g": 1},
    {"id": "isolate_scoop", "name": "Whey Isolate (1 scoop ~30g)", "category": "Compléments", "unit": "scoop", "default_qty": 1,
     "kcal": 110, "protein_g": 27, "carbs_g": 1, "fat_g": 0.5},
    {"id": "gainer_scoop", "name": "Mass gainer (1 scoop ~70g)", "category": "Compléments", "unit": "scoop", "default_qty": 1,
     "kcal": 280, "protein_g": 20, "carbs_g": 45, "fat_g": 2.5},
    {"id": "creatine_g", "name": "Créatine monohydrate", "category": "Compléments", "unit": "g", "default_qty": 5,
     "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0},
    {"id": "bcaa_g", "name": "BCAA (poudre)", "category": "Compléments", "unit": "g", "default_qty": 10,
     "kcal": 40, "protein_g": 10, "carbs_g": 0, "fat_g": 0},
    {"id": "omega3_caps", "name": "Oméga 3 (1 capsule 1g)", "category": "Compléments", "unit": "capsule", "default_qty": 1,
     "kcal": 9, "protein_g": 0, "carbs_g": 0, "fat_g": 1},
    {"id": "barre_proteinee", "name": "Barre protéinée (~60g)", "category": "Compléments", "unit": "unit", "default_qty": 1,
     "kcal": 220, "protein_g": 20, "carbs_g": 18, "fat_g": 7},

    # --- Protéines animales ---
    {"id": "blanc_oeuf", "name": "Blanc d'œuf (1 blanc ~33g)", "category": "Protéines", "unit": "unit", "default_qty": 1,
     "kcal": 17, "protein_g": 3.6, "carbs_g": 0.2, "fat_g": 0.1},
    {"id": "oeuf_entier", "name": "Œuf entier (1 ~55g)", "category": "Protéines", "unit": "unit", "default_qty": 1,
     "kcal": 78, "protein_g": 6, "carbs_g": 0.6, "fat_g": 5},
    {"id": "poulet_blanc_cru", "name": "Blanc de poulet (cru)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 110, "protein_g": 23, "carbs_g": 0, "fat_g": 1.5},
    {"id": "poulet_blanc_cuit", "name": "Blanc de poulet (cuit)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 165, "protein_g": 31, "carbs_g": 0, "fat_g": 3.6},
    {"id": "boeuf_5", "name": "Bœuf haché 5% (cru)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 137, "protein_g": 21, "carbs_g": 0, "fat_g": 5},
    {"id": "boeuf_15", "name": "Bœuf haché 15% (cru)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 220, "protein_g": 19, "carbs_g": 0, "fat_g": 15},
    {"id": "thon_naturel", "name": "Thon au naturel (boîte)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 116, "protein_g": 26, "carbs_g": 0, "fat_g": 1},
    {"id": "saumon_cru", "name": "Saumon (cru)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 208, "protein_g": 20, "carbs_g": 0, "fat_g": 13},
    {"id": "dinde_cru", "name": "Escalope de dinde (crue)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 105, "protein_g": 22, "carbs_g": 0, "fat_g": 1.5},
    {"id": "jambon_blanc", "name": "Jambon blanc (1 tranche ~40g)", "category": "Protéines", "unit": "tranche", "default_qty": 1,
     "kcal": 45, "protein_g": 7, "carbs_g": 0.5, "fat_g": 1.6},
    {"id": "tofu", "name": "Tofu nature", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 76, "protein_g": 8, "carbs_g": 2, "fat_g": 4.8},

    # --- Glucides bruts ---
    {"id": "riz_blanc_cru", "name": "Riz blanc (cru)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 360, "protein_g": 7, "carbs_g": 79, "fat_g": 0.6},
    {"id": "riz_complet_cru", "name": "Riz complet (cru)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 350, "protein_g": 7.5, "carbs_g": 76, "fat_g": 2.7},
    {"id": "riz_blanc_cuit", "name": "Riz blanc (cuit)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3},
    {"id": "pates_crues", "name": "Pâtes (crues)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 370, "protein_g": 13, "carbs_g": 74, "fat_g": 1.5},
    {"id": "pates_cuites", "name": "Pâtes (cuites)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 158, "protein_g": 5.8, "carbs_g": 31, "fat_g": 0.9},
    {"id": "flocons_avoine", "name": "Flocons d'avoine (cru)", "category": "Glucides", "unit": "g", "default_qty": 50,
     "kcal": 370, "protein_g": 13, "carbs_g": 60, "fat_g": 7},
    {"id": "quinoa_cru", "name": "Quinoa (cru)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 368, "protein_g": 14, "carbs_g": 64, "fat_g": 6},
    {"id": "patate_douce", "name": "Patate douce (crue)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 86, "protein_g": 1.6, "carbs_g": 20, "fat_g": 0.1},
    {"id": "pomme_terre", "name": "Pomme de terre (crue)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 77, "protein_g": 2, "carbs_g": 17, "fat_g": 0.1},
    {"id": "pain_complet", "name": "Pain complet (1 tranche ~40g)", "category": "Glucides", "unit": "tranche", "default_qty": 1,
     "kcal": 100, "protein_g": 4, "carbs_g": 18, "fat_g": 1.2},
    {"id": "pain_blanc", "name": "Pain blanc / baguette (1 tranche ~40g)", "category": "Glucides", "unit": "tranche", "default_qty": 1,
     "kcal": 110, "protein_g": 3.5, "carbs_g": 22, "fat_g": 0.8},
    {"id": "couscous_cru", "name": "Semoule de couscous (cru)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 376, "protein_g": 13, "carbs_g": 77, "fat_g": 0.6},
    {"id": "lentilles_crues", "name": "Lentilles (crues)", "category": "Glucides", "unit": "g", "default_qty": 100,
     "kcal": 353, "protein_g": 25, "carbs_g": 60, "fat_g": 1},

    # --- Fruits ---
    {"id": "banane", "name": "Banane (1 ~120g)", "category": "Fruits", "unit": "unit", "default_qty": 1,
     "kcal": 105, "protein_g": 1.3, "carbs_g": 27, "fat_g": 0.4},
    {"id": "pomme", "name": "Pomme (1 ~180g)", "category": "Fruits", "unit": "unit", "default_qty": 1,
     "kcal": 95, "protein_g": 0.5, "carbs_g": 25, "fat_g": 0.3},
    {"id": "orange", "name": "Orange (1 ~150g)", "category": "Fruits", "unit": "unit", "default_qty": 1,
     "kcal": 70, "protein_g": 1.4, "carbs_g": 17, "fat_g": 0.2},
    {"id": "kiwi", "name": "Kiwi (1 ~70g)", "category": "Fruits", "unit": "unit", "default_qty": 1,
     "kcal": 42, "protein_g": 0.8, "carbs_g": 10, "fat_g": 0.4},
    {"id": "fraises", "name": "Fraises", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 32, "protein_g": 0.7, "carbs_g": 7.7, "fat_g": 0.3},
    {"id": "myrtilles", "name": "Myrtilles", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 57, "protein_g": 0.7, "carbs_g": 14, "fat_g": 0.3},
    {"id": "raisin", "name": "Raisin", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 69, "protein_g": 0.7, "carbs_g": 18, "fat_g": 0.2},
    {"id": "mangue", "name": "Mangue", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 60, "protein_g": 0.8, "carbs_g": 15, "fat_g": 0.4},
    {"id": "ananas", "name": "Ananas", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 50, "protein_g": 0.5, "carbs_g": 13, "fat_g": 0.1},
    {"id": "avocat", "name": "Avocat (1/2 ~100g)", "category": "Fruits", "unit": "g", "default_qty": 100,
     "kcal": 160, "protein_g": 2, "carbs_g": 9, "fat_g": 15},
    {"id": "date_medjool", "name": "Datte Medjool (1 ~20g)", "category": "Fruits", "unit": "unit", "default_qty": 1,
     "kcal": 65, "protein_g": 0.5, "carbs_g": 17, "fat_g": 0.1},

    # --- Légumes ---
    {"id": "brocoli", "name": "Brocoli", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 34, "protein_g": 2.8, "carbs_g": 7, "fat_g": 0.4},
    {"id": "epinards", "name": "Épinards", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 23, "protein_g": 2.9, "carbs_g": 3.6, "fat_g": 0.4},
    {"id": "courgette", "name": "Courgette", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 17, "protein_g": 1.2, "carbs_g": 3.1, "fat_g": 0.3},
    {"id": "carotte", "name": "Carotte", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 41, "protein_g": 0.9, "carbs_g": 10, "fat_g": 0.2},
    {"id": "tomate", "name": "Tomate", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 18, "protein_g": 0.9, "carbs_g": 3.9, "fat_g": 0.2},
    {"id": "poivron", "name": "Poivron", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 31, "protein_g": 1, "carbs_g": 6, "fat_g": 0.3},
    {"id": "haricots_verts", "name": "Haricots verts", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 31, "protein_g": 1.8, "carbs_g": 7, "fat_g": 0.2},

    # --- Lipides ---
    {"id": "amandes", "name": "Amandes", "category": "Lipides", "unit": "g", "default_qty": 30,
     "kcal": 579, "protein_g": 21, "carbs_g": 22, "fat_g": 50},
    {"id": "noix", "name": "Noix", "category": "Lipides", "unit": "g", "default_qty": 30,
     "kcal": 654, "protein_g": 15, "carbs_g": 14, "fat_g": 65},
    {"id": "noisettes", "name": "Noisettes", "category": "Lipides", "unit": "g", "default_qty": 30,
     "kcal": 628, "protein_g": 15, "carbs_g": 17, "fat_g": 61},
    {"id": "beurre_cacahuete", "name": "Beurre de cacahuète", "category": "Lipides", "unit": "g", "default_qty": 20,
     "kcal": 588, "protein_g": 25, "carbs_g": 20, "fat_g": 50},
    {"id": "huile_olive", "name": "Huile d'olive", "category": "Lipides", "unit": "ml", "default_qty": 10,
     "kcal": 884, "protein_g": 0, "carbs_g": 0, "fat_g": 100},
    {"id": "huile_colza", "name": "Huile de colza", "category": "Lipides", "unit": "ml", "default_qty": 10,
     "kcal": 884, "protein_g": 0, "carbs_g": 0, "fat_g": 100},
    {"id": "beurre", "name": "Beurre doux", "category": "Lipides", "unit": "g", "default_qty": 10,
     "kcal": 717, "protein_g": 0.9, "carbs_g": 0.1, "fat_g": 81},

    # --- Produits laitiers ---
    {"id": "lait_entier", "name": "Lait entier", "category": "Laitiers", "unit": "ml", "default_qty": 200,
     "kcal": 61, "protein_g": 3.2, "carbs_g": 4.7, "fat_g": 3.3},
    {"id": "lait_demi", "name": "Lait demi-écrémé", "category": "Laitiers", "unit": "ml", "default_qty": 200,
     "kcal": 47, "protein_g": 3.4, "carbs_g": 4.8, "fat_g": 1.6},
    {"id": "yaourt_nature", "name": "Yaourt nature (1 pot ~125g)", "category": "Laitiers", "unit": "unit", "default_qty": 1,
     "kcal": 75, "protein_g": 4.4, "carbs_g": 6, "fat_g": 4},
    {"id": "yaourt_grec_0", "name": "Yaourt grec 0% (1 pot ~150g)", "category": "Laitiers", "unit": "unit", "default_qty": 1,
     "kcal": 90, "protein_g": 15, "carbs_g": 6, "fat_g": 0.5},
    {"id": "fromage_blanc_0", "name": "Fromage blanc 0%", "category": "Laitiers", "unit": "g", "default_qty": 100,
     "kcal": 47, "protein_g": 8, "carbs_g": 3.5, "fat_g": 0.2},
    {"id": "fromage_blanc_3", "name": "Fromage blanc 3%", "category": "Laitiers", "unit": "g", "default_qty": 100,
     "kcal": 75, "protein_g": 7.5, "carbs_g": 4, "fat_g": 3},
    {"id": "cottage_cheese", "name": "Cottage cheese", "category": "Laitiers", "unit": "g", "default_qty": 100,
     "kcal": 98, "protein_g": 11, "carbs_g": 3.4, "fat_g": 4.3},
    {"id": "mozzarella", "name": "Mozzarella", "category": "Laitiers", "unit": "g", "default_qty": 100,
     "kcal": 280, "protein_g": 22, "carbs_g": 2.2, "fat_g": 22},
    {"id": "cheddar", "name": "Cheddar", "category": "Laitiers", "unit": "g", "default_qty": 30,
     "kcal": 403, "protein_g": 25, "carbs_g": 1.3, "fat_g": 33},
    {"id": "parmesan", "name": "Parmesan", "category": "Laitiers", "unit": "g", "default_qty": 20,
     "kcal": 431, "protein_g": 38, "carbs_g": 4, "fat_g": 29},

    # --- Sucreries / pâtisseries ---
    {"id": "chocolat_noir_70", "name": "Chocolat noir 70%", "category": "Sucreries", "unit": "g", "default_qty": 20,
     "kcal": 598, "protein_g": 7.8, "carbs_g": 46, "fat_g": 43},
    {"id": "chocolat_lait", "name": "Chocolat au lait", "category": "Sucreries", "unit": "g", "default_qty": 20,
     "kcal": 540, "protein_g": 7.5, "carbs_g": 59, "fat_g": 30},
    {"id": "cookie", "name": "Cookie (1 ~40g)", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 200, "protein_g": 2.5, "carbs_g": 26, "fat_g": 9.5},
    {"id": "brownie", "name": "Brownie (1 part ~60g)", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 270, "protein_g": 3.5, "carbs_g": 32, "fat_g": 14},
    {"id": "croissant", "name": "Croissant", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 280, "protein_g": 5.5, "carbs_g": 31, "fat_g": 15},
    {"id": "pain_chocolat", "name": "Pain au chocolat", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 310, "protein_g": 5, "carbs_g": 33, "fat_g": 17},
    {"id": "donut", "name": "Donut glacé", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 250, "protein_g": 3, "carbs_g": 30, "fat_g": 13},
    {"id": "glace_boule", "name": "Glace (1 boule ~50g)", "category": "Sucreries", "unit": "unit", "default_qty": 1,
     "kcal": 100, "protein_g": 1.5, "carbs_g": 13, "fat_g": 5},
    {"id": "miel", "name": "Miel", "category": "Sucreries", "unit": "g", "default_qty": 15,
     "kcal": 304, "protein_g": 0.3, "carbs_g": 82, "fat_g": 0},
    {"id": "sucre", "name": "Sucre blanc", "category": "Sucreries", "unit": "g", "default_qty": 5,
     "kcal": 400, "protein_g": 0, "carbs_g": 100, "fat_g": 0},

    # --- Boissons ---
    {"id": "jus_orange", "name": "Jus d'orange", "category": "Boissons", "unit": "ml", "default_qty": 250,
     "kcal": 45, "protein_g": 0.7, "carbs_g": 10, "fat_g": 0.2},
    {"id": "soda_cola", "name": "Soda cola", "category": "Boissons", "unit": "ml", "default_qty": 330,
     "kcal": 42, "protein_g": 0, "carbs_g": 10.6, "fat_g": 0},
    {"id": "biere_blonde", "name": "Bière blonde", "category": "Boissons", "unit": "ml", "default_qty": 250,
     "kcal": 43, "protein_g": 0.5, "carbs_g": 3.6, "fat_g": 0},
    {"id": "vin_rouge", "name": "Vin rouge", "category": "Boissons", "unit": "ml", "default_qty": 125,
     "kcal": 85, "protein_g": 0.1, "carbs_g": 2.6, "fat_g": 0},
    {"id": "cafe_noir", "name": "Café noir", "category": "Boissons", "unit": "ml", "default_qty": 100,
     "kcal": 2, "protein_g": 0.1, "carbs_g": 0, "fat_g": 0},

    # --- Plats préparés / fast-food ---
    {"id": "pizza_part", "name": "Pizza (1 part ~120g)", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 280, "protein_g": 12, "carbs_g": 35, "fat_g": 10},
    {"id": "burger_simple", "name": "Burger classique", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 500, "protein_g": 25, "carbs_g": 40, "fat_g": 25},
    {"id": "kebab", "name": "Kebab (sandwich)", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 750, "protein_g": 35, "carbs_g": 65, "fat_g": 38},
    {"id": "sushi_piece", "name": "Sushi maki (1 pièce)", "category": "Plats préparés", "unit": "unit", "default_qty": 6,
     "kcal": 40, "protein_g": 1.5, "carbs_g": 7, "fat_g": 0.5},
    {"id": "salade_cesar", "name": "Salade César", "category": "Plats préparés", "unit": "g", "default_qty": 300,
     "kcal": 180, "protein_g": 10, "carbs_g": 8, "fat_g": 13},
    {"id": "wrap_poulet", "name": "Wrap poulet", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 380, "protein_g": 20, "carbs_g": 35, "fat_g": 17},
    {"id": "sandwich_jambon", "name": "Sandwich jambon-beurre", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 350, "protein_g": 15, "carbs_g": 45, "fat_g": 12},
    {"id": "lasagnes", "name": "Lasagnes (1 part)", "category": "Plats préparés", "unit": "g", "default_qty": 300,
     "kcal": 145, "protein_g": 8, "carbs_g": 15, "fat_g": 6},
    {"id": "frites_mcdo", "name": "Frites (portion ~115g)", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 365, "protein_g": 4, "carbs_g": 47, "fat_g": 18},
    {"id": "nuggets_6", "name": "Nuggets de poulet (6)", "category": "Plats préparés", "unit": "unit", "default_qty": 1,
     "kcal": 270, "protein_g": 14, "carbs_g": 16, "fat_g": 17},

    # --- Snacks ---
    {"id": "chips_30", "name": "Chips (sachet ~30g)", "category": "Snacks", "unit": "g", "default_qty": 30,
     "kcal": 536, "protein_g": 6, "carbs_g": 53, "fat_g": 33},
    {"id": "popcorn", "name": "Popcorn (nature)", "category": "Snacks", "unit": "g", "default_qty": 30,
     "kcal": 387, "protein_g": 13, "carbs_g": 78, "fat_g": 4.5},
    {"id": "biscuits_petit", "name": "Petits beurre / biscuits secs", "category": "Snacks", "unit": "unit", "default_qty": 2,
     "kcal": 38, "protein_g": 0.6, "carbs_g": 6.5, "fat_g": 1.1},
    {"id": "mm_30", "name": "M&M's / Skittles (~30g)", "category": "Snacks", "unit": "g", "default_qty": 30,
     "kcal": 480, "protein_g": 4, "carbs_g": 68, "fat_g": 20},
    {"id": "barre_cereales", "name": "Barre de céréales (~25g)", "category": "Snacks", "unit": "unit", "default_qty": 1,
     "kcal": 95, "protein_g": 1.5, "carbs_g": 17, "fat_g": 2.5},

    # --- Glucides étendus ---
    {"id": "muesli", "name": "Muesli", "category": "Glucides", "unit": "g", "default_qty": 50,
     "kcal": 370, "protein_g": 10, "carbs_g": 65, "fat_g": 6},
    {"id": "granola", "name": "Granola", "category": "Glucides", "unit": "g", "default_qty": 50,
     "kcal": 470, "protein_g": 10, "carbs_g": 60, "fat_g": 20},
    {"id": "tortilla", "name": "Tortilla / wrap nature", "category": "Glucides", "unit": "unit", "default_qty": 1,
     "kcal": 150, "protein_g": 4, "carbs_g": 25, "fat_g": 3.5},

    # --- Protéines étendues ---
    {"id": "crevettes", "name": "Crevettes cuites", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 99, "protein_g": 24, "carbs_g": 0.2, "fat_g": 0.3},
    {"id": "saumon_fume", "name": "Saumon fumé (1 tranche ~30g)", "category": "Protéines", "unit": "tranche", "default_qty": 1,
     "kcal": 60, "protein_g": 7, "carbs_g": 0, "fat_g": 3.5},
    {"id": "cabillaud", "name": "Cabillaud (cru)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 76, "protein_g": 18, "carbs_g": 0, "fat_g": 0.7},
    {"id": "edamame", "name": "Edamame cuit", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 121, "protein_g": 12, "carbs_g": 9, "fat_g": 5},
    {"id": "pois_chiches", "name": "Pois chiches (cuits)", "category": "Protéines", "unit": "g", "default_qty": 100,
     "kcal": 164, "protein_g": 9, "carbs_g": 27, "fat_g": 2.6},

    # --- Légumes étendus ---
    {"id": "champignons", "name": "Champignons", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 22, "protein_g": 3, "carbs_g": 3.3, "fat_g": 0.3},
    {"id": "concombre", "name": "Concombre", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 15, "protein_g": 0.7, "carbs_g": 3.6, "fat_g": 0.1},
    {"id": "salade_verte", "name": "Salade verte / laitue", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 15, "protein_g": 1.4, "carbs_g": 2.9, "fat_g": 0.2},
    {"id": "aubergine", "name": "Aubergine", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 25, "protein_g": 1, "carbs_g": 6, "fat_g": 0.2},
    {"id": "chou_fleur", "name": "Chou-fleur", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 25, "protein_g": 2, "carbs_g": 5, "fat_g": 0.3},
    {"id": "oignon", "name": "Oignon", "category": "Légumes", "unit": "g", "default_qty": 100,
     "kcal": 40, "protein_g": 1.1, "carbs_g": 9.3, "fat_g": 0.1},

    # --- Boissons étendues ---
    {"id": "eau_gazeuse", "name": "Eau gazeuse / pétillante", "category": "Boissons", "unit": "ml", "default_qty": 500,
     "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0},
    {"id": "smoothie", "name": "Smoothie fruits", "category": "Boissons", "unit": "ml", "default_qty": 250,
     "kcal": 60, "protein_g": 1, "carbs_g": 14, "fat_g": 0.4},
    {"id": "the_vert", "name": "Thé vert", "category": "Boissons", "unit": "ml", "default_qty": 250,
     "kcal": 1, "protein_g": 0, "carbs_g": 0, "fat_g": 0},
    {"id": "energy_drink", "name": "Boisson énergisante (Red Bull)", "category": "Boissons", "unit": "ml", "default_qty": 250,
     "kcal": 45, "protein_g": 0, "carbs_g": 11, "fat_g": 0},
    {"id": "boisson_proteinee", "name": "Boisson protéinée prête (~330ml)", "category": "Boissons", "unit": "ml", "default_qty": 330,
     "kcal": 50, "protein_g": 9, "carbs_g": 2, "fat_g": 0.5},
]


def compute_food_macros(food: Dict[str, Any], qty: float) -> Dict[str, Any]:
    """Compute calories & macros from FOOD_LIBRARY entry × user-given quantity."""
    if food.get("unit") in ("g", "ml"):
        # macros are PER 100; scale by qty/100
        ratio = qty / 100.0
    else:
        # macros are PER 1 piece; scale by qty
        ratio = qty
    return {
        "name": food["name"],
        "calories": round(float(food.get("kcal", 0)) * ratio),
        "protein_g": round(float(food.get("protein_g", 0)) * ratio, 1),
        "carbs_g": round(float(food.get("carbs_g", 0)) * ratio, 1),
        "fat_g": round(float(food.get("fat_g", 0)) * ratio, 1),
    }


def local_food_search(query: str) -> List[Dict[str, Any]]:
    q = re.sub(r"\s+", " ", query.lower().strip())
    if len(q) < 2:
        return []
    scored: List[tuple[int, Dict[str, Any]]] = []
    for food in FOOD_LIBRARY:
        name = str(food.get("name", "")).lower()
        category = str(food.get("category", "")).lower()
        score = 0
        if q == name:
            score += 100
        if q in name:
            score += 50
        if any(part and part in name for part in q.split()):
            score += 15
        if q in category:
            score += 8
        if score:
            scored.append((score, food))
    scored.sort(key=lambda item: item[0], reverse=True)
    out: List[Dict[str, Any]] = []
    for _, food in scored[:3]:
        raw_unit = str(food.get("unit", "g")).lower()
        unit = raw_unit if raw_unit in ("g", "ml") else "unit"
        out.append({
            "id": f"local_{food.get('id', new_id('food'))}",
            "name": str(food.get("name", query))[:80],
            "category": str(food.get("category", "Plats préparés"))[:30],
            "unit": unit,
            "default_qty": float(food.get("default_qty", 100 if unit in ("g", "ml") else 1)),
            "kcal": float(food.get("kcal", 0)),
            "protein_g": float(food.get("protein_g", 0)),
            "carbs_g": float(food.get("carbs_g", 0)),
            "fat_g": float(food.get("fat_g", 0)),
            "portion_label": "Base interne FIT AI",
            "source": "algorithm",
        })
    return out


def reps_for(session_type: str) -> str:
    return SESSION_TYPES.get(session_type, SESSION_TYPES["volume"])["reps"]


def auto_meal_type(created_at: datetime) -> str:
    """Categorize meal by local hour (UTC for now, good enough for MVP)."""
    h = created_at.hour
    if 5 <= h < 11:
        return "breakfast"
    if 11 <= h < 15:
        return "lunch"
    if 15 <= h < 19:
        return "snack"
    return "dinner"


def estimate_1rm(weight_kg: float, reps: int) -> float:
    """Epley formula. Capped reps to 12 to stay realistic."""
    if weight_kg <= 0 or reps <= 0:
        return 0.0
    r = min(reps, 12)
    if r == 1:
        return round(weight_kg, 1)
    return round(weight_kg * (1 + r / 30), 1)


# --- Workout generator ---
def generate_week_plan(profile: dict, session_type: str = "volume") -> List[Dict[str, Any]]:
    st = SESSION_TYPES.get(session_type, SESSION_TYPES["volume"])
    reps = st["reps"]
    sets = st["sets"]
    rest = st["rest_s"]

    def ex(name: str) -> Dict[str, Any]:
        return {"name": name, "sets": sets, "reps": reps, "rest_s": rest, "checked": True}

    base = [
        {
            "focus": "Haut du corps",
            "exercises": [ex("Pompes"), ex("Dips sur chaise"), ex("Rowing haltère"),
                          ex("Élévations latérales"), ex("Planche")],
        },
        {
            "focus": "Bas du corps",
            "exercises": [ex("Squat"), ex("Fentes alternées"), ex("Hip thrust"),
                          ex("Mollets debout"), ex("Planche latérale")],
        },
        {
            "focus": "Repos actif",
            "exercises": [{"name": "Marche rapide", "sets": 1, "reps": "30 min", "rest_s": 0, "checked": True},
                          {"name": "Mobilité hanche / épaule", "sets": 1, "reps": "10 min", "rest_s": 0, "checked": True}],
        },
        {
            "focus": "Full body",
            "exercises": [ex("Burpees"), ex("Squat sauté"), ex("Pompes inclinées"),
                          ex("Mountain climbers"), ex("Planche")],
        },
        {
            "focus": "Cardio HIIT",
            "exercises": [
                {"name": "Jumping jacks", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15, "checked": True},
                {"name": "High knees", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15, "checked": True},
                {"name": "Skater jumps", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15, "checked": True},
                {"name": "Récupération", "sets": 1, "reps": "5 min marche", "rest_s": 0, "checked": True},
            ],
        },
        {
            "focus": "Core & gainage",
            "exercises": [ex("Planche"), ex("Crunchs"), ex("Russian twist"), ex("Leg raises")],
        },
        {
            "focus": "Repos",
            "exercises": [{"name": "Étirements doux", "sets": 1, "reps": "15 min", "rest_s": 0, "checked": True}],
        },
    ]
    today = now_local().date()
    plan = []
    for i, day in enumerate(base):
        d = today + timedelta(days=i)
        plan.append(
            {
                "id": new_id("wk"),
                "user_id": profile["user_id"],
                "date": d.isoformat(),
                "title": f"Jour {i + 1}",
                "focus": day["focus"],
                "duration_min": 45 if "Repos" not in day["focus"] else 20,
                "exercises": day["exercises"],
                "completed": False,
                "session_type": session_type,
            }
        )
    return plan


# --- Program (multi-week) generation ---
# Curated blueprints per focus name.
FOCUS_BLUEPRINTS: Dict[str, List[str]] = {
    "Push": ["Développé couché barre", "Développé incliné haltères", "Dips lestés (penché avant)", "Élévations latérales", "Extensions triceps poulie"],
    "Pull": ["Tractions pronation", "Rowing barre (Yates / Pendlay)", "Tirage horizontal poulie", "Curl barre", "Curl marteau"],
    "Legs": ["Squat barre arrière", "Soulevé de terre roumain", "Presse à cuisses", "Fentes avant haltères", "Mollets debout machine"],
    "FullBody A": ["Squat barre arrière", "Développé couché barre", "Rowing barre (Yates / Pendlay)", "Curl marteau", "Planche"],
    "FullBody B": ["Presse à cuisses", "Développé incliné haltères", "Tirage vertical poulie", "Extensions triceps poulie", "Crunchs"],
    "FullBody C": ["Soulevé de terre roumain", "Développé militaire barre", "Tirage horizontal poulie", "Curl barre", "Fentes avant haltères"],
    "FullBody D": ["Front squat", "Pompes", "Tractions pronation", "Élévations latérales", "Leg raises"],
    "FullBody E": ["Hip thrust barre", "Développé couché haltères", "Rowing haltère unilatéral", "Dips triceps", "Planche latérale"],
    "FullBody": ["Squat barre arrière", "Développé couché barre", "Rowing barre (Yates / Pendlay)", "Curl marteau", "Planche"],
    "Upper": ["Développé couché barre", "Tractions pronation", "Développé militaire barre", "Rowing barre (Yates / Pendlay)", "Extensions triceps poulie"],
    "Lower": ["Squat barre arrière", "Soulevé de terre roumain", "Presse à cuisses", "Leg curl machine", "Mollets debout machine"],
    "Pectoraux": ["Développé couché barre", "Développé incliné haltères", "Écarté couché haltères", "Pec-deck (butterfly)", "Pompes"],
    "Dos": ["Tractions pronation", "Soulevé de terre barre", "Rowing barre (Yates / Pendlay)", "Tirage vertical poulie", "Shrugs (trapèzes)"],
    "Épaules": ["Développé militaire barre", "Élévations latérales", "Élévations frontales", "Oiseau (rear delt fly)", "Rotations externes"],
    "Bras": ["Curl barre", "Curl marteau", "Extensions triceps poulie", "Dips triceps", "Curl pupitre"],
    "Jambes": ["Squat barre arrière", "Soulevé de terre roumain", "Fentes avant haltères", "Leg curl machine", "Mollets debout machine"],
    "Core": ["Crunchs", "Russian twist", "Leg raises", "Planche", "Planche latérale"],
    "Cardio": ["Marche rapide", "Course intermittente", "Burpees", "Mountain climbers"],
    "Repos actif": ["Marche rapide", "Mobilité hanche / épaule"],
    # Bodyweight / home variants — STRICT poids du corps, aucun matériel
    "HomePush": ["Pompes diamant", "Pompes inclinées (pieds surélevés)", "Pompes archer", "Pompes pike", "Pompes lestées d'un sac"],
    "HomePull": ["Rowing inversé sous table", "Superman", "Bird-dog", "Pompes diamant", "Tirage serviette (porte)"],
    "HomeLegs": ["Squats sautés", "Fentes alternées", "Squat bulgare (chaise)", "Pont fessier 1 jambe", "Chaise au mur"],
    "HomeFullBody": ["Burpees", "Pompes diamant", "Squats sautés", "Mountain climbers", "Planche"],
    "HomeCore": ["Planche", "Planche latérale", "Mountain climbers", "Russian twist", "Hollow hold"],
}

# Best ROI / "rentable" exercises per (goal, session_type) — green-dot
RECOMMENDED_BY_GOAL: Dict[str, Set[str]] = {
    "muscle": {
        "Développé couché barre", "Développé incliné haltères", "Squat barre arrière",
        "Soulevé de terre roumain", "Soulevé de terre barre", "Rowing barre (Yates / Pendlay)",
        "Tractions pronation", "Développé militaire barre", "Presse à cuisses",
    },
    "strength": {
        "Squat barre arrière", "Soulevé de terre barre", "Développé couché barre",
        "Développé militaire barre", "Rowing barre (Yates / Pendlay)", "Tractions pronation",
    },
    "fat_loss": {
        "Burpees", "Squats sautés", "Mountain climbers", "Course intermittente",
        "Squat barre arrière", "Soulevé de terre roumain", "Pompes diamant",
    },
    "endurance": {
        "Course intermittente", "Marche rapide", "Mountain climbers", "Burpees",
        "Squats sautés", "Pompes diamant",
    },
}


def _focus_sequence(frequency: int, split: str) -> List[str]:
    sp = (split or "ppl").lower()
    frequency = max(2, min(int(frequency), 7))
    if sp == "home":
        # bodyweight only
        if frequency <= 3:
            return ["HomePush", "HomePull", "HomeLegs"]
        if frequency <= 5:
            return ["HomePush", "HomePull", "HomeLegs", "HomeCore", "HomeFullBody"]
        return ["HomePush", "HomePull", "HomeLegs", "HomeCore", "HomeFullBody", "HomeFullBody", "Cardio"]
    if sp == "fullbody":
        seq = ["FullBody A", "FullBody B", "FullBody C", "FullBody D", "FullBody E", "FullBody A", "Cardio"]
        return seq[:frequency]
    if sp in ("upper_lower", "halfbody", "half_body"):
        seq = ["Upper", "Lower", "Upper", "Lower", "Upper", "Lower", "Core"]
        return seq[:frequency]
    if sp == "split":
        if frequency <= 3:
            return ["Push", "Pull", "Legs"]
        if frequency <= 5:
            return ["Pectoraux", "Dos", "Épaules", "Bras", "Jambes"]
        return ["Pectoraux", "Dos", "Épaules", "Bras", "Jambes", "Core", "Cardio"]
    if frequency <= 3:
        return ["Push", "Pull", "Legs"]
    if frequency <= 5:
        return ["Push", "Pull", "Legs", "Push", "Pull"][:frequency]
    return ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Repos actif"]


def _is_recommended(ex_name: str, goal: Optional[str]) -> bool:
    if not goal:
        return False
    return ex_name in RECOMMENDED_BY_GOAL.get(goal, set())


def _build_day_exercises(focus: str, session_type: str, goal: Optional[str] = None) -> List[Dict[str, Any]]:
    st = SESSION_TYPES.get(session_type, SESSION_TYPES["volume"])
    sets = st["sets"]
    reps = st["reps"]
    rest_s = st["rest_s"]
    names = FOCUS_BLUEPRINTS.get(focus, FOCUS_BLUEPRINTS["FullBody"])
    # cap to 5 (≤3 per same muscle handled by curated blueprint variety)
    return [
        {
            "name": n,
            "sets": sets,
            "reps": reps,
            "rest_s": rest_s,
            "checked": True,
            "is_recommended": _is_recommended(n, goal),
        }
        for n in names[:5]
    ]


# Phase 3: ordered block sequence with configurable durations
ORDERED_BLOCK_SEQUENCE: List[str] = ["volume", "puissance", "force"]


def _expand_block_weeks(block_weeks: Optional[Dict[str, int]]) -> List[str]:
    bw = block_weeks or {}
    pattern: List[str] = []
    for block in ORDERED_BLOCK_SEQUENCE:
        n = int(bw.get(block, 1))
        n = max(1, min(n, 8))  # allow longer blocks when the user customizes the cycle
        pattern.extend([block] * n)
    return pattern  # e.g. [v,v,p,f,f] = 5 weeks per cycle


def generate_program_structure(
    weeks: int,
    frequency: int,
    split: str,
    cycle_pattern: Optional[List[str]] = None,
    block_weeks: Optional[Dict[str, int]] = None,
    goal: Optional[str] = None,
) -> List[Dict[str, Any]]:
    weeks = max(1, min(int(weeks), 24))
    frequency = max(2, min(int(frequency), 7))
    # Phase 3: block-based pattern takes priority over legacy cycle_pattern
    if block_weeks is not None:
        pattern = _expand_block_weeks(block_weeks)
    elif cycle_pattern:
        pattern = [p for p in cycle_pattern if p in SESSION_TYPES]
        if not pattern:
            pattern = _expand_block_weeks({"volume": 1, "puissance": 1, "force": 1})
    else:
        pattern = _expand_block_weeks({"volume": 1, "puissance": 1, "force": 1})
    focus_seq = _focus_sequence(frequency, split)
    out: List[Dict[str, Any]] = []
    for w in range(weeks):
        st = pattern[w % len(pattern)]
        days = []
        for d_idx, focus in enumerate(focus_seq):
            days.append({
                "day_index": d_idx,
                "focus": focus,
                "exercises": _build_day_exercises(focus, st, goal=goal),
            })
        out.append({"week_index": w + 1, "session_type": st, "days": days})
    return out


# Challenges blueprint — 30-day progression based on level
CHALLENGE_BLUEPRINTS: Dict[str, Dict[str, Any]] = {
    "pushups": {
        "name": "30 jours de pompes",
        "exercise": "Pompes",
        "muscle": "Pectoraux",
        "icon": "fitness",
        "unit": "reps",
        "rest_days": [3, 6, 10, 13, 17, 20, 24, 27],  # Wed/Sat each week
    },
    "abs": {
        "name": "30 jours d'abdos",
        "exercise": "Crunchs + Planche (mix)",
        "muscle": "Core",
        "icon": "shield-checkmark",
        "unit": "reps",
        "rest_days": [3, 7, 10, 14, 17, 21, 24, 28],
    },
    "squats": {
        "name": "30 jours de squats",
        "exercise": "Squats au poids du corps",
        "muscle": "Jambes",
        "icon": "barbell",
        "unit": "reps",
        "rest_days": [3, 6, 10, 13, 17, 20, 24, 27],
    },
    "plank": {
        "name": "30 jours de gainage",
        "exercise": "Planche",
        "muscle": "Core",
        "icon": "timer",
        "unit": "sec",
        "rest_days": [3, 7, 11, 15, 19, 23, 27],
    },
    "steps10k": {
        "name": "30 jours à 10 000 pas",
        "exercise": "10 000 pas",
        "muscle": "Cardio",
        "icon": "walk",
        "unit": "pas",
        "rest_days": [],
    },
    "running": {
        "name": "30 jours running",
        "exercise": "Course",
        "muscle": "Cardio",
        "icon": "footsteps",
        "unit": "km",
        "rest_days": [3, 7, 11, 15, 19, 23, 27],
    },
}


CHALLENGE_ALIASES = {
    "pushup": "pushups",
    "pushups": "pushups",
    "pompe": "pushups",
    "pompes": "pushups",
    "defipompes": "pushups",
    "abs": "abs",
    "abdo": "abs",
    "abdos": "abs",
    "abdominaux": "abs",
    "defiabdos": "abs",
    "squat": "squats",
    "squats": "squats",
    "defisquats": "squats",
    "plank": "plank",
    "planche": "plank",
    "gainage": "plank",
    "defigainage": "plank",
    "defigainage30jours": "plank",
    "steps": "steps10k",
    "pas": "steps10k",
    "10000pas": "steps10k",
    "10000": "steps10k",
    "10kpas": "steps10k",
    "10k": "steps10k",
    "steps10k": "steps10k",
    "defi10000pas": "steps10k",
    "defi10kpas": "steps10k",
    "defipas": "steps10k",
    "10000steps": "steps10k",
    "marche": "steps10k",
    "run": "running",
    "runner": "running",
    "running": "running",
    "course": "running",
    "courseapied": "running",
    "defirunning": "running",
    "defirunning30jours": "running",
}


def normalize_challenge_type(raw: str) -> str:
    """Accept both internal ids and user-facing French labels."""
    normalized = unicodedata.normalize("NFKD", raw or "")
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    key = re.sub(r"[^a-z0-9]+", "", normalized.lower())
    if key in CHALLENGE_ALIASES:
        return CHALLENGE_ALIASES[key]
    if "gain" in key or "plank" in key or "planche" in key:
        return "plank"
    if "10000" in key or "10k" in key or "pas" in key or "step" in key or "marche" in key:
        return "steps10k"
    if "run" in key or "course" in key or "km" in key:
        return "running"
    if "abdo" in key or "crunch" in key:
        return "abs"
    if "pompe" in key or "push" in key:
        return "pushups"
    if "squat" in key:
        return "squats"
    return key


def _challenge_volume_for(day_index: int, level: int) -> int:
    """Volume progressif sur 30 jours. level 1-3 (débutant/intermédiaire/avancé)."""
    base = {1: 10, 2: 20, 3: 35}.get(level, 15)
    # Linear progression: day 1 = base, day 30 = base * 4
    progress = 1.0 + (day_index / 29.0) * 3.0
    return int(round(base * progress))


def _challenge_target_for(ch_type: str, day_index: int, level: Optional[int] = None) -> float:
    if ch_type == "plank":
        base = {1: 20, 2: 35, 3: 50}.get(level, 25)
        return int(round(base + day_index * (4 + level)))
    if ch_type == "steps10k":
        return 10000
    if ch_type == "running":
        base = {1: 1.0, 2: 1.5, 3: 2.0}.get(level or 1, 1.2)
        return round(base + day_index * (0.08 + (level or 1) * 0.03), 1)
    return _challenge_volume_for(day_index, level)


def _challenge_level_from_profile(profile: Optional[Dict[str, Any]]) -> int:
    if not profile:
        return 1
    act = (profile.get("activity_level") or "").lower()
    if act in ("very_active", "athlete", "high"):
        return 3
    if act in ("moderate", "active"):
        return 2
    return 1


def _build_challenge_days(ch_type: str, level: int) -> List[Dict[str, Any]]:
    bp = CHALLENGE_BLUEPRINTS[ch_type]
    rest_set = set(bp["rest_days"])
    out: List[Dict[str, Any]] = []
    for d in range(30):
        if d in rest_set:
            out.append({
                "day_index": d,
                "is_rest": True,
                "target_reps": 0,
                "label": "Repos actif",
                "completed": False,
            })
        else:
            out.append({
                "day_index": d,
                "is_rest": False,
                "target_reps": _challenge_target_for(ch_type, d, level),
                "unit": bp.get("unit", "reps"),
                "label": f"{bp['exercise']}",
                "completed": False,
            })
    return out


# --- LLM utils ---
def extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    # Try to find a JSON object inside the text
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        # Sometimes models wrap with ```json
        cleaned = m.group(0).replace("\n", " ")
        try:
            return json.loads(cleaned)
        except Exception:
            return None


async def call_claude(system: str, text: str, images_base64: Optional[List[str]] = None) -> str:
    """Send a message to Claude via the Anthropic API and return the text response."""
    if not anthropic_client:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")
    content: List[Dict[str, Any]] = []
    for img in images_base64 or []:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": img},
        })
    content.append({"type": "text", "text": text})
    response = await anthropic_client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": content}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


async def analyze_meal_with_claude(image_base64: str) -> Dict[str, Any]:
    if not anthropic_client:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    system = (
        "Tu es un nutritionniste expert. Tu analyses des photos d'assiette et tu réponds "
        "UNIQUEMENT avec un JSON valide. Sois réaliste et précis. Le JSON DOIT avoir cette forme:\n"
        '{"name": "nom court du plat en français", '
        '"calories": int (kcal estimés pour la portion visible), '
        '"protein_g": int, "carbs_g": int, "fat_g": int, '
        '"notes": "courte note (max 12 mots) sur la qualité nutritionnelle"}'
    )
    try:
        response = await call_claude(
            system,
            "Analyse cette assiette. Retourne UNIQUEMENT le JSON, rien d'autre.",
            images_base64=[image_base64],
        )
    except Exception as e:
        log.exception("Claude meal analysis failed")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    data = extract_json(response or "")
    if not data:
        raise HTTPException(status_code=502, detail="Failed to parse meal analysis")
    return {
        "name": str(data.get("name", "Repas")),
        "calories": int(data.get("calories", 0)),
        "protein_g": int(data.get("protein_g", 0)),
        "carbs_g": int(data.get("carbs_g", 0)),
        "fat_g": int(data.get("fat_g", 0)),
        "notes": str(data.get("notes", "")),
    }


async def ai_food_search(query: str) -> List[Dict[str, Any]]:
    """Use Claude to estimate nutritional values for an unknown food name.
    Returns 1-3 suggestions: per 100g/100ml/per unit + a standard portion."""
    if not anthropic_client or not query.strip():
        return []
    system = (
        "Tu es un nutritionniste expert. L'utilisateur tape le nom d'un aliment ou d'un plat. "
        "Tu retournes UNIQUEMENT un JSON valide. Si tu reconnais l'aliment, propose 1 à 3 "
        "variantes (ex: 'pizza margherita' et 'pizza 4 fromages'). Sois réaliste et précis. "
        "Le JSON DOIT avoir cette forme exacte :\n"
        '{"suggestions": ['
        '  {"name": "nom court en français", '
        '   "category": "Protéines|Glucides|Légumes|Fruits|Laitiers|Lipides|Sucreries|Boissons|Plats préparés|Snacks|Compléments", '
        '   "unit": "g|ml|unit", '
        '   "default_qty": float (portion par défaut), '
        '   "kcal": float (par 100g/100ml OU par 1 unit), '
        '   "protein_g": float, "carbs_g": float, "fat_g": float, '
        '   "portion_label": "ex: 1 part (120g), 1 bol (250ml), 1 fruit (180g)"}'
        ']}'
        "\nSi tu ne reconnais pas, retourne {\"suggestions\": []}. Ne devine pas."
    )
    try:
        response = await call_claude(system, f"Aliment: {query.strip()[:100]}\nRetourne UNIQUEMENT le JSON.")
    except Exception:
        log.exception("Claude food search failed")
        return []
    data = extract_json(response or "")
    if not data or not isinstance(data.get("suggestions"), list):
        return []
    out: List[Dict[str, Any]] = []
    for s in data["suggestions"][:3]:
        try:
            unit = str(s.get("unit", "g")).lower()
            if unit not in ("g", "ml", "unit"):
                unit = "g"
            out.append({
                "id": f"ai_{new_id('food')}",
                "name": str(s.get("name", query))[:80],
                "category": str(s.get("category", "Plats préparés"))[:30],
                "unit": unit,
                "default_qty": float(s.get("default_qty", 100 if unit in ("g", "ml") else 1)),
                "kcal": float(s.get("kcal", 0)),
                "protein_g": float(s.get("protein_g", 0)),
                "carbs_g": float(s.get("carbs_g", 0)),
                "fat_g": float(s.get("fat_g", 0)),
                "portion_label": str(s.get("portion_label", ""))[:80],
                "source": "ai",
            })
        except (ValueError, TypeError):
            continue
    return out


async def generate_recipes_with_claude(ingredients: List[str], goal: Optional[str]) -> List[Dict[str, Any]]:
    """Use Claude to suggest 3-5 recipes from a list of ingredients, filtered by goal."""
    if not anthropic_client or not ingredients:
        return []
    goal_clean = (goal or "maintenance").lower()
    goal_hint = {
        "cutting": "Objectif PERTE DE GRAS : favorise les recettes peu denses en calories, riches en protéines (≥30g/portion) et fibres.",
        "bulking": "Objectif PRISE DE MUSCLE : favorise les recettes riches en protéines (≥40g/portion) et calories suffisantes (450-700 kcal/portion).",
        "maintenance": "Objectif MAINTIEN : recettes équilibrées (protéines, glucides, lipides modérés).",
    }.get(goal_clean, "Objectif équilibré.")

    system = (
        "Tu es un chef nutritionniste. À partir d'une liste d'ingrédients que possède l'utilisateur, "
        "tu proposes 3 à 5 recettes RÉALISABLES UNIQUEMENT avec ces ingrédients (ou +sel/poivre/huile/épices basiques). "
        "Sois RÉALISTE et précis. Tu retournes UNIQUEMENT un JSON valide :\n"
        '{"recipes": ['
        '  {"name": "nom court", '
        '   "ingredients_used": ["ingrédient 1", "ingrédient 2"], '
        '   "instructions_brief": "Texte court (1-3 phrases) des étapes principales", '
        '   "kcal": int (par portion), '
        '   "protein_g": float, "carbs_g": float, "fat_g": float, '
        '   "portion_label": "1 portion (~Xg)", '
        '   "prep_min": int, '
        '   "category": "Protéines|Glucides|Plats préparés|Légumes"}'
        ']}'
        f"\n{goal_hint}"
    )
    user_text = "Ingrédients disponibles : " + ", ".join(ingredients[:25])[:500] + "\nRetourne UNIQUEMENT le JSON."
    try:
        response = await call_claude(system, user_text)
    except Exception:
        log.exception("Claude recipe generation failed")
        return []
    data = extract_json(response or "")
    if not data or not isinstance(data.get("recipes"), list):
        return []
    out: List[Dict[str, Any]] = []
    for r in data["recipes"][:5]:
        try:
            out.append({
                "id": f"rcp_{new_id('recipe')}",
                "name": str(r.get("name", "Recette"))[:80],
                "ingredients_used": [str(x)[:60] for x in (r.get("ingredients_used") or [])[:15]],
                "instructions_brief": str(r.get("instructions_brief", ""))[:400],
                "kcal": int(r.get("kcal", 0)),
                "protein_g": float(r.get("protein_g", 0)),
                "carbs_g": float(r.get("carbs_g", 0)),
                "fat_g": float(r.get("fat_g", 0)),
                "portion_label": str(r.get("portion_label", "1 portion"))[:60],
                "prep_min": int(r.get("prep_min", 0)),
                "category": str(r.get("category", "Plats préparés"))[:30],
            })
        except (ValueError, TypeError):
            continue
    return out


def local_recipe_suggestions(ingredients: List[str], goal: Optional[str]) -> List[Dict[str, Any]]:
    cleaned = [re.sub(r"\s+", " ", x.strip()) for x in ingredients if x.strip()]
    if not cleaned:
        return []
    protein_words = [x for x in cleaned if any(w in x.lower() for w in ("poulet", "thon", "oeuf", "œuf", "boeuf", "bœuf", "tofu", "saumon", "whey", "dinde"))]
    carb_words = [x for x in cleaned if any(w in x.lower() for w in ("riz", "pâte", "pates", "avoine", "pain", "pomme de terre", "quinoa", "semoule"))]
    veg_words = [x for x in cleaned if x not in protein_words and x not in carb_words]
    protein = protein_words[0] if protein_words else cleaned[0]
    carb = carb_words[0] if carb_words else None
    veg = veg_words[0] if veg_words else None
    goal_clean = (goal or "maintenance").lower()
    kcal = 430 if goal_clean == "cutting" else 620 if goal_clean == "bulking" else 520
    protein_g = 38 if protein_words else 25
    name_parts = [protein]
    if carb:
        name_parts.append(carb)
    if veg:
        name_parts.append(veg)
    main_name = "Bol " + " + ".join(name_parts[:3])
    return [{
        "id": f"local_{new_id('recipe')}",
        "name": main_name[:80],
        "ingredients_used": name_parts[:6],
        "instructions_brief": "Assemble une base simple : cuisson douce, portion protéinée au centre, glucides ajustés selon l'objectif, légumes ou fruits autour.",
        "kcal": kcal,
        "protein_g": protein_g,
        "carbs_g": 45 if carb else 25,
        "fat_g": 14,
        "portion_label": "1 portion",
        "prep_min": 15,
        "category": "Plats préparés",
        "source": "algorithm",
    }]


def validate_meal_date(d: Optional[str]) -> str:
    """Validate that the date is within the last 14 days. Returns YYYY-MM-DD."""
    if not d:
        return today_str()
    try:
        target = datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format (expected YYYY-MM-DD)")
    today = now_local().date()
    if target > today:
        raise HTTPException(400, "Date dans le futur non autorisée")
    if (today - target).days > 14:
        raise HTTPException(400, "Tu ne peux ajouter qu'aux 14 derniers jours")
    return d


def validate_log_date(d: Optional[str]) -> str:
    if not d:
        return today_str()
    try:
        target = datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format (expected YYYY-MM-DD)")
    if target > now_local().date():
        raise HTTPException(400, "Date dans le futur non autorisée")
    return d


async def analyze_transformation_with_claude(image_base64: str, prev_image_base64: Optional[str] = None) -> str:
    if not anthropic_client:
        return "Analyse IA indisponible."
    system = (
        "Tu es un coach physique. Tu donnes un feedback bref, factuel et bienveillant sur la "
        "composition corporelle visible (définition musculaire, posture, niveau de gras visible). "
        "Réponds en français, 2 à 3 phrases max. Pas de jugement, que des observations utiles."
    )
    images = [image_base64]
    text = "Analyse cette photo de transformation. Donne un feedback bref et concret."
    if prev_image_base64:
        images.insert(0, prev_image_base64)
        text = "Compare la photo précédente et la nouvelle (la 2e). Donne un feedback bref."
    try:
        response = await call_claude(system, text, images_base64=images)
        return (response or "").strip()[:500]
    except Exception as e:
        log.exception("Claude transformation failed")
        return f"Analyse impossible: {e}"


# --- AUTH ---
@api.post("/privacy-requests", status_code=202)
async def create_privacy_request(body: PrivacyRequestIn):
    """Create a privacy-rights request without revealing account existence."""
    if body.website:
        return {"ok": True, "request_id": new_id("privacy")}
    if not body.confirmation:
        raise HTTPException(400, "La confirmation est requise.")

    email = body.email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(400, "Adresse e-mail invalide.")
    allowed_types = {"access", "rectification", "portability", "objection", "deletion", "other"}
    request_type = body.request_type if body.request_type in allowed_types else "other"
    email_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()

    recent = await db.privacy_requests.find_one(
        {
            "email_hash": email_hash,
            "request_type": request_type,
            "created_at": {"$gte": now_utc() - timedelta(hours=24)},
        },
        {"_id": 0, "id": 1},
    )
    if recent:
        return {"ok": True, "request_id": recent["id"]}

    request_id = new_id("privacy")
    await db.privacy_requests.insert_one(
        {
            "id": request_id,
            "email": email,
            "email_hash": email_hash,
            "request_type": request_type,
            "message": (body.message or "").strip()[:1500],
            "status": "pending_verification",
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=180),
        }
    )
    return {"ok": True, "request_id": request_id}


@api.post("/auth/session")
async def auth_session(body: SessionLoginRequest):
    """Exchange session_id from Emergent Auth for an app session (one-shot call)."""
    headers = {"X-Session-ID": body.session_id}
    async with httpx.AsyncClient(timeout=15.0) as cli:
        try:
            r = await cli.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers=headers,
            )
        except httpx.HTTPError as e:
            log.exception("Auth provider error")
            raise HTTPException(status_code=502, detail=f"Auth provider error: {e}")
    if r.status_code != 200:
        log.warning("Emergent auth lookup failed: %s %s", r.status_code, r.text[:200])
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    name = data.get("name", email.split("@")[0])
    picture = data.get("picture")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = new_id("user")
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "created_at": now_utc(),
                "onboarded": False,
            }
        )

    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "expires_at": now_utc() + timedelta(days=7),
                "created_at": now_utc(),
            }
        },
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {
        "session_token": session_token,
        "user": {
            "user_id": user_id,
            "email": user["email"],
            "name": user["name"],
            "picture": user.get("picture"),
            "onboarded": bool(user.get("onboarded", False)),
        },
    }


@api.post("/auth/review")
async def auth_review(body: ReviewLoginRequest):
    """Issue a reusable, store-review-only session without exposing a password."""
    if not PLAY_REVIEW_USERNAME or len(PLAY_REVIEW_PASSWORD_HASH) != 64:
        raise HTTPException(status_code=404, detail="Review access is not configured")

    submitted_username = body.username.strip().lower()
    expected_username = PLAY_REVIEW_USERNAME.lower()
    submitted_hash = hashlib.sha256(body.password.encode("utf-8")).hexdigest()
    credentials_valid = hmac.compare_digest(submitted_username, expected_username)
    credentials_valid = credentials_valid and hmac.compare_digest(
        submitted_hash, PLAY_REVIEW_PASSWORD_HASH
    )
    if not credentials_valid:
        raise HTTPException(status_code=401, detail="Invalid review credentials")

    user_id = "play_review_account"
    review_email = (
        PLAY_REVIEW_USERNAME
        if "@" in PLAY_REVIEW_USERNAME
        else "play-review@fit-ai.app"
    )
    mascot = {"animal": "aigle", "chosen_at": now_utc()}
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "email": review_email,
                "name": "Equipe Google Play",
                "picture": None,
                "onboarded": True,
                "reviewer_access": True,
                "mascot": mascot,
            },
            "$setOnInsert": {"created_at": now_utc()},
        },
        upsert=True,
    )

    review_profile = ProfileIn(
        weight_kg=75,
        height_cm=175,
        age=30,
        gender="male",
        goal="maintain",
        activity_level="moderate",
        health_data_consent=True,
        legal_version="2026-08-10",
    )
    profile_doc = {
        "user_id": user_id,
        **review_profile.model_dump(exclude_none=True),
        **compute_targets(review_profile),
        "health_data_consent_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.profiles.update_one(
        {"user_id": user_id}, {"$set": profile_doc}, upsert=True
    )

    session_token = "review_" + secrets.token_urlsafe(48)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": now_utc() + timedelta(days=90),
            "created_at": now_utc(),
            "purpose": "google_play_review",
        }
    )
    return {
        "session_token": session_token,
        "user": {
            "user_id": user_id,
            "email": review_email,
            "name": "Equipe Google Play",
            "picture": None,
            "onboarded": True,
            "reviewer_access": True,
            "mascot": mascot,
        },
    }


@api.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "onboarded": bool(user.get("onboarded", False)),
        "silhouette": user.get("silhouette"),
        "force_metrics": user.get("force_metrics"),
        "mascot": user.get("mascot"),
        "notif_prefs": user.get("notif_prefs"),
        "referral": user.get("referral"),
        "reviewer_access": bool(user.get("reviewer_access", False)),
    }


@api.get("/ai/usage")
async def ai_usage_summary(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    day = today_str()
    month = day[:7]
    today_items = await db.ai_usage.find(
        {"user_id": user["user_id"], "date": day}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    month_items = await db.ai_usage.find(
        {"user_id": user["user_id"], "month": month}, {"_id": 0}
    ).to_list(1000)
    by_feature: Dict[str, int] = {}
    for item in month_items:
        feature = str(item.get("feature", "unknown"))
        by_feature[feature] = by_feature.get(feature, 0) + int(item.get("units", 1))
    return {
        "algorithm_only": ALGORITHM_ONLY_AI,
        "daily_limit": AI_DAILY_LIMIT,
        "monthly_limit": AI_MONTHLY_LIMIT,
        "today_used": sum(int(x.get("units", 1)) for x in today_items),
        "month_used": sum(int(x.get("units", 1)) for x in month_items),
        "estimated_month_cost_cents": round(sum(float(x.get("estimated_cost_cents", 0)) for x in month_items), 3),
        "by_feature": by_feature,
        "recent": today_items[:20],
    }


@api.post("/affiliates")
async def create_affiliate_code(
    body: AffiliateCreateRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    base = body.code or body.display_name or user.get("name") or user.get("email") or "COACH"
    code = normalize_code(base)
    if len(code) < 4:
        code = normalize_code(f"COACH-{user['user_id'][-6:]}")
    existing = await db.affiliates.find_one({"code": code}, {"_id": 0})
    if existing:
        raise HTTPException(409, "Ce code coach existe déjà.")
    doc = {
        "id": new_id("aff"),
        "code": code,
        "owner_user_id": user["user_id"],
        "display_name": (body.display_name or user.get("name") or "Coach")[:80],
        "commission_percent": max(0, min(60, float(body.commission_percent))),
        "flat_fee_cents": max(0, int(body.flat_fee_cents)),
        "status": "active",
        "created_at": now_utc(),
    }
    await db.affiliates.insert_one(doc)
    return strip_id(doc)


@api.get("/affiliates/me")
async def my_affiliate_codes(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.affiliates.find(
        {"owner_user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"items": items}


@api.post("/affiliates/apply")
async def apply_affiliate_code(
    body: AffiliateApplyRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    code = normalize_code(body.code)
    affiliate = await db.affiliates.find_one({"code": code, "status": "active"}, {"_id": 0})
    if not affiliate:
        raise HTTPException(404, "Code coach introuvable.")
    if affiliate.get("owner_user_id") == user["user_id"]:
        raise HTTPException(400, "Tu ne peux pas appliquer ton propre code.")
    referral = {
        "code": code,
        "affiliate_id": affiliate["id"],
        "owner_user_id": affiliate["owner_user_id"],
        "applied_at": now_utc(),
    }
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral": referral}})
    await db.affiliate_events.insert_one({
        "id": new_id("affe"),
        "type": "code_applied",
        "code": code,
        "affiliate_id": affiliate["id"],
        "owner_user_id": affiliate["owner_user_id"],
        "user_id": user["user_id"],
        "created_at": now_utc(),
    })
    return {"ok": True, "referral": referral}


@api.get("/affiliates/{code}/stats")
async def affiliate_stats(code: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    normalized = normalize_code(code)
    affiliate = await db.affiliates.find_one({"code": normalized}, {"_id": 0})
    if not affiliate:
        raise HTTPException(404, "Code coach introuvable.")
    if affiliate.get("owner_user_id") != user["user_id"]:
        raise HTTPException(403, "Accès réservé au propriétaire du code.")
    signups = await db.users.count_documents({"referral.code": normalized})
    events = await db.affiliate_events.find(
        {"code": normalized}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {
        "code": normalized,
        "signups": signups,
        "conversions": 0,
        "estimated_commission_cents": 0,
        "events": events[:25],
    }


@api.put("/users/me/mascot")
async def update_mascot(
    body: MascotRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    animal = (body.animal or "").lower()
    valid = {"lion", "tigre", "loup", "ours", "aigle"}
    if animal not in valid:
        raise HTTPException(400, "Animal invalide")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"mascot": {"animal": animal, "chosen_at": now_utc().isoformat()}}},
    )
    return {"mascot": {"animal": animal}}


@api.put("/users/me/notif-prefs")
async def update_notif_prefs(
    body: NotifPrefsRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    cleaned: List[Dict[str, Any]] = []
    for r in body.reminders[:8]:  # cap at 8 reminders
        kind = r.kind if r.kind in ("workout", "protein") else "workout"
        hour = max(0, min(23, int(r.hour)))
        minute = max(0, min(59, int(r.minute)))
        days = r.days_of_week or list(range(7))
        days = sorted({max(0, min(6, int(d))) for d in days})
        cleaned.append({
            "id": r.id or new_id("notif"),
            "kind": kind,
            "hour": hour,
            "minute": minute,
            "enabled": bool(r.enabled),
            "days_of_week": days,
            "label": r.label,
        })
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"notif_prefs": {"reminders": cleaned}}}
    )
    return {"notif_prefs": {"reminders": cleaned}}


# ---- POINTS / LEVELS ----

POINT_RULES = {
    "workout_completed": 100,
    "protein_target_hit": 10,
    "calories_on_track": 10,
    "challenge_day": 50,
    "sleep_bonus_7h": 50,
    "sleep_bonus_8h": 100,
    "sleep_penalty_6h": -50,
    "sleep_penalty_5h": -100,
    "missed_workout_penalty": -25,
    "missed_meal_penalty": -20,
    "protein_low_penalty": -20,
    "sleep_missing_penalty": -20,
    "pr_beaten": 25,
    "streak_bonus": 5,
    "combo_bonus": 20,  # 3+ goals in same day
}


def compute_level(total: int) -> Dict[str, int]:
    """Levels 1..10. Threshold = 50 * (level^1.15) cumulative.
    Returns dict with level, points_in_level, next_threshold, evolution(1..3)."""
    thresholds = [int(50 * ((i) ** 1.25)) for i in range(1, 11)]  # cumulative steps
    cum = 0
    pts = max(0, total)
    lvl = 1
    next_t = thresholds[0]
    for i, step in enumerate(thresholds):
        if pts >= cum + step:
            cum += step
            lvl = i + 2 if i + 1 < len(thresholds) else 10
        else:
            next_t = cum + step
            break
    lvl = min(10, lvl)
    evolution = 1 if lvl <= 3 else (2 if lvl <= 7 else 3)
    return {
        "level": lvl,
        "points_total": pts,
        "points_in_level": pts - cum,
        "level_span": (next_t - cum) if lvl < 10 else 0,
        "evolution": evolution,
    }


async def award_points(user_id: str, reason: str, qty: Optional[int] = None, meta: Optional[Dict[str, Any]] = None) -> int:
    """Insert a points event and return the awarded amount. Idempotent per (user, date, reason, meta.key)."""
    base = qty if qty is not None else POINT_RULES.get(reason, 0)
    if base == 0:
        return 0
    d = today_str()
    key = (meta or {}).get("key") or reason
    existing = await db.points_events.find_one(
        {"user_id": user_id, "date": d, "reason": reason, "key": key}
    )
    if existing:
        return 0
    doc = {
        "id": new_id("pt"),
        "user_id": user_id,
        "date": d,
        "reason": reason,
        "key": key,
        "amount": base,
        "meta": meta or {},
        "created_at": now_utc(),
    }
    await db.points_events.insert_one(doc)
    return base


async def evaluate_daily_combos(user_id: str) -> None:
    """If user has hit 3+ goal reasons today, award combo bonus once."""
    d = today_str()
    reasons = await db.points_events.distinct(
        "reason", {"user_id": user_id, "date": d, "reason": {"$ne": "combo_bonus"}}
    )
    if len([r for r in reasons if r in ("workout_completed", "protein_target_hit", "calories_on_track", "challenge_day", "pr_beaten")]) >= 3:
        await award_points(user_id, "combo_bonus", meta={"key": "combo_" + d})


def health_state_for(level: int, weekly_steps: int, active_minutes: int, weekly_workouts: int) -> Dict[str, Any]:
    if level >= 8:
        title = "Condition solide"
        summary = "Ton niveau indique une base cardio-musculaire déjà bien installée."
    elif level >= 5:
        title = "Rythme protecteur"
        summary = "Tu construis une routine qui soutient l'énergie, le souffle et la force."
    elif level >= 3:
        title = "Base active"
        summary = "Les premiers effets se jouent sur la régularité et la dépense quotidienne."
    else:
        title = "Mise en route"
        summary = "Chaque séance et chaque marche créent le socle de progression."
    benefits: List[str] = []
    if weekly_workouts >= 2:
        benefits.append("Renforcement musculaire, posture et métabolisme mieux stimulés.")
    if active_minutes >= 150:
        benefits.append("Objectif hebdo d'activité atteint : bon signal pour le coeur et l'endurance.")
    elif active_minutes >= 75:
        benefits.append("Activité cardio en construction : vise encore quelques minutes actives.")
    if weekly_steps >= 50000:
        benefits.append("Beau volume de pas : meilleure dépense quotidienne et récupération active.")
    elif weekly_steps >= 25000:
        benefits.append("Les pas soutiennent ta dépense de fond sans ajouter trop de fatigue.")
    if not benefits:
        benefits.append("Commence par une séance et une marche : le compteur santé monte vite.")
    return {
        "title": title,
        "summary": summary,
        "benefits": benefits[:3],
    }


async def evaluate_previous_day_penalties(user_id: str) -> None:
    """Best-effort daily accountability. Idempotent by date/reason/key."""
    target_day = now_utc().date() - timedelta(days=1)
    d = target_day.isoformat()
    existing_review = await db.points_events.find_one(
        {"user_id": user_id, "date": d, "reason": "daily_review_marker", "key": f"review_{d}"}
    )
    if existing_review:
        return

    program = await db.programs.find_one({"user_id": user_id, "active": True}, {"_id": 0})
    training_days = program.get("training_days") if program else None
    should_train = bool(training_days and target_day.weekday() in set(int(x) for x in training_days))
    workout_done = await db.workouts.find_one({"user_id": user_id, "date": d, "completed": True})
    if should_train and not workout_done:
        await db.points_events.update_one(
            {"user_id": user_id, "date": d, "reason": "missed_workout_penalty", "key": f"missed_workout_{d}"},
            {"$setOnInsert": {
                "id": new_id("pt"),
                "user_id": user_id,
                "date": d,
                "reason": "missed_workout_penalty",
                "key": f"missed_workout_{d}",
                "amount": POINT_RULES["missed_workout_penalty"],
                "meta": {"key": f"missed_workout_{d}"},
                "created_at": now_utc(),
            }},
            upsert=True,
        )

    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
    protein_target = float(profile.get("protein_g", 0) or 0)
    meals = await db.meals.find({"user_id": user_id, "date": d}, {"_id": 0, "image_base64": 0}).to_list(200)
    if not meals:
        await db.points_events.update_one(
            {"user_id": user_id, "date": d, "reason": "missed_meal_penalty", "key": f"missed_meal_{d}"},
            {"$setOnInsert": {
                "id": new_id("pt"),
                "user_id": user_id,
                "date": d,
                "reason": "missed_meal_penalty",
                "key": f"missed_meal_{d}",
                "amount": POINT_RULES["missed_meal_penalty"],
                "meta": {"key": f"missed_meal_{d}"},
                "created_at": now_utc(),
            }},
            upsert=True,
        )
    elif protein_target > 0:
        protein = sum(float(m.get("protein_g", 0) or 0) for m in meals)
        if protein < protein_target * 0.75:
            await db.points_events.update_one(
                {"user_id": user_id, "date": d, "reason": "protein_low_penalty", "key": f"protein_low_{d}"},
                {"$setOnInsert": {
                    "id": new_id("pt"),
                    "user_id": user_id,
                    "date": d,
                    "reason": "protein_low_penalty",
                    "key": f"protein_low_{d}",
                    "amount": POINT_RULES["protein_low_penalty"],
                    "meta": {"key": f"protein_low_{d}", "protein_g": protein, "target_g": protein_target},
                    "created_at": now_utc(),
                }},
                upsert=True,
            )

    sleep = await db.sleep.find_one({"user_id": user_id, "date": d}, {"_id": 0})
    if not sleep:
        await db.points_events.update_one(
            {"user_id": user_id, "date": d, "reason": "sleep_missing_penalty", "key": f"sleep_missing_{d}"},
            {"$setOnInsert": {
                "id": new_id("pt"),
                "user_id": user_id,
                "date": d,
                "reason": "sleep_missing_penalty",
                "key": f"sleep_missing_{d}",
                "amount": POINT_RULES["sleep_missing_penalty"],
                "meta": {"key": f"sleep_missing_{d}"},
                "created_at": now_utc(),
            }},
            upsert=True,
        )

    await db.points_events.update_one(
        {"user_id": user_id, "date": d, "reason": "daily_review_marker", "key": f"review_{d}"},
        {"$setOnInsert": {
            "id": new_id("pt"),
            "user_id": user_id,
            "date": d,
            "reason": "daily_review_marker",
            "key": f"review_{d}",
            "amount": 0,
            "meta": {"key": f"review_{d}"},
            "created_at": now_utc(),
        }},
        upsert=True,
    )


@api.get("/points/summary")
async def points_summary(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    try:
        await evaluate_previous_day_penalties(user["user_id"])
    except Exception as e:
        log.warning(f"daily penalties failed: {e}")
    today = today_str()
    today_date = datetime.strptime(today, "%Y-%m-%d").date()
    week_start = (today_date - timedelta(days=today_date.weekday())).isoformat()
    pipeline_total = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    pipeline_today = [{"$match": {"user_id": user["user_id"], "date": today}}]
    pipeline_week = [{"$match": {"user_id": user["user_id"], "date": {"$gte": week_start, "$lte": today}}}]
    cur_t = db.points_events.aggregate(pipeline_total)
    cur_d = db.points_events.aggregate(pipeline_today + [{"$project": {"amount": 1}}])
    cur_w = db.points_events.aggregate(pipeline_week + [{"$project": {"amount": 1}}])
    total_doc = await cur_t.to_list(1)
    today_events = await cur_d.to_list(200)
    week_events = await cur_w.to_list(1000)
    total = int(total_doc[0]["total"]) if total_doc else 0
    points_today = int(sum(int(ev.get("amount", 0)) for ev in today_events))
    points_gained_today = int(sum(max(0, int(ev.get("amount", 0))) for ev in today_events))
    points_lost_today = int(sum(abs(min(0, int(ev.get("amount", 0)))) for ev in today_events))
    points_gained_week = int(sum(max(0, int(ev.get("amount", 0))) for ev in week_events))
    points_lost_week = int(sum(abs(min(0, int(ev.get("amount", 0)))) for ev in week_events))
    # Last 5 events
    recent = await db.points_events.find(
        {"user_id": user["user_id"], "amount": {"$ne": 0}}, {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    # Streak: consecutive days with at least one workout_completed
    streak = 0
    cur_date = datetime.strptime(today, "%Y-%m-%d").date()
    for i in range(0, 60):
        d = (cur_date - timedelta(days=i)).isoformat()
        ev = await db.points_events.find_one({"user_id": user["user_id"], "date": d, "reason": "workout_completed"})
        if ev:
            streak += 1
        else:
            if i == 0:
                continue  # today not yet completed shouldn't break the streak
            break
    lvl = compute_level(total)
    week_workouts = await db.workouts.count_documents(
        {"user_id": user["user_id"], "date": {"$gte": week_start, "$lte": today}, "completed": True}
    )
    activity_docs = await db.activity.find(
        {"user_id": user["user_id"], "date": {"$gte": week_start, "$lte": today}}, {"_id": 0}
    ).to_list(10)
    weekly_steps = sum(int(a.get("steps", 0) or 0) for a in activity_docs)
    weekly_active = sum(int(a.get("cardio_minutes", 0) or 0) for a in activity_docs)
    next_level_points = max(0, int(lvl.get("level_span", 0)) - int(lvl.get("points_in_level", 0)))
    return {
        **lvl,
        "points_today": points_today,
        "points_gained_today": points_gained_today,
        "points_lost_today": points_lost_today,
        "points_net_today": points_today,
        "points_gained_week": points_gained_week,
        "points_lost_week": points_lost_week,
        "points_net_week": points_gained_week - points_lost_week,
        "next_level_points": next_level_points,
        "health_state": health_state_for(lvl["level"], weekly_steps, weekly_active, week_workouts),
        "weekly_activity": {
            "workouts": week_workouts,
            "steps": weekly_steps,
            "active_minutes": weekly_active,
        },
        "recent": recent,
        "streak_days": streak,
    }


def sleep_points_for(hours: float) -> tuple[str, int]:
    if hours >= 8:
        return "sleep_bonus_8h", 100
    if hours >= 7:
        return "sleep_bonus_7h", 50
    if hours > 0 and hours <= 5:
        return "sleep_penalty_5h", -100
    if hours > 0 and hours <= 6:
        return "sleep_penalty_6h", -50
    return "sleep_neutral", 0


@api.post("/sleep")
async def log_sleep(body: SleepLogRequest, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    d = validate_meal_date(body.date)
    hours = max(0, min(14, round(float(body.hours) * 2) / 2))
    reason, amount = sleep_points_for(hours)
    await db.sleep.update_one(
        {"user_id": user["user_id"], "date": d},
        {"$set": {"user_id": user["user_id"], "date": d, "hours": hours, "updated_at": now_utc()}},
        upsert=True,
    )
    await db.points_events.delete_many(
        {"user_id": user["user_id"], "date": d, "reason": {"$regex": "^sleep_"}, "key": f"sleep_{d}"}
    )
    if amount:
        await db.points_events.insert_one({
            "id": new_id("pt"),
            "user_id": user["user_id"],
            "date": d,
            "reason": reason,
            "key": f"sleep_{d}",
            "amount": amount,
            "meta": {"key": f"sleep_{d}", "hours": hours},
            "created_at": now_utc(),
        })
    return {"ok": True, "date": d, "hours": hours, "points": amount, "reason": reason}


@api.put("/users/me/silhouette")
async def update_silhouette(
    body: SilhouetteRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    sex = "female" if body.sex.lower().startswith("f") else "male"
    level = max(1, min(5, int(body.level)))
    silhouette = {"sex": sex, "level": level}
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"silhouette": silhouette}}
    )
    return {"silhouette": silhouette}


@api.post("/workouts/estimate-1rm")
async def estimate_1rm_endpoint(
    body: Estimate1RMRequest, authorization: Optional[str] = Header(default=None)
):
    """Estimate 1RM for the big-3 + OHP from user-supplied weight×reps.
    Stores both the raw entries (in exercise_perf, so charts include them) and
    a compact `force_metrics` snapshot on the user doc for the profile screen."""
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    body_weight = float(profile.get("weight_kg", 0) or 0)

    pairs = [
        ("Squat barre arrière", "squat", body.squat_kg, body.squat_reps),
        ("Développé couché barre", "bench", body.bench_kg, body.bench_reps),
        ("Soulevé de terre barre", "deadlift", body.deadlift_kg, body.deadlift_reps),
        ("Développé militaire barre", "ohp", body.ohp_kg, body.ohp_reps),
    ]
    results: List[Dict[str, Any]] = []
    snapshot: Dict[str, Any] = {"at": now_utc().isoformat()}
    for name, slug, wkg, reps in pairs:
        if not wkg or not reps:
            continue
        est = estimate_1rm(float(wkg), int(reps))
        ratio = (est / body_weight) if body_weight > 0 else 0
        tier = strength_tier(ratio)
        # Persist in exercise_perf for chart continuity
        await db.exercise_perf.insert_one({
            "id": new_id("perf"),
            "user_id": user["user_id"],
            "workout_id": None,
            "date": today_str(),
            "exercise_name": name,
            "weight_kg": float(wkg),
            "reps": int(reps),
            "sets": 1,
            "est_1rm": est,
            "notes": "estimation onboarding/profile",
            "source": "estimate",
            "created_at": now_utc(),
        })
        results.append({
            "exercise": name,
            "weight_kg": float(wkg),
            "reps": int(reps),
            "est_1rm": est,
            "ratio_bw": round(ratio, 2),
            "tier": tier,
        })
        snapshot[slug] = est
    if results:
        await db.users.update_one(
            {"user_id": user["user_id"]}, {"$set": {"force_metrics": snapshot}}
        )
    return {"items": results, "snapshot": snapshot}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.delete("/auth/account")
async def delete_account(authorization: Optional[str] = Header(default=None)):
    """Permanently delete the authenticated account and user-owned data."""
    user = await get_current_user(authorization)
    user_id = user["user_id"]
    email = str(user.get("email", "")).strip().lower()

    direct_collections = [
        "activity",
        "ai_usage",
        "challenges",
        "daily_compliance",
        "exercise_perf",
        "favorites",
        "meals",
        "points_events",
        "profiles",
        "programs",
        "sleep",
        "transformations",
        "user_exercises",
        "weight_logs",
        "workouts",
    ]
    deleted: Dict[str, int] = {}
    for collection_name in direct_collections:
        result = await db[collection_name].delete_many({"user_id": user_id})
        deleted[collection_name] = result.deleted_count

    owned_affiliates = await db.affiliates.find(
        {"owner_user_id": user_id}, {"_id": 0, "code": 1}
    ).to_list(200)
    owned_codes = [item["code"] for item in owned_affiliates if item.get("code")]
    affiliate_filter: Dict[str, Any] = {
        "$or": [{"user_id": user_id}, {"owner_user_id": user_id}]
    }
    if owned_codes:
        affiliate_filter["$or"].append({"code": {"$in": owned_codes}})
    deleted["affiliate_events"] = (
        await db.affiliate_events.delete_many(affiliate_filter)
    ).deleted_count
    deleted["affiliates"] = (
        await db.affiliates.delete_many({"owner_user_id": user_id})
    ).deleted_count
    await db.users.update_many(
        {"referral.owner_user_id": user_id}, {"$unset": {"referral": ""}}
    )

    deleted["user_sessions"] = (
        await db.user_sessions.delete_many({"user_id": user_id})
    ).deleted_count
    deleted["users"] = (
        await db.users.delete_one({"user_id": user_id})
    ).deleted_count

    if email:
        email_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()
        await db.privacy_requests.update_many(
            {"email_hash": email_hash},
            {
                "$set": {
                    "status": "fulfilled_in_app",
                    "fulfilled_at": now_utc(),
                    "email": None,
                    "message": "",
                    "expires_at": now_utc() + timedelta(days=180),
                }
            },
        )

    return {"ok": True, "deleted_records": sum(deleted.values())}


# --- PROFILE ---
@api.get("/profile")
async def get_profile(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    prof = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not prof:
        return {"measurement_complete": False}
    prof["measurement_complete"] = all(
        float(prof.get(key, 0) or 0) > 0 for key in ("weight_kg", "height_cm", "age")
    )
    return prof


@api.put("/profile")
async def upsert_profile(body: ProfileIn, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    targets = compute_targets(body)
    profile_values = body.model_dump(exclude_none=True)
    doc = {
        "user_id": user["user_id"],
        **profile_values,
        **targets,
        "updated_at": now_utc(),
    }
    if body.health_data_consent:
        doc["health_data_consent_at"] = now_utc()
        doc["legal_version"] = body.legal_version or "2026-08-10"
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": doc}, upsert=True)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarded": True}})
    response = strip_id(doc)
    response["measurement_complete"] = True
    return response


# --- MEALS ---
async def compute_compliance(user_id: str, date: str) -> Dict[str, Any]:
    """Compute % of target respected for a given date."""
    profile = await db.profiles.find_one({"user_id": user_id}, {"_id": 0}) or {}
    target = int(profile.get("daily_calories", 0))
    meals = await db.meals.find(
        {"user_id": user_id, "date": date}, {"_id": 0, "image_base64": 0}
    ).to_list(500)
    consumed = sum(m.get("calories", 0) for m in meals)
    if target <= 0:
        compliance_pct = 0
    else:
        # 100% = exactly at target, scales down as you over/under shoot
        deviation = abs(consumed - target) / target
        compliance_pct = max(0, round((1 - deviation) * 100))
    return {
        "user_id": user_id,
        "date": date,
        "target": target,
        "consumed": consumed,
        "compliance_pct": compliance_pct,
        "meals_count": len(meals),
        "snapshot_at": now_utc(),
    }


async def archive_compliance_snapshot(user_id: str, date: str) -> None:
    """Persist compliance summary for a date so it survives meal deletion."""
    snap = await compute_compliance(user_id, date)
    await db.daily_compliance.update_one(
        {"user_id": user_id, "date": date}, {"$set": snap}, upsert=True
    )


async def run_meal_lifecycle(user_id: str) -> Dict[str, int]:
    """
    Lifecycle policy:
      - meals between 7 and 14 days old → marked archived (kept, hidden by default)
      - meals older than 14 days → snapshot daily compliance, then delete
    Returns counts.
    """
    today = now_utc().date()
    archive_cutoff = today - timedelta(days=7)
    delete_cutoff = today - timedelta(days=14)

    # Snapshot compliance for any day we're about to purge
    purge_dates_cursor = db.meals.aggregate(
        [
            {"$match": {"user_id": user_id, "date": {"$lt": delete_cutoff.isoformat()}}},
            {"$group": {"_id": "$date"}},
        ]
    )
    purge_dates = [d["_id"] async for d in purge_dates_cursor]
    for d in purge_dates:
        await archive_compliance_snapshot(user_id, d)

    # Delete old (>14d)
    deleted = await db.meals.delete_many(
        {"user_id": user_id, "date": {"$lt": delete_cutoff.isoformat()}}
    )
    # Mark 7-14d as archived if not already
    archived = await db.meals.update_many(
        {
            "user_id": user_id,
            "date": {"$lt": archive_cutoff.isoformat()},
            "archived": {"$ne": True},
        },
        {"$set": {"archived": True}},
    )
    return {"deleted": deleted.deleted_count, "archived": archived.modified_count}


@api.post("/meals/analyze")
async def analyze_and_save_meal(
    body: MealAnalyzeRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    usage = await record_ai_usage(user["user_id"], "meal_photo_analysis")
    if usage.get("algorithm_only"):
        raise HTTPException(503, "Analyse photo désactivée en mode sans IA externe.")
    analysis = await analyze_meal_with_claude(body.image_base64)
    target_date = validate_meal_date(body.date)
    created = now_utc()
    meal = {
        "id": new_id("meal"),
        "user_id": user["user_id"],
        "date": target_date,
        "created_at": created,
        "image_base64": body.image_base64[:200000],  # cap to avoid bloat
        "meal_type": body.meal_type or auto_meal_type(created),
        **analysis,
    }
    await db.meals.insert_one(meal)
    return strip_id(meal)


@api.get("/meals")
async def list_meals(
    date: Optional[str] = None,
    include_archived: bool = False,
    history: bool = False,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    # Run lifecycle (auto-archive >7d, delete >14d) on every read — cheap
    await run_meal_lifecycle(user["user_id"])

    q: Dict[str, Any] = {"user_id": user["user_id"]}
    if date:
        q["date"] = date
    if not include_archived and not history:
        q["archived"] = {"$ne": True}
    cursor = db.meals.find(q, {"_id": 0, "image_base64": 0}).sort("created_at", -1)
    items = await cursor.to_list(500)

    if history:
        # Group by date, include compliance for each day
        by_date: Dict[str, List[Dict[str, Any]]] = {}
        for m in items:
            by_date.setdefault(m["date"], []).append(m)
        days = []
        for d in sorted(by_date.keys(), reverse=True):
            comp = await compute_compliance(user["user_id"], d)
            days.append({"date": d, "compliance": comp, "meals": by_date[d]})
        # Add snapshots for dates with no live meals (already purged)
        snapshot_dates = await db.daily_compliance.find(
            {"user_id": user["user_id"]}, {"_id": 0}
        ).sort("date", -1).to_list(60)
        existing = {d["date"] for d in days}
        for s in snapshot_dates:
            if s["date"] not in existing:
                days.append({"date": s["date"], "compliance": s, "meals": [], "purged": True})
        days.sort(key=lambda x: x["date"], reverse=True)
        return {"days": days}

    return items


@api.post("/meals/cleanup")
async def cleanup_meals(authorization: Optional[str] = Header(default=None)):
    """Manually trigger lifecycle (already auto-runs on GET /meals)."""
    user = await get_current_user(authorization)
    res = await run_meal_lifecycle(user["user_id"])
    return res


@api.delete("/meals/older-than/{days}")
async def delete_old_meals(
    days: int, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    if days < 1:
        raise HTTPException(400, "days must be >= 1")
    cutoff = (now_utc().date() - timedelta(days=days)).isoformat()
    # Snapshot before delete
    dates_cursor = db.meals.aggregate(
        [
            {"$match": {"user_id": user["user_id"], "date": {"$lt": cutoff}}},
            {"$group": {"_id": "$date"}},
        ]
    )
    dates = [d["_id"] async for d in dates_cursor]
    for d in dates:
        await archive_compliance_snapshot(user["user_id"], d)
    res = await db.meals.delete_many(
        {"user_id": user["user_id"], "date": {"$lt": cutoff}}
    )
    return {"deleted": res.deleted_count, "snapshots": len(dates)}


@api.get("/compliance/history")
async def compliance_history(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.daily_compliance.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("date", -1).to_list(180)
    return items


@api.get("/meals/{meal_id}")
async def get_meal(meal_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    meal = await db.meals.find_one(
        {"id": meal_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not meal:
        raise HTTPException(404, "Not found")
    return meal


@api.patch("/meals/{meal_id}")
async def update_meal(meal_id: str, body: MealUpdateRequest, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    update: Dict[str, Any] = {"updated_at": now_utc()}
    if body.date is not None:
        update["date"] = validate_meal_date(body.date)
    if body.meal_type is not None:
        update["meal_type"] = body.meal_type
    if len(update) == 1:
        raise HTTPException(400, "Nothing to update")
    res = await db.meals.update_one(
        {"id": meal_id, "user_id": user["user_id"]},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    meal = await db.meals.find_one(
        {"id": meal_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return meal


@api.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    res = await db.meals.delete_one({"id": meal_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# --- ACTIVITY ---
@api.post("/activity")
async def upsert_activity(body: ActivityIn, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    doc = {
        "user_id": user["user_id"],
        "date": body.date,
        "steps": body.steps,
        "cardio_minutes": body.cardio_minutes,
        "cardio_type": body.cardio_type,
        "updated_at": now_utc(),
    }
    await db.activity.update_one(
        {"user_id": user["user_id"], "date": body.date}, {"$set": doc}, upsert=True
    )
    return strip_id(doc)


@api.get("/activity")
async def get_activity(date: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    doc = await db.activity.find_one(
        {"user_id": user["user_id"], "date": date}, {"_id": 0}
    )
    return doc or {"date": date, "steps": 0, "cardio_minutes": 0, "cardio_type": None}


# --- WORKOUTS ---
async def ai_generate_exercise(description: str) -> Optional[Dict[str, Any]]:
    """Use Claude to generate a structured exercise from a free-text description."""
    if not anthropic_client or not description.strip():
        return None
    system = (
        "Tu es coach de musculation. À partir d'une description courte d'un exercice, retourne "
        "UNIQUEMENT un JSON :\n"
        '{"name": "Nom court en français", '
        '"category": "Pectoraux|Dos|Épaules|Bras|Jambes|Core|Cardio|Mobilité", '
        '"equipment": "Poids du corps|Haltères|Barre|Machine|Poulie|Élastique|Kettlebell|Autre", '
        '"muscles_targeted": ["muscle1", "muscle2"], '
        '"recommended_reps": "ex: 8-12", '
        '"recommended_rest_s": int }'
        "\nSi l'exercice n'a pas de sens, retourne {\"name\":\"\"}."
    )
    try:
        response = await call_claude(system, f"Description : {description.strip()[:200]}\nRetourne UNIQUEMENT le JSON.")
    except Exception:
        log.exception("Claude exercise gen failed")
        return None
    data = extract_json(response or "")
    if not data or not str(data.get("name", "")).strip():
        return None
    return {
        "id": f"ai_{new_id('ex')}",
        "name": str(data.get("name", ""))[:80],
        "category": str(data.get("category", "Mobilité"))[:30],
        "equipment": str(data.get("equipment", "Poids du corps"))[:60],
        "muscles_targeted": [str(m)[:40] for m in (data.get("muscles_targeted") or [])[:6]],
        "recommended_reps": str(data.get("recommended_reps", "10-12"))[:20],
        "recommended_rest_s": int(data.get("recommended_rest_s", 60)),
        "source": "ai",
    }


def local_exercise_from_description(description: str) -> Optional[Dict[str, Any]]:
    clean = re.sub(r"\s+", " ", (description or "").strip())
    if len(clean) < 3:
        return None
    lower = clean.lower()
    category = "Mobilité"
    equipment = "Autre"
    reps = "10-12"
    rest = 60
    if any(w in lower for w in ("pompe", "push", "développé", "pectoraux", "bench")):
        category = "Pectoraux"
    elif any(w in lower for w in ("rowing", "tirage", "traction", "dos")):
        category = "Dos"
    elif any(w in lower for w in ("squat", "presse", "fente", "jambe", "mollet")):
        category = "Jambes"
    elif any(w in lower for w in ("curl", "triceps", "biceps", "bras")):
        category = "Bras"
    elif any(w in lower for w in ("gainage", "abdo", "core")):
        category = "Core"
    if "haltère" in lower or "haltere" in lower:
        equipment = "Haltères"
    elif "barre" in lower or "bench" in lower:
        equipment = "Barre"
        rest = 90
    elif "machine" in lower or "presse" in lower:
        equipment = "Machine"
        rest = 90
    elif "poids du corps" in lower or "pompe" in lower or "traction" in lower:
        equipment = "Poids du corps"
    return {
        "id": f"local_{new_id('ex')}",
        "name": clean[:80],
        "category": category,
        "equipment": equipment,
        "muscles_targeted": [category],
        "recommended_reps": reps,
        "recommended_rest_s": rest,
        "source": "algorithm",
    }


@api.post("/exercises/ai-add")
async def add_exercise_via_ai(
    body: AiExerciseRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    if len((body.description or "").strip()) < 3:
        raise HTTPException(400, "Description trop courte")
    if ALGORITHM_ONLY_AI:
        ex = local_exercise_from_description(body.description)
    else:
        await record_ai_usage(user["user_id"], "exercise_generation")
        ex = await ai_generate_exercise(body.description)
        if not ex:
            ex = local_exercise_from_description(body.description)
    if not ex:
        raise HTTPException(422, "L'IA n'a pas pu identifier cet exercice")
    doc = {**ex, "user_id": user["user_id"], "created_at": now_utc()}
    await db.user_exercises.insert_one(doc)
    return strip_id(doc)


@api.get("/program/current")
async def program_current(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    prog = await db.programs.find_one(
        {"user_id": user["user_id"], "active": True},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not prog:
        return {"program": None}
    # current week computation based on started_at
    if prog.get("started_at"):
        try:
            started = prog["started_at"]
            if isinstance(started, str):
                started = datetime.fromisoformat(started.replace("Z", "+00:00"))
            if isinstance(started, datetime) and started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            days_in = (now_utc() - started).days if isinstance(started, datetime) else 0
            current_week = min(prog["weeks_total"], max(1, days_in // 7 + 1))
            prog["current_week"] = current_week
        except (ValueError, KeyError, TypeError):
            prog["current_week"] = prog.get("current_week", 1)
    return {"program": prog}


@api.post("/program/create")
async def program_create(
    body: ProgramCreateRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    weeks = max(4, min(int(body.weeks), 24))
    frequency = max(2, min(int(body.frequency), 7))
    defaults_by_freq = {
        2: [0, 3],
        3: [0, 2, 4],
        4: [0, 1, 3, 4],
        5: [0, 1, 2, 3, 4],
        6: [0, 1, 2, 3, 4, 5],
        7: [0, 1, 2, 3, 4, 5, 6],
    }
    requested_days = [int(d) % 7 for d in (body.training_days or []) if isinstance(d, int) or str(d).isdigit()]
    training_days = []
    for d in requested_days + defaults_by_freq.get(frequency, [0, 2, 4]):
        if d not in training_days:
            training_days.append(d)
    training_days = sorted(training_days[:frequency])
    raw_split = (body.split or "ppl").lower()
    split_aliases = {"halfbody": "upper_lower", "half_body": "upper_lower", "upperlower": "upper_lower"}
    split = split_aliases.get(raw_split, raw_split)
    if split not in ("ppl", "fullbody", "split", "upper_lower", "home"):
        split = "ppl"
    # Get goal from profile if not provided
    goal = body.goal
    if not goal:
        prof = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
        goal = (prof or {}).get("goal")
    structure = generate_program_structure(
        weeks, frequency, split,
        cycle_pattern=body.cycle_pattern,
        block_weeks=body.block_weeks,
        goal=goal,
    )
    await db.programs.update_many(
        {"user_id": user["user_id"], "active": True},
        {"$set": {"active": False, "deactivated_at": now_utc()}},
    )
    # Applying a new structure must immediately affect today's and future sessions.
    # Completed history stays intact; unfinished generated sessions are replaced.
    await db.workouts.delete_many(
        {
            "user_id": user["user_id"],
            "date": {"$gte": today_str()},
            "completed": {"$ne": True},
        }
    )
    program_id = new_id("prog")
    doc = {
        "id": program_id,
        "user_id": user["user_id"],
        "name": f"{(body.goal_label or 'Hypertrophie')} · {split.upper()} {frequency}j",
        "goal_label": body.goal_label or "Hypertrophie",
        "goal": goal,
        "weeks_total": weeks,
        "frequency": frequency,
        "training_days": training_days,
        "training_times": body.training_times if body.training_times else None,
        "split": split,
        "block_weeks": body.block_weeks or {"volume": 1, "puissance": 1, "force": 1},
        "cycle_pattern": [w["session_type"] for w in structure[:6]],
        "started_at": now_utc(),
        "active": True,
        "current_week": 1,
        "weeks": structure,
        "created_at": now_utc(),
        "is_travel": False,
    }
    await db.programs.insert_one(doc)
    return strip_id(doc)


@api.post("/program/travel-mode")
async def program_travel_mode(
    body: TravelModeRequest, authorization: Optional[str] = Header(default=None)
):
    """Pause current active program, create a temporary bodyweight program for `days`."""
    user = await get_current_user(authorization)
    days = max(3, min(int(body.days), 90))
    # Compute travel weeks (round up)
    travel_weeks = max(1, (days + 6) // 7)
    # Pause current active program (do NOT deactivate, just mark paused)
    current = await db.programs.find_one({"user_id": user["user_id"], "active": True, "is_travel": {"$ne": True}})
    paused_id = current.get("id") if current else None
    if current:
        await db.programs.update_one(
            {"id": current["id"]},
            {"$set": {"active": False, "paused_for_travel": True, "paused_at": now_utc()}},
        )
    # Also deactivate any pending travel programs
    await db.programs.update_many(
        {"user_id": user["user_id"], "active": True, "is_travel": True},
        {"$set": {"active": False, "deactivated_at": now_utc()}},
    )
    prof = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    goal = (prof or {}).get("goal")
    structure = generate_program_structure(
        travel_weeks, 3, "home",
        block_weeks={"volume": 1, "puissance": 1, "force": 1},
        goal=goal,
    )
    program_id = new_id("prog")
    doc = {
        "id": program_id,
        "user_id": user["user_id"],
        "name": f"En déplacement · {days} jours",
        "goal_label": body.goal_label or "Maintien",
        "goal": goal,
        "weeks_total": travel_weeks,
        "frequency": 3,
        "split": "home",
        "block_weeks": {"volume": 1, "puissance": 1, "force": 1},
        "cycle_pattern": [w["session_type"] for w in structure[:6]],
        "started_at": now_utc(),
        "active": True,
        "current_week": 1,
        "weeks": structure,
        "created_at": now_utc(),
        "is_travel": True,
        "travel_days": days,
        "paused_program_id": paused_id,
    }
    await db.programs.insert_one(doc)
    return strip_id(doc)


@api.post("/program/resume")
async def program_resume(authorization: Optional[str] = Header(default=None)):
    """Resume the program that was paused by travel mode."""
    user = await get_current_user(authorization)
    # Find current travel program
    travel = await db.programs.find_one({"user_id": user["user_id"], "active": True, "is_travel": True})
    if not travel:
        # Nothing to resume — just try unpausing the paused one
        paused = await db.programs.find_one({"user_id": user["user_id"], "paused_for_travel": True})
        if not paused:
            raise HTTPException(404, "Aucun programme en pause")
        await db.programs.update_one(
            {"id": paused["id"]},
            {"$set": {"active": True, "paused_for_travel": False}, "$unset": {"paused_at": ""}},
        )
        return {"ok": True, "resumed": paused["id"]}
    # Deactivate travel + reactivate paused
    await db.programs.update_one(
        {"id": travel["id"]},
        {"$set": {"active": False, "deactivated_at": now_utc()}},
    )
    paused_id = travel.get("paused_program_id")
    if paused_id:
        await db.programs.update_one(
            {"id": paused_id, "user_id": user["user_id"]},
            {"$set": {"active": True, "paused_for_travel": False}, "$unset": {"paused_at": ""}},
        )
    return {"ok": True, "resumed": paused_id, "travel_ended": travel["id"]}


# --- Challenges ---

@api.post("/challenges/start")
async def challenge_start(
    body: ChallengeStartRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    ch_type = normalize_challenge_type(body.type)
    if ch_type not in CHALLENGE_BLUEPRINTS:
        raise HTTPException(400, "Type invalide")
    # Stop any active challenge of the same type
    previous = await db.challenges.find(
        {"user_id": user["user_id"], "type": ch_type, "active": True},
        {"_id": 0, "id": 1},
    ).to_list(20)
    previous_ids = [item["id"] for item in previous if item.get("id")]
    await db.challenges.update_many(
        {"user_id": user["user_id"], "type": ch_type, "active": True},
        {"$set": {"active": False, "abandoned_at": now_utc()}},
    )
    if previous_ids:
        await db.workouts.delete_many({
            "user_id": user["user_id"],
            "challenge_id": {"$in": previous_ids},
            "source": {"$in": ["challenge", "challenge_plan"]},
            "completed": {"$ne": True},
        })
    prof = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    level = _challenge_level_from_profile(prof)
    days_plan = _build_challenge_days(ch_type, level)
    bp = CHALLENGE_BLUEPRINTS[ch_type]
    doc = {
        "id": new_id("chl"),
        "user_id": user["user_id"],
        "type": ch_type,
        "name": bp["name"],
        "icon": bp["icon"],
        "muscle": bp["muscle"],
        "exercise": bp["exercise"],
        "level": level,
        "active": True,
        "started_at": now_utc(),
        "days": days_plan,
        "streak": 0,
        "completed_count": 0,
    }
    await db.challenges.insert_one(doc)
    start_day = doc["started_at"].date()
    planned_workouts = []
    for day in days_plan:
        if day.get("is_rest"):
            continue
        day_index = int(day.get("day_index", 0))
        planned_date = (start_day + timedelta(days=day_index)).isoformat()
        planned_workouts.append({
            "id": new_id("wk"),
            "user_id": user["user_id"],
            "date": planned_date,
            "title": bp["name"],
            "focus": f"Challenge J{day_index + 1}: {day.get('label', bp['exercise'])}",
            "duration_min": 10 if ch_type != "running" else 20,
            "exercises": [{
                "name": day.get("label", bp["exercise"]),
                "sets": 1,
                "reps": str(day.get("target_reps", 0)),
                "rest_s": 60,
                "checked": True,
            }],
            "completed": False,
            "session_type": "volume",
            "created_at": doc["started_at"],
            "challenge_id": doc["id"],
            "challenge_day_index": day_index,
            "source": "challenge_plan",
        })
    if planned_workouts:
        await db.workouts.delete_many({"user_id": user["user_id"], "challenge_id": doc["id"], "source": {"$in": ["challenge", "challenge_plan"]}})
        await db.workouts.insert_many(planned_workouts)
    return strip_id(doc)


@api.get("/challenges/active")
async def challenges_active(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    cur = db.challenges.find(
        {"user_id": user["user_id"], "active": True}, {"_id": 0}
    ).sort("started_at", -1)
    items = await cur.to_list(10)
    return {"items": items}


@api.get("/challenges/blueprints")
async def challenges_blueprints(_: Optional[str] = Header(default=None, alias="authorization")):
    items = []
    for k, bp in CHALLENGE_BLUEPRINTS.items():
        items.append({"type": k, "name": bp["name"], "muscle": bp["muscle"], "icon": bp["icon"], "exercise": bp["exercise"]})
    return {"items": items}


@api.get("/challenges/{challenge_id}")
async def challenge_get(
    challenge_id: str, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    ch = await db.challenges.find_one({"id": challenge_id, "user_id": user["user_id"]}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Challenge not found")
    return ch


@api.post("/challenges/{challenge_id}/check-day")
async def challenge_check_day(
    challenge_id: str,
    body: ChallengeCheckDayRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    ch = await db.challenges.find_one({"id": challenge_id, "user_id": user["user_id"]})
    if not ch:
        raise HTTPException(404, "Challenge not found")
    days = ch.get("days", [])
    if body.day_index < 0 or body.day_index >= len(days):
        raise HTTPException(400, "Invalid day_index")
    day = days[body.day_index]
    if day.get("completed"):
        return {"ok": True, "already_done": True, "challenge": strip_id(ch)}
    day["completed"] = True
    day["completed_at"] = now_utc().isoformat()
    # Recount streak and completion
    completed_count = sum(1 for d in days if d.get("completed"))
    # streak: consecutive completed days from day 0 (excluding rest days which count as ok)
    streak = 0
    for d in days:
        if d.get("completed") or d.get("is_rest"):
            streak += 1
        else:
            break
    await db.challenges.update_one(
        {"id": challenge_id, "user_id": user["user_id"]},
        {"$set": {"days": days, "streak": streak, "completed_count": completed_count}},
    )
    # Add a workout entry to existing collection so it appears in calendar/history
    if not day.get("is_rest"):
        now = now_utc()
        wk_doc = {
            "id": new_id("wk"),
            "user_id": user["user_id"],
            "date": now.date().isoformat(),
            "title": ch["name"],
            "focus": f"Challenge J{body.day_index + 1}: {day.get('label', '')}",
            "duration_min": 10 if ch.get("type") != "running" else 20,
            "exercises": [{
                "name": day.get("label", ch["exercise"]),
                "sets": 1,
                "reps": str(day.get("target_reps", 0)),
                "rest_s": 60,
                "checked": True,
            }],
            "completed": True,
            "completed_at": now,
            "session_type": "volume",
            "created_at": now,
            "challenge_id": challenge_id,
            "challenge_day_index": body.day_index,
            "source": "challenge_plan",
        }
        existing = await db.workouts.find_one({
            "user_id": user["user_id"],
            "challenge_id": challenge_id,
            "challenge_day_index": body.day_index,
        })
        if existing:
            await db.workouts.update_one(
                {"id": existing["id"], "user_id": user["user_id"]},
                {"$set": {
                    "completed": True,
                    "completed_at": now,
                    "date": now.date().isoformat(),
                    "source": "challenge_plan",
                    "focus": wk_doc["focus"],
                    "exercises": wk_doc["exercises"],
                    "duration_min": wk_doc["duration_min"],
                }},
            )
        else:
            await db.workouts.insert_one(wk_doc)
    # ---- POINTS: challenge day ----
    if not day.get("is_rest"):
        await award_points(
            user["user_id"], "challenge_day",
            meta={"key": f"ch_{challenge_id}_{body.day_index}"}
        )
        await evaluate_daily_combos(user["user_id"])
    if completed_count >= sum(1 for d in days if not d.get("is_rest")):
        await db.challenges.update_one(
            {"id": challenge_id},
            {"$set": {"active": False, "completed_at": now_utc()}},
        )
    refreshed = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    return {"ok": True, "challenge": refreshed}


@api.post("/challenges/{challenge_id}/uncheck-day")
async def challenge_uncheck_day(
    challenge_id: str,
    body: ChallengeCheckDayRequest,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    ch = await db.challenges.find_one({"id": challenge_id, "user_id": user["user_id"]})
    if not ch:
        raise HTTPException(404, "Challenge not found")
    days = ch.get("days", [])
    if body.day_index < 0 or body.day_index >= len(days):
        raise HTTPException(400, "Invalid day_index")
    days[body.day_index]["completed"] = False
    days[body.day_index].pop("completed_at", None)
    completed_count = sum(1 for d in days if d.get("completed"))
    streak = 0
    for d in days:
        if d.get("completed") or d.get("is_rest"):
            streak += 1
        else:
            break
    await db.challenges.update_one(
        {"id": challenge_id, "user_id": user["user_id"]},
        {"$set": {"days": days, "streak": streak, "completed_count": completed_count, "active": True}, "$unset": {"completed_at": ""}},
    )
    await db.workouts.delete_many({
        "user_id": user["user_id"],
        "challenge_id": challenge_id,
        "challenge_day_index": body.day_index,
        "source": {"$in": ["challenge", "challenge_plan"]},
    })
    await db.points_events.delete_many({"user_id": user["user_id"], "meta.key": f"ch_{challenge_id}_{body.day_index}"})
    refreshed = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    return {"ok": True, "challenge": refreshed}


@api.delete("/challenges/{challenge_id}")
async def challenge_abandon(
    challenge_id: str, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    res = await db.challenges.update_one(
        {"id": challenge_id, "user_id": user["user_id"]},
        {"$set": {"active": False, "abandoned_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Challenge not found")
    return {"ok": True}


@api.put("/program/{program_id}/week/{week_index}/day/{day_index}")
async def program_update_day(
    program_id: str,
    week_index: int,
    day_index: int,
    body: ProgramDayUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    prog = await db.programs.find_one(
        {"id": program_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not prog:
        raise HTTPException(404, "Program not found")
    weeks = prog.get("weeks") or []
    target_w = next((w for w in weeks if w.get("week_index") == week_index), None)
    if not target_w:
        raise HTTPException(404, "Week not found")
    days = target_w.get("days") or []
    target_d = next((d for d in days if d.get("day_index") == day_index), None)
    if target_d is None:
        raise HTTPException(404, "Day not found")
    # Normalize new exercises
    new_exs: List[Dict[str, Any]] = []
    for e in body.exercises or []:
        new_exs.append({
            "name": str(e.get("name", "")).strip(),
            "sets": int(e.get("sets", 3)),
            "reps": str(e.get("reps", "10")),
            "rest_s": int(e.get("rest_s", 60)),
            "checked": bool(e.get("checked", True)),
            "category": str(e.get("category", "")),
        })
    target_d["exercises"] = new_exs
    if body.focus:
        target_d["focus"] = body.focus
    await db.programs.update_one(
        {"id": program_id, "user_id": user["user_id"]},
        {"$set": {"weeks": weeks}},
    )
    return target_d


@api.post("/program/{program_id}/week/{week_index}/day")
async def program_create_day(
    program_id: str,
    week_index: int,
    body: ProgramDayCreate,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    prog = await db.programs.find_one(
        {"id": program_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not prog:
        raise HTTPException(404, "Program not found")
    weeks = prog.get("weeks") or []
    target_w = next((w for w in weeks if int(w.get("week_index", -1)) == int(week_index)), None)
    if not target_w:
        raise HTTPException(404, "Week not found")
    days = target_w.get("days") or []
    next_day_index = max([int(d.get("day_index", -1)) for d in days] + [-1]) + 1
    session_type = str(body.session_type or target_w.get("session_type") or "volume").lower()
    if session_type not in SESSION_TYPES:
        session_type = "volume"
    new_exs: List[Dict[str, Any]] = []
    for e in body.exercises or []:
        name = str(e.get("name", "")).strip()
        if not name:
            continue
        new_exs.append({
            "name": name,
            "sets": int(e.get("sets", 3)),
            "reps": str(e.get("reps", "10")),
            "rest_s": int(e.get("rest_s", 60)),
            "checked": bool(e.get("checked", True)),
            "category": str(e.get("category", "")),
        })
    new_day = {
        "day_index": next_day_index,
        "focus": (body.focus or f"Séance libre {next_day_index + 1}").strip(),
        "exercises": new_exs,
    }
    days.append(new_day)
    target_w["days"] = days
    await db.programs.update_one(
        {"id": program_id, "user_id": user["user_id"]},
        {"$set": {"weeks": weeks}},
    )
    return new_day


@api.post("/program/day-workout")
async def program_day_to_workout(
    body: ProgramDayWorkoutRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    query: Dict[str, Any] = {"user_id": user["user_id"]}
    if body.program_id:
        query["id"] = body.program_id
    else:
        query["active"] = True
    prog = await db.programs.find_one(query, {"_id": 0}, sort=[("created_at", -1)])
    if not prog:
        raise HTTPException(404, "Program not found")

    target_date = body.date or today_str()
    existing = await db.workouts.find_one(
        {"user_id": user["user_id"], "date": target_date}, {"_id": 0}
    )
    if existing:
        return existing

    week_index = int(body.week_index or prog.get("current_week") or 1)
    day_index = int(body.day_index if body.day_index is not None else 0)
    weeks = prog.get("weeks") or []
    target_w = next((w for w in weeks if int(w.get("week_index", -1)) == week_index), None)
    if not target_w:
        target_w = weeks[0] if weeks else None
    if not target_w:
        raise HTTPException(404, "Program week not found")
    days = target_w.get("days") or []
    target_d = next((d for d in days if int(d.get("day_index", -1)) == day_index), None)
    if not target_d:
        target_d = days[0] if days else None
    if not target_d:
        raise HTTPException(404, "Program day not found")

    training_days = prog.get("training_days") or []
    day_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    raw_day_index = int(target_d.get("day_index", day_index))
    if raw_day_index < len(training_days):
        title_day = day_labels[int(training_days[raw_day_index]) % 7]
    else:
        title_day = f"J{raw_day_index + 1}"

    exercises: List[Dict[str, Any]] = []
    for exercise in target_d.get("exercises") or []:
        if exercise.get("checked") is False:
            continue
        exercises.append({
            "name": str(exercise.get("name", "")).strip(),
            "sets": int(exercise.get("sets", 3)),
            "reps": str(exercise.get("reps", "10-12")),
            "rest_s": int(exercise.get("rest_s", 60)),
            "checked": True,
            "is_recommended": bool(exercise.get("is_recommended", False)),
            "category": str(exercise.get("category", "")),
        })

    workout = {
        "id": new_id("wk"),
        "user_id": user["user_id"],
        "date": target_date,
        "title": f"{str(prog.get('split', 'FULLBODY')).upper()} {title_day}",
        "focus": str(target_d.get("focus") or prog.get("goal_label") or "Séance du jour"),
        "duration_min": int(target_d.get("duration_min", 45) or 45),
        "exercises": exercises,
        "completed": False,
        "session_type": str(target_w.get("session_type", "volume")),
        "program_id": prog.get("id"),
        "program_week_index": int(target_w.get("week_index", week_index)),
        "program_day_index": int(target_d.get("day_index", day_index)),
        "created_at": now_utc(),
    }
    await db.workouts.insert_one(workout)
    return strip_id(workout)


@api.delete("/program/{program_id}")
async def program_archive(
    program_id: str, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    res = await db.programs.update_one(
        {"id": program_id, "user_id": user["user_id"]},
        {"$set": {"active": False, "deactivated_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Program not found")
    return {"ok": True}


@api.get("/exercises/user-added")
async def list_user_exercises(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    cur = db.user_exercises.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50)
    items = await cur.to_list(100)
    return {"items": items}


WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]


def _program_training_days(prog: Dict[str, Any]) -> List[int]:
    custom_days = prog.get("training_days")
    if custom_days:
        return [int(x) % 7 for x in custom_days]
    frequency = int(prog.get("frequency", 3) or 3)
    if frequency >= 7:
        return list(range(7))
    if frequency >= 5:
        return [0, 1, 2, 3, 4][:frequency]
    if frequency == 4:
        return [0, 1, 3, 4]
    if frequency == 2:
        return [0, 3]
    return [0, 2, 4]


def _program_slot_for_date(prog: Dict[str, Any], target: dt_date) -> Optional[Dict[str, Any]]:
    started = prog.get("started_at")
    if isinstance(started, str):
        try:
            started = datetime.fromisoformat(started.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(started, datetime):
        return None
    started_date = started.date()
    days_since_start = (target - started_date).days
    weeks_total = int(prog.get("weeks_total", 0) or 0)
    if days_since_start < 0 or days_since_start >= weeks_total * 7:
        return None
    training_days = _program_training_days(prog)
    if target.weekday() not in training_days:
        return None
    day_index = training_days.index(target.weekday())
    week_index = days_since_start // 7 + 1
    weeks = prog.get("weeks") or []
    target_w = next((w for w in weeks if int(w.get("week_index", -1)) == week_index), None)
    if not target_w:
        return None
    target_d = next((d for d in (target_w.get("days") or []) if int(d.get("day_index", -1)) == day_index), None)
    if not target_d:
        return None
    return {"week": target_w, "day": target_d, "week_index": week_index, "day_index": day_index}


def _planned_program_workout_payload(prog: Dict[str, Any], target_date: str) -> Optional[Dict[str, Any]]:
    try:
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    slot = _program_slot_for_date(prog, target)
    if not slot:
        return None
    day = slot["day"]
    week = slot["week"]
    exercises = [e for e in (day.get("exercises") or []) if e.get("checked", True) is not False]
    weekday = target.weekday()
    training_time = (prog.get("training_times") or {}).get(str(weekday))
    return {
        "id": f"prog:{prog.get('id')}:{slot['week_index']}:{slot['day_index']}",
        "date": target_date,
        "title": f"{str(prog.get('split', 'training')).upper()} {WEEKDAY_LABELS[weekday]}",
        "focus": day.get("focus") or "Séance du jour",
        "duration_min": int(day.get("duration_min", 45) or 45),
        "exercises": exercises,
        "completed": False,
        "session_type": week.get("session_type", "volume"),
        "planned": True,
        "training_time": training_time,
    }


def _next_program_workout_payload(prog: Dict[str, Any], from_date: str, max_days: int = 28) -> Optional[Dict[str, Any]]:
    try:
        start = datetime.strptime(from_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    for offset in range(1, max_days + 1):
        d = (start + timedelta(days=offset)).isoformat()
        planned = _planned_program_workout_payload(prog, d)
        if planned:
            planned["upcoming"] = True
            return planned
    return None


def _fallback_program_workout_payload(prog: Dict[str, Any], target_date: str) -> Optional[Dict[str, Any]]:
    """Return a concrete program day for today even if today is not in training_days."""
    try:
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    weeks = prog.get("weeks") or []
    if not weeks:
        return None
    started = prog.get("started_at")
    if isinstance(started, str):
        try:
            started = datetime.fromisoformat(started.replace("Z", "+00:00"))
        except ValueError:
            started = None
    if isinstance(started, datetime):
        days_since_start = max(0, (target - started.date()).days)
        week_index = min(int(prog.get("weeks_total", len(weeks)) or len(weeks)), days_since_start // 7 + 1)
    else:
        week_index = int(prog.get("current_week", 1) or 1)
    week = next((w for w in weeks if int(w.get("week_index", -1)) == week_index), weeks[0])
    days = week.get("days") or []
    if not days:
        return None
    day = days[0]
    day_index = int(day.get("day_index", 0) or 0)
    training_days = _program_training_days(prog)
    weekday = training_days[day_index] if day_index < len(training_days) else target.weekday()
    exercises = [e for e in (day.get("exercises") or []) if e.get("checked", True) is not False]
    training_time = (prog.get("training_times") or {}).get(str(weekday))
    return {
        "id": f"prog:{prog.get('id')}:{int(week.get('week_index', week_index) or week_index)}:{day_index}",
        "date": target_date,
        "title": f"{str(prog.get('split', 'training')).upper()} {WEEKDAY_LABELS[weekday % 7]}",
        "focus": day.get("focus") or "Séance du jour",
        "duration_min": int(day.get("duration_min", 45) or 45),
        "exercises": exercises,
        "completed": False,
        "session_type": week.get("session_type", "volume"),
        "planned": True,
        "training_time": training_time,
    }


@api.post("/workouts/generate")
async def generate_workouts(
    session_type: str = "volume", authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(400, "Profile required before generating workouts")
    if session_type not in SESSION_TYPES:
        session_type = "volume"
    today = now_utc().date()
    end = today + timedelta(days=7)
    await db.workouts.delete_many(
        {
            "user_id": user["user_id"],
            "date": {"$gte": today.isoformat(), "$lt": end.isoformat()},
            "completed": {"$ne": True},
        }
    )
    plan = generate_week_plan(profile, session_type=session_type)
    if plan:
        await db.workouts.insert_many([{**w} for w in plan])
    return [strip_id(w) for w in plan]


# Default block periodization pattern for a 4-week cycle
DEFAULT_CYCLE_PATTERN: List[str] = ["volume", "volume", "force", "puissance"]


@api.post("/workouts/cycle/generate")
async def generate_cycle(
    weeks: int = 4,
    pattern: Optional[str] = None,  # e.g. "volume,volume,force,puissance"
    authorization: Optional[str] = Header(default=None),
):
    """Generate a multi-week periodization cycle starting from this week.
    Each week alternates session_type per the pattern (e.g. Volume → Volume → Force → Puissance/deload).
    """
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(400, "Profile required before generating workouts")
    weeks = max(1, min(int(weeks), 8))
    seq: List[str] = []
    if pattern:
        for p in pattern.split(","):
            p_clean = p.strip().lower()
            if p_clean in SESSION_TYPES:
                seq.append(p_clean)
    if not seq:
        seq = DEFAULT_CYCLE_PATTERN
    today = now_utc().date()
    end = today + timedelta(days=7 * weeks)
    await db.workouts.delete_many(
        {
            "user_id": user["user_id"],
            "date": {"$gte": today.isoformat(), "$lt": end.isoformat()},
            "completed": {"$ne": True},
        }
    )
    all_workouts: List[Dict[str, Any]] = []
    for w_idx in range(weeks):
        st = seq[w_idx % len(seq)]
        week_plan = generate_week_plan(profile, session_type=st)
        # Shift each workout's date by w_idx weeks
        for w in week_plan:
            d = datetime.strptime(w["date"], "%Y-%m-%d").date() + timedelta(days=7 * w_idx)
            w["date"] = d.isoformat()
            w["cycle_week_index"] = w_idx
            w["cycle_session_type"] = st
        all_workouts.extend(week_plan)
    if all_workouts:
        await db.workouts.insert_many(all_workouts)
    return {
        "weeks": weeks,
        "pattern": seq,
        "total_workouts": len(all_workouts),
    }


@api.get("/workouts/calendar")
async def workouts_calendar(
    month: Optional[str] = None,  # YYYY-MM
    authorization: Optional[str] = Header(default=None),
):
    """Return all workouts of a given month (planned + completed) as a dict keyed by date."""
    user = await get_current_user(authorization)
    if month:
        try:
            datetime.strptime(month, "%Y-%m")
            year_s, month_s = month.split("-")
            year_i, month_i = int(year_s), int(month_s)
        except (ValueError, IndexError):
            raise HTTPException(400, "Invalid month format (expected YYYY-MM)")
    else:
        today = now_utc().date()
        year_i, month_i = today.year, today.month
    start = dt_date(year_i, month_i, 1)
    if month_i == 12:
        end = dt_date(year_i + 1, 1, 1)
    else:
        end = dt_date(year_i, month_i + 1, 1)
    cur = db.workouts.find({
        "user_id": user["user_id"],
        "date": {"$gte": start.isoformat(), "$lt": end.isoformat()},
    })
    items = await cur.to_list(200)
    out: Dict[str, Dict[str, Any]] = {}
    for w in items:
        d = w.get("date")
        if not d:
            continue
        out[d] = {
            "id": w.get("id"),
            "session_type": w.get("session_type", "volume"),
            "completed": bool(w.get("completed", False)),
            "focus": w.get("focus", ""),
            "exercises_count": len(w.get("exercises") or []),
        }
    # Fill remaining days of the month with the active program's plan
    # (so the calendar reflects the whole program). Pauses are handled
    # naturally: a paused program's started_at predates the pause, so its
    # future days fall outside [started_at, started_at + weeks_total*7)
    # once a new (travel/resumed) program takes over with its own started_at.
    prog = await db.programs.find_one(
        {"user_id": user["user_id"], "active": True}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if prog and prog.get("started_at"):
        d = start
        while d < end:
            d_iso = d.isoformat()
            if d_iso not in out:
                planned = _planned_program_workout_payload(prog, d_iso)
                if planned:
                    out[d_iso] = {
                        "id": planned.get("id"),
                        "session_type": planned.get("session_type", "volume"),
                        "completed": False,
                        "focus": planned.get("focus", ""),
                        "exercises_count": len(planned.get("exercises") or []),
                        "planned": True,
                        "training_time": planned.get("training_time"),
                    }
            d += timedelta(days=1)
    return {
        "month": f"{year_i:04d}-{month_i:02d}",
        "days": out,
    }


@api.get("/workouts/history")
async def workouts_history(
    limit: int = 30, authorization: Optional[str] = Header(default=None)
):
    """Return user's completed workout history (most recent first), grouped by date."""
    user = await get_current_user(authorization)
    cur = (
        db.workouts.find({
            "user_id": user["user_id"],
            "completed": True,
        }, {"_id": 0})
        .sort("date", -1)
        .limit(max(1, min(int(limit), 100)))
    )
    items = await cur.to_list(200)
    history: List[Dict[str, Any]] = []
    for w in items:
        # Attach perf records logged for this workout
        perfs = await db.exercise_perf.find(
            {"user_id": user["user_id"], "workout_id": w.get("id")}, {"_id": 0}
        ).sort("created_at", 1).to_list(50)
        point_rows = await db.points_events.find(
            {
                "user_id": user["user_id"],
                "$or": [
                    {"meta.key": f"wk_{w.get('id')}"},
                    {"meta.key": {"$regex": f"^pr_{re.escape(str(w.get('id')))}_"}},
                ],
            },
            {"_id": 0, "amount": 1},
        ).to_list(50)
        points_earned = int(sum(max(0, int(p.get("amount", 0) or 0)) for p in point_rows))
        history.append({
            "id": w.get("id"),
            "date": w.get("date"),
            "title": w.get("title", ""),
            "focus": w.get("focus", ""),
            "source": w.get("source", ""),
            "challenge_id": w.get("challenge_id"),
            "challenge_day_index": w.get("challenge_day_index"),
            "session_type": w.get("session_type", "volume"),
            "duration_min": w.get("duration_min", 45),
            "completed": True,
            "points_earned": points_earned,
            "exercises": [e for e in (w.get("exercises") or []) if e.get("checked", True) is not False],
            "performances": perfs,
        })
    return history


@api.post("/workouts/manual")
async def create_manual_workout(
    body: WorkoutCreateManual, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    try:
        dt_date.fromisoformat(body.date)
    except Exception:
        raise HTTPException(400, "Date invalide")
    session_type = body.session_type if body.session_type in SESSION_TYPES else "volume"
    exercises = []
    for e in body.exercises or []:
        name = str(e.get("name", "")).strip()
        if not name:
            continue
        exercises.append({
            "name": name,
            "sets": int(e.get("sets", 3)),
            "reps": str(e.get("reps", "10")),
            "rest_s": int(e.get("rest_s", 60)),
            "checked": bool(e.get("checked", True)),
        })
    now = now_utc()
    doc = {
        "id": new_id("wk"),
        "user_id": user["user_id"],
        "date": body.date,
        "title": body.title or "Séance ajoutée",
        "focus": body.focus or "Séance ajoutée",
        "duration_min": max(1, int(body.duration_min or 45)),
        "exercises": exercises,
        "completed": bool(body.completed),
        "completed_at": now if body.completed else None,
        "session_type": session_type,
        "source": "manual_history",
        "created_at": now,
    }
    await db.workouts.insert_one(doc)
    if doc["completed"]:
        try:
            await award_points(user["user_id"], "workout_completed", meta={"key": f"wk_{doc['id']}"})
            await evaluate_daily_combos(user["user_id"])
        except Exception as e:
            log.warning(f"manual workout points: {e}")
    return strip_id(doc)


@api.delete("/workouts/all")
async def delete_all_workouts(authorization: Optional[str] = Header(default=None)):
    """Delete all workouts for the current user (calendar clear)."""
    user = await get_current_user(authorization)
    result = await db.workouts.delete_many({"user_id": user["user_id"]})
    return {"deleted": result.deleted_count}


async def cleanup_workout_points(user_id: str, workout_id: str) -> int:
    result = await db.points_events.delete_many(
        {
            "user_id": user_id,
            "$or": [
                {"meta.key": f"wk_{workout_id}"},
                {"meta.key": {"$regex": f"^pr_{re.escape(workout_id)}_"}},
            ],
        }
    )
    return int(result.deleted_count)


@api.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, authorization: Optional[str] = Header(default=None)):
    """Delete one workout from history/calendar and remove its direct points/performance records."""
    user = await get_current_user(authorization)
    workout = await db.workouts.find_one({"id": workout_id, "user_id": user["user_id"]}, {"_id": 0})
    deleted_workouts = 0
    if workout:
        challenge_id = workout.get("challenge_id")
        challenge_day_index = workout.get("challenge_day_index")
        res = await db.workouts.delete_one({"id": workout_id, "user_id": user["user_id"]})
        deleted_workouts = int(res.deleted_count)
        if challenge_id is not None and challenge_day_index is not None:
            ch = await db.challenges.find_one({"id": challenge_id, "user_id": user["user_id"]})
            if ch:
                days = ch.get("days", [])
                idx = int(challenge_day_index)
                if 0 <= idx < len(days):
                    days[idx]["completed"] = False
                    days[idx].pop("completed_at", None)
                    completed_count = sum(1 for d in days if d.get("completed"))
                    await db.challenges.update_one(
                        {"id": challenge_id, "user_id": user["user_id"]},
                        {"$set": {"days": days, "completed_count": completed_count, "active": True}, "$unset": {"completed_at": ""}},
                    )
                    await db.points_events.delete_many({"user_id": user["user_id"], "meta.key": f"ch_{challenge_id}_{idx}"})
    await db.exercise_perf.delete_many({"user_id": user["user_id"], "workout_id": workout_id})
    try:
        deleted_points = await cleanup_workout_points(user["user_id"], workout_id)
    except Exception as e:
        log.warning(f"delete_workout points cleanup: {e}")
        deleted_points = 0
    return {"ok": True, "deleted_workouts": deleted_workouts, "deleted_points": deleted_points}


@api.put("/workouts/{workout_id}")
async def update_workout(
    workout_id: str, body: WorkoutUpdate, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    update_doc: Dict[str, Any] = {}
    if body.session_type is not None and body.session_type in SESSION_TYPES:
        update_doc["session_type"] = body.session_type
    if body.focus is not None:
        update_doc["focus"] = body.focus
    if body.duration_min is not None:
        update_doc["duration_min"] = body.duration_min
    if body.exercises is not None:
        # Normalize each exercise
        new_ex = []
        for e in body.exercises:
            new_ex.append(
                {
                    "name": str(e.get("name", "")).strip(),
                    "sets": int(e.get("sets", 3)),
                    "reps": str(e.get("reps", "10")),
                    "rest_s": int(e.get("rest_s", 60)),
                    "checked": bool(e.get("checked", True)),
                }
            )
        update_doc["exercises"] = new_ex
    if not update_doc:
        raise HTTPException(400, "Nothing to update")
    res = await db.workouts.update_one(
        {"id": workout_id, "user_id": user["user_id"]}, {"$set": update_doc}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Workout not found")
    w = await db.workouts.find_one(
        {"id": workout_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    return strip_id(w)


@api.post("/workouts/{workout_id}/perf")
async def log_performance(
    workout_id: str, body: ExercisePerf, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    w = await db.workouts.find_one(
        {"id": workout_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not w:
        raise HTTPException(404, "Workout not found")
    est = estimate_1rm(body.weight_kg, body.reps)
    doc = {
        "id": new_id("perf"),
        "user_id": user["user_id"],
        "workout_id": workout_id,
        "date": w.get("date", today_str()),
        "exercise_name": body.exercise_name,
        "weight_kg": body.weight_kg,
        "reps": body.reps,
        "sets": body.sets,
        "est_1rm": est,
        "notes": body.notes,
        "created_at": now_utc(),
    }
    await db.exercise_perf.insert_one(doc)
    return strip_id(doc)


@api.get("/workouts/{workout_id}/perf")
async def list_workout_perf(
    workout_id: str, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    items = await db.exercise_perf.find(
        {"user_id": user["user_id"], "workout_id": workout_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items


@api.get("/perf/recent")
async def perf_recent(
    exercise: Optional[str] = None,
    limit: int = 30,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    q: Dict[str, Any] = {"user_id": user["user_id"]}
    if exercise:
        q["exercise_name"] = exercise
    items = await db.exercise_perf.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(200, max(1, limit)))
    # Best lifts per exercise (max est_1rm)
    bests: Dict[str, Dict[str, Any]] = {}
    for p in items:
        ex = p["exercise_name"]
        if ex not in bests or p.get("est_1rm", 0) > bests[ex].get("est_1rm", 0):
            bests[ex] = p
    return {"items": items, "personal_bests": list(bests.values())}


EXERCISE_CATEGORY_BY_NAME = {str(item.get("name")): str(item.get("category", "Autre")) for item in EXERCISE_LIBRARY}


def exercise_muscle_group(exercise_name: str) -> str:
    if exercise_name in EXERCISE_CATEGORY_BY_NAME:
        return EXERCISE_CATEGORY_BY_NAME[exercise_name]
    lower = unicodedata.normalize("NFKD", exercise_name or "").encode("ascii", "ignore").decode("ascii").lower()
    if any(k in lower for k in ("developpe militaire", "elevation", "oiseau", "face pull", "epaule", "shoulder")):
        return "Épaules"
    if any(k in lower for k in ("curl", "triceps", "biceps", "kick-back", "skull")):
        return "Bras"
    if any(k in lower for k in ("developpe", "bench", "pompe", "pec", "ecarte", "dips")):
        return "Pectoraux"
    if any(k in lower for k in ("rowing", "tirage", "traction", "souleve", "deadlift", "superman", "shrug")):
        return "Dos"
    if any(k in lower for k in ("squat", "presse", "fente", "leg ", "mollet", "hip thrust", "ischio")):
        return "Jambes"
    if any(k in lower for k in ("planche", "crunch", "russian", "gainage", "abdo", "core", "leg raise")):
        return "Core"
    if any(k in lower for k in ("course", "cardio", "burpee", "mountain", "jumping", "rameur", "velo")):
        return "Cardio"
    return "Autre"


@api.get("/perf/muscle-volume")
async def perf_muscle_volume(
    weeks: int = 8, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    weeks = max(2, min(int(weeks), 24))
    today = now_utc().date()
    current_week_start = today - timedelta(days=today.weekday())
    start = current_week_start - timedelta(days=7 * (weeks - 1))
    perfs = await db.exercise_perf.find(
        {"user_id": user["user_id"], "date": {"$gte": start.isoformat()}}, {"_id": 0}
    ).sort("date", 1).to_list(2000)

    groups: Dict[str, Dict[str, Any]] = {}
    week_labels = []
    for offset in range(weeks):
        monday = start + timedelta(days=7 * offset)
        key = monday.isoformat()
        week_labels.append(key)

    for p in perfs:
        try:
            d = datetime.strptime(str(p.get("date")), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        monday = d - timedelta(days=d.weekday())
        week_key = monday.isoformat()
        muscle = exercise_muscle_group(str(p.get("exercise_name", "")))
        weight = float(p.get("weight_kg", 0) or 0)
        reps = int(p.get("reps", 0) or 0)
        sets = int(p.get("sets", 0) or 0)
        volume = max(0.0, weight * reps * sets)
        group = groups.setdefault(
            muscle,
            {
                "muscle": muscle,
                "week_total": 0,
                "total": 0,
                "series": {key: 0 for key in week_labels},
                "top_exercises": {},
            },
        )
        group["total"] += volume
        group["series"][week_key] = group["series"].get(week_key, 0) + volume
        if week_key == current_week_start.isoformat():
            group["week_total"] += volume
        ex = str(p.get("exercise_name", ""))
        group["top_exercises"][ex] = group["top_exercises"].get(ex, 0) + volume

    items = []
    for group in groups.values():
        series = [{"week": key, "volume": int(round(group["series"].get(key, 0)))} for key in week_labels]
        top = sorted(group["top_exercises"].items(), key=lambda item: item[1], reverse=True)[:3]
        items.append({
            "muscle": group["muscle"],
            "week_total": int(round(group["week_total"])),
            "total": int(round(group["total"])),
            "series": series,
            "top_exercises": [{"name": name, "volume": int(round(volume))} for name, volume in top],
        })
    items.sort(key=lambda item: item["week_total"], reverse=True)
    return {"weeks": week_labels, "items": items}


@api.get("/exercises/library")
async def exercises_library(authorization: Optional[str] = Header(default=None)):
    _ = await get_current_user(authorization)
    return {"exercises": EXERCISE_LIBRARY, "session_types": SESSION_TYPES}


@api.put("/auth/me")
async def update_me(body: UserUpdate, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    update: Dict[str, Any] = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        update["name"] = name[:80]
    if not update:
        raise HTTPException(400, "Nothing to update")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u["name"],
        "picture": u.get("picture"),
        "onboarded": bool(u.get("onboarded", False)),
    }


# --- FAVORITES ---
@api.get("/favorites")
async def list_favorites(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.favorites.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    # Enrich with current food data
    out = []
    for f in items:
        food = next((x for x in FOOD_LIBRARY if x["id"] == f["food_id"]), None)
        if not food:
            continue
        macros = compute_food_macros(food, float(f["quantity"]))
        out.append({**f, "food": food, "macros_preview": macros})
    return out


@api.post("/favorites")
async def add_favorite(body: FavoriteIn, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    food = next((f for f in FOOD_LIBRARY if f["id"] == body.food_id), None)
    if not food:
        raise HTTPException(404, "Food not found")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")
    doc = {
        "id": new_id("fav"),
        "user_id": user["user_id"],
        "food_id": body.food_id,
        "quantity": float(body.quantity),
        "label": body.label,
        "created_at": now_utc(),
    }
    await db.favorites.insert_one(doc)
    return strip_id(doc)


@api.delete("/favorites/{fav_id}")
async def delete_favorite(fav_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    res = await db.favorites.delete_one({"id": fav_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# --- BODY COMPOSITION ---
def navy_body_fat(gender: str, height_cm: float, waist_cm: float,
                  neck_cm: float, hips_cm: Optional[float] = None) -> Optional[float]:
    """US Navy body-fat formula. Returns % or None if inputs missing/invalid."""
    import math
    try:
        if not all([height_cm, waist_cm, neck_cm]):
            return None
        if gender.lower().startswith("m"):
            v = 86.010 * math.log10(waist_cm - neck_cm) - 70.041 * math.log10(height_cm) + 36.76
        else:
            if not hips_cm:
                return None
            v = 163.205 * math.log10(waist_cm + hips_cm - neck_cm) - 97.684 * math.log10(height_cm) - 78.387
        return max(2.0, min(60.0, round(v, 1)))
    except (ValueError, ZeroDivisionError):
        return None


def deurenberg_body_fat(gender: str, age: int, weight_kg: float, height_cm: float) -> float:
    """Fallback: Deurenberg formula from BMI. Less precise."""
    bmi = weight_kg / ((height_cm / 100) ** 2)
    sex = 1 if gender.lower().startswith("m") else 0
    bf = 1.20 * bmi + 0.23 * age - 10.8 * sex - 5.4
    return max(2.0, min(60.0, round(bf, 1)))


def strength_tier(ratio: float) -> str:
    """1RM / body-weight ratio → strength tier."""
    if ratio >= 2.5:
        return "Élite"
    if ratio >= 1.75:
        return "Avancé"
    if ratio >= 1.25:
        return "Intermédiaire"
    if ratio >= 0.75:
        return "Novice"
    return "Débutant"


# benchmarks for males (×bodyweight) — squat/bench/deadlift/ohp
STRENGTH_BENCHMARKS = {
    "Squat barre (back squat)": 1.5,
    "Développé couché barre": 1.0,
    "Soulevé de terre barre": 2.0,
    "Développé militaire barre": 0.65,
    "Tractions pronation": 0.5,  # extra weight ratio
}


@api.get("/body/composition")
async def body_composition(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    if not profile:
        return {"available": False, "reason": "Profil incomplet"}

    weight = float(profile.get("weight_kg", 0))
    height = float(profile.get("height_cm", 0))
    age = int(profile.get("age", 0))
    gender = profile.get("gender", "male")
    waist = profile.get("waist_cm")
    neck = profile.get("neck_cm")
    hips = profile.get("hips_cm")

    # Body fat
    bf_navy = navy_body_fat(gender, height, waist or 0, neck or 0, hips) if waist and neck else None
    bf_method = "US Navy" if bf_navy is not None else "Deurenberg (estimation)"
    bf_pct = bf_navy if bf_navy is not None else deurenberg_body_fat(gender, age, weight, height)

    fat_kg = round(weight * bf_pct / 100, 1)
    lean_kg = round(weight - fat_kg, 1)
    # Janssen-ish skeletal muscle mass estimate (~ 47% of lean mass typically)
    muscle_kg = round(lean_kg * 0.47, 1)

    # Strength scoring per benchmark
    perf_cursor = db.exercise_perf.find({"user_id": user["user_id"]}, {"_id": 0})
    perfs = await perf_cursor.to_list(500)
    bests: Dict[str, float] = {}
    for p in perfs:
        ex = p["exercise_name"]
        bests[ex] = max(bests.get(ex, 0), float(p.get("est_1rm", 0)))

    strength_scores = []
    overall_total = 0.0
    overall_count = 0
    for ex_name, target in STRENGTH_BENCHMARKS.items():
        best = bests.get(ex_name, 0)
        ratio = best / weight if weight > 0 else 0
        target_kg = round(target * weight, 1)
        score_pct = round((ratio / target) * 100, 0) if target > 0 else 0
        strength_scores.append({
            "exercise": ex_name,
            "best_1rm": best,
            "target_for_intermediate": target_kg,
            "ratio_bw": round(ratio, 2),
            "score_pct": score_pct,
            "tier": strength_tier(ratio),
        })
        if best > 0:
            overall_total += ratio / target
            overall_count += 1
    overall_score = round((overall_total / overall_count) * 100, 0) if overall_count > 0 else 0

    # Muscle group "level" heatmap from recorded exercises
    group_map = {
        "Pectoraux": ["Développé couché barre", "Développé couché haltères", "Pompes"],
        "Dos": ["Soulevé de terre barre", "Tractions pronation", "Rowing barre (Yates / Pendlay)"],
        "Jambes": ["Squat barre (back squat)", "Leg press", "Hip thrust barre"],
        "Épaules": ["Développé militaire barre", "Développé militaire haltères"],
        "Bras": ["Curl barre droite", "Skull crushers (extension barre EZ)"],
        "Core": ["Planche", "Ab wheel (roue abdominale)"],
    }
    group_levels = []
    for group, exs in group_map.items():
        max_score = 0
        for e in exs:
            if e in bests and bests[e] > 0 and e in STRENGTH_BENCHMARKS:
                ratio = bests[e] / weight
                pct = (ratio / STRENGTH_BENCHMARKS[e]) * 100
                max_score = max(max_score, pct)
        group_levels.append({
            "group": group,
            "score_pct": round(max_score, 0),
            "status": "fort" if max_score >= 100 else "à développer" if max_score < 50 else "moyen",
        })

    return {
        "available": True,
        "body_fat": {
            "percent": bf_pct,
            "method": bf_method,
            "fat_kg": fat_kg,
            "lean_kg": lean_kg,
            "muscle_kg_est": muscle_kg,
            "has_measurements": bool(waist and neck),
        },
        "strength": {
            "overall_score_pct": overall_score,
            "overall_tier": strength_tier((overall_total / overall_count) if overall_count > 0 else 0),
            "scores": strength_scores,
        },
        "muscle_groups": group_levels,
    }


@api.get("/dashboard/week-macros")
async def week_macros(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    today = now_utc().date()
    days = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        meals = await db.meals.find(
            {"user_id": user["user_id"], "date": d}, {"_id": 0, "image_base64": 0}
        ).to_list(500)
        days.append({
            "date": d,
            "calories": sum(m.get("calories", 0) for m in meals),
            "protein_g": sum(m.get("protein_g", 0) for m in meals),
            "carbs_g": sum(m.get("carbs_g", 0) for m in meals),
            "fat_g": sum(m.get("fat_g", 0) for m in meals),
        })
    nonzero = [d for d in days if d["calories"] > 0]
    n = len(nonzero) or 1
    avg = {
        "calories": int(sum(d["calories"] for d in nonzero) / n),
        "protein_g": int(sum(d["protein_g"] for d in nonzero) / n),
        "carbs_g": int(sum(d["carbs_g"] for d in nonzero) / n),
        "fat_g": int(sum(d["fat_g"] for d in nonzero) / n),
    } if nonzero else {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
    targets = {
        "calories": int(profile.get("daily_calories", 0)),
        "protein_g": int(profile.get("protein_g", 0)),
        "carbs_g": int(profile.get("carbs_g", 0)),
        "fat_g": int(profile.get("fat_g", 0)),
    }
    return {"days": days, "avg": avg, "targets": targets, "tracked_days": len(nonzero)}


@api.get("/foods/library")
async def foods_library(authorization: Optional[str] = Header(default=None)):
    _ = await get_current_user(authorization)
    return {"foods": FOOD_LIBRARY}


@api.post("/meals/manual")
async def add_manual_meal(
    body: ManualMealRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    food = next((f for f in FOOD_LIBRARY if f["id"] == body.food_id), None)
    if not food:
        raise HTTPException(404, "Food not found")
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")
    target_date = validate_meal_date(body.date)
    macros = compute_food_macros(food, float(body.quantity))
    created = now_utc()
    meal = {
        "id": new_id("meal"),
        "user_id": user["user_id"],
        "date": target_date,
        "created_at": created,
        "meal_type": body.meal_type or auto_meal_type(created),
        "source": "manual",
        "food_id": body.food_id,
        "quantity": body.quantity,
        "unit": food.get("unit"),
        "name": body.name_override or macros["name"],
        "calories": macros["calories"],
        "protein_g": macros["protein_g"],
        "carbs_g": macros["carbs_g"],
        "fat_g": macros["fat_g"],
        "notes": f"Saisie manuelle · {body.quantity} {food.get('unit', '')}",
    }
    await db.meals.insert_one(meal)
    return strip_id(meal)


@api.post("/foods/ai-search")
async def foods_ai_search(
    body: AiFoodSearchRequest, authorization: Optional[str] = Header(default=None)
):
    """Suggest nutritional values: local database first, Claude only when needed."""
    user = await get_current_user(authorization)
    q = body.query.strip()
    if len(q) < 2:
        return {"suggestions": []}
    local = local_food_search(q)
    if local:
        return {"suggestions": local}
    if ALGORITHM_ONLY_AI:
        return {"suggestions": []}
    await record_ai_usage(user["user_id"], "food_text_search")
    suggestions = await ai_food_search(q)
    return {"suggestions": suggestions}


@api.post("/meals/manual_ai")
async def add_manual_ai_meal(
    body: ManualAiMealRequest, authorization: Optional[str] = Header(default=None)
):
    """Save a meal from an AI-suggested food (no FOOD_LIBRARY id)."""
    user = await get_current_user(authorization)
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")
    target_date = validate_meal_date(body.date)
    unit = (body.unit or "g").lower()
    if unit not in ("g", "ml", "unit"):
        unit = "g"
    ratio = body.quantity / 100.0 if unit in ("g", "ml") else body.quantity
    calories = round(body.kcal_per_unit * ratio)
    protein_g = round(body.protein_g_per_unit * ratio, 1)
    carbs_g = round(body.carbs_g_per_unit * ratio, 1)
    fat_g = round(body.fat_g_per_unit * ratio, 1)
    created = now_utc()
    meal = {
        "id": new_id("meal"),
        "user_id": user["user_id"],
        "date": target_date,
        "created_at": created,
        "meal_type": body.meal_type or auto_meal_type(created),
        "source": "ai",
        "ai_food_snapshot": {
            "name": body.name,
            "category": body.category,
            "unit": unit,
            "kcal_per_unit": body.kcal_per_unit,
            "protein_g_per_unit": body.protein_g_per_unit,
            "carbs_g_per_unit": body.carbs_g_per_unit,
            "fat_g_per_unit": body.fat_g_per_unit,
        },
        "quantity": body.quantity,
        "unit": unit,
        "name": body.name,
        "calories": calories,
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "notes": f"Suggestion IA · {body.quantity} {unit}",
    }
    await db.meals.insert_one(meal)
    return strip_id(meal)


@api.get("/foods/recent")
async def foods_recent(authorization: Optional[str] = Header(default=None)):
    """Return user's most recently used foods (last 30 days, distinct by name)."""
    user = await get_current_user(authorization)
    pipeline = [
        {"$match": {
            "user_id": user["user_id"],
            "source": {"$in": ["manual", "ai"]},
        }},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$name",
            "last_used": {"$first": "$created_at"},
            "count": {"$sum": 1},
            "source": {"$first": "$source"},
            "food_id": {"$first": "$food_id"},
            "quantity": {"$first": "$quantity"},
            "unit": {"$first": "$unit"},
            "calories": {"$first": "$calories"},
            "protein_g": {"$first": "$protein_g"},
            "carbs_g": {"$first": "$carbs_g"},
            "fat_g": {"$first": "$fat_g"},
            "ai_snapshot": {"$first": "$ai_food_snapshot"},
        }},
        {"$sort": {"last_used": -1}},
        {"$limit": 12},
    ]
    items = await db.meals.aggregate(pipeline).to_list(20)
    out: List[Dict[str, Any]] = []
    for it in items:
        out.append({
            "name": it["_id"],
            "count": it.get("count", 1),
            "source": it.get("source"),
            "food_id": it.get("food_id"),
            "quantity": it.get("quantity"),
            "unit": it.get("unit"),
            "calories": it.get("calories"),
            "protein_g": it.get("protein_g"),
            "carbs_g": it.get("carbs_g"),
            "fat_g": it.get("fat_g"),
            "ai_snapshot": it.get("ai_snapshot"),
        })
    return {"items": out}


@api.post("/meals/{meal_id}/duplicate")
async def duplicate_meal(
    meal_id: str, body: DuplicateMealRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    original = await db.meals.find_one({"id": meal_id, "user_id": user["user_id"]})
    if not original:
        raise HTTPException(404, "Meal not found")
    target_date = validate_meal_date(body.target_date)
    new_meal = {k: v for k, v in original.items() if k not in ("_id", "id", "created_at", "date", "archived")}
    new_meal["id"] = new_id("meal")
    new_meal["user_id"] = user["user_id"]
    new_meal["date"] = target_date
    new_meal["created_at"] = now_utc()
    new_meal["notes"] = (new_meal.get("notes") or "") + " · dupliqué"
    await db.meals.insert_one(new_meal)
    return strip_id(new_meal)


@api.post("/meals/duplicate-day")
async def duplicate_day(
    body: DuplicateDayRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    # Validate both source and target are within window (source can be older if archived, but typically <=14d)
    target_date = validate_meal_date(body.target_date)
    # Source date: must exist; no 14-day restriction on source (allows from older archived if available)
    try:
        datetime.strptime(body.source_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Invalid source_date")
    cur = db.meals.find({"user_id": user["user_id"], "date": body.source_date})
    src_meals = await cur.to_list(200)
    if not src_meals:
        raise HTTPException(404, "Aucun repas trouvé pour cette date source")
    inserted: List[Dict[str, Any]] = []
    now = now_utc()
    for original in src_meals:
        new_meal = {k: v for k, v in original.items() if k not in ("_id", "id", "created_at", "date", "archived")}
        new_meal["id"] = new_id("meal")
        new_meal["user_id"] = user["user_id"]
        new_meal["date"] = target_date
        new_meal["created_at"] = now
        new_meal["notes"] = (new_meal.get("notes") or "") + " · dupliqué"
        inserted.append(new_meal)
    if inserted:
        await db.meals.insert_many(inserted)
    return {"copied": len(inserted), "target_date": target_date, "source_date": body.source_date}


@api.post("/recipes/from-ingredients")
async def recipes_from_ingredients(
    body: RecipeFromIngredientsRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    cleaned = [str(x).strip() for x in (body.ingredients or []) if str(x).strip()]
    if not cleaned:
        return {"recipes": []}
    if ALGORITHM_ONLY_AI:
        recipes = local_recipe_suggestions(cleaned[:25], body.goal)
    else:
        await record_ai_usage(user["user_id"], "recipe_generation")
        recipes = await generate_recipes_with_claude(cleaned[:25], body.goal)
        if not recipes:
            recipes = local_recipe_suggestions(cleaned[:25], body.goal)
    return {"recipes": recipes}


@api.post("/activity/steps")
async def quick_add_steps(
    body: StepsIn, authorization: Optional[str] = Header(default=None)
):
    """Increment today's step count (or replace if date provided)."""
    user = await get_current_user(authorization)
    d = body.date or today_str()
    existing = await db.activity.find_one(
        {"user_id": user["user_id"], "date": d}, {"_id": 0}
    ) or {"steps": 0, "cardio_minutes": 0, "cardio_type": None}
    new_steps = int(existing.get("steps", 0)) + max(0, int(body.steps))
    doc = {
        "user_id": user["user_id"],
        "date": d,
        "steps": new_steps,
        "cardio_minutes": int(existing.get("cardio_minutes", 0)),
        "cardio_type": existing.get("cardio_type"),
        "updated_at": now_utc(),
    }
    await db.activity.update_one(
        {"user_id": user["user_id"], "date": d}, {"$set": doc}, upsert=True
    )
    return strip_id(doc)


@api.get("/workouts/week")
async def get_week_workouts(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", 1).to_list(50)
    return items


@api.get("/workouts/today")
async def workout_today(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    w = await db.workouts.find_one(
        {
            "user_id": user["user_id"],
            "date": today_str(),
            "$or": [{"challenge_id": {"$exists": False}}, {"challenge_id": None}],
        },
        {"_id": 0},
    )
    if not w:
        prog = await db.programs.find_one(
            {"user_id": user["user_id"], "active": True}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if prog:
            w = _planned_program_workout_payload(prog, today_str())
    return w or {}


@api.post("/workouts/{workout_id}/complete")
async def complete_workout(workout_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    res = await db.workouts.update_one(
        {"id": workout_id, "user_id": user["user_id"]},
        {"$set": {"completed": True, "completed_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Workout not found")
    # ---- POINTS: best-effort, never break complete_workout ----
    try:
        await award_points(user["user_id"], "workout_completed", meta={"key": f"wk_{workout_id}"})
        # Detect PRs from exercise_perf created for this workout
        perfs = await db.exercise_perf.find(
            {"user_id": user["user_id"], "workout_id": workout_id}, {"_id": 0}
        ).to_list(50)
        for p in perfs:
            ex = p.get("exercise_name")
            cur = float(p.get("est_1rm", 0))
            if not ex or cur <= 0:
                continue
            prev = await db.exercise_perf.find(
                {"user_id": user["user_id"], "exercise_name": ex, "id": {"$ne": p.get("id")}}, {"_id": 0, "est_1rm": 1}
            ).sort("created_at", -1).to_list(50)
            prev_max = max((float(x.get("est_1rm", 0)) for x in prev), default=0)
            if cur > prev_max + 0.5:
                await award_points(user["user_id"], "pr_beaten", meta={"key": f"pr_{workout_id}_{ex}"})
        # Streak bonus
        yest = (datetime.strptime(today_str(), "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
        streaked = await db.points_events.find_one({"user_id": user["user_id"], "date": yest, "reason": "workout_completed"})
        if streaked:
            await award_points(user["user_id"], "streak_bonus", meta={"key": f"streak_{today_str()}"})
        await evaluate_daily_combos(user["user_id"])
    except Exception as e:
        log.warning(f"complete_workout award: {e}")
    return {"ok": True}


@api.post("/workouts/{workout_id}/uncomplete")
async def uncomplete_workout(workout_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    res = await db.workouts.update_one(
        {"id": workout_id, "user_id": user["user_id"]},
        {"$set": {"completed": False}, "$unset": {"completed_at": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Workout not found")
    try:
        await cleanup_workout_points(user["user_id"], workout_id)
    except Exception as e:
        log.warning(f"uncomplete_workout points cleanup: {e}")
    return {"ok": True}


# --- TRANSFORMATIONS ---
@api.post("/transformations")
async def add_transformation(authorization: Optional[str] = Header(default=None)):
    await get_current_user(authorization)
    raise HTTPException(
        status_code=410,
        detail="La galerie de photos corporelles n'est plus proposée. Utilise le suivi du poids.",
    )


@api.get("/transformations")
async def list_transformations(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.transformations.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items


@api.post("/weight-logs")
async def add_weight_log(body: WeightLogRequest, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    d = validate_log_date(body.date)
    weight = round(max(20.0, min(400.0, float(body.weight_kg))), 1)
    doc = {
        "id": new_id("weight"),
        "user_id": user["user_id"],
        "date": d,
        "weight_kg": weight,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    existing = await db.weight_logs.find_one({"user_id": user["user_id"], "date": d}, {"_id": 0})
    if existing:
        doc["id"] = existing.get("id", doc["id"])
        doc["created_at"] = existing.get("created_at", doc["created_at"])
    await db.weight_logs.update_one(
        {"user_id": user["user_id"], "date": d},
        {"$set": doc},
        upsert=True,
    )
    await db.profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"weight_kg": weight, "updated_at": now_utc()}},
    )
    return strip_id(doc)


@api.get("/weight-logs")
async def list_weight_logs(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    return await db.weight_logs.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("date", 1).to_list(240)


@api.delete("/weight-logs/{weight_log_id}")
async def delete_weight_log(weight_log_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    existing = await db.weight_logs.find_one(
        {"id": weight_log_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Poids introuvable")
    await db.weight_logs.delete_one({"id": weight_log_id, "user_id": user["user_id"]})
    latest = await db.weight_logs.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("date", -1).to_list(1)
    if latest:
        await db.profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"weight_kg": latest[0]["weight_kg"], "updated_at": now_utc()}},
        )
    else:
        await db.profiles.update_one(
            {"user_id": user["user_id"]},
            {"$unset": {"weight_kg": ""}, "$set": {"updated_at": now_utc()}},
        )
    return {"ok": True}


@api.delete("/transformations/{transfo_id}")
async def delete_transformation(transfo_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    res = await db.transformations.delete_one(
        {"id": transfo_id, "user_id": user["user_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Photo introuvable")
    return {"ok": True}


# --- DASHBOARD ---
def steps_to_kcal(steps: int, weight_kg: float) -> int:
    # rough: 0.04 kcal per step per kg / 70 normalized
    return int(steps * 0.045 * (weight_kg / 70.0)) if weight_kg else int(steps * 0.045)


def cardio_to_kcal(minutes: int, weight_kg: float) -> int:
    # ~8 kcal/min for 70kg, scaled
    return int(minutes * 8 * (weight_kg / 70.0)) if weight_kg else minutes * 8


def workout_to_kcal(duration_min: int, weight_kg: float) -> int:
    return int(duration_min * 6 * (weight_kg / 70.0)) if weight_kg else duration_min * 6


@api.get("/dashboard/day")
async def dashboard_day(
    date: Optional[str] = None, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    d = date or today_str()
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    meals = await db.meals.find(
        {"user_id": user["user_id"], "date": d}, {"_id": 0, "image_base64": 0}
    ).to_list(200)
    activity = await db.activity.find_one(
        {"user_id": user["user_id"], "date": d}, {"_id": 0}
    ) or {"steps": 0, "cardio_minutes": 0}
    workout = await db.workouts.find_one(
        {
            "user_id": user["user_id"],
            "date": d,
            "$or": [{"challenge_id": {"$exists": False}}, {"challenge_id": None}],
        },
        {"_id": 0},
    )
    if not workout:
        prog = await db.programs.find_one(
            {"user_id": user["user_id"], "active": True}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if prog:
            workout = _planned_program_workout_payload(prog, d) or _next_program_workout_payload(prog, d)

    consumed = sum(m.get("calories", 0) for m in meals)
    protein = sum(m.get("protein_g", 0) for m in meals)
    carbs = sum(m.get("carbs_g", 0) for m in meals)
    fat = sum(m.get("fat_g", 0) for m in meals)

    weight = float(profile.get("weight_kg", 70))
    bmr = int(profile.get("bmr", 1600))
    steps_kcal = steps_to_kcal(int(activity.get("steps", 0)), weight)
    cardio_kcal = cardio_to_kcal(int(activity.get("cardio_minutes", 0)), weight)
    workout_kcal = workout_to_kcal(int(workout.get("duration_min", 0)) if (workout and workout.get("completed")) else 0, weight)
    burned_total = bmr + steps_kcal + cardio_kcal + workout_kcal

    target = int(profile.get("daily_calories", 2000))
    protein_target = int(profile.get("protein_g", 0))
    # ---- POINTS: protein target / calories on track (only for today, idempotent) ----
    if d == today_str():
        try:
            if protein_target > 0 and protein >= protein_target * 0.95:
                if await award_points(user["user_id"], "protein_target_hit", meta={"key": f"prot_{d}"}):
                    await evaluate_daily_combos(user["user_id"])
            if target > 0 and abs(consumed - target) / target <= 0.07:
                if await award_points(user["user_id"], "calories_on_track", meta={"key": f"cal_{d}"}):
                    await evaluate_daily_combos(user["user_id"])
        except Exception as e:
            log.warning(f"award daily points: {e}")
    return {
        "date": d,
        "target_calories": target,
        "consumed_calories": consumed,
        "remaining_calories": target - consumed,
        "macros": {
            "protein_g": protein,
            "carbs_g": carbs,
            "fat_g": fat,
            "protein_target": int(profile.get("protein_g", 0)),
            "carbs_target": int(profile.get("carbs_g", 0)),
            "fat_target": int(profile.get("fat_g", 0)),
        },
        "burned": {
            "bmr": bmr,
            "steps": steps_kcal,
            "cardio": cardio_kcal,
            "workout": workout_kcal,
            "total": burned_total,
        },
        "activity": {
            "steps": int(activity.get("steps", 0)),
            "cardio_minutes": int(activity.get("cardio_minutes", 0)),
        },
        "workout": workout,
        "meals_count": len(meals),
        "balance": consumed - burned_total,  # negative = deficit
    }


@api.get("/dashboard/week")
async def dashboard_week(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    target = int(profile.get("daily_calories", 2000))
    days = []
    today = now_utc().date()
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        meals = await db.meals.find(
            {"user_id": user["user_id"], "date": d}, {"_id": 0, "image_base64": 0}
        ).to_list(200)
        activity = await db.activity.find_one(
            {"user_id": user["user_id"], "date": d}, {"_id": 0}
        ) or {"steps": 0, "cardio_minutes": 0}
        consumed = sum(m.get("calories", 0) for m in meals)
        days.append(
            {
                "date": d,
                "consumed": consumed,
                "target": target,
                "steps": int(activity.get("steps", 0)),
                "cardio_minutes": int(activity.get("cardio_minutes", 0)),
            }
        )
    avg = sum(d["consumed"] for d in days if d["consumed"] > 0)
    nonzero = [d for d in days if d["consumed"] > 0]
    avg = int(avg / len(nonzero)) if nonzero else 0
    return {"days": days, "avg_consumed": avg, "target": target}


@api.get("/")
async def root():
    return {"service": "Performance Fitness API", "status": "ok"}


# --- Startup ---
@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.profiles.create_index("user_id", unique=True)
    await db.meals.create_index([("user_id", 1), ("date", 1)])
    await db.meals.create_index("id", unique=True)
    await db.activity.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.workouts.create_index("id", unique=True)
    await db.workouts.create_index([("user_id", 1), ("date", 1)])
    await db.transformations.create_index([("user_id", 1), ("created_at", -1)])
    await db.exercise_perf.create_index([("user_id", 1), ("created_at", -1)])
    await db.exercise_perf.create_index([("user_id", 1), ("exercise_name", 1)])
    await db.daily_compliance.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.favorites.create_index([("user_id", 1), ("created_at", -1)])
    await db.programs.create_index([("user_id", 1), ("active", 1)])
    await db.user_exercises.create_index([("user_id", 1), ("created_at", -1)])
    await db.ai_usage.create_index([("user_id", 1), ("date", 1)])
    await db.ai_usage.create_index([("user_id", 1), ("month", 1)])
    await db.ai_usage.create_index("created_at", expireAfterSeconds=365 * 24 * 60 * 60)
    await db.privacy_requests.create_index("id", unique=True)
    await db.privacy_requests.create_index([("email_hash", 1), ("created_at", -1)])
    await db.privacy_requests.create_index("expires_at", expireAfterSeconds=0)
    await db.affiliates.create_index("code", unique=True)
    await db.affiliates.create_index("owner_user_id")
    await db.affiliate_events.create_index([("code", 1), ("created_at", -1)])
    await db.sleep.create_index([("user_id", 1), ("date", 1)], unique=True)
    log.info("Indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
