#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const repoRoot = process.env.CODEX_FIX_REPO_ROOT || path.resolve(__dirname, "../..");
const packagePath = path.join(repoRoot, "frontend", "package.json");
const scriptPath = __filename;
const postinstallCommand = "node ./scripts/apply-codex-fix.js";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(repoRoot, rel), content);
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to) && !source.includes(from)) return source;
  if (!source.includes(from)) throw new Error(`Missing block: ${label}`);
  return source.replace(from, to);
}

function replaceRegex(source, regex, to, label) {
  if (!regex.test(source)) throw new Error(`Missing pattern: ${label}`);
  return source.replace(regex, to);
}

function edit(rel, fn) {
  const before = read(rel);
  const after = fn(before);
  if (after !== before) write(rel, after);
}

function run(command, args) {
  return cp.execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

function removePostinstall() {
  if (!fs.existsSync(packagePath)) return;
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (pkg.scripts && pkg.scripts.postinstall === postinstallCommand) {
    delete pkg.scripts.postinstall;
    fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function cleanupTemporaryFiles() {
  removePostinstall();
  const patchDir = path.join(repoRoot, ".codex-patches");
  if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
  if (fs.existsSync(scriptPath) && scriptPath.includes(path.join("frontend", "scripts"))) {
    fs.rmSync(scriptPath, { force: true });
    try {
      fs.rmdirSync(path.dirname(scriptPath));
    } catch (_) {}
  }
}

function updateBackend() {
  edit("backend/server.py", (s) => replaceOnce(
    s,
    '\n\n@api.delete("/transformations/{transfo_id}")',
    '\n\n@api.delete("/weight-logs/{weight_log_id}")\nasync def delete_weight_log(weight_log_id: str, authorization: Optional[str] = Header(default=None)):\n    user = await get_current_user(authorization)\n    existing = await db.weight_logs.find_one(\n        {"id": weight_log_id, "user_id": user["user_id"]}, {"_id": 0}\n    )\n    if not existing:\n        raise HTTPException(404, "Poids introuvable")\n    await db.weight_logs.delete_one({"id": weight_log_id, "user_id": user["user_id"]})\n    latest = await db.weight_logs.find(\n        {"user_id": user["user_id"]}, {"_id": 0}\n    ).sort("date", -1).to_list(1)\n    if latest:\n        await db.profiles.update_one(\n            {"user_id": user["user_id"]},\n            {"$set": {"weight_kg": latest[0]["weight_kg"], "updated_at": now_utc()}},\n        )\n    else:\n        await db.profiles.update_one(\n            {"user_id": user["user_id"]},\n            {"$unset": {"weight_kg": ""}, "$set": {"updated_at": now_utc()}},\n        )\n    return {"ok": True}\n\n\n@api.delete("/transformations/{transfo_id}")',
    "weight log delete endpoint"
  ));
}

function updateProfile() {
  edit("frontend/app/(tabs)/profile.tsx", (s) => s.replace('title="Modifier mon profil"', 'title="Modifier mes objectifs"'));
}

function updateUI() {
  edit("frontend/src/components/UI.tsx", (s) => {
    s = replaceOnce(
      s,
      "\n// --- Bar chart (week consumed vs target) ---\nexport function WeekBars({",
      '\n// --- Bar chart (week consumed vs target) ---\nfunction parseChartDate(iso: string) {\n  const [year, month, day] = iso.split("-").map(Number);\n  return new Date(year || 1970, (month || 1) - 1, day || 1);\n}\n\nexport function WeekBars({',
      "parse chart date"
    );
    s = s.replace(
      "  const max = Math.max(target, ...days.map((d) => d.consumed), 1);",
      '  const orderedDays = days.slice().sort((a, b) => parseChartDate(a.date).getTime() - parseChartDate(b.date).getTime());\n  const max = Math.max(target, ...orderedDays.map((d) => d.consumed), 1);'
    );
    s = s.replace("      {days.map((d) => {", "      {orderedDays.map((d) => {");
    s = s.replace(
      '        const day = new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short" });',
      '        const day = parseChartDate(d.date).toLocaleDateString("fr-FR", { weekday: "short" });'
    );
    return s;
  });
}

function updateDashboard() {
  edit("frontend/app/(tabs)/dashboard.tsx", (s) => {
    s = s.replace('cardio_type: "Minutes actives"', 'cardio_type: "Running"');
    s = s.replace('label="Minutes actives"', 'label="Running"');
    s = s.replace("<Text style={styles.modalTitle}>Minutes actives</Text>", "<Text style={styles.modalTitle}>Running</Text>");
    s = s.replace(
      "Course, vélo, marche rapide ou cardio ajouté manuellement.",
      "Course, marche rapide, vélo ou cardio ajouté manuellement."
    );

    const caloriesBlock = `          <Card style={styles.simpleMainCard} testID="dashboard-simple-calories">
            <Text style={styles.simpleLabel}>Calories à viser</Text>
            <Text style={styles.simpleCalories}>{data.target_calories.toLocaleString("fr-FR")}</Text>
            <Text style={styles.simpleSub}>
              {\`\${Math.max(0, data.remaining_calories).toLocaleString("fr-FR")} kcal restantes aujourd'hui\`}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/meals")} style={styles.simplePrimaryButton} testID="dashboard-simple-add-meal">
              <Ionicons name="restaurant-outline" size={20} color="#102108" />
              <Text style={styles.simplePrimaryText}>Ajouter un repas</Text>
            </TouchableOpacity>
          </Card>`;
    const workoutBlock = `          <Card style={styles.simpleWorkoutCard} testID="dashboard-simple-workout">
            <Text style={styles.simpleLabel}>Programme</Text>
            <Text style={styles.simpleWorkoutTitle}>{workoutLabel}</Text>
            <Text style={styles.simpleSub}>
              {workoutMeta}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/training")} style={styles.simplePrimaryButton} testID="dashboard-simple-start-workout">
              <Ionicons name="play-circle" size={21} color="#102108" />
              <Text style={styles.simplePrimaryText}>{workoutActionText}</Text>
            </TouchableOpacity>
          </Card>`;
    s = replaceOnce(s, `${caloriesBlock}\n\n${workoutBlock}`, `${workoutBlock}\n\n${caloriesBlock}`, "simple dashboard card order");

    s = replaceOnce(
      s,
      `              <ProgressRing progress={workoutDone ? 1 : Math.max(0.12, activeMinutesProgress)} size={74} stroke={7}>
                <Text style={styles.heroRingValue}>{workoutDone ? "100%" : \`\${Math.round(Math.max(activeMinutesProgress, 0.12) * 100)}%\`}</Text>
              </ProgressRing>`,
      `              <View style={[styles.heroWorkoutIcon, workoutDone && styles.heroWorkoutIconDone]}>
                <Ionicons name={workoutDone ? "checkmark-circle" : "play-circle"} size={32} color={workoutDone ? "#102108" : colors.primaryLight} />
              </View>`,
      "dashboard hero workout icon"
    );
    s = replaceOnce(
      s,
      "  heroPointsText: { color: \"#102108\", fontSize: 11.5, fontWeight: \"900\" },\n  heroRingValue:",
      "  heroPointsText: { color: \"#102108\", fontSize: 11.5, fontWeight: \"900\" },\n  heroWorkoutIcon: { width: 74, height: 74, borderRadius: 37, alignItems: \"center\", justifyContent: \"center\", borderWidth: 1, borderColor: \"rgba(182,255,63,0.26)\", backgroundColor: \"rgba(182,255,63,0.10)\" },\n  heroWorkoutIconDone: { borderColor: colors.primaryLight, backgroundColor: colors.primaryLight },\n  heroRingValue:",
      "dashboard hero icon styles"
    );
    return s;
  });
}

function updateChallenges() {
  edit("frontend/app/(tabs)/challenges.tsx", (s) => {
    s = replaceRegex(s, /\n\ntype Workout = \{[\s\S]*?\};\n\ntype Week = \{[\s\S]*?\};/, "", "challenge unused types");
    s = s.replace("  const [week, setWeek] = useState<Week | null>(null);\n", "");
    s = s.replace("  const [workouts, setWorkouts] = useState<Workout[]>([]);\n", "");
    s = s.replace("  const [participating, setParticipating] = useState(false);\n", "");
    s = s.replace(
      `      const [ps, w, wk, active] = await Promise.all([
        api<PointsSummary>("/points/summary").catch(() => null),
        api<Week>("/dashboard/week").catch(() => null),
        api<Workout[]>("/workouts/week").catch(() => []),
        api<{ items: ActiveChallenge[] }>("/challenges/active").catch(() => ({ items: [] })),
      ]);
      setPoints(ps);
      setWeek(w);
      setWorkouts(wk || []);`,
      `      const [ps, active] = await Promise.all([
        api<PointsSummary>("/points/summary").catch(() => null),
        api<{ items: ActiveChallenge[] }>("/challenges/active").catch(() => ({ items: [] })),
      ]);
      setPoints(ps);`
    );
    s = replaceRegex(s, /\n  const sessionsDone = workouts\.filter[\s\S]*?const chestReady = missionCount >= 3;\n/, "\n", "weekly challenge derived stats");
    s = replaceRegex(s, /\n        <Card testID="weekly-explorer-card"[\s\S]*?        <\/Card>\n(?=\n        <Card testID="total-xp-card")/, "", "weekly explorer card");
    s = replaceRegex(s, /\nfunction MissionRow\([\s\S]*?\n\}\n(?=\nfunction todayChallengeIndex)/, "\n", "mission row component");
    s = replaceRegex(s, /\n  weeklyCard: \{[\s\S]*?  missionValue: \{[^\n]*\},/, "", "weekly styles");
    s = s.replace("\n\n\nfunction todayChallengeIndex", "\n\nfunction todayChallengeIndex");
    return s;
  });
}

function updateProgress() {
  edit("frontend/app/(tabs)/progress.tsx", (s) => {
    s = replaceOnce(
      s,
      "type WeightLog = { id: string; date: string; weight_kg: number; created_at: string };\n",
      'type WeightLog = { id: string; date: string; weight_kg: number; created_at: string };\ntype WeightPoint = { id?: string; date: string; weight: number; time: number; source: "log" | "photo" };\n',
      "weight point type"
    );
    s = replaceOnce(
      s,
      "  const [savingWeight, setSavingWeight] = useState(false);\n",
      '  const [savingWeight, setSavingWeight] = useState(false);\n  const [deletingWeightId, setDeletingWeightId] = useState<string | null>(null);\n',
      "weight delete state"
    );
    s = s.replace(
      "  const weightsMap = new Map<string, { date: string; weight: number; time: number }>();",
      "  const weightsMap = new Map<string, WeightPoint>();"
    );
    s = s.replace(
      "      weightsMap.set(date, { date, weight: Number(item.weight_kg), time: parseLocalISO(date).getTime() });",
      '      weightsMap.set(date, { date, weight: Number(item.weight_kg), time: parseLocalISO(date).getTime(), source: "photo" });'
    );
    s = s.replace(
      "    weightsMap.set(item.date, { date: item.date, weight: Number(item.weight_kg), time: parseLocalISO(item.date).getTime() });",
      '    weightsMap.set(item.date, { id: item.id, date: item.date, weight: Number(item.weight_kg), time: parseLocalISO(item.date).getTime(), source: "log" });'
    );
    s = replaceOnce(
      s,
      `      await api("/weight-logs", {
        method: "POST",
        body: { weight_kg: weight, date: toLocalISO(weightDate) },
      });
      await onSaved();`,
      `      await api("/weight-logs", {
        method: "POST",
        body: { weight_kg: weight, date: toLocalISO(weightDate) },
      });
      setShowWeightDate(false);
      await onSaved();`,
      "close date picker after save"
    );
    s = replaceOnce(
      s,
      "\n  return (\n    <Card testID=\"body-composition-card\"",
      `\n  const deleteWeight = async (point: WeightPoint) => {
    if (!point.id || point.source !== "log") return;
    setDeletingWeightId(point.id);
    try {
      await api(\`/weight-logs/\${point.id}\`, { method: "DELETE" });
      await onSaved();
    } finally {
      setDeletingWeightId(null);
    }
  };

  const confirmDeleteWeight = (point: WeightPoint) => {
    if (!point.id || point.source !== "log") return;
    Alert.alert(
      "Supprimer cette pesée ?",
      \`\${point.weight.toFixed(1)} kg · \${point.date}\`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => deleteWeight(point) },
      ]
    );
  };

  return (
    <Card testID="body-composition-card"`,
      "weight delete handlers"
    );
    s = replaceOnce(
      s,
      `            <View key={\`\${point.date}-\${index}\`} style={styles.weightBarCol}>
              <View style={styles.weightBarTrack}>
                <View style={[styles.weightBarFill, { height: \`\${Math.max(10, ((point.weight - min) / span) * 80 + 12)}%\` }]} />
              </View>
            </View>`,
      `            <View key={\`\${point.date}-\${index}\`} style={styles.weightBarCol}>
              <Text style={styles.weightBarValue}>{point.weight.toFixed(1)}</Text>
              <View style={styles.weightBarTrack}>
                <View style={[styles.weightBarFill, { height: \`\${Math.max(10, ((point.weight - min) / span) * 80 + 12)}%\` }]} />
              </View>
              <Text style={styles.weightBarDate}>{parseLocalISO(point.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</Text>
            </View>`,
      "weight bar labels"
    );
    s = replaceOnce(
      s,
      `        {showWeightDate && (
          <DateTimePicker
            value={weightDate}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, selected) => {
              if (Platform.OS !== "ios") setShowWeightDate(false);
              if (selected) setWeightDate(selected);
            }}
          />
        )}`,
      `        {showWeightDate && (
          <>
            <DateTimePicker
              value={weightDate}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, selected) => {
                if (Platform.OS !== "ios") setShowWeightDate(false);
                if (selected) setWeightDate(selected);
              }}
            />
            <TouchableOpacity onPress={() => setShowWeightDate(false)} style={styles.weightDoneBtn} testID="weight-log-date-done">
              <Text style={styles.weightDoneText}>Terminer</Text>
            </TouchableOpacity>
          </>
        )}
        {weights.length > 0 ? (
          <View style={styles.weightHistoryList} testID="weight-history-list">
            <Text style={styles.weightHistoryTitle}>Pesées enregistrées</Text>
            {weights.slice().reverse().slice(0, 5).map((point) => (
              <View key={\`\${point.source}-\${point.id || point.date}\`} style={styles.weightHistoryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weightHistoryValue}>{point.weight.toFixed(1)} kg</Text>
                  <Text style={styles.weightHistoryDate}>
                    {parseLocalISO(point.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {point.source === "photo" ? " · photo" : ""}
                  </Text>
                </View>
                {point.source === "log" && point.id ? (
                  <TouchableOpacity
                    onPress={() => confirmDeleteWeight(point)}
                    disabled={deletingWeightId === point.id}
                    style={styles.weightDeleteBtn}
                    testID={\`weight-delete-\${point.id}\`}
                  >
                    {deletingWeightId === point.id ? (
                      <ActivityIndicator size="small" color={colors.alert} />
                    ) : (
                      <Ionicons name="trash-outline" size={15} color={colors.alert} />
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}`,
      "date picker and weight history"
    );
    s = replaceOnce(
      s,
      `  weightBars: { height: 82, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  weightBarCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  weightBarTrack: { height: "100%", borderRadius: 8, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "rgba(255,255,255,0.08)" },
  weightBarFill: { width: "100%", borderRadius: 8, backgroundColor: "rgba(88,183,255,0.82)" },
  weightAddRow:`,
      `  weightBars: { height: 112, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  weightBarCol: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  weightBarValue: { color: colors.textMain, fontSize: 9.5, fontWeight: "900" },
  weightBarTrack: { width: "100%", flex: 1, borderRadius: 8, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "rgba(255,255,255,0.08)" },
  weightBarFill: { width: "100%", borderRadius: 8, backgroundColor: "rgba(88,183,255,0.82)" },
  weightBarDate: { color: colors.textMuted, fontSize: 8.5, fontWeight: "800" },
  weightAddRow:`,
      "weight chart styles"
    );
    s = replaceOnce(
      s,
      "  weightSaveText: { color: \"#102108\", fontSize: 12, fontWeight: \"900\" },\n  performanceHeader:",
      "  weightSaveText: { color: \"#102108\", fontSize: 12, fontWeight: \"900\" },\n  weightDoneBtn: { minHeight: 40, borderRadius: radius.full, alignItems: \"center\", justifyContent: \"center\", borderWidth: 1, borderColor: \"rgba(182,255,63,0.24)\", backgroundColor: \"rgba(182,255,63,0.08)\" },\n  weightDoneText: { color: colors.primaryLight, fontSize: 12, fontWeight: \"900\" },\n  weightHistoryList: { gap: 6, paddingTop: 3 },\n  weightHistoryTitle: { color: colors.textMuted, fontSize: 11, fontWeight: \"900\", textTransform: \"uppercase\" },\n  weightHistoryRow: { minHeight: 42, flexDirection: \"row\", alignItems: \"center\", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: \"rgba(255,255,255,0.10)\", backgroundColor: \"rgba(255,255,255,0.045)\" },\n  weightHistoryValue: { color: colors.textMain, fontSize: 13, fontWeight: \"900\" },\n  weightHistoryDate: { color: colors.textMuted, fontSize: 10.5, fontWeight: \"700\", marginTop: 1, textTransform: \"capitalize\" },\n  weightDeleteBtn: { width: 34, height: 34, borderRadius: 17, alignItems: \"center\", justifyContent: \"center\", borderWidth: 1, borderColor: \"rgba(255,94,94,0.28)\", backgroundColor: \"rgba(255,94,94,0.08)\" },\n  performanceHeader:",
      "weight history styles"
    );
    return s;
  });
}

function updateTraining() {
  edit("frontend/app/(tabs)/training.tsx", (s) => {
    s = replaceOnce(
      s,
      "\nfunction weekdayFromIso(dateIso: string) {",
      '\nfunction scheduledWorkoutButtonLabel(dateIso: string) {\n  const d = new Date(`${dateIso}T12:00:00`);\n  if (Number.isNaN(d.getTime())) return "Au planning";\n  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });\n  return `À ${day}`;\n}\n\nfunction weekdayFromIso(dateIso: string) {',
      "scheduled workout label"
    );
    s = s.replace("      id: `program-${program.id}-${weekIndex}-${day.day_index}`,", "      id: `prog:${program.id}:${weekIndex}:${day.day_index}`,");
    s = s.replace("  const [resumeRunnerAfterEdit, setResumeRunnerAfterEdit] = useState(false);\n", "");
    s = replaceRegex(
      s,
      /\n    if \(resumeRunnerAfterEdit && runnerWorkout\) \{[\s\S]*?\n    setResumeRunnerAfterEdit\(false\);\n/,
      "\n",
      "resume runner block"
    );
    s = s.replace(/^\s*setResumeRunnerAfterEdit\((?:false|true)\);\n/gm, "");
    s = replaceOnce(
      s,
      `  const startTodayWorkout = async (workout: Workout) => {
    if (startingToday) return;
    if (!workout.id.startsWith("prog:")) {
      startGuidedSession(workout);
      return;
    }`,
      `  const startTodayWorkout = async (workout: Workout, options: { forceToday?: boolean } = {}) => {
    if (startingToday) return;
    if (!workout.id.startsWith("prog:")) {
      startGuidedSession(options.forceToday ? { ...workout, date: today } : workout);
      return;
    }`,
      "start workout options"
    );
    s = s.replace("          date: workout.date || today,", "          date: options.forceToday ? today : workout.date || today,");
    s = replaceRegex(
      s,
      /\n  const programProgress = program\?\.weeks_total[\s\S]*?    : 0;/,
      "",
      "program progress variable"
    );
    s = replaceOnce(
      s,
      "  const isPlannedForToday = plannedTodayWorkout?.date === today;\n  const todayPlanLabel",
      '  const isPlannedForToday = plannedTodayWorkout?.date === today;\n  const scheduledCtaLabel = plannedTodayWorkout ? scheduledWorkoutButtonLabel(plannedTodayWorkout.date) : "Au planning";\n  const todayPlanLabel',
      "scheduled label const"
    );
    s = replaceOnce(
      s,
      `      <ImageBackground
        source={require("../../assets/images/fitai-hero-program-hd.png")}
        style={styles.trainingHero}
        imageStyle={styles.trainingHeroImage}
        resizeMode="cover"
      >`,
      "      <View style={styles.trainingHero}>",
      "program duplicate image"
    );
    s = replaceOnce(
      s,
      `          <View style={styles.heroProgress}>
            <Text style={styles.heroProgressValue}>{programProgress}%</Text>
            <Text style={styles.heroProgressLabel}>terminé</Text>
          </View>`,
      "",
      "program progress pill"
    );
    s = s.replace("          </View>\n\n        </View>", "          </View>\n        </View>");
    s = s.replace("      </ImageBackground>", "      </View>");
    s = replaceOnce(
      s,
      `                    : isPlannedForToday
                      ? "Programme prévu pour aujourd'hui"
                      : todayRelativeLabel}`,
      `                    : isPlannedForToday
                      ? "Programme prévu pour aujourd'hui"
                      : "Séance prévue dans ton programme"}`,
      "future workout status"
    );
    s = replaceOnce(
      s,
      `              <TouchableOpacity
                onPress={() => toggleTodayWorkoutCheck(plannedTodayWorkout)}
                activeOpacity={0.84}
                disabled={startingToday}
                style={[styles.todayCheckButton, plannedTodayWorkout.completed && styles.todayCheckButtonDone, startingToday && { opacity: 0.55 }]}
                testID="today-workout-toggle"
              >
                <Ionicons name={plannedTodayWorkout.completed ? "checkmark" : "ellipse-outline"} size={18} color={plannedTodayWorkout.completed ? "#102108" : colors.primaryLight} />
              </TouchableOpacity>`,
      `              {isPlannedForToday ? (
                <TouchableOpacity
                  onPress={() => toggleTodayWorkoutCheck(plannedTodayWorkout)}
                  activeOpacity={0.84}
                  disabled={startingToday}
                  style={[styles.todayCheckButton, plannedTodayWorkout.completed && styles.todayCheckButtonDone, startingToday && { opacity: 0.55 }]}
                  testID="today-workout-toggle"
                >
                  <Ionicons name={plannedTodayWorkout.completed ? "checkmark" : "ellipse-outline"} size={18} color={plannedTodayWorkout.completed ? "#102108" : colors.primaryLight} />
                </TouchableOpacity>
              ) : (
                <View style={styles.futureDayChip} testID="today-workout-scheduled-chip">
                  <Ionicons name="calendar-outline" size={13} color={colors.primaryLight} />
                  <Text style={styles.futureDayChipText}>{scheduledCtaLabel}</Text>
                </View>
              )}`,
      "today workout check only today"
    );
    s = replaceOnce(
      s,
      `              <TouchableOpacity
                onPress={() => startTodayWorkout(plannedTodayWorkout)}
                activeOpacity={0.86}
                disabled={startingToday}
                style={[styles.startTodayButton, startingToday && { opacity: 0.7 }]}
                testID="complete-workout-button"
              >
                <Ionicons name="play-circle" size={18} color="#102108" />
                <Text style={styles.startTodayText}>
                  {startingToday ? "Préparation..." : isPlannedForToday ? "Commencer ma séance du jour" : "Préparer cette séance"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => plannedTodayWorkout.id.startsWith("draft:") ? setProgramSetupOpen(true) : openEditor(plannedTodayWorkout)}
                style={styles.todayEditIconButton}
                testID="edit-today-workout"
              >
                <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
              </TouchableOpacity>`,
      `              {isPlannedForToday ? (
                <>
                  <TouchableOpacity
                    onPress={() => startTodayWorkout(plannedTodayWorkout)}
                    activeOpacity={0.86}
                    disabled={startingToday}
                    style={[styles.startTodayButton, startingToday && { opacity: 0.7 }]}
                    testID="complete-workout-button"
                  >
                    <Ionicons name="play-circle" size={18} color="#102108" />
                    <Text style={styles.startTodayText}>
                      {startingToday ? "Préparation..." : "Commencer ma séance du jour"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => plannedTodayWorkout.id.startsWith("draft:") ? setProgramSetupOpen(true) : openEditor(plannedTodayWorkout)}
                    style={styles.todayEditIconButton}
                    testID="edit-today-workout"
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.futureActionStack}>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/dashboard")}
                    activeOpacity={0.86}
                    style={[styles.startTodayButton, styles.futureReturnButton]}
                    testID="scheduled-return-home"
                  >
                    <Ionicons name="calendar-outline" size={17} color="#102108" />
                    <Text style={styles.startTodayText}>{scheduledCtaLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => startTodayWorkout(plannedTodayWorkout, { forceToday: true })}
                    activeOpacity={0.86}
                    disabled={startingToday}
                    style={[styles.advanceTodayButton, startingToday && { opacity: 0.7 }]}
                    testID="advance-workout-today"
                  >
                    <Ionicons name="play-skip-forward-outline" size={17} color={colors.primaryLight} />
                    <Text style={styles.advanceTodayText}>
                      {startingToday ? "Préparation..." : "Faire la séance aujourd'hui finalement"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}`,
      "future workout actions"
    );
    s = s.replace("  trainingHeroImage: { opacity: 0.96 },\n", "");
    s = s.replace(/  heroProgress: \{[^\n]*\},\n  heroProgressValue: \{[^\n]*\},\n  heroProgressLabel: \{[^\n]*\},\n/, "");
    s = s.replace(
      '  runnerIconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },',
      '  runnerIconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", marginTop: 8 },'
    );
    s = replaceOnce(
      s,
      "  todaySmallPillText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: \"900\" },\n  profileCompanionRow:",
      "  todaySmallPillText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: \"900\" },\n  futureDayChip: { minHeight: 34, flexDirection: \"row\", alignItems: \"center\", justifyContent: \"center\", gap: 5, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1, borderColor: \"rgba(182,255,63,0.24)\", backgroundColor: \"rgba(182,255,63,0.10)\" },\n  futureDayChipText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: \"900\", textTransform: \"capitalize\" },\n  profileCompanionRow:",
      "future day chip styles"
    );
    s = replaceOnce(
      s,
      "  startTodayText: { color: \"#102108\", fontSize: 13, fontWeight: \"900\" },\n  todayEditIconButton:",
      "  startTodayText: { color: \"#102108\", fontSize: 13, fontWeight: \"900\" },\n  futureActionStack: { flex: 1, gap: 8 },\n  futureReturnButton: { flex: 0, width: \"100%\" },\n  advanceTodayButton: { minHeight: 44, borderRadius: radius.full, borderWidth: 1, borderColor: \"rgba(182,255,63,0.28)\", backgroundColor: \"rgba(182,255,63,0.08)\", alignItems: \"center\", justifyContent: \"center\", flexDirection: \"row\", gap: 7 },\n  advanceTodayText: { color: colors.primaryLight, fontSize: 12.5, fontWeight: \"900\" },\n  todayEditIconButton:",
      "future action styles"
    );
    return s;
  });
}

function applyChanges() {
  updateBackend();
  updateProfile();
  updateUI();
  updateDashboard();
  updateChallenges();
  updateProgress();
  updateTraining();
  cleanupTemporaryFiles();
}

if (process.env.GITHUB_ACTIONS !== "true" && process.env.CODEX_FIX_TEST !== "1") {
  console.log("[codex] Skipping fix outside GitHub Actions.");
  process.exit(0);
}

try {
  applyChanges();
  if (process.env.CODEX_FIX_TEST === "1") {
    console.log("[codex] Direct fix test completed.");
    process.exit(0);
  }
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["add", "-A"]);
  const staged = cp.execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: repoRoot, encoding: "utf8" });
  if (!staged.trim()) {
    console.log("[codex] Fix already applied; no commit needed.");
    process.exit(0);
  }
  run("git", ["commit", "-m", "Fix workout flow and progress tracking"]);
  run("git", ["push", "origin", "HEAD:main"]);
} catch (error) {
  console.error("[codex] Could not apply direct app fixes.");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
