"""
Performance Fitness App - Backend
FastAPI + MongoDB + Emergent Google Auth + Claude Sonnet 4.5 vision
"""
import os
import uuid
import json
import re
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date as dt_date
from typing import List, Optional, Dict, Any

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ---
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Performance Fitness API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("fitness")


# --- Helpers ---
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_str() -> str:
    return now_utc().date().isoformat()


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def strip_id(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


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
    session_token: str


class AuthMeResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    onboarded: bool = False


class ProfileIn(BaseModel):
    weight_kg: float
    height_cm: float
    age: int
    gender: str  # "male" | "female"
    goal: str  # "lose" | "gain" | "maintain"
    activity_level: str = "moderate"  # sedentary | light | moderate | active | very_active


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


class ActivityIn(BaseModel):
    date: str
    steps: int = 0
    cardio_minutes: int = 0
    cardio_type: Optional[str] = None


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
    goal_adj = {"lose": -0.20, "gain": 0.12, "maintain": 0.0}
    cals = tdee * (1 + goal_adj.get(p.goal, 0.0))
    cals = max(1200, round(cals))
    # Macros: protein 2g/kg, fat 25% of cals, rest carbs
    protein_g = round(p.weight_kg * 2)
    fat_g = round((cals * 0.25) / 9)
    carbs_g = max(0, round((cals - protein_g * 4 - fat_g * 9) / 4))
    return {
        "bmr": round(bmr),
        "daily_calories": int(cals),
        "protein_g": int(protein_g),
        "carbs_g": int(carbs_g),
        "fat_g": int(fat_g),
    }


# --- Workout generator ---
def generate_week_plan(profile: dict) -> List[Dict[str, Any]]:
    goal = profile.get("goal", "maintain")
    intensity = {"lose": "moderate-high", "gain": "high", "maintain": "moderate"}.get(goal, "moderate")
    base = [
        {
            "focus": "Haut du corps",
            "exercises": [
                {"name": "Pompes", "sets": 4, "reps": "10-15", "rest_s": 60},
                {"name": "Dips sur chaise", "sets": 3, "reps": "10-12", "rest_s": 60},
                {"name": "Rowing haltère", "sets": 4, "reps": "12 / côté", "rest_s": 60},
                {"name": "Élévations latérales", "sets": 3, "reps": "15", "rest_s": 45},
                {"name": "Gainage planche", "sets": 3, "reps": "45s", "rest_s": 45},
            ],
        },
        {
            "focus": "Bas du corps",
            "exercises": [
                {"name": "Squat poids du corps", "sets": 4, "reps": "15-20", "rest_s": 60},
                {"name": "Fentes alternées", "sets": 3, "reps": "12 / jambe", "rest_s": 60},
                {"name": "Hip thrust", "sets": 4, "reps": "15", "rest_s": 60},
                {"name": "Mollets debout", "sets": 4, "reps": "20", "rest_s": 45},
                {"name": "Gainage latéral", "sets": 3, "reps": "30s / côté", "rest_s": 45},
            ],
        },
        {
            "focus": "Repos actif",
            "exercises": [
                {"name": "Marche rapide", "sets": 1, "reps": "30 min", "rest_s": 0},
                {"name": "Mobilité hanche/épaule", "sets": 1, "reps": "10 min", "rest_s": 0},
            ],
        },
        {
            "focus": "Full body",
            "exercises": [
                {"name": "Burpees", "sets": 4, "reps": "10", "rest_s": 60},
                {"name": "Squat sauté", "sets": 4, "reps": "12", "rest_s": 60},
                {"name": "Pompes inclinées", "sets": 4, "reps": "12", "rest_s": 60},
                {"name": "Mountain climbers", "sets": 3, "reps": "30s", "rest_s": 45},
                {"name": "Gainage planche", "sets": 3, "reps": "60s", "rest_s": 45},
            ],
        },
        {
            "focus": "Cardio HIIT",
            "exercises": [
                {"name": "Jumping jacks", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15},
                {"name": "High knees", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15},
                {"name": "Skater jumps", "sets": 5, "reps": "45s on / 15s off", "rest_s": 15},
                {"name": "Récupération", "sets": 1, "reps": "5 min marche", "rest_s": 0},
            ],
        },
        {
            "focus": "Core & gainage",
            "exercises": [
                {"name": "Planche", "sets": 4, "reps": "45-60s", "rest_s": 30},
                {"name": "Crunchs", "sets": 4, "reps": "20", "rest_s": 30},
                {"name": "Russian twist", "sets": 4, "reps": "30", "rest_s": 30},
                {"name": "Leg raises", "sets": 4, "reps": "12", "rest_s": 30},
            ],
        },
        {
            "focus": "Repos",
            "exercises": [
                {"name": "Récupération totale", "sets": 1, "reps": "Étirements 15 min", "rest_s": 0},
            ],
        },
    ]
    today = now_utc().date()
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
                "intensity": intensity,
            }
        )
    return plan


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


async def analyze_meal_with_claude(image_base64: str) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    system = (
        "Tu es un nutritionniste expert. Tu analyses des photos d'assiette et tu réponds "
        "UNIQUEMENT avec un JSON valide. Sois réaliste et précis. Le JSON DOIT avoir cette forme:\n"
        '{"name": "nom court du plat en français", '
        '"calories": int (kcal estimés pour la portion visible), '
        '"protein_g": int, "carbs_g": int, "fat_g": int, '
        '"notes": "courte note (max 12 mots) sur la qualité nutritionnelle"}'
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=new_id("meal"),
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    msg = UserMessage(
        text="Analyse cette assiette. Retourne UNIQUEMENT le JSON, rien d'autre.",
        file_contents=[ImageContent(image_base64=image_base64)],
    )
    try:
        response = await chat.send_message(msg)
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


async def analyze_transformation_with_claude(image_base64: str, prev_image_base64: Optional[str] = None) -> str:
    if not EMERGENT_LLM_KEY:
        return "Analyse IA indisponible."
    system = (
        "Tu es un coach physique. Tu donnes un feedback bref, factuel et bienveillant sur la "
        "composition corporelle visible (définition musculaire, posture, niveau de gras visible). "
        "Réponds en français, 2 à 3 phrases max. Pas de jugement, que des observations utiles."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=new_id("transfo"),
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    files = [ImageContent(image_base64=image_base64)]
    text = "Analyse cette photo de transformation. Donne un feedback bref et concret."
    if prev_image_base64:
        files.insert(0, ImageContent(image_base64=prev_image_base64))
        text = "Compare la photo précédente et la nouvelle (la 2e). Donne un feedback bref."
    try:
        msg = UserMessage(text=text, file_contents=files)
        response = await chat.send_message(msg)
        return (response or "").strip()[:500]
    except Exception as e:
        log.exception("Claude transformation failed")
        return f"Analyse impossible: {e}"


# --- AUTH ---
@api.post("/auth/session")
async def auth_session(body: SessionLoginRequest):
    """Process session_token from Emergent Auth -> persist session locally"""
    headers = {"X-Session-ID": body.session_token}
    async with httpx.AsyncClient(timeout=15.0) as cli:
        try:
            r = await cli.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers=headers,
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Auth provider error: {e}")
    if r.status_code != 200:
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


@api.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "onboarded": bool(user.get("onboarded", False)),
    }


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# --- PROFILE ---
@api.get("/profile")
async def get_profile(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    prof = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return prof or {}


@api.put("/profile")
async def upsert_profile(body: ProfileIn, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    targets = compute_targets(body)
    doc = {
        "user_id": user["user_id"],
        **body.dict(),
        **targets,
        "updated_at": now_utc(),
    }
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": doc}, upsert=True)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarded": True}})
    return strip_id(doc)


# --- MEALS ---
@api.post("/meals/analyze")
async def analyze_and_save_meal(
    body: MealAnalyzeRequest, authorization: Optional[str] = Header(default=None)
):
    user = await get_current_user(authorization)
    analysis = await analyze_meal_with_claude(body.image_base64)
    meal = {
        "id": new_id("meal"),
        "user_id": user["user_id"],
        "date": today_str(),
        "created_at": now_utc(),
        "image_base64": body.image_base64[:200000],  # cap to avoid bloat
        **analysis,
    }
    await db.meals.insert_one(meal)
    return strip_id(meal)


@api.get("/meals")
async def list_meals(
    date: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
):
    user = await get_current_user(authorization)
    q: Dict[str, Any] = {"user_id": user["user_id"]}
    if date:
        q["date"] = date
    cursor = db.meals.find(q, {"_id": 0, "image_base64": 0}).sort("created_at", -1)
    items = await cursor.to_list(500)
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
@api.post("/workouts/generate")
async def generate_workouts(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(400, "Profile required before generating workouts")
    # wipe upcoming sessions (next 7 days) and rebuild
    today = now_utc().date()
    end = today + timedelta(days=7)
    await db.workouts.delete_many(
        {
            "user_id": user["user_id"],
            "date": {"$gte": today.isoformat(), "$lt": end.isoformat()},
        }
    )
    plan = generate_week_plan(profile)
    if plan:
        await db.workouts.insert_many([{**w} for w in plan])
    return [strip_id(w) for w in plan]


@api.get("/workouts/week")
async def get_week_workouts(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", 1).to_list(50)
    return items


@api.get("/workouts/today")
async def workout_today(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    w = await db.workouts.find_one(
        {"user_id": user["user_id"], "date": today_str()}, {"_id": 0}
    )
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
    return {"ok": True}


# --- TRANSFORMATIONS ---
@api.post("/transformations")
async def add_transformation(body: TransformationIn, authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    prev = await db.transformations.find_one(
        {"user_id": user["user_id"]}, sort=[("created_at", -1)], projection={"_id": 0}
    )
    prev_img = prev.get("image_base64") if prev else None
    feedback = await analyze_transformation_with_claude(body.image_base64, prev_img)
    doc = {
        "id": new_id("transfo"),
        "user_id": user["user_id"],
        "date": today_str(),
        "created_at": now_utc(),
        "image_base64": body.image_base64[:300000],
        "weight_kg": body.weight_kg,
        "ai_feedback": feedback,
    }
    await db.transformations.insert_one(doc)
    return strip_id(doc)


@api.get("/transformations")
async def list_transformations(authorization: Optional[str] = Header(default=None)):
    user = await get_current_user(authorization)
    items = await db.transformations.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items


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
        {"user_id": user["user_id"], "date": d}, {"_id": 0}
    )

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
    log.info("Indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
