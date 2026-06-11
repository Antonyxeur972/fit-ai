# Performance Fitness App — PRD

## Vision
A premium, performance-driven fitness app in French that replaces motivational
fluff with real, immediate data. Users photograph their meals → AI returns
calories & macros instantly. Daily caloric target, custom workout plan,
and transformation photo tracking complete the loop.

## Tech Stack
- **Backend**: FastAPI + Motor (MongoDB) + Emergent Integrations
- **Frontend**: Expo SDK 54 + Expo Router (file-based) + React Native + react-native-svg
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via EMERGENT_LLM_KEY
  for both meal analysis and transformation photo feedback.
- **Auth**: Emergent-managed Google Auth (`auth.emergentagent.com`)

## Design language
- Palette: `#FAFAF8` background, green accents (`#2D7C3E`, `#4ADE80`, `#E8F5E9`),
  text `#1A1A1A` / `#666666`, alert `#EF4444`.
- Organic, premium, white space heavy. Rounded-2xl cards, subtle shadows.
- Bottom tab navigation: Dashboard, Repas, Training, Progression, Profil.

## Features (V1)
1. **Onboarding**: 4-step (gender → measures → goal → activity level).
   Server-side Mifflin-St Jeor BMR → TDEE → calorie target → macros.
2. **Dashboard**: Daily caloric ring, macro bars, energy expenditure breakdown
   (BMR + steps + cardio + workout), today's workout, activity glance.
3. **Meals**: Camera + library photo capture → Claude Sonnet 4.5 vision returns
   `{name, calories, protein_g, carbs_g, fat_g, notes}` JSON → persisted in Mongo.
   List + delete meals for the day.
4. **Training**: Auto-generated 7-day home workout plan adapted to goal
   (lose/maintain/gain). Today's session detail with exercises. Mark complete.
   Activity entry (steps, cardio minutes, type).
5. **Progress**: 7-day caloric chart, weekly activity totals, transformation
   photo upload with AI feedback (Claude compares to last photo).
6. **Profile**: Targets, mesures, edit profile (re-runs onboarding), logout.

## Backend Routes (all under `/api`)
| Route | Method | Notes |
|---|---|---|
| `/auth/session` | POST | exchange session_token from Emergent → app session |
| `/auth/me` | GET | current user |
| `/auth/logout` | POST | delete session |
| `/profile` | GET / PUT | profile + computed targets |
| `/meals/analyze` | POST | Claude vision → meal record |
| `/meals` | GET | list day's meals (no image bytes) |
| `/meals/{id}` | GET / DELETE | meal detail / delete |
| `/activity` | GET / POST | manual steps + cardio per day |
| `/workouts/generate` | POST | rebuild 7-day plan |
| `/workouts/week` | GET | full upcoming plan |
| `/workouts/today` | GET | today's session |
| `/workouts/{id}/complete` | POST | mark done |
| `/transformations` | GET / POST | with Claude before/after feedback |
| `/dashboard/day` | GET | aggregated daily view |
| `/dashboard/week` | GET | 7-day rolling view |

## Mongo Collections
`users`, `user_sessions` (TTL on `expires_at`), `profiles`, `meals`, `activity`,
`workouts`, `transformations`. Custom `user_id` field everywhere, never expose `_id`.

## Mock / unimplemented
- Activity tracking is **manual only** (no HealthKit/Google Fit). Confirmed with user.
- No push notifications.
