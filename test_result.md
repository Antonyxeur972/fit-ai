#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  FIT AI – Phase 4 (June 2026). Suite des Phases 1-3 complétées.
  Demande actuelle (Phase 4) :
  1. Supprimer le bouton "Accélérer mes résultats" (côté UI training).
  2. Corriger l'ajout d'exercice via IA (Mon exercice n'est pas listé).
  3. Modes Home / Travel doivent rester 100 % poids du corps.
  4. Choix d'une silhouette (10 visuels = 5 niveaux × 2 sexes) dans l'onboarding
     ET dans le profil, modifiable ensuite.
  5. Estimation 1RM (Squat / Bench / Deadlift) via normes standards en onboarding
     ET dans le profil, modifiable ensuite.
  6. Galerie photo PRIVÉE sans IA (suppression de toute analyse Claude des
     photos corps), avec comparatif chronologique côte à côte.
  7. Carte "Partager mes perfs" (story verticale premium) à la fin d'une séance
     terminée, capturable via react-native-view-shot, avec options enregistrer
     ET partager.

backend:
  - task: "PUT /users/me/silhouette (save sex+level 1..5)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Endpoint added. Smoke-tested with curl → returns {silhouette: {sex,level}} and persists to users.silhouette."
  - task: "POST /workouts/estimate-1rm (Epley for squat/bench/dl/ohp)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Endpoint added. Inserts into exercise_perf for chart continuity AND saves a force_metrics snapshot on user doc."
  - task: "Transformations: remove Claude AI analysis (private gallery)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /transformations no longer calls analyze_transformation_with_claude. Also added DELETE /transformations/{id} so user can remove photos in the new gallery."
  - task: "/auth/me returns silhouette + force_metrics"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Two extra optional fields added to /auth/me response."
  - task: "/exercises/ai-add still works (no regression)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "No code change in this iteration but the endpoint is now hooked from the UI editor only. Worth a quick e2e check (description='farmer walk') with bearer token."

frontend:
  - task: "Onboarding: add silhouette step (step 5) + 1RM step (step 6)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/onboarding.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New SilhouettePicker (5 levels × 2 sexes) + Lift rows (Squat / Bench / Deadlift) with auto live 1RM. Optional skip checkbox."
  - task: "Profile: silhouette card + 1RM card with edit modals"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Two new cards above 'Avatar de force'. Modals open the picker / lift form. Save calls refreshUser to update local state."
  - task: "Progress: private photo gallery (no AI) + chronologie / Avant-Après compare"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/progress.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Removed ai_feedback rendering. New PhotoGallery component with grid + Avant/Après compare panes and delete buttons (uses DELETE /transformations/{id})."
  - task: "Training: remove 'Accélérer' button + share card after session"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/training.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "ProgramSummaryCard no longer renders 'Accélérer'. After 'Marquer comme terminée', auto-opens ShareCardModal and shows a 'Partager mes perfs' button on completed sessions."
  - task: "ShareCard + ShareCardModal (capture, save, share)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/ShareCard.tsx, ShareCardModal.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "9:16 dark premium card with brand, focus, hero stats (volume / minutes / exercices), top 3 PRs (avec delta vs précédent), or best set fallback. Background photo optionnelle. Capture via react-native-view-shot, save (MediaLibrary), share (expo-sharing)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 10
  run_ui: true

test_plan:
  current_focus:
    - "PUT /users/me/silhouette"
    - "POST /workouts/estimate-1rm"
    - "POST /transformations (no AI now) + DELETE /transformations/{id}"
    - "Onboarding silhouette/1RM steps reach dashboard"
    - "Profile silhouette + 1RM modals persist after refresh"
    - "Progress gallery grid + compare modes"
    - "Training 'Accélérer' is gone, share card opens after complete"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 4 backend + frontend implemented. Please test priority items above. Notes:
      * Backend endpoints already pass curl smoke tests.
      * Auth uses session bearer `test_session_token_abc` for user_test_001 (seeded).
      * Share card uses react-native-view-shot; capture only fully works on native build,
        web fallback opens preview URL. UI itself should still render & buttons must not crash.
      * Photo background picker is optional. The card MUST also work without a background photo.
  - agent: "testing"
    message: |
      Iteration 10: 17/18 backend tests passing. Critical bug found in force_metrics keys
      collision ('développé' overrides 'bench' & 'ohp'). RCA pointed to a stray slug recompute.
  - agent: "main"
    message: |
      Bug fixed: removed the stray `slug = name.split(" ")[0].lower()` override. Snapshot now
      uses tuple-provided slugs squat/bench/deadlift/ohp. TestEstimate1RM (4/4) PASSED.
      Backend Phase 4: 18/18 ✅.
