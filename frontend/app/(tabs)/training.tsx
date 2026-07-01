import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ImageBackground,
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Button, SectionTitle, Stat } from "@/src/components/UI";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { ProgramCarousel } from "@/src/components/ProgramCarousel";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { MotivationalScript } from "@/src/components/MotivationalScript";
import { colors, spacing, typography, radius } from "@/src/theme";
import { PROGRAM_PRESETS, SCIENCE_NOTES, phaseForWeek, presetByGoal, weeklyAiAdvice } from "@/src/lib/programPresets";

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

// Display label for the program split, used on the share card
const SPLIT_LABELS: Record<string, string> = {
  ppl: "PPL",
  fullbody: "Full Body",
  split: "Split",
  home: "Home",
};

type CalendarDay = {
  id: string | null; session_type: string; completed: boolean; focus: string; exercises_count: number; planned?: boolean;
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

const EXERCISE_VISUALS: ImageSourcePropType[] = [
  require("../../assets/images/fitai-hero-activities-hd.png"),
  require("../../assets/images/fitai-hero-program-hd.png"),
  require("../../assets/images/fitai-hero-dashboard-hd.png"),
  require("../../assets/images/fitai-hero-progress-hd.png"),
];

function exerciseVisualFor(name: string, index: number) {
  const lower = name.toLowerCase();
  if (lower.includes("squat") || lower.includes("presse") || lower.includes("fente") || lower.includes("mollet")) return EXERCISE_VISUALS[2];
  if (lower.includes("développé") || lower.includes("bench") || lower.includes("pompe") || lower.includes("traction")) return EXERCISE_VISUALS[0];
  if (lower.includes("rowing") || lower.includes("tirage") || lower.includes("soulevé") || lower.includes("deadlift")) return EXERCISE_VISUALS[1];
  if (lower.includes("gainage") || lower.includes("abdo") || lower.includes("yoga") || lower.includes("mobilité")) return EXERCISE_VISUALS[4];
  return EXERCISE_VISUALS[index % EXERCISE_VISUALS.length];
}

function exercisePointsFor(ex: Exercise, index: number, reco: boolean) {
  return 8 + Math.min(10, ex.sets * 2) + (reco ? 8 : 0) + (index < 3 ? 2 : 0);
}

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

  const [editorOpen, setEditorOpen] = useState(false);
  const [editWorkout, setEditWorkout] = useState<Workout | null>(null);

  const [perfOpen, setPerfOpen] = useState(false);
  const [perfEx, setPerfEx] = useState<{ workout: Workout; exercise: Exercise } | null>(null);
  const [perfWeight, setPerfWeight] = useState("");
  const [perfReps, setPerfReps] = useState("");
  const [perfHistory, setPerfHistory] = useState<Perf[]>([]);
  const [earnedExercisePoints, setEarnedExercisePoints] = useState<Record<string, number>>({});

  // Calendar / history state
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [calDays, setCalDays] = useState<Record<string, CalendarDay>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [deletingAllWorkouts, setDeletingAllWorkouts] = useState(false);
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
  const [setupFreq, setSetupFreq] = useState<2 | 3 | 4>(3);
  const [setupDays, setSetupDays] = useState<number[]>([0, 2, 4]);
  const [setupSplit, setSetupSplit] = useState<"ppl" | "fullbody" | "split">("ppl");
  const [setupGoal, setSetupGoal] = useState("Masse");
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
      const splitLabel = SPLIT_LABELS[program?.split || ""] || "Training";
      setShareData({
        focus: `${splitLabel}${sLabel}`,
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

  // ---- Calendar / History ----

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

  const deleteAllWorkouts = useCallback(() => {
    Alert.alert(
      "Vider le calendrier",
      "Toutes les séances enregistrées seront supprimées. Cette action est irréversible.\n\nÊtes-vous sûr ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer tout",
          style: "destructive",
          onPress: async () => {
            setDeletingAllWorkouts(true);
            try {
              await api("/workouts/all", { method: "DELETE" });
              setCalDays({});
              await loadCalendar(calMonth);
            } catch (e) {
              Alert.alert("Erreur", "Impossible de supprimer les séances.");
            } finally {
              setDeletingAllWorkouts(false);
            }
          },
        },
      ]
    );
  }, [calMonth, loadCalendar]);

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

  const createProgram = async (overrides?: { goal_label?: string; frequency?: number; training_days?: number[]; split?: string; weeks?: number }) => {
    setCreatingProgram(true);
    try {
      const dayDefaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4] };
      const freq = overrides?.frequency ?? setupFreq;
      const created = await api<TrainingProgram>("/program/create", {
        method: "POST",
        body: {
          weeks: overrides?.weeks ?? setupWeeks,
          frequency: freq,
          training_days: overrides?.training_days ?? dayDefaults[freq] ?? setupDays,
          split: overrides?.split ?? setupSplit,
          goal_label: overrides?.goal_label ?? setupGoal,
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
    const exerciseIndex = perfEx.workout.exercises.findIndex((item) => item.name === perfEx.exercise.name);
    const reco = isRecommendedFor(perfEx.exercise.name, perfEx.workout.session_type);
    const points = exercisePointsFor(perfEx.exercise, Math.max(0, exerciseIndex), reco);
    setEarnedExercisePoints((prev) => ({ ...prev, [perfEx.exercise.name]: points }));
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
  const programProgress = program?.weeks_total
    ? Math.min(100, Math.round(((program.current_week + 1) / program.weeks_total) * 100))
    : 0;
  const completedSessions = week.filter((item) => item.completed).length;
  const streakDays = Math.max(1, completedSessions + (todayWorkout?.completed ? 1 : 0));
  const weeklyChallengeProgress = Math.min(100, Math.round((completedSessions / Math.max(1, program?.frequency || 3)) * 100));
  const chestReady = todayWorkout?.completed || weeklyChallengeProgress >= 100;

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
    <ScreenBackground bg="training">
      <View style={styles.header}>
        <Text style={styles.heroEyebrow}>Programme</Text>
        <View style={styles.heroTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroCaption}>Ton parcours</Text>
            <Text style={styles.title}>Transforme-toi</Text>
            <MotivationalScript style={styles.heroScript}>libère ton esprit.</MotivationalScript>
            <Text style={styles.heroProgram} numberOfLines={2}>
              {program?.name || "Un programme pensé pour ton rythme"}
            </Text>
          </View>
          <View style={styles.heroProgress}>
            <Text style={styles.heroProgressValue}>{programProgress}%</Text>
            <Text style={styles.heroProgressLabel}>terminé</Text>
          </View>
        </View>
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

        <TrainingPulseCard program={program} />

        <RewardsRail
          streakDays={streakDays}
          weeklyChallengeProgress={weeklyChallengeProgress}
          chestReady={chestReady}
        />

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
            <ImageBackground
              source={exerciseVisualFor(todayWorkout.focus || todayWorkout.title, 0)}
              style={styles.todayVisualWrap}
              imageStyle={styles.todayVisualImage}
              resizeMode="cover"
            >
              <View style={styles.todayVisualShade} />
              <View style={styles.todayVisualContent}>
                <View style={styles.todayHeroTop}>
                  <View style={styles.todayHeroIcon}>
                    <Ionicons name="timer-outline" size={18} color={colors.primaryLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayVisualEyebrow}>SÉANCE DU JOUR</Text>
                    <Text style={styles.todayVisualTitle}>{todayWorkout.focus}</Text>
                  </View>
                  <View style={styles.sessionXpBadge}>
                    <Ionicons name="star" size={12} color={colors.primaryLight} />
                    <Text style={styles.sessionXpText}>+80 XP</Text>
                  </View>
                </View>
                <View style={styles.sessionGuideGrid}>
                  <SessionGuideStat icon="repeat-outline" title="Swap" text="Remplace en un geste" />
                  <SessionGuideStat icon="stopwatch-outline" title="Repos" text="Timer adapté" />
                  <SessionGuideStat icon="sparkles-outline" title="IA" text="Feedback après série" />
                </View>
                <View style={styles.sessionProgressPanel}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionProgressLabel}>Progression de la séance</Text>
                    <View style={styles.sessionProgressTrack}>
                      <View style={[styles.sessionProgressFill, { width: todayWorkout.completed ? "100%" : "28%" }]} />
                    </View>
                  </View>
                  <View style={styles.timerBubble}>
                  <Text style={styles.timerBubbleValue}>00:45</Text>
                    <Text style={styles.timerBubbleLabel}>repos</Text>
                  </View>
                </View>
                <SessionPerformanceGraph
                  completed={todayWorkout.completed}
                  total={todayExercises.length}
                  earnedPoints={todayExercises.reduce((sum, ex) => sum + (earnedExercisePoints[ex.name] || 0), 0)}
                />
              </View>
            </ImageBackground>
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
            {todayExercises.map((ex, i) => {
              const reco = isRecommendedFor(ex.name, todayWorkout?.session_type);
              const points = exercisePointsFor(ex, i, reco);
              const earned = earnedExercisePoints[ex.name] || (todayWorkout.completed ? points : 0);
              return (
                <ExerciseSessionCard
                  key={`${ex.name}-${i}`}
                  exercise={ex}
                  index={i}
                  recommended={reco}
                  points={points}
                  earnedPoints={earned}
                  visual={exerciseVisualFor(ex.name, i)}
                  onPress={() => openPerf(todayWorkout, ex)}
                  testID={`exercise-${i}`}
                />
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
                    const splitLabel = SPLIT_LABELS[program?.split || ""] || "Training";
                    setShareData({
                      focus: `${splitLabel}${sLabel}`,
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
          </Card>
        ) : !program ? (
          <ProgramCarousel
            onSelectProgram={(goalLabel, freq, split, weeks) =>
              createProgram({ goal_label: goalLabel, frequency: freq, split, weeks: weeks || presetByGoal(goalLabel).defaultWeeks })
            }
            loading={creatingProgram}
          />
        ) : null}

        {/* My Program (weeks) */}
        {program && (
          <View testID="my-program-section">
            <SectionTitle title="Mon programme" action={
              <TouchableOpacity onPress={() => setProgramSetupOpen(true)} testID="reset-program">
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Refaire</Text>
              </TouchableOpacity>
            } />
            <View style={{ gap: spacing.sm }}>
              {(program.weeks || []).map((w) => (
                <ProgramWeekCard
                  key={w.week_index}
                  week={w}
                  totalWeeks={program.weeks_total}
                  currentWeek={program.current_week}
                  isExpanded={expandedWeek === w.week_index}
                  isCurrent={program.current_week === w.week_index}
                  onToggle={() => setExpandedWeek(expandedWeek === w.week_index ? null : w.week_index)}
                  onEditDay={(dayIndex) => openProgramDayEditor(program, w.week_index, dayIndex)}
                />
              ))}
            </View>
            <SciencePanel />
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
          </>
        )}

        {tab === "calendar" && (
          <>
            <SessionLegend />

            <CalendarTrainingView
              monthDate={calMonth}
              days={calDays}
              loading={calLoading}
              onPrev={() => setCalMonth(addMonths(calMonth, -1))}
              onNext={() => setCalMonth(addMonths(calMonth, 1))}
            />

            <Button
              title="Vider le calendrier"
              variant="secondary"
              loading={deletingAllWorkouts}
              onPress={deleteAllWorkouts}
              icon={<Ionicons name="trash-outline" size={15} color={colors.alert} />}
              style={{ borderColor: colors.alert, marginTop: spacing.sm }}
              testID="calendar-delete-all"
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
                {PROGRAM_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => {
                      setSetupGoal(preset.goalLabel);
                      setSetupWeeks(preset.defaultWeeks);
                      setSetupFreq(preset.defaultFrequency);
                      setSetupSplit(preset.defaultSplit);
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };
                      setSetupDays(defaults[preset.defaultFrequency]);
                    }}
                    style={[styles.setupOption, setupGoal === preset.goalLabel && styles.setupOptionOn]}
                    testID={`setup-goal-${preset.id}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupGoal === preset.goalLabel && styles.setupOptionLabelOn]}>{preset.goalLabel}</Text>
                    <Text style={styles.setupOptionSub}>{preset.defaultWeeks} sem.</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Fréquence (jours / semaine)</Text>
              <View style={styles.setupOptionRow}>
                {([2, 3, 4] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => {
                      setSetupFreq(f);
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };
                      setSetupDays(defaults[f]);
                    }}
                    style={[styles.setupOption, setupFreq === f && styles.setupOptionOn]}
                    testID={`setup-freq-${f}`}
                  >
                      <Text style={[styles.setupOptionLabel, setupFreq === f && styles.setupOptionLabelOn]}>{f}j</Text>
                      <Text style={styles.setupOptionSub}>
                        {f === 2 ? "Minimal" : f === 3 ? "Optimal" : "Ambitieux"}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Jours d&apos;entraînement ({setupDays.length}/{setupFreq})</Text>
              <View style={styles.setupOptionRow}>
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label, idx) => {
                  const on = setupDays.includes(idx);
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => {
                        if (on) {
                          setSetupDays(setupDays.filter((d) => d !== idx));
                        } else if (setupDays.length < setupFreq) {
                          setSetupDays([...setupDays, idx].sort());
                        }
                      }}
                      style={[styles.setupOption, on && styles.setupOptionOn, { minWidth: 44, paddingVertical: 8 }]}
                      testID={`setup-day-${idx}`}
                    >
                      <Text style={[styles.setupOptionLabel, { fontSize: 12 }, on && styles.setupOptionLabelOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
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
                {[6, 8, 10, 12].map((w) => (
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
              onPress={() => createProgram()}
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

            {perfEx && earnedExercisePoints[perfEx.exercise.name] ? (
              <View style={styles.exerciseRewardToast} testID="perf-reward-toast">
                <View style={styles.exerciseRewardIcon}>
                  <Ionicons name="sparkles" size={18} color="#081207" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseRewardTitle}>Exercice validé</Text>
                  <Text style={styles.exerciseRewardText}>+{earnedExercisePoints[perfEx.exercise.name]} points ajoutés à ta séance.</Text>
                </View>
              </View>
            ) : null}

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
    </ScreenBackground>
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

const GLASS = "rgba(10,28,16,0.72)";
const GLASS_BORDER = "rgba(74,222,128,0.18)";
const SHEET = "rgba(6,16,10,0.97)";

const styles = StyleSheet.create({
  header: { minHeight: 300, padding: spacing.lg, paddingBottom: spacing.xl, justifyContent: "space-between" },
  heroEyebrow: { ...typography.caption, color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  heroTitleRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  heroCaption: { ...typography.body, color: "rgba(255,255,255,0.82)", marginBottom: 2 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0 },
  heroProgram: { ...typography.small, color: "rgba(255,255,255,0.78)", marginTop: spacing.sm, maxWidth: 210 },
  heroScript: { fontSize: 29, lineHeight: 33, marginTop: 2 },
  heroProgress: { width: 82, height: 82, borderRadius: 41, borderWidth: 7, borderColor: colors.primaryLight, backgroundColor: "rgba(2,18,12,0.58)", alignItems: "center", justifyContent: "center" },
  heroProgressValue: { fontSize: 22, fontWeight: "900", color: "#FFFFFF" },
  heroProgressLabel: { fontSize: 9, color: "rgba(255,255,255,0.72)", marginTop: -2 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 130 },
  focusBadge: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.18)", alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  exerciseRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  recoBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: "rgba(161,42,34,0.25)", borderRadius: radius.full, borderWidth: 1, borderColor: "#E58880" },
  recoBadgeTxt: { fontSize: 9, fontWeight: "900", color: "#F87171", letterSpacing: 0.5 },
  exCheckReco: { borderColor: "#E58880", backgroundColor: "rgba(161,42,34,0.12)" },
  exerciseNum: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.18)", alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  weekRow: { flexDirection: "row", alignItems: "center", backgroundColor: GLASS, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER },
  weekRowToday: { borderColor: colors.primaryLight, backgroundColor: "rgba(74,222,128,0.15)" },
  statusDot: { width: 12, height: 12, borderRadius: radius.full },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: SHEET, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: GLASS_BORDER },
  modalHandle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  input: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: "#FFFFFF", marginTop: 6 },
  chip: { borderRadius: radius.full, alignSelf: "flex-start" },
  editBtn: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(74,222,128,0.15)", borderRadius: radius.full, borderWidth: 1, borderColor: GLASS_BORDER },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeBig: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS },
  typeBigActive: { borderColor: colors.primaryLight, backgroundColor: "rgba(74,222,128,0.18)" },
  typeBigLabel: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  typeBigReps: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  typeBigDesc: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 14 },
  exCheck: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, marginBottom: 6, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER },
  exCheckOn: { backgroundColor: "rgba(74,222,128,0.18)", borderColor: colors.primaryLight },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rmBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(74,222,128,0.15)", padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, borderWidth: 1, borderColor: GLASS_BORDER },
  rmValue: { fontSize: 24, fontWeight: "800", color: colors.primaryLight, marginTop: 2 },
  perfRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  // Tabs
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tabChip: { flex: 1, minHeight: 38, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.55)" },
  tabTextActive: { color: "#102108" },
  // History
  histDot: { width: 8, height: 8, borderRadius: 4 },
  // Timer overlay
  timerOverlay: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, alignItems: "center", padding: spacing.md, zIndex: 100, elevation: 10 },
  timerCard: { backgroundColor: "rgba(6,20,10,0.97)", padding: spacing.md, borderRadius: radius.lg, alignItems: "center", borderWidth: 2, borderColor: colors.primaryLight, width: "92%", maxWidth: 360, gap: 4 },
  timerBig: { fontSize: 40, fontWeight: "800", color: colors.primaryLight, letterSpacing: -1 },
  timerProgressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, width: "100%", overflow: "hidden" },
  timerProgressFill: { height: "100%", backgroundColor: colors.primaryLight, borderRadius: 3 },
  timerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)", borderWidth: 1, borderColor: colors.primaryLight },
  timerBtnTxt: { fontSize: 13, fontWeight: "700", color: colors.primaryLight },
  timerSaveCfg: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, marginTop: 4 },
  // Calendar
  calWrap: { backgroundColor: GLASS, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: GLASS_BORDER },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  calNavBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.1)" },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  calCellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  calCellInner: { width: "85%", aspectRatio: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  calToday: { borderColor: "#FFFFFF", borderWidth: 2 },
  legendRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center", marginVertical: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  // Program
  progressBar: { height: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", marginTop: spacing.sm },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 2 },
  timelineRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: "rgba(182,255,63,0.14)", borderColor: "rgba(182,255,63,0.28)" },
  timelineDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timelineDotText: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.62)" },
  timelineDotTextActive: { color: "#13230A" },
  referenceMetricRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  referenceMetric: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: spacing.sm,
    justifyContent: "space-between",
  },
  referenceMetricValue: { color: colors.textMain, fontSize: 14, fontWeight: "800" },
  referenceMetricLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
  programNatureBand: {
    height: 124,
    margin: -spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
    backgroundColor: "rgba(182,255,63,0.08)",
  },
  programSun: { position: "absolute", right: 30, top: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,179,63,0.34)" },
  programMountainBack: { position: "absolute", left: -20, bottom: 0, width: 220, height: 94, borderTopLeftRadius: 130, borderTopRightRadius: 130, backgroundColor: "rgba(53,214,232,0.14)", transform: [{ rotate: "-8deg" }] },
  programMountainFront: { position: "absolute", right: -40, bottom: -4, width: 250, height: 108, borderTopLeftRadius: 150, borderTopRightRadius: 150, backgroundColor: "rgba(13,46,27,0.86)", transform: [{ rotate: "7deg" }] },
  programTrail: { position: "absolute", left: 78, right: 76, bottom: 22, height: 4, borderRadius: 2, backgroundColor: "rgba(182,255,63,0.42)", transform: [{ rotate: "-10deg" }] },
  programHiker: { position: "absolute", right: 76, bottom: 30, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  phasePreviewStack: { gap: 8, marginTop: spacing.md },
  phasePreview: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 58, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm },
  phaseAccent: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  phasePreviewLabel: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  phasePreviewWeeks: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  sparkline: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 34 },
  sparkBar: { width: 4, borderRadius: 2, opacity: 0.9 },
  currentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  weekTypePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  programDayRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: GLASS_BORDER },
  programDayNum: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.18)" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: "rgba(74,222,128,0.15)" },
  // Setup modal
  setupOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  setupOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: GLASS_BORDER, flex: 1, minWidth: 90, alignItems: "center" },
  setupOptionOn: { backgroundColor: "rgba(74,222,128,0.18)", borderColor: colors.primaryLight },
  setupOptionLabel: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  setupOptionLabelOn: { color: colors.primaryLight },
  setupOptionSub: { fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 2 },
  xpRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 5, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,18,12,0.54)" },
  xpValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", lineHeight: 22 },
  xpLabel: { color: colors.primaryLight, fontSize: 10, fontWeight: "900", marginTop: -1 },
  pulseGrid: { flexDirection: "row", gap: spacing.sm },
  pulseStat: { flex: 1, minHeight: 76, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", gap: 3 },
  pulseValue: { color: colors.textMain, fontSize: 17, fontWeight: "900" },
  pulseLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
  aiCoachBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.10)" },
  aiCoachText: { color: colors.textSecondary, flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  rewardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rewardEyebrow: { fontSize: 11, fontWeight: "900", color: colors.primaryLight, letterSpacing: 0.3 },
  rewardCrown: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.12)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.24)",
  },
  rewardGrid: { flexDirection: "row", gap: spacing.sm },
  rewardTile: {
    flex: 1,
    minHeight: 82,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: spacing.sm,
  },
  rewardValue: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  rewardLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
  challengeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
    backgroundColor: "rgba(182,255,63,0.08)",
  },
  challengeTitle: { color: colors.textMain, fontSize: 14, fontWeight: "800" },
  challengeText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  challengeRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(4,14,9,0.72)",
  },
  challengeRingValue: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  todayVisualWrap: {
    minHeight: 318,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.28)",
    backgroundColor: "rgba(4,18,12,0.82)",
  },
  todayVisualImage: { opacity: 0.9, transform: [{ scale: 1.05 }] },
  todayVisualShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(1,12,7,0.54)",
    borderRadius: radius.lg,
  },
  todayVisualContent: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: "space-between" },
  todayHeroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  todayHeroIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.26)" },
  todayVisualEyebrow: { fontSize: 11, fontWeight: "900", color: colors.primaryLight, letterSpacing: 0.3 },
  todayVisualTitle: { fontSize: 25, lineHeight: 29, fontWeight: "800", color: colors.textMain, maxWidth: 240 },
  sessionXpBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.24)" },
  sessionXpText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  sessionGuideGrid: { flexDirection: "row", gap: spacing.sm },
  sessionGuideStat: { flex: 1, minHeight: 86, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, justifyContent: "space-between" },
  sessionGuideTitle: { color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  sessionGuideText: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14 },
  sessionProgressPanel: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  sessionProgressLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", marginBottom: 8 },
  sessionProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  sessionProgressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primaryLight },
  timerBubble: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,18,12,0.58)" },
  timerBubbleValue: { color: colors.textMain, fontSize: 16, fontWeight: "900" },
  timerBubbleLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "800", marginTop: -1 },
  sessionGraphPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.24)",
    backgroundColor: "rgba(1,16,9,0.72)",
  },
  sessionGraphRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 7,
    borderColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2,18,12,0.72)",
  },
  sessionGraphRingValue: { color: colors.textMain, fontSize: 18, fontWeight: "900" },
  sessionGraphRingLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "800", marginTop: 1 },
  sessionGraphTopLine: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, alignItems: "flex-start" },
  sessionGraphTitle: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  sessionGraphText: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  sessionGraphXp: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.24)" },
  sessionGraphXpText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  sessionBars: { height: 54, flexDirection: "row", alignItems: "flex-end", gap: 6 },
  sessionBar: { flex: 1, minWidth: 7, borderRadius: 7 },
  exerciseLuxuryCard: {
    minHeight: 132,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(5,22,14,0.74)",
  },
  exerciseLuxuryCardDone: {
    borderColor: "rgba(182,255,63,0.42)",
    backgroundColor: "rgba(21,56,25,0.62)",
  },
  exerciseThumb: {
    width: 96,
    borderRadius: radius.md,
    overflow: "hidden",
    justifyContent: "space-between",
    padding: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  exerciseThumbImage: { borderRadius: radius.md, opacity: 0.86, transform: [{ scale: 1.12 }] },
  exerciseThumbShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,12,8,0.24)" },
  exerciseNumLuxury: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
  },
  exerciseNumReco: { backgroundColor: "rgba(255,179,63,0.92)" },
  exerciseNumLuxuryText: { color: "#071207", fontSize: 13, fontWeight: "900" },
  exerciseLuxuryBody: { flex: 1, justifyContent: "space-between", gap: spacing.sm, paddingVertical: 2 },
  exerciseLuxuryHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  exerciseNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  exerciseLuxuryName: { color: colors.textMain, fontSize: 15.5, fontWeight: "900", flexShrink: 1 },
  exerciseLuxuryMeta: { color: colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 3, fontWeight: "700" },
  exercisePointPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.28)",
    backgroundColor: "rgba(182,255,63,0.10)",
  },
  exercisePointPillDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  exercisePointText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  exercisePointTextDone: { color: "#081207" },
  exerciseMicroStats: { flexDirection: "row", gap: 6 },
  exerciseMicroStat: { flex: 1, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.055)", alignItems: "center", justifyContent: "center" },
  exerciseMicroValue: { color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  exerciseMicroLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "800", marginTop: 1 },
  exerciseLuxuryProgress: { height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  exerciseLuxuryProgressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primaryLight },
  exerciseRewardToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.30)",
    backgroundColor: "rgba(182,255,63,0.12)",
  },
  exerciseRewardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  exerciseRewardTitle: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  exerciseRewardText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  weekMetrics: { flexDirection: "row", gap: spacing.sm },
  miniMetric: { flex: 1, borderRadius: radius.sm, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)", padding: spacing.sm },
  miniMetricValue: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  miniMetricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  scienceIcon: { width: 34, height: 34, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(53,214,232,0.14)" },
  scienceRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  scienceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.aqua, marginTop: 6 },
  scienceText: { color: colors.textSecondary, flex: 1, fontSize: 12.5, lineHeight: 18 },
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
      <Card testID="program-summary-empty">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={[styles.focusBadge, { backgroundColor: colors.primaryPale }]}>
            <Ionicons name="rocket-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.body, { fontWeight: "700" }]}>Objectif & programme</Text>
            <Text style={typography.small}>Aucun programme défini. Crée le tien en 30s.</Text>
          </View>
          <TouchableOpacity onPress={onCreate} style={[styles.editBtn, { borderColor: colors.primary }]} testID="summary-create">
            <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Créer</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }
  const isTravel = (program as any).is_travel === true;
  return (
    <Card testID="program-summary-card" style={{ borderColor: isTravel ? "#A85B0F" : colors.primary, borderWidth: 1.5, overflow: "hidden" }}>
      <View style={styles.programNatureBand}>
        <View style={styles.programSun} />
        <View style={styles.programMountainBack} />
        <View style={styles.programMountainFront} />
        <View style={styles.programTrail} />
        <View style={styles.programHiker}>
          <Ionicons name="walk" size={18} color="#13230A" />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={[styles.focusBadge, { backgroundColor: isTravel ? "#FCE3CB" : colors.primaryPale }]}>
          <Ionicons name={isTravel ? "airplane" : "rocket"} size={20} color={isTravel ? "#A85B0F" : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: isTravel ? "#A85B0F" : colors.primary, fontWeight: "700" }]}>
            {isTravel ? "Mode déplacement actif" : "Objectif & programme"}
          </Text>
          <Text style={[typography.body, { fontWeight: "700" }]}>{program.goal_label} · {program.split.toUpperCase()} {program.frequency}j</Text>
          <Text style={[typography.small, { marginTop: 2 }]}>
            Semaine <Text style={{ fontWeight: "800", color: colors.primary }}>{program.current_week}/{program.weeks_total}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(100, (program.current_week / program.weeks_total) * 100)}%`, backgroundColor: isTravel ? "#A85B0F" : colors.primary }]} />
      </View>
      <View style={styles.timelineRow}>
        {Array.from({ length: program.weeks_total }).map((_, index) => {
          const weekIndex = index + 1;
          const active = weekIndex === program.current_week;
          const done = weekIndex < program.current_week;
          return (
            <View
              key={`timeline-${weekIndex}`}
              style={[
                styles.timelineDot,
                done && styles.timelineDotDone,
                active && styles.timelineDotActive,
              ]}
            >
              <Text style={[styles.timelineDotText, active && styles.timelineDotTextActive]}>{weekIndex}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.referenceMetricRow}>
        <ReferenceMetric label="Phase" value={phaseForWeek(program.weeks_total, program.current_week)} />
        <ReferenceMetric label="Rythme" value={`${program.frequency} séances`} />
        <ReferenceMetric label="Plan" value={program.split.toUpperCase()} />
      </View>
      <View style={styles.phasePreviewStack}>
        <PhasePreview label="Volume" weeks="Sem. 1 à 4" accent={colors.primaryLight} />
        <PhasePreview label="Force" weeks="Sem. 5 à 8" accent={colors.aqua} />
        <PhasePreview label="Consolidation" weeks="Sem. 9 à 12" accent={colors.amber} />
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
    </Card>
  );
}

function RewardsRail({
  streakDays,
  weeklyChallengeProgress,
  chestReady,
}: {
  streakDays: number;
  weeklyChallengeProgress: number;
  chestReady: boolean;
}) {
  return (
    <Card testID="rewards-rail-card" style={{ gap: spacing.md }}>
      <View style={styles.rewardHeader}>
        <View>
          <Text style={styles.rewardEyebrow}>GAMIFICATION PREMIUM</Text>
          <Text style={[typography.h3, { marginTop: 2 }]}>Chaque séance nourrit ta progression.</Text>
        </View>
        <View style={styles.rewardCrown}>
          <Ionicons name="trophy" size={18} color={colors.primaryLight} />
        </View>
      </View>
      <View style={styles.rewardGrid}>
        <RewardTile icon="flame" label="Streak" value={`${streakDays} j`} />
        <RewardTile icon="ribbon" label="Badge proche" value="7 jours" />
        <RewardTile icon="gift" label="Coffre" value={chestReady ? "Disponible" : "En cours"} />
      </View>
      <View style={styles.challengeBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.challengeTitle}>Défi hebdomadaire</Text>
          <Text style={styles.challengeText}>Termine ton rythme prévu pour débloquer un coffre surprise, des XP et un bonus de motivation.</Text>
        </View>
        <View style={styles.challengeRing}>
          <Text style={styles.challengeRingValue}>{weeklyChallengeProgress}%</Text>
        </View>
      </View>
    </Card>
  );
}

function TrainingPulseCard({ program }: { program: TrainingProgram | null }) {
  const preset = presetByGoal(program?.goal_label);
  const currentWeek = program?.current_week || 1;
  const totalWeeks = program?.weeks_total || preset.defaultWeeks;
  const completion = Math.min(100, Math.round((currentWeek / Math.max(1, totalWeeks)) * 100));
  return (
    <Card testID="training-pulse-card" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: colors.primaryLight, fontWeight: "900" }]}>AVENTURE FIT AI</Text>
          <Text style={[typography.h3, { marginTop: 3 }]}>Ton plan s&apos;adapte à toi, pas l&apos;inverse.</Text>
        </View>
        <View style={styles.xpRing}>
          <Text style={styles.xpValue}>+80</Text>
          <Text style={styles.xpLabel}>XP</Text>
        </View>
      </View>
      <View style={styles.pulseGrid}>
        <PulseStat icon="flame-outline" label="Streak" value="1 j" />
        <PulseStat icon="trophy-outline" label="Badge proche" value="7 j" />
        <PulseStat icon="analytics-outline" label="Cycle" value={`${completion}%`} />
      </View>
      <View style={styles.aiCoachBox}>
        <Ionicons name="sparkles-outline" size={16} color={colors.primaryLight} />
        <Text style={styles.aiCoachText}>{weeklyAiAdvice(program?.weeks?.find((w) => w.week_index === currentWeek)?.session_type, currentWeek)}</Text>
      </View>
    </Card>
  );
}

function PulseStat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.pulseStat}>
      <Ionicons name={icon} size={16} color={colors.primaryLight} />
      <Text style={styles.pulseValue}>{value}</Text>
      <Text style={styles.pulseLabel}>{label}</Text>
    </View>
  );
}

function RewardTile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.rewardTile}>
      <Ionicons name={icon} size={18} color={colors.primaryLight} />
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
    </View>
  );
}

function ExerciseSessionCard({
  exercise,
  index,
  recommended,
  points,
  earnedPoints,
  visual,
  onPress,
  testID,
}: {
  exercise: Exercise;
  index: number;
  recommended: boolean;
  points: number;
  earnedPoints: number;
  visual: ImageSourcePropType;
  onPress: () => void;
  testID: string;
}) {
  const completed = earnedPoints > 0;
  const progress = completed ? 100 : Math.min(86, 28 + index * 11);
  return (
    <TouchableOpacity
      style={[styles.exerciseLuxuryCard, completed && styles.exerciseLuxuryCardDone]}
      onPress={onPress}
      testID={testID}
      activeOpacity={0.82}
    >
      <ImageBackground source={visual} style={styles.exerciseThumb} imageStyle={styles.exerciseThumbImage} resizeMode="cover">
        <View style={styles.exerciseThumbShade} />
        <View style={[styles.exerciseNumLuxury, recommended && styles.exerciseNumReco]}>
          <Text style={styles.exerciseNumLuxuryText}>{index + 1}</Text>
        </View>
      </ImageBackground>

      <View style={styles.exerciseLuxuryBody}>
        <View style={styles.exerciseLuxuryHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.exerciseNameRow}>
              <Text style={styles.exerciseLuxuryName} numberOfLines={1}>{exercise.name}</Text>
              {recommended ? (
                <View style={styles.recoBadge}>
                  <Ionicons name="flame" size={9} color="#F87171" />
                  <Text style={styles.recoBadgeTxt}>IA</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.exerciseLuxuryMeta}>{exercise.sets} séries · {exercise.reps} reps · {exercise.rest_s}s repos</Text>
          </View>
          <View style={[styles.exercisePointPill, completed && styles.exercisePointPillDone]}>
            <Ionicons name={completed ? "checkmark" : "star"} size={12} color={completed ? "#081207" : colors.primaryLight} />
            <Text style={[styles.exercisePointText, completed && styles.exercisePointTextDone]}>
              {completed ? `+${earnedPoints}` : `+${points}`}
            </Text>
          </View>
        </View>

        <View style={styles.exerciseMicroStats}>
          <View style={styles.exerciseMicroStat}>
            <Text style={styles.exerciseMicroValue}>{exercise.sets}</Text>
            <Text style={styles.exerciseMicroLabel}>séries</Text>
          </View>
          <View style={styles.exerciseMicroStat}>
            <Text style={styles.exerciseMicroValue}>{exercise.reps}</Text>
            <Text style={styles.exerciseMicroLabel}>cible</Text>
          </View>
          <View style={styles.exerciseMicroStat}>
            <Text style={styles.exerciseMicroValue}>{Math.round(exercise.rest_s / 15) * 15}s</Text>
            <Text style={styles.exerciseMicroLabel}>repos</Text>
          </View>
        </View>

        <View style={styles.exerciseLuxuryProgress}>
          <View style={[styles.exerciseLuxuryProgressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SessionPerformanceGraph({
  completed,
  total,
  earnedPoints,
}: {
  completed: boolean;
  total: number;
  earnedPoints: number;
}) {
  const done = completed ? total : Math.min(total, Math.max(1, Math.round(total * 0.42)));
  const ratio = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={styles.sessionGraphPanel}>
      <View style={styles.sessionGraphRing}>
        <Text style={styles.sessionGraphRingValue}>{done}/{Math.max(1, total)}</Text>
        <Text style={styles.sessionGraphRingLabel}>exercices</Text>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={styles.sessionGraphTopLine}>
          <View>
            <Text style={styles.sessionGraphTitle}>Suivi de séance</Text>
            <Text style={styles.sessionGraphText}>{completed ? "Séance complète. Coffre prêt." : "Objectif : valider série par série."}</Text>
          </View>
          <View style={styles.sessionGraphXp}>
            <Ionicons name="sparkles" size={12} color={colors.primaryLight} />
            <Text style={styles.sessionGraphXpText}>+{earnedPoints || 80} pts</Text>
          </View>
        </View>
        <View style={styles.sessionBars}>
          {[0.36, 0.62, 0.48, 0.78, 0.56, 0.88].map((height, index) => (
            <View
              key={`session-bar-${index}`}
              style={[
                styles.sessionBar,
                {
                  height: 12 + height * 34,
                  backgroundColor: index < Math.ceil((ratio / 100) * 6) ? colors.primaryLight : "rgba(255,255,255,0.16)",
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function SessionGuideStat({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.sessionGuideStat}>
      <Ionicons name={icon} size={16} color={colors.primaryLight} />
      <Text style={styles.sessionGuideTitle}>{title}</Text>
      <Text style={styles.sessionGuideText}>{text}</Text>
    </View>
  );
}

function PhasePreview({ label, weeks, accent }: { label: string; weeks: string; accent: string }) {
  return (
    <View style={styles.phasePreview}>
      <View style={[styles.phaseAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.phasePreviewLabel}>{label}</Text>
        <Text style={styles.phasePreviewWeeks}>{weeks}</Text>
      </View>
      <View style={styles.sparkline}>
        {[0.25, 0.52, 0.38, 0.72, 0.58].map((height, index) => (
          <View key={`${label}-${index}`} style={[styles.sparkBar, { height: 8 + height * 20, backgroundColor: accent }]} />
        ))}
      </View>
    </View>
  );
}

function ReferenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.referenceMetric}>
      <Text style={styles.referenceMetricValue}>{value}</Text>
      <Text style={styles.referenceMetricLabel}>{label}</Text>
    </View>
  );
}

function SciencePanel() {
  return (
    <Card testID="science-panel" style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={styles.scienceIcon}>
          <Ionicons name="flask-outline" size={16} color={colors.aqua} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: "900" }]}>Basé sur la science</Text>
          <Text style={typography.small}>Repères courts, sans jargon.</Text>
        </View>
      </View>
      {SCIENCE_NOTES.slice(0, 4).map((note) => (
        <View key={note} style={styles.scienceRow}>
          <View style={styles.scienceDot} />
          <Text style={styles.scienceText}>{note}</Text>
        </View>
      ))}
    </Card>
  );
}

function ProgramWeekCard({
  week, totalWeeks, currentWeek, isExpanded, isCurrent, onToggle, onEditDay,
}: {
  week: ProgramWeek;
  totalWeeks: number;
  currentWeek: number;
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onEditDay: (dayIndex: number) => void;
}) {
  const palette = SESSION_COLOR[week.session_type] || SESSION_COLOR.volume;
  const status = week.week_index < currentWeek ? "Terminée" : isCurrent ? "En cours" : "À venir";
  const adherence = week.week_index < currentWeek ? 88 : isCurrent ? 68 : 0;
  return (
    <Card style={{ marginBottom: 0, borderLeftWidth: 4, borderLeftColor: palette.fg }} testID={`program-week-${week.week_index}`}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[typography.body, { fontWeight: "700" }]}>Semaine {week.week_index}</Text>
              {isCurrent && (
                <View style={[styles.currentBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[typography.small, { fontSize: 9, color: "#fff", fontWeight: "800" }]}>EN COURS</Text>
                </View>
              )}
            </View>
            <Text style={typography.small}>
              {status} · {phaseForWeek(totalWeeks, week.week_index)} · {week.days.length} séances
            </Text>
          </View>
          <View style={[styles.weekTypePill, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: palette.fg, textTransform: "uppercase" }}>{week.session_type}</Text>
          </View>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
      {isExpanded && (
        <View style={{ marginTop: spacing.md, gap: 6 }}>
          <View style={styles.weekMetrics}>
            <MiniMetric label="Adhérence" value={adherence ? `${adherence}%` : "À venir"} />
            <MiniMetric label="Charge" value={week.week_index <= currentWeek ? "+2%" : "Planifié"} />
            <MiniMetric label="Fatigue" value={isCurrent ? "Modérée" : week.week_index < currentWeek ? "OK" : "—"} />
          </View>
          <View style={styles.aiCoachBox}>
            <Ionicons name="sparkles-outline" size={15} color={colors.primaryLight} />
            <Text style={styles.aiCoachText}>{weeklyAiAdvice(week.session_type, week.week_index)}</Text>
          </View>
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
                <Text style={[typography.body, { fontWeight: "600" }]}>{d.focus}</Text>
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
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
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
          // Only colorize sessions that have a recognized type — no fallback to volume
          const knownPalette = info && info.session_type && SESSION_COLOR[info.session_type]
            ? SESSION_COLOR[info.session_type]
            : null;
          // Completed sessions: full color. Planned but not completed: subtle outline only.
          const palette = info?.completed ? knownPalette : null;
          const plannedPalette = info && !info.completed ? knownPalette : null;
          const isToday = iso === todayISO;
          return (
            <View key={idx} style={styles.calCell}>
              <View
                style={[
                  styles.calCellInner,
                  {
                    backgroundColor: palette ? palette.bg : colors.background,
                    borderColor: palette ? palette.border : plannedPalette ? plannedPalette.border : colors.border,
                    borderWidth: plannedPalette && !palette ? 1.5 : 1,
                    borderStyle: plannedPalette && !palette ? "dashed" : "solid",
                  },
                  isToday && styles.calToday,
                ]}
                testID={`cal-day-${iso}`}
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: palette ? "800" : "500",
                  color: palette ? palette.fg : plannedPalette ? plannedPalette.fg : colors.textMuted,
                  opacity: plannedPalette && !palette ? 0.6 : 1,
                }}>
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
