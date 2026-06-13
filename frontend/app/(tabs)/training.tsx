import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { Card, Button, SectionTitle, Stat } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Exercise = { name: string; sets: number; reps: string; rest_s: number; checked?: boolean };
type Workout = {
  id: string; date: string; title: string; focus: string; duration_min: number;
  exercises: Exercise[]; completed: boolean; session_type?: string;
};
type Activity = { date: string; steps: number; cardio_minutes: number; cardio_type?: string };
type LibExercise = { id: string; name: string; category: string; equipment: string };
type SessionTypeDef = { label: string; reps: string; sets: number; rest_s: number; desc: string };
type SessionTypes = Record<string, SessionTypeDef>;
type Perf = { id: string; exercise_name: string; weight_kg: number; reps: number; sets: number; est_1rm: number; created_at: string };

const SESSION_KEYS = ["volume", "puissance", "force"] as const;
type SessionKey = typeof SESSION_KEYS[number];
type TrainingTab = "today" | "calendar" | "history";

// Color code per session_type (block periodization legend)
const SESSION_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  volume: { bg: "#DCEAFE", fg: "#1E4FA8", border: "#7AAEEF" },      // bleu
  force: { bg: "#FBDDDB", fg: "#A12A22", border: "#E58880" },       // rouge
  puissance: { bg: "#FCE3CB", fg: "#A85B0F", border: "#F0A861" },   // orange
  deload: { bg: "#E6E6DF", fg: "#666661", border: "#BFBFB7" },      // gris (déload)
};

type CalendarDay = {
  id: string; session_type: string; completed: boolean; focus: string; exercises_count: number;
};

// Rest timer defaults per session_type
const REST_DEFAULTS: Record<string, number> = {
  force: 240,      // 4 min
  puissance: 180,  // 3 min
  volume: 75,      // 1 min 15
  endurance: 45,
};

export default function Training() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<TrainingTab>("today");
  const [week, setWeek] = useState<Workout[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [library, setLibrary] = useState<LibExercise[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionTypes>({});
  const [showActivity, setShowActivity] = useState(false);
  const [steps, setSteps] = useState("");
  const [cardioMin, setCardioMin] = useState("");
  const [cardioType, setCardioType] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateType, setGenerateType] = useState<SessionKey>("volume");
  const [cycleWeeks, setCycleWeeks] = useState<number>(4);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editWorkout, setEditWorkout] = useState<Workout | null>(null);

  const [perfOpen, setPerfOpen] = useState(false);
  const [perfEx, setPerfEx] = useState<{ workout: Workout; exercise: Exercise } | null>(null);
  const [perfWeight, setPerfWeight] = useState("");
  const [perfReps, setPerfReps] = useState("");
  const [perfHistory, setPerfHistory] = useState<Perf[]>([]);

  // Calendar / history state
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [calDays, setCalDays] = useState<Record<string, CalendarDay>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<Workout[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState<string | null>(null);

  // Rest timer state
  const [restTotal, setRestTotal] = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restPerExercise, setRestPerExercise] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const [w, a, lib] = await Promise.all([
        api<Workout[]>("/workouts/week"),
        api<Activity>(`/activity?date=${today}`),
        api<{ exercises: LibExercise[]; session_types: SessionTypes }>("/exercises/library"),
      ]);
      setWeek(w);
      setActivity(a);
      setSteps(String(a.steps || ""));
      setCardioMin(String(a.cardio_minutes || ""));
      setCardioType(a.cardio_type || "");
      setLibrary(lib.exercises);
      setSessionTypes(lib.session_types);
    } catch (e) {
      console.warn("training load", e);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = async () => {
    setGenerating(true);
    try {
      await api(`/workouts/generate?session_type=${generateType}`, { method: "POST" });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const completeWorkout = async (id: string) => {
    await api(`/workouts/${id}/complete`, { method: "POST" });
    await load();
    if (tab === "calendar") loadCalendar(calMonth);
  };

  // ---- Cycle / Calendar / History ----

  const generateCycle = async () => {
    setGenerating(true);
    try {
      await api(`/workouts/cycle/generate?weeks=${cycleWeeks}`, { method: "POST" });
      await load();
      await loadCalendar(calMonth);
    } finally {
      setGenerating(false);
    }
  };

  const loadCalendar = useCallback(async (anchor: Date) => {
    setCalLoading(true);
    try {
      const monthStr = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
      const resp = await api<{ month: string; days: Record<string, CalendarDay> }>(`/workouts/calendar?month=${monthStr}`);
      setCalDays(resp.days || {});
    } catch {
      setCalDays({});
    } finally {
      setCalLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await api<Workout[]>(`/workouts/history?limit=40`);
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "calendar") loadCalendar(calMonth);
    if (tab === "history") loadHistory();
  }, [tab, calMonth, loadCalendar, loadHistory]);

  // ---- Rest Timer ----
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  const beep = useCallback(() => {
    try {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 600);
      } else if (Platform.OS === "web" && typeof window !== "undefined") {
        // Web fallback : synthetize a short beep via Web Audio API
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = 880;
          gain.gain.value = 0.2;
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.18);
          setTimeout(() => ctx.close(), 300);
        }
      }
    } catch {}
  }, []);

  const startRestTimer = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    finishedRef.current = false;
    setRestTotal(seconds);
    setRestRemaining(seconds);
    setRestRunning(true);
    timerIntervalRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          if (!finishedRef.current) {
            finishedRef.current = true;
            beep();
          }
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setRestRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [beep]);

  const stopRestTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setRestRunning(false);
    setRestRemaining(0);
    setRestTotal(0);
  }, []);

  const adjustRest = useCallback((delta: number) => {
    setRestRemaining((prev) => Math.max(0, prev + delta));
    setRestTotal((prev) => Math.max(prev + delta, prev));
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Auto rest duration for an exercise based on session type + manual override
  const getRestForExercise = useCallback((exName: string, sessionType?: string) => {
    if (restPerExercise[exName]) return restPerExercise[exName];
    const st = (sessionType || "volume").toLowerCase();
    return REST_DEFAULTS[st] ?? 60;
  }, [restPerExercise]);

  const saveActivity = async () => {
    await api("/activity", {
      method: "POST",
      body: {
        date: today,
        steps: parseInt(steps || "0", 10),
        cardio_minutes: parseInt(cardioMin || "0", 10),
        cardio_type: cardioType || null,
      },
    });
    setShowActivity(false);
    await load();
  };

  const openEditor = (w: Workout) => {
    setEditWorkout({ ...w, exercises: w.exercises.map((e) => ({ ...e, checked: e.checked !== false })) });
    setEditorOpen(true);
  };

  const applySessionTypeToEditor = (key: SessionKey) => {
    if (!editWorkout) return;
    const st = sessionTypes[key];
    if (!st) return;
    setEditWorkout({
      ...editWorkout,
      session_type: key,
      exercises: editWorkout.exercises.map((e) => ({
        ...e,
        sets: st.sets,
        reps: st.reps,
        rest_s: st.rest_s,
      })),
    });
  };

  const toggleExerciseInEditor = (name: string) => {
    if (!editWorkout) return;
    const exists = editWorkout.exercises.find((e) => e.name === name);
    if (exists) {
      setEditWorkout({
        ...editWorkout,
        exercises: editWorkout.exercises.map((e) =>
          e.name === name ? { ...e, checked: !(e.checked !== false) } : e
        ),
      });
    } else {
      const st = sessionTypes[(editWorkout.session_type as SessionKey) || "volume"] || sessionTypes.volume;
      setEditWorkout({
        ...editWorkout,
        exercises: [
          ...editWorkout.exercises,
          { name, sets: st?.sets || 4, reps: st?.reps || "10-12", rest_s: st?.rest_s || 60, checked: true },
        ],
      });
    }
  };

  const saveEditor = async () => {
    if (!editWorkout) return;
    const filtered = editWorkout.exercises.filter((e) => e.checked !== false);
    await api(`/workouts/${editWorkout.id}`, {
      method: "PUT",
      body: {
        session_type: editWorkout.session_type,
        exercises: filtered,
      },
    });
    setEditorOpen(false);
    setEditWorkout(null);
    await load();
  };

  const openPerf = async (w: Workout, ex: Exercise) => {
    setPerfEx({ workout: w, exercise: ex });
    setPerfWeight("");
    setPerfReps("");
    try {
      const r = await api<{ items: Perf[]; personal_bests: Perf[] }>(`/perf/recent?exercise=${encodeURIComponent(ex.name)}&limit=10`);
      setPerfHistory(r.items);
    } catch {
      setPerfHistory([]);
    }
    setPerfOpen(true);
  };

  const estimated1RM = useMemo(() => {
    const w = parseFloat(perfWeight || "0");
    const r = parseInt(perfReps || "0", 10);
    if (!w || !r) return 0;
    if (r === 1) return Math.round(w * 10) / 10;
    return Math.round(w * (1 + Math.min(r, 12) / 30) * 10) / 10;
  }, [perfWeight, perfReps]);

  const savePerf = async () => {
    if (!perfEx) return;
    const w = parseFloat(perfWeight || "0");
    const r = parseInt(perfReps || "0", 10);
    if (!w || !r) return;
    await api(`/workouts/${perfEx.workout.id}/perf`, {
      method: "POST",
      body: {
        workout_id: perfEx.workout.id,
        exercise_name: perfEx.exercise.name,
        weight_kg: w,
        reps: r,
        sets: 1,
      },
    });
    // refresh history
    try {
      const r2 = await api<{ items: Perf[] }>(`/perf/recent?exercise=${encodeURIComponent(perfEx.exercise.name)}&limit=10`);
      setPerfHistory(r2.items);
    } catch {}
    setPerfWeight("");
    setPerfReps("");
    // Auto start rest timer based on session type / saved override
    const restSec = getRestForExercise(perfEx.exercise.name, perfEx.workout.session_type);
    startRestTimer(restSec);
  };

  const todayWorkout = week.find((w) => w.date === today);
  const todayExercises = todayWorkout?.exercises.filter((e) => e.checked !== false) || [];

  // Library grouped by category, used in editor
  const libByCategory = useMemo(() => {
    const out: Record<string, LibExercise[]> = {};
    library.forEach((e) => {
      out[e.category] = out[e.category] || [];
      out[e.category].push(e);
    });
    return out;
  }, [library]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="training-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Programme</Text>
        <Text style={styles.title}>Ton entraînement</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("today")} style={[styles.tabChip, tab === "today" && styles.tabChipActive]} testID="training-tab-today">
          <Text style={[styles.tabText, tab === "today" && styles.tabTextActive]}>Aujourd&apos;hui</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("calendar")} style={[styles.tabChip, tab === "calendar" && styles.tabChipActive]} testID="training-tab-calendar">
          <Text style={[styles.tabText, tab === "calendar" && styles.tabTextActive]}>Calendrier</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("history")} style={[styles.tabChip, tab === "history" && styles.tabChipActive]} testID="training-tab-history">
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Historique</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "today" && (
          <>
        {/* Activity card */}
        <Card testID="activity-card">
          <SectionTitle title="Activité du jour" action={
            <TouchableOpacity onPress={() => setShowActivity(true)} testID="activity-edit-button">
              <Text style={[typography.small, { color: colors.primary, fontWeight: "600" }]}>
                {activity?.steps || activity?.cardio_minutes ? "Modifier" : "Saisir"}
              </Text>
            </TouchableOpacity>
          } />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Pas" value={(activity?.steps || 0).toLocaleString("fr-FR")} testID="training-steps" />
            <Stat label="Cardio" value={activity?.cardio_minutes || 0} unit="min" align="center" testID="training-cardio-min" />
            <Stat label="Type" value={activity?.cardio_type || "—"} align="center" />
          </View>
        </Card>

        {/* Today's workout */}
        {todayWorkout ? (
          <Card testID="today-workout-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={typography.caption}>Séance du jour</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TypeChip type={(todayWorkout.session_type as SessionKey) || "volume"} compact />
                <TouchableOpacity onPress={() => openEditor(todayWorkout)} style={styles.editBtn} testID="edit-today-workout">
                  <Ionicons name="create-outline" size={14} color={colors.primary} />
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Éditer</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
              <View style={styles.focusBadge}>
                <Ionicons name="barbell" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h3]}>{todayWorkout.focus}</Text>
                <Text style={typography.small}>{todayWorkout.duration_min} min · {todayExercises.length} exercices</Text>
              </View>
            </View>
            {todayExercises.map((ex, i) => (
              <TouchableOpacity key={`${ex.name}-${i}`} style={styles.exerciseRow} onPress={() => openPerf(todayWorkout, ex)} testID={`exercise-${i}`} activeOpacity={0.7}>
                <View style={styles.exerciseNum}>
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: "600" }]}>{ex.name}</Text>
                  <Text style={typography.small}>{ex.sets} × {ex.reps} · repos {ex.rest_s}s</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))}
            <Button
              title={todayWorkout.completed ? "Séance terminée ✓" : "Marquer comme terminée"}
              variant={todayWorkout.completed ? "secondary" : "primary"}
              onPress={() => !todayWorkout.completed && completeWorkout(todayWorkout.id)}
              disabled={todayWorkout.completed}
              testID="complete-workout-button"
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : (
          <Card>
            <SectionTitle title="Aucune séance" />
            <Text style={typography.small}>Choisis ton type de séance et génère ton plan.</Text>
            <SessionTypeSelector value={generateType} onChange={setGenerateType} sessionTypes={sessionTypes} />
            <Button title="Générer mon programme" onPress={generate} loading={generating} style={{ marginTop: spacing.md }} testID="generate-button" />
          </Card>
        )}

        {/* Generate options always visible */}
        {todayWorkout && (
          <Card testID="generate-card">
            <SectionTitle title="Régénérer la semaine" />
            <SessionTypeSelector value={generateType} onChange={setGenerateType} sessionTypes={sessionTypes} />
            <Button title="Régénérer 7 jours" variant="ghost" onPress={generate} loading={generating} style={{ marginTop: spacing.md }} testID="regenerate-button" />
          </Card>
        )}

        {/* Week plan */}
        <SectionTitle title="Cette semaine" />
        <View style={{ gap: spacing.sm }}>
          {week.length === 0 ? (
            <Text style={typography.small}>Pas encore de programme.</Text>
          ) : week.map((w) => {
            const exCount = w.exercises.filter((e) => e.checked !== false).length;
            return (
              <TouchableOpacity key={w.id} style={[styles.weekRow, w.date === today && styles.weekRowToday]} onPress={() => openEditor(w)} testID={`week-${w.date}`} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.caption]}>
                    {new Date(w.date).toLocaleDateString("fr-FR", { weekday: "long" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: 2 }]}>{w.focus}</Text>
                  <Text style={typography.small}>{w.duration_min} min · {exCount} exercices</Text>
                </View>
                <TypeChip type={(w.session_type as SessionKey) || "volume"} compact />
                <View style={[styles.statusDot, { backgroundColor: w.completed ? colors.primary : colors.border, marginLeft: 8 }]} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: spacing.xxl }} />
          </>
        )}

        {tab === "calendar" && (
          <>
            <Card testID="cycle-generator-card">
              <SectionTitle title="Cycle de périodisation" />
              <Text style={[typography.small, { marginBottom: spacing.sm }]}>
                Volume × Volume × Force × Puissance. Cycle paramétrable de 1 à 8 semaines.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.sm }}>
                {[2, 4, 6, 8].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setCycleWeeks(n)}
                    style={[styles.cycleChip, cycleWeeks === n && styles.cycleChipOn]}
                    testID={`cycle-${n}w`}
                  >
                    <Text style={[typography.small, { fontWeight: "700", color: cycleWeeks === n ? colors.primary : colors.textSecondary }]}>
                      {n} sem.
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Button
                title={`Générer ${cycleWeeks} sem. de cycle`}
                loading={generating}
                onPress={generateCycle}
                icon={<Ionicons name="layers-outline" size={16} color="#fff" />}
                testID="cycle-generate-btn"
              />
            </Card>

            <SessionLegend />

            <CalendarTrainingView
              monthDate={calMonth}
              days={calDays}
              loading={calLoading}
              onPrev={() => setCalMonth(addMonths(calMonth, -1))}
              onNext={() => setCalMonth(addMonths(calMonth, 1))}
            />
          </>
        )}

        {tab === "history" && (
          <>
            <SectionTitle title="Historique des séances" />
            {historyLoading ? (
              <Text style={typography.small}>Chargement...</Text>
            ) : historyItems.length === 0 ? (
              <Card>
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                  Aucune séance terminée pour le moment.
                </Text>
                <Text style={[typography.small, { marginTop: 4 }]}>
                  Termine une séance pour la voir ici.
                </Text>
              </Card>
            ) : (
              historyItems.map((w) => {
                const isOpen = historyExpanded === w.id;
                return (
                  <Card key={w.id} testID={`history-${w.id}`} style={{ marginBottom: 0 }}>
                    <TouchableOpacity onPress={() => setHistoryExpanded(isOpen ? null : w.id)} activeOpacity={0.7}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <View style={[styles.histDot, { backgroundColor: SESSION_COLOR[w.session_type || "volume"]?.fg || colors.primary }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: "700" }]}>{w.focus || w.title}</Text>
                          <Text style={typography.small}>
                            {new Date(w.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} · {w.exercises.length} exercices · {w.duration_min} min
                          </Text>
                        </View>
                        <TypeChip type={(w.session_type as SessionKey) || "volume"} compact />
                        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={{ marginTop: spacing.sm, gap: 4 }}>
                        {w.exercises.map((e, idx) => (
                          <Text key={`${e.name}-${idx}`} style={typography.small}>
                            • {e.name} — {e.sets} × {e.reps}
                          </Text>
                        ))}
                      </View>
                    )}
                  </Card>
                );
              })
            )}
            <View style={{ height: spacing.xxl }} />
          </>
        )}
      </ScrollView>

      {/* Rest Timer Overlay */}
      {(restRunning || restRemaining > 0) && (
        <View style={styles.timerOverlay} testID="rest-timer-overlay">
          <View style={styles.timerCard}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Repos</Text>
            <Text style={styles.timerBig}>
              {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}
            </Text>
            <View style={styles.timerProgressTrack}>
              <View style={[styles.timerProgressFill, { width: `${restTotal > 0 ? Math.min(100, (1 - restRemaining / restTotal) * 100) : 0}%` }]} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
              <TouchableOpacity onPress={() => adjustRest(-15)} style={styles.timerBtn} testID="timer-minus">
                <Text style={styles.timerBtnTxt}>-15s</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustRest(15)} style={styles.timerBtn} testID="timer-plus">
                <Text style={styles.timerBtnTxt}>+15s</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={stopRestTimer} style={[styles.timerBtn, { backgroundColor: colors.alert }]} testID="timer-stop">
                <Text style={[styles.timerBtnTxt, { color: "#fff" }]}>Passer</Text>
              </TouchableOpacity>
            </View>
            {perfEx && (
              <TouchableOpacity
                onPress={() => {
                  // memorize this custom duration for the current exercise
                  setRestPerExercise((prev) => ({ ...prev, [perfEx.exercise.name]: restTotal }));
                }}
                style={styles.timerSaveCfg}
                testID="timer-save-default"
              >
                <Ionicons name="bookmark-outline" size={12} color={colors.primary} />
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700", fontSize: 11 }]}>
                  Mémoriser {Math.floor(restTotal/60)}:{String(restTotal % 60).padStart(2, "0")} pour {perfEx.exercise.name.slice(0, 20)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Activity modal */}
      <Modal visible={showActivity} transparent animationType="slide" onRequestClose={() => setShowActivity(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Activité du jour</Text>

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Pas</Text>
            <TextInput value={steps} onChangeText={(t) => setSteps(t.replace(/[^0-9]/g, ""))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} style={styles.input} testID="activity-steps-input" />

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Cardio (minutes)</Text>
            <TextInput value={cardioMin} onChangeText={(t) => setCardioMin(t.replace(/[^0-9]/g, ""))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} style={styles.input} testID="activity-cardio-input" />

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Type de cardio</Text>
            <TextInput value={cardioType} onChangeText={setCardioType} placeholder="Course, vélo, natation..." placeholderTextColor={colors.textMuted} style={styles.input} testID="activity-cardio-type-input" />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setShowActivity(false)} style={{ flex: 1 }} testID="activity-cancel" />
              <Button title="Enregistrer" onPress={saveActivity} style={{ flex: 1.4 }} testID="activity-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Workout editor modal */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "92%" }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Éditer la séance</Text>
              <TouchableOpacity onPress={() => setEditorOpen(false)} testID="editor-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.small, { marginTop: 2 }]}>{editWorkout?.focus}</Text>

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Type de séance</Text>
            <View style={styles.typeRow}>
              {SESSION_KEYS.map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => applySessionTypeToEditor(k)}
                  style={[styles.typeBig, editWorkout?.session_type === k && styles.typeBigActive]}
                  testID={`editor-type-${k}`}
                >
                  <Text style={[styles.typeBigLabel, editWorkout?.session_type === k && { color: colors.primary }]}>
                    {sessionTypes[k]?.label || k}
                  </Text>
                  <Text style={styles.typeBigReps}>{sessionTypes[k]?.reps || ""} reps</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ paddingBottom: spacing.lg }}>
              {Object.entries(libByCategory).map(([cat, list]) => (
                <View key={cat} style={{ marginBottom: spacing.md }}>
                  <Text style={[typography.caption, { marginBottom: 8 }]}>{cat}</Text>
                  {list.map((ex) => {
                    const inWk = editWorkout?.exercises.find((e) => e.name === ex.name);
                    const isOn = !!inWk && inWk.checked !== false;
                    return (
                      <TouchableOpacity
                        key={ex.id}
                        onPress={() => toggleExerciseInEditor(ex.name)}
                        style={[styles.exCheck, isOn && styles.exCheckOn]}
                        testID={`editor-ex-${ex.id}`}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                          {isOn && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: isOn ? "700" : "500" }]}>{ex.name}</Text>
                          <Text style={typography.small}>{ex.equipment}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <Button title="Annuler" variant="secondary" onPress={() => setEditorOpen(false)} style={{ flex: 1 }} testID="editor-cancel" />
              <Button title="Enregistrer" onPress={saveEditor} style={{ flex: 1.4 }} testID="editor-save" />
            </View>
            <View style={{ height: spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Performance log modal */}
      <Modal visible={perfOpen} transparent animationType="slide" onRequestClose={() => setPerfOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={styles.modalTitle}>{perfEx?.exercise.name}</Text>
                <Text style={typography.small}>{perfEx?.exercise.sets} × {perfEx?.exercise.reps}</Text>
              </View>
              <TouchableOpacity onPress={() => setPerfOpen(false)} testID="perf-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={typography.caption}>Charge (kg)</Text>
                <TextInput
                  value={perfWeight}
                  onChangeText={(t) => setPerfWeight(t.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  testID="perf-weight-input"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.caption}>Reps réalisées</Text>
                <TextInput
                  value={perfReps}
                  onChangeText={(t) => setPerfReps(t.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  testID="perf-reps-input"
                />
              </View>
            </View>

            <View style={styles.rmBox} testID="perf-1rm-box">
              <View>
                <Text style={typography.caption}>1RM estimée (Epley)</Text>
                <Text style={styles.rmValue}>{estimated1RM > 0 ? `${estimated1RM} kg` : "—"}</Text>
              </View>
              <Ionicons name="flash" size={22} color={colors.primary} />
            </View>

            <Button title="Enregistrer la perf" onPress={savePerf} style={{ marginTop: spacing.md }} testID="perf-save" />

            <Text style={[typography.caption, { marginTop: spacing.lg }]}>Historique</Text>
            {perfHistory.length === 0 ? (
              <Text style={[typography.small, { marginTop: spacing.sm }]}>Aucune perf enregistrée. Tu démarres une nouvelle série.</Text>
            ) : (
              perfHistory.slice(0, 8).map((p) => (
                <View key={p.id} style={styles.perfRow}>
                  <Text style={typography.small}>
                    {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", flex: 1, textAlign: "center" }]}>
                    {p.weight_kg} kg × {p.reps}
                  </Text>
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>
                    1RM {p.est_1rm} kg
                  </Text>
                </View>
              ))
            )}
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TypeChip({ type, compact }: { type: SessionKey; compact?: boolean }) {
  const palette: Record<SessionKey, { bg: string; fg: string; label: string }> = {
    volume: { bg: "#E8F5E9", fg: "#2D7C3E", label: "Volume" },
    puissance: { bg: "#FEF3C7", fg: "#92400E", label: "Puissance" },
    force: { bg: "#FEE2E2", fg: "#B91C1C", label: "Force" },
  };
  const p = palette[type] || palette.volume;
  return (
    <View style={[styles.chip, { backgroundColor: p.bg, paddingHorizontal: compact ? 8 : 12, paddingVertical: compact ? 3 : 6 }]}>
      <Text style={[typography.small, { color: p.fg, fontWeight: "700", fontSize: compact ? 11 : 13 }]}>
        {p.label}
      </Text>
    </View>
  );
}

function SessionTypeSelector({
  value, onChange, sessionTypes,
}: { value: SessionKey; onChange: (k: SessionKey) => void; sessionTypes: SessionTypes }) {
  return (
    <View style={styles.typeRow}>
      {SESSION_KEYS.map((k) => (
        <TouchableOpacity
          key={k}
          onPress={() => onChange(k)}
          style={[styles.typeBig, value === k && styles.typeBigActive]}
          testID={`session-type-${k}`}
        >
          <Text style={[styles.typeBigLabel, value === k && { color: colors.primary }]}>
            {sessionTypes[k]?.label || k}
          </Text>
          <Text style={styles.typeBigReps}>{sessionTypes[k]?.reps || ""} reps</Text>
          <Text style={styles.typeBigDesc}>{sessionTypes[k]?.desc || ""}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6, marginTop: 4 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  focusBadge: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  exerciseRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseNum: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  weekRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  weekRowToday: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  statusDot: { width: 12, height: 12, borderRadius: radius.full },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textMain, marginTop: 6 },
  chip: { borderRadius: radius.full, alignSelf: "flex-start" },
  editBtn: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primaryPale, borderRadius: radius.full },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeBig: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeBigActive: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  typeBigLabel: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  typeBigReps: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  typeBigDesc: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 14 },
  exCheck: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, marginBottom: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  exCheckOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rmBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primaryPale, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  rmValue: { fontSize: 24, fontWeight: "800", color: colors.primary, marginTop: 2 },
  perfRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  // Tabs
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tabChip: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  tabTextActive: { color: colors.surface },
  // Cycle
  cycleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  cycleChipOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  // History
  histDot: { width: 8, height: 8, borderRadius: 4 },
  // Timer overlay
  timerOverlay: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, alignItems: "center", padding: spacing.md, zIndex: 100, elevation: 10 },
  timerCard: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg, alignItems: "center", borderWidth: 2, borderColor: colors.primary, width: "92%", maxWidth: 360, gap: 4 },
  timerBig: { fontSize: 40, fontWeight: "800", color: colors.primary, letterSpacing: -1 },
  timerProgressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, width: "100%", overflow: "hidden" },
  timerProgressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  timerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: colors.primary },
  timerBtnTxt: { fontSize: 13, fontWeight: "700", color: colors.primary },
  timerSaveCfg: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  // Calendar
  calWrap: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  calNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: colors.background },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  calCellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  calCellInner: { width: "85%", aspectRatio: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  calToday: { borderColor: colors.textMain, borderWidth: 2 },
  legendRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center", marginVertical: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});

// ----- Helpers / sub-components -----

function addMonths(d: Date, n: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

const MONTH_LABELS = ["Janv", "Févr", "Mars", "Avril", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function SessionLegend() {
  return (
    <View style={styles.legendRow} testID="session-legend">
      {Object.entries(SESSION_COLOR).map(([key, c]) => (
        <View key={key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: c.fg }]} />
          <Text style={[typography.small, { fontWeight: "700", fontSize: 11, color: colors.textSecondary, textTransform: "capitalize" }]}>
            {key}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CalendarTrainingView({
  monthDate, days, loading, onPrev, onNext,
}: {
  monthDate: Date;
  days: Record<string, CalendarDay>;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  return (
    <View style={styles.calWrap} testID="training-calendar">
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={onPrev} style={styles.calNavBtn} testID="cal-prev">
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[typography.body, { fontWeight: "700", textTransform: "capitalize" }]}>
          {MONTH_LABELS[month]} {year}{loading ? " ..." : ""}
        </Text>
        <TouchableOpacity onPress={onNext} style={styles.calNavBtn} testID="cal-next">
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text key={`${d}-${i}`} style={[typography.small, { fontSize: 11, textAlign: "center", flex: 1, color: colors.textMuted, fontWeight: "700" }]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={idx} style={styles.calCellEmpty} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = days[iso];
          const palette = info ? SESSION_COLOR[info.session_type] || SESSION_COLOR.volume : null;
          const isToday = iso === todayISO;
          return (
            <View key={idx} style={styles.calCell}>
              <View
                style={[
                  styles.calCellInner,
                  {
                    backgroundColor: palette ? palette.bg : colors.background,
                    borderColor: palette ? palette.border : colors.border,
                  },
                  isToday && styles.calToday,
                ]}
                testID={`cal-day-${iso}`}
              >
                <Text style={{ fontSize: 13, fontWeight: palette ? "800" : "500", color: palette ? palette.fg : colors.textMuted }}>
                  {day}
                </Text>
                {info?.completed && (
                  <Ionicons name="checkmark" size={12} color={palette?.fg || colors.primary} style={{ position: "absolute", bottom: 2, right: 2 }} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
