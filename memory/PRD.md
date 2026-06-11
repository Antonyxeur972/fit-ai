# FIT AI — PRD

## Vision
A premium, performance-driven fitness app in French that replaces motivational
fluff with real, immediate data. Users photograph their meals → AI returns
calories & macros instantly. Custom calorie targets, fully-editable workouts,
and transformation photo tracking complete the loop.

## Tech Stack
- **Backend**: FastAPI + Motor (MongoDB) + Emergent Integrations
- **Frontend**: Expo SDK 54 + Expo Router + React Native + react-native-svg
- **AI**: Claude Sonnet 4.5 vision (meal & transformation analysis) via EMERGENT_LLM_KEY
- **Auth**: Emergent-managed Google Auth (`auth.emergentagent.com`)

## Brand
- App name: **FIT AI** (slug `fit-ai`)
- Tagline: « Les données ne mentent pas. » / « Performance over motivation »
- Palette: #FAFAF8 + green accents (#2D7C3E, #4ADE80, #E8F5E9), text #1A1A1A.

## Bottom Tabs
Dashboard · Repas · Training · Progression · Profil.

## Core flows
1. **Onboarding**: 4-step (gender, measures, goal, activity) → Mifflin-St Jeor BMR → TDEE → calorie target + macros.
2. **Dashboard**: caloric ring, macro bars, energy breakdown (BMR + steps + cardio + workout), today's workout card, activity glance with **quick-add steps** (+500/+1000/+2500/+5000 chips).
3. **Meals**:
   - Today tab grouped by **meal_type** (Petit-déj / Déjeuner / Collation / Dîner — auto from creation hour).
   - History tab: per-day cards with **compliance % badge** (green ≥80, amber ≥50, red <50). Sub-buckets: Hier / Cette semaine / Plus ancien (archivé).
   - Lifecycle: auto-archive at 7 days (hidden by default), auto-delete at 14 days; user can also bulk-purge >7d. **Compliance % is snapshotted to `daily_compliance` before any deletion** so history survives.
4. **Training**:
   - **Session type chips** — Volume (10-12 reps), Puissance (6-8), Force (3-6) — applied to all exercises and stamped on the workout.
   - **Workout editor**: pick exercises from a library (~35 exercises across 7 categories: Pectoraux, Dos, Jambes, Épaules, Bras, Core, Cardio). Check / uncheck → reps & sets auto from session type.
   - **Perf logging**: tap any exercise → enter weight × reps → **estimated 1RM (Epley)** shown live; saved with history per exercise.
5. **Progress**: 7-day caloric chart + weekly activity totals + transformation photo upload with Claude AI feedback.
6. **Profile**: targets, measures, edit profile (re-runs onboarding), logout.

## New Backend Routes (iteration 2)
| Route | Method | Notes |
|---|---|---|
| `/workouts/generate?session_type=volume\|puissance\|force` | POST | rebuild 7-day plan with chosen rep range |
| `/workouts/{id}` | PUT | edit session_type / exercises / focus / duration |
| `/workouts/{id}/perf` | POST | log a set (weight_kg, reps) → est_1rm |
| `/workouts/{id}/perf` | GET | list perfs for a workout |
| `/perf/recent?exercise=&limit=` | GET | recent perfs + personal_bests per exercise |
| `/exercises/library` | GET | full predefined library + session_types definitions |
| `/activity/steps` | POST | append steps (or replace if `date` given) |
| `/meals?history=true&include_archived=true` | GET | grouped per-day with compliance |
| `/meals/older-than/{days}` | DELETE | snapshot compliance then bulk delete |
| `/meals/cleanup` | POST | run lifecycle on-demand (also auto-runs on every meals GET) |
| `/compliance/history` | GET | daily compliance snapshots (survives meal deletion) |

## 1RM Formula
Epley: `1RM = weight × (1 + reps/30)`. Capped to 12 reps. Reps=1 → weight itself.

## Mongo Collections
`users`, `user_sessions` (TTL), `profiles`, `meals` (+ `archived` flag, `meal_type`), `activity`, `workouts` (+ `session_type`), `transformations`, `exercise_perf`, `daily_compliance` (unique on `user_id+date`).

## Mock / unimplemented
- Activité : **saisie manuelle** (no HealthKit/Google Fit).
- No push notifications.
