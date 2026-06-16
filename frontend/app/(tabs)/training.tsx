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
import { useAuth } from "@/src/auth";
import { GlassCard, ScreenBg, Button, Stat } from "@/src/components/UI";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { colors, spacing, typography, radius } from "@/src/theme";

const BG_URI = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=90";

type Exercise = { name: string; sets: number; reps: string; rest_s: number; checked?: boolean; is_recommended?: boolean };
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

type ProgramDay = {
  day_index: number;
  focus: string;
  exercises: Exercise[];
};
type ProgramWeek = {
  week_index: number;
  session_type: string;
  days: ProgramDay[];
};
type TrainingProgram = {
  id: string;
  name: string;
  goal_label: string;
  weeks_total: number;
  frequency: number;
  split: "ppl" | "fullbody" | "split";
  cycle_pattern: string[];
  started_at: string;
  active: boolean;
  current_week: number;
  weeks: ProgramWeek[];
};

// Rest timer defaults per session_type
const REST_DEFAULTS: Record<string, number> = {
  force: 240,      // 4 min
  puissance: 180,  // 3 min
  volume: 75,      // 1 min 15
  endurance: 45,
};

// Phase 5 — C4: red-highlight AI-recommended exercises per session type.
// Heuristic based on standard strength science: big compounds for Force,
// explosive/plyo for Puissance, hypertrophy compounds + isolations for Volume.
const RECO_KEYWORDS: Record<string, string[]> = {
  force: [
    "squat", "soulevé", "deadlift", "développé couché", "bench", "rowing barre",
    "tractions lestées", "développé militaire barre", "front squat", "rdl",
  ],
  puissance: [
    "épaulé", "arraché", "power clean", "snatch", "saut", "plyo", "kettlebell swing",
    "push press", "med ball", "burpee", "explosif", "jumping",
  ],
  volume: [
    "développé couché", "développé incliné", "développé haltères", "tractions",
    "rowing", "leg press", "hack squat", "curl", "extension", "écarté",
    "élévations", "leg curl", "leg extension", "poulie",
  ],
};

export function isRecommendedFor(exerciseName: string, sessionType?: string): boolean {
  if (!exerciseName || !sessionType) return false;
  const lower = exerciseName.toLowerCase();
  const keys = RECO_KEYWORDS[sessionType.toLowerCase()] || [];
  return keys.some((k) => lower.includes(k));
}

export default function Training() {
  const { user } = useAuth();
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

  // Program state
  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [programSetupOpen, setProgramSetupOpen] = useState(false);
  const [setupWeeks, setSetupWeeks] = useState(8);
  const [setupFreq, setSetupFreq] = useState<3 | 5 | 7>(5);
  const [setupSplit, setSetupSplit] = useState<"ppl" | "fullbody" | "split">("ppl");
  const [setupGoal, setSetupGoal] = useState("Hypertrophie");
  const [setupBlocks, setSetupBlocks] = useState<{ volume: number; puissance: number; force: number }>({ volume: 1, puissance: 1, force: 1 });
  const [creatingProgram, setCreatingProgram] = useState(false);

  // Travel mode
  const [travelOpen, setTravelOpen] = useState(false);
  const [travelDays, setTravelDays] = useState(7);
  const [travelBusy, setTravelBusy] = useState(false);

  // Share Card (after session complete)
  const [shareOpen, setShareOpen] = useState(false);
  const [shareData, setShareData] = useState<any>(null);

  // AI exercise add
  const [aiExModalOpen, setAiExModalOpen] = useState(false);
  const [aiExInput, setAiExInput] = useState("");
  const [aiExLoading, setAiExLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, a, lib, prog] = await Promise.all([
        api<Workout[]>("/workouts/week"),
        api<Activity>(`/activity?date=${today}`),
        api<{ exercises: LibExercise[]; session_types: SessionTypes }>("/exercises/library"),
        api<{ program: TrainingProgram | null }>("/program/current").catch(() => ({ program: null })),
      ]);
      setWeek(w);
      setActivity(a);
      setSteps(String(a.steps || ""));
      setCardioMin(String(a.cardio_minutes || ""));
      setCardioType(a.cardio_type || "");
      setLibrary(lib.exercises);
      setSessionTypes(lib.session_types);
      setProgram(prog.program || null);
      if (prog.program && expandedWeek === null) {
        setExpandedWeek(prog.program.current_week);
      }
    } catch (e) {
      console.warn("training load", e);
    }
  }, [today, expandedWeek]);

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
    // Build share card data
    try {
      const w = week.find((x) => x.id === id);
      const focus = w?.focus || w?.title || "Séance";
      const sType = (w?.session_type || "").toString();
      const sLabel = sType ? ` · ${sType.charAt(0).toUpperCase() + sType.slice(1)}` : "";
      // Phase 5: fetch points/strength to enrich the share card
      let evolution: 1 | 2 | 3 = 1;
      let strength_value = 0.4;
      let points_today = 0;
      try {
        const ps = await api<{ evolution: 1 | 2 | 3; points_in_level: number; level_span: number; points_today: number }>("/points/summary");
        evolution = (ps.evolution as 1 | 2 | 3) || 1;
        strength_value = ps.level_span > 0 ? Math.min(1, ps.points_in_level / ps.level_span) : 0.5;
        points_today = ps.points_today || 0;
      } catch {}
      setShareData({
        focus: `${focus}${sLabel}`,
        duration_min: w?.duration_min,
        evolution,
        strength_value,
        points_today,
      });
      setShareOpen(true);
    } catch (e) {
      console.warn("share data", e);
    }
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

  const openProgramDayEditor = (prog: TrainingProgram, weekIndex: number, dayIndex: number) => {
    const w = prog.weeks.find((x) => x.week_index === weekIndex);
    const d = w?.days.find((x) => x.day_index === dayIndex);
    if (!w || !d) return;
    // Reuse the existing workout editor by simulating a Workout structure with extra meta.
    setEditWorkout({
      id: `prog:${prog.id}:${weekIndex}:${dayIndex}`,
      date: "",
      title: `Sem. ${weekIndex} · ${d.focus}`,
      focus: d.focus,
      duration_min: 45,
      exercises: d.exercises.map((e) => ({ ...e, checked: e.checked !== false })),
      completed: false,
      session_type: w.session_type,
    });
    setEditorOpen(true);
  };

  const createProgram = async () => {
    setCreatingProgram(true);
    try {
      const created = await api<TrainingProgram>("/program/create", {
        method: "POST",
        body: {
          weeks: setupWeeks,
          frequency: setupFreq,
          split: setupSplit,
          goal_label: setupGoal,
          block_weeks: setupBlocks,
        },
      });
      setProgram(created);
      setExpandedWeek(1);
      setProgramSetupOpen(false);
    } catch {} finally {
      setCreatingProgram(false);
    }
  };

  const startTravelMode = async () => {
    setTravelBusy(true);
    try {
      await api("/program/travel-mode", { method: "POST", body: { days: travelDays, goal_label: "Maintien" } });
      const refreshed = await api<{ program: TrainingProgram | null }>("/program/current");
      setProgram(refreshed.program);
      setTravelOpen(false);
    } catch {} finally {
      setTravelBusy(false);
    }
  };

  const endTravelMode = async () => {
    setTravelBusy(true);
    try {
      await api("/program/resume", { method: "POST" });
      const refreshed = await api<{ program: TrainingProgram | null }>("/program/current");
      setProgram(refreshed.program);
    } catch {} finally {
      setTravelBusy(false);
    }
  };

  const addAiExercise = async () => {
    if (!aiExInput.trim() || !editWorkout) return;
    setAiExLoading(true);
    try {
      const ex = await api<{ name: string; category: string; recommended_reps: string; recommended_rest_s: number }>("/exercises/ai-add", {
        method: "POST",
        body: { description: aiExInput.trim() },
      });
      setEditWorkout({
        ...editWorkout,
        exercises: [
          ...editWorkout.exercises,
          { name: ex.name, sets: 3, reps: ex.recommended_reps || "10-12", rest_s: ex.recommended_rest_s || 60, checked: true },
        ],
      });
      setAiExInput("");
      setAiExModalOpen(false);
    } catch {
    } finally {
      setAiExLoading(false);
    }
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
    // Special path: editing a program day (id format: prog:<programId>:<weekIndex>:<dayIndex>)
    if (editWorkout.id.startsWith("prog:")) {
      const [, programId, wIdx, dIdx] = editWorkout.id.split(":");
      await api(`/program/${programId}/week/${wIdx}/day/${dIdx}`, {
        method: "PUT",
        body: { focus: editWorkout.focus, exercises: filtered },
      });
    } else {
      await api(`/workouts/${editWorkout.id}`, {
        method: "PUT",
        body: {
          session_type: editWorkout.session_type,
          exercises: filtered,
        },
      });
    }
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
    <ScreenBg uri={BG_URI}>
    <SafeAreaView style={{flex:1, backgroundColor:"transparent"}} edges={["top"]} testID="training-screen">
      <View style={styles.header}>
        <Text style={[typography.caption, {color:"rgba(255,255,255,0.6)"}]}>Programme</Text>
        <Text style={[styles.title, {color:"#fff", fontWeight:"800"}]}>Ton entraînement</Text>
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
        {/* Program summary card */}
        <ProgramSummaryCard
          program={program}
          onCreate={() => setProgramSetupOpen(true)}
          onTravel={() => setTravelOpen(true)}
          onEndTravel={endTravelMode}
          travelBusy={travelBusy}
        />

        {/* Activity card */}
        <GlassCard testID="activity-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Activité du jour</Text>
            <TouchableOpacity onPress={() => setShowActivity(true)} testID="activity-edit-button">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "600" }]}>
                {activity?.steps || activity?.cardio_minutes ? "Modifier" : "Saisir"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Pas" value={(activity?.steps || 0).toLocaleString("fr-FR")} testID="training-steps" />
            <Stat label="Cardio" value={activity?.cardio_minutes || 0} unit="min" align="center" testID="training-cardio-min" />
            <Stat label="Type" value={activity?.cardio_type || "—"} align="center" />
          </View>
        </GlassCard>

        {/* Today's workout */}
        {todayWorkout ? (
          <GlassCard testID="today-workout-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={[typography.caption, {color:"rgba(255,255,255,0.6)"}]}>Séance du jour</Text>
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
                <Text style={[typography.h3, {color:"#fff"}]}>{todayWorkout.focus}</Text>
                <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>{todayWorkout.duration_min} min · {todayExercises.length} exercices</Text>
              </View>
            </View>
            {todayExercises.map((ex, i) => {
              const reco = isRecommendedFor(ex.name, todayWorkout?.session_type);
              return (
                <TouchableOpacity key={`${ex.name}-${i}`} style={styles.exerciseRow} onPress={() => openPerf(todayWorkout, ex)} testID={`exercise-${i}`} activeOpacity={0.7}>
                  <View style={[styles.exerciseNum, reco && { backgroundColor: "#FBDDDB" }]}>
                    <Text style={[typography.small, { color: reco ? "#A12A22" : colors.primary, fontWeight: "700" }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={[typography.body, { fontWeight: "600", color: reco ? "#A12A22" : "#fff" }]}>{ex.name}</Text>
                      {reco && (
                        <View style={styles.recoBadge}>
                          <Ionicons name="flame" size={9} color="#A12A22" />
                          <Text style={styles.recoBadgeTxt}>RECO IA</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>{ex.sets} × {ex.reps} · repos {ex.rest_s}s</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={reco ? "#A12A22" : colors.primary} />
                </TouchableOpacity>
              );
            })}
            <Button
              title={todayWorkout.completed ? "Séance terminée ✓" : "Marquer comme terminée"}
              variant={todayWorkout.completed ? "secondary" : "primary"}
              onPress={() => !todayWorkout.completed && completeWorkout(todayWorkout.id)}
              disabled={todayWorkout.completed}
              testID="complete-workout-button"
              style={{ marginTop: spacing.md }}
            />
            {todayWorkout.completed && (
              <Button
                title="Partager ma performance"
                variant="primary"
                onPress={async () => {
                  try {
                    const focus = todayWorkout.focus || todayWorkout.title || "Séance";
                    const sType = (todayWorkout.session_type || "").toString();
                    const sLabel = sType ? ` · ${sType.charAt(0).toUpperCase() + sType.slice(1)}` : "";
                    let evolution: 1 | 2 | 3 = 1;
                    let strength_value = 0.4;
                    let points_today = 0;
                    try {
                      const ps = await api<{ evolution: 1 | 2 | 3; points_in_level: number; level_span: number; points_today: number }>("/points/summary");
                      evolution = (ps.evolution as 1 | 2 | 3) || 1;
                      strength_value = ps.level_span > 0 ? Math.min(1, ps.points_in_level / ps.level_span) : 0.5;
                      points_today = ps.points_today || 0;
                    } catch {}
                    setShareData({
                      focus: `${focus}${sLabel}`,
                      duration_min: todayWorkout.duration_min,
                      evolution,
                      strength_value,
                      points_today,
                    });
                    setShareOpen(true);
                  } catch (e) {
                    console.warn("share rebuild", e);
                  }
                }}
                icon={<Ionicons name="share-social-outline" size={16} color="#fff" />}
                testID="share-perf-button"
                style={{ marginTop: spacing.sm }}
              />
            )}
          </GlassCard>
        ) : !program ? (
          <GlassCard>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8}}>Pas encore de programme</Text>
            <Text style={[typography.small, { marginBottom: spacing.md, color:"rgba(255,255,255,0.6)" }]}>
              Configure ton programme : durée, fréquence et organisation des séances.
            </Text>
            <Button
              title="Créer mon programme"
              onPress={() => setProgramSetupOpen(true)}
              testID="create-program-button"
              icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
            />
          </GlassCard>
        ) : null}

        {/* My Program (weeks) */}
        {program && (
          <View testID="my-program-section">
            <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Mon programme</Text>
              <TouchableOpacity onPress={() => setProgramSetupOpen(true)} testID="reset-program">
                <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>Refaire</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: spacing.sm }}>
              {(program.weeks || []).map((w) => (
                <ProgramWeekCard
                  key={w.week_index}
                  week={w}
                  isExpanded={expandedWeek === w.week_index}
                  isCurrent={program.current_week === w.week_index}
                  onToggle={() => setExpandedWeek(expandedWeek === w.week_index ? null : w.week_index)}
                  onEditDay={(dayIndex) => openProgramDayEditor(program, w.week_index, dayIndex)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
          </>
        )}

        {tab === "calendar" && (
          <>
            <GlassCard testID="cycle-generator-card">
              <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8}}>Cycle de périodisation</Text>
              <Text style={[typography.small, { marginBottom: spacing.sm, color:"rgba(255,255,255,0.6)" }]}>
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
                    <Text style={[typography.small, { fontWeight: "700", color: cycleWeeks === n ? "#4ade80" : "rgba(255,255,255,0.6)" }]}>
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
            </GlassCard>

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
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8}}>Historique des séances</Text>
            {historyLoading ? (
              <Text style={typography.small}>Chargement...</Text>
            ) : historyItems.length === 0 ? (
              <GlassCard>
                <Text style={[typography.body, { color: "rgba(255,255,255,0.6)" }]}>
                  Aucune séance terminée pour le moment.
                </Text>
                <Text style={[typography.small, { marginTop: 4, color:"rgba(255,255,255,0.6)" }]}>
                  Termine une séance pour la voir ici.
                </Text>
              </GlassCard>
            ) : (
              historyItems.map((w) => {
                const isOpen = historyExpanded === w.id;
                return (
                  <GlassCard key={w.id} testID={`history-${w.id}`} style={{ marginBottom: 0 }}>
                    <TouchableOpacity onPress={() => setHistoryExpanded(isOpen ? null : w.id)} activeOpacity={0.7}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <View style={[styles.histDot, { backgroundColor: SESSION_COLOR[w.session_type || "volume"]?.fg || colors.primary }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: "700", color:"#fff" }]}>{w.focus || w.title}</Text>
                          <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>
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
                  </GlassCard>
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
      {/* Travel mode modal */}
      <Modal visible={travelOpen} transparent animationType="fade" onRequestClose={() => setTravelOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard} testID="travel-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Mode déplacement</Text>
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  100 % poids du corps. Ton programme normal sera mis en pause.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTravelOpen(false)} testID="travel-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.caption, { marginTop: spacing.md }]}>Durée du voyage</Text>
            <View style={styles.setupOptionRow}>
              {[5, 7, 10, 14, 21, 30].map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setTravelDays(d)}
                  style={[styles.setupOption, travelDays === d && styles.setupOptionOn, { minWidth: 60 }]}
                  testID={`travel-days-${d}`}
                >
                  <Text style={[styles.setupOptionLabel, travelDays === d && styles.setupOptionLabelOn]}>{d} j</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button
              title={travelBusy ? "Configuration..." : `Activer (${travelDays} jours)`}
              onPress={startTravelMode}
              loading={travelBusy}
              icon={<Ionicons name="airplane" size={16} color="#fff" />}
              style={{ marginTop: spacing.lg }}
              testID="travel-confirm"
            />
          </View>
        </View>
      </Modal>

      {/* Program setup modal */}
      <Modal visible={programSetupOpen} transparent animationType="slide" onRequestClose={() => setProgramSetupOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard} testID="program-setup-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Crée ton programme</Text>
              <TouchableOpacity onPress={() => setProgramSetupOpen(false)} testID="program-setup-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
              <Text style={[typography.caption, { marginTop: spacing.md }]}>Objectif</Text>
              <View style={styles.setupOptionRow}>
                {["Hypertrophie", "Force", "Perte de gras"].map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setSetupGoal(g)}
                    style={[styles.setupOption, setupGoal === g && styles.setupOptionOn]}
                    testID={`setup-goal-${g}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupGoal === g && styles.setupOptionLabelOn]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Fréquence (jours / semaine)</Text>
              <View style={styles.setupOptionRow}>
                {([3, 5, 7] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setSetupFreq(f)}
                    style={[styles.setupOption, setupFreq === f && styles.setupOptionOn]}
                    testID={`setup-freq-${f}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupFreq === f && styles.setupOptionLabelOn]}>{f}j</Text>
                    <Text style={styles.setupOptionSub}>
                      {f === 3 ? "Light" : f === 5 ? "Optimal" : "Intensif"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Organisation des séances</Text>
              <View style={styles.setupOptionRow}>
                {([
                  { v: "ppl" as const, label: "PPL", sub: "Push / Pull / Legs" },
                  { v: "fullbody" as const, label: "Full body", sub: "Tout le corps" },
                  { v: "split" as const, label: "Split", sub: "1 groupe / séance" },
                  { v: "home" as const, label: "À la maison", sub: "Poids du corps" },
                ]).map((o) => (
                  <TouchableOpacity
                    key={o.v}
                    onPress={() => setSetupSplit(o.v as any)}
                    style={[styles.setupOption, setupSplit === o.v && styles.setupOptionOn]}
                    testID={`setup-split-${o.v}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupSplit === o.v && styles.setupOptionLabelOn]}>{o.label}</Text>
                    <Text style={styles.setupOptionSub}>{o.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Durée du programme</Text>
              <View style={styles.setupOptionRow}>
                {[4, 8, 12, 16, 24].map((w) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setSetupWeeks(w)}
                    style={[styles.setupOption, setupWeeks === w && styles.setupOptionOn, { minWidth: 60 }]}
                    testID={`setup-weeks-${w}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupWeeks === w && styles.setupOptionLabelOn]}>{w} sem.</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Durée des blocs (Volume → Puissance → Force)</Text>
              {(["volume", "puissance", "force"] as const).map((block) => (
                <View key={block} style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 }}>
                  <View style={{ width: 88, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SESSION_COLOR[block]?.fg || colors.primary }} />
                    <Text style={[typography.small, { fontWeight: "700", textTransform: "capitalize" }]}>{block}</Text>
                  </View>
                  {[1, 2, 3].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setSetupBlocks({ ...setupBlocks, [block]: n })}
                      style={[styles.setupOption, setupBlocks[block] === n && styles.setupOptionOn, { flex: 1, minWidth: 50, paddingVertical: 8 }]}
                      testID={`setup-block-${block}-${n}`}
                    >
                      <Text style={[styles.setupOptionLabel, { fontSize: 12 }, setupBlocks[block] === n && styles.setupOptionLabelOn]}>
                        {n} sem.
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>

            <Button
              title={creatingProgram ? "Création..." : `Créer mon programme (${setupWeeks} sem.)`}
              onPress={createProgram}
              loading={creatingProgram}
              icon={<Ionicons name="rocket" size={16} color="#fff" />}
              style={{ marginTop: spacing.lg }}
              testID="program-setup-create"
            />
          </View>
        </View>
      </Modal>

      {/* AI exercise modal */}
      <Modal visible={aiExModalOpen} transparent animationType="fade" onRequestClose={() => setAiExModalOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard} testID="ai-exercise-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Ajouter un exercice via IA</Text>
                <Text style={[typography.small, { color: colors.textMuted }]}>
                  Décris l&apos;exercice (ex: &laquo; farmer carry haltères &raquo;).
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAiExModalOpen(false)} testID="ai-ex-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={aiExInput}
              onChangeText={setAiExInput}
              placeholder="Description de l'exercice"
              placeholderTextColor={colors.textMuted}
              style={{
                marginTop: spacing.md,
                padding: spacing.md,
                fontSize: 15,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                backgroundColor: colors.background,
                color: colors.textMain,
              }}
              testID="ai-ex-input"
              autoCorrect={false}
            />
            <Button
              title={aiExLoading ? "L'IA réfléchit..." : "Ajouter via IA"}
              onPress={addAiExercise}
              loading={aiExLoading}
              disabled={!aiExInput.trim() || aiExLoading}
              icon={<Ionicons name="sparkles" size={16} color="#fff" />}
              style={{ marginTop: spacing.md }}
              testID="ai-ex-add"
            />
          </View>
        </View>
      </Modal>

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
              <TouchableOpacity
                onPress={() => { setAiExInput(""); setAiExModalOpen(true); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryPale, marginBottom: spacing.md }}
                testID="editor-add-ai"
              >
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>
                  Mon exercice n&apos;est pas listé · Ajouter via IA
                </Text>
              </TouchableOpacity>
              {Object.entries(libByCategory).map(([cat, list]) => (
                <View key={cat} style={{ marginBottom: spacing.md }}>
                  <Text style={[typography.caption, { marginBottom: 8 }]}>{cat}</Text>
                  {list.map((ex) => {
                    const inWk = editWorkout?.exercises.find((e) => e.name === ex.name);
                    const isOn = !!inWk && inWk.checked !== false;
                    const reco = isRecommendedFor(ex.name, editWorkout?.session_type);
                    return (
                      <TouchableOpacity
                        key={ex.id}
                        onPress={() => toggleExerciseInEditor(ex.name)}
                        style={[styles.exCheck, isOn && styles.exCheckOn, reco && !isOn && styles.exCheckReco]}
                        testID={`editor-ex-${ex.id}`}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, isOn && styles.checkboxOn, reco && !isOn && { borderColor: "#A12A22" }]}>
                          {isOn && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Text style={[typography.body, { fontWeight: isOn ? "700" : reco ? "700" : "500", color: reco ? "#A12A22" : colors.textMain }]}>
                              {ex.name}
                            </Text>
                            {reco && (
                              <View style={styles.recoBadge}>
                                <Ionicons name="flame" size={9} color="#A12A22" />
                                <Text style={styles.recoBadgeTxt}>RECO IA</Text>
                              </View>
                            )}
                          </View>
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

      {/* Share Card Modal */}
      <ShareCardModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        data={{
          mascot: user?.mascot ? {
            animal: user.mascot.animal,
            evolution: shareData?.evolution || 1,
          } : null,
          strength_evolution: shareData?.evolution || 1,
          strength_value: shareData?.strength_value || 0.5,
          points_today: shareData?.points_today || 0,
          ...(shareData || {}),
        }}
      />
    </SafeAreaView>
    </ScreenBg>
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
  safe: { flex: 1, backgroundColor: "transparent" },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: -0.6, marginTop: 4 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  focusBadge: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  exerciseRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)" },
  recoBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "#FBDDDB", borderRadius: radius.full, borderWidth: 1, borderColor: "#E58880" },
  recoBadgeTxt: { fontSize: 9, fontWeight: "900", color: "#A12A22", letterSpacing: 0.5 },
  exCheckReco: { borderColor: "#E58880", backgroundColor: "#FFF6F5" },
  exerciseNum: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  weekRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  weekRowToday: { borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.1)" },
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
  tabChip: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  tabChipActive: { backgroundColor: "#4ade80", borderColor: "#4ade80" },
  tabText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  tabTextActive: { color: "#fff" },
  // Cycle
  cycleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  cycleChipOn: { backgroundColor: "rgba(74,222,128,0.15)", borderColor: "#4ade80" },
  // History
  histDot: { width: 8, height: 8, borderRadius: 4 },
  // Timer overlay
  timerOverlay: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, alignItems: "center", padding: spacing.md, zIndex: 100, elevation: 10 },
  timerCard: { backgroundColor: "rgba(0,0,0,0.85)", padding: spacing.md, borderRadius: radius.lg, alignItems: "center", borderWidth: 2, borderColor: "#4ade80", width: "92%", maxWidth: 360, gap: 4 },
  timerBig: { fontSize: 40, fontWeight: "800", color: colors.primary, letterSpacing: -1 },
  timerProgressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, width: "100%", overflow: "hidden" },
  timerProgressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  timerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: colors.primary },
  timerBtnTxt: { fontSize: 13, fontWeight: "700", color: colors.primary },
  timerSaveCfg: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  // Calendar
  calWrap: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  calNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.1)" },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  calCellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  calCellInner: { width: "85%", aspectRatio: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  calToday: { borderColor: "#fff", borderWidth: 2 },
  legendRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center", marginVertical: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  // Program
  progressBar: { height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: spacing.sm },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 2 },
  currentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  weekTypePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  programDayRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  programDayNum: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.1)" },
  // Setup modal
  setupOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  setupOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flex: 1, minWidth: 90, alignItems: "center" },
  setupOptionOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  setupOptionLabel: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  setupOptionLabelOn: { color: colors.primary },
  setupOptionSub: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
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
          <Text style={[typography.small, { fontWeight: "700", fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "capitalize" }]}>
            {key}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ProgramSummaryCard({
  program, onCreate, onTravel, onEndTravel, travelBusy,
}: {
  program: TrainingProgram | null;
  onCreate: () => void;
  onTravel?: () => void;
  onEndTravel?: () => void;
  travelBusy?: boolean;
}) {
  if (!program) {
    return (
      <GlassCard testID="program-summary-empty">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={[styles.focusBadge, { backgroundColor: colors.primaryPale }]}>
            <Ionicons name="rocket-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { fontWeight: "700", color:"#fff" }]}>Objectif & programme</Text>
            <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>Aucun programme défini. Crée le tien en 30s.</Text>
          </View>
          <TouchableOpacity onPress={onCreate} style={[styles.editBtn, { borderColor: colors.primary }]} testID="summary-create">
            <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Créer</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    );
  }
  const isTravel = (program as any).is_travel === true;
  return (
    <GlassCard testID="program-summary-card" style={{ borderColor: isTravel ? "#A85B0F" : colors.primary, borderWidth: 1.5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={[styles.focusBadge, { backgroundColor: isTravel ? "#FCE3CB" : colors.primaryPale }]}>
          <Ionicons name={isTravel ? "airplane" : "rocket"} size={20} color={isTravel ? "#A85B0F" : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: isTravel ? "#A85B0F" : colors.primary, fontWeight: "700" }]}>
            {isTravel ? "Mode déplacement actif" : "Objectif & programme"}
          </Text>
          <Text style={[typography.body, { fontWeight: "700", color:"#fff" }]}>{program.goal_label} · {program.split.toUpperCase()} {program.frequency}j</Text>
          <Text style={[typography.small, { marginTop: 2, color:"rgba(255,255,255,0.6)" }]}>
            Semaine <Text style={{ fontWeight: "800", color: colors.primary }}>{program.current_week}/{program.weeks_total}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(100, (program.current_week / program.weeks_total) * 100)}%`, backgroundColor: isTravel ? "#A85B0F" : colors.primary }]} />
      </View>
      {/* Action buttons */}
      <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" }}>
        {isTravel ? (
          <TouchableOpacity
            onPress={onEndTravel}
            disabled={travelBusy}
            style={[styles.actionBtn, { borderColor: "#A85B0F", flex: 1 }, travelBusy && { opacity: 0.5 }]}
            testID="summary-end-travel"
          >
            <Ionicons name="arrow-undo" size={14} color="#A85B0F" />
            <Text style={[typography.small, { color: "#A85B0F", fontWeight: "700" }]}>Reprendre mon programme</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity onPress={onCreate} style={styles.actionBtn} testID="summary-new-goals">
              <Ionicons name="refresh" size={14} color={colors.primary} />
              <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Nouveaux objectifs</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onTravel} style={styles.actionBtn} testID="summary-travel">
              <Ionicons name="airplane-outline" size={14} color={colors.primary} />
              <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Déplacement</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </GlassCard>
  );
}

function ProgramWeekCard({
  week, isExpanded, isCurrent, onToggle, onEditDay,
}: {
  week: ProgramWeek;
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onEditDay: (dayIndex: number) => void;
}) {
  const palette = SESSION_COLOR[week.session_type] || SESSION_COLOR.volume;
  return (
    <GlassCard style={{ marginBottom: 0, borderLeftWidth: 4, borderLeftColor: palette.fg }} testID={`program-week-${week.week_index}`}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[typography.body, { fontWeight: "700", color:"#fff" }]}>Semaine {week.week_index}</Text>
              {isCurrent && (
                <View style={[styles.currentBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[typography.small, { fontSize: 9, color: "#fff", fontWeight: "800" }]}>EN COURS</Text>
                </View>
              )}
            </View>
            <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>{week.days.length} séances · {week.days.map((d) => d.focus).join(" · ")}</Text>
          </View>
          <View style={[styles.weekTypePill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: palette.fg, textTransform: "uppercase" }}>{week.session_type}</Text>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
      {isExpanded && (
        <View style={{ marginTop: spacing.md, gap: 6 }}>
          {week.days.map((d) => (
            <TouchableOpacity
              key={d.day_index}
              onPress={() => onEditDay(d.day_index)}
              style={styles.programDayRow}
              testID={`program-day-${week.week_index}-${d.day_index}`}
            >
              <View style={styles.programDayNum}>
                <Text style={[typography.small, { color: colors.primary, fontWeight: "800" }]}>J{d.day_index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: "600", color:"#fff" }]}>{d.focus}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  {d.exercises.some((e) => e.is_recommended) && (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                  )}
                  <Text style={typography.small} numberOfLines={1}>
                    {d.exercises.length} ex. · {d.exercises.slice(0, 2).map((e) => e.name.split(" ")[0]).join(", ")}…
                  </Text>
                </View>
              </View>
              <Ionicons name="create-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </GlassCard>
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
        <Text style={[typography.body, { fontWeight: "700", textTransform: "capitalize", color:"#fff" }]}>
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
