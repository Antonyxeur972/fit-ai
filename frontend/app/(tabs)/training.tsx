import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Platform, Alert, ImageBackground,
} from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Calendar from "expo-calendar";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, Button, SectionTitle } from "@/src/components/UI";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { ProgramCarousel } from "@/src/components/ProgramCarousel";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { MotivationalScript } from "@/src/components/MotivationalScript";
import { colors, spacing, typography, radius } from "@/src/theme";
import { PROGRAM_PRESETS, phaseForWeek, presetByGoal } from "@/src/lib/programPresets";
import { readDefaultTrainingTime } from "@/src/lib/trainingPreferences";
import { getSimpleMode } from "@/src/lib/simpleMode";

type Exercise = { name: string; sets: number; reps: string; rest_s: number; checked?: boolean; is_recommended?: boolean };
type Workout = {
  id: string; date: string; title: string; focus: string; duration_min: number;
  exercises: Exercise[]; completed: boolean; session_type?: string; points_earned?: number;
};
type Activity = { date: string; steps: number; cardio_minutes: number; cardio_type?: string };
type LibExercise = { id: string; name: string; category: string; equipment: string };
type SessionTypeDef = { label: string; reps: string; sets: number; rest_s: number; desc: string };
type SessionTypes = Record<string, SessionTypeDef>;
type Perf = { id: string; exercise_name: string; weight_kg: number; reps: number; sets: number; est_1rm: number; created_at: string };
type SessionDraft = { sets: string; reps: string; weight: string; rest: string; pr: boolean; done: boolean };
type SessionResult = { prs: number; volume: number; duration: number; calories: number; xp: number };

const SESSION_KEYS = ["volume", "puissance", "force"] as const;
type SessionKey = typeof SESSION_KEYS[number];
type TrainingTab = "today" | "recommendation" | "calendar" | "history";

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
  upper_lower: "Upper / Lower",
  home: "Home",
};

const STRUCTURE_OPTIONS = [
  {
    v: "fullbody" as const,
    label: "Full body",
    ideal: "idéal 2 à 3 j / sem",
    icon: "body-outline" as const,
    points: ["Chaque muscle 2 à 3x / sem", "Simple, complet, très efficace"],
  },
  {
    v: "upper_lower" as const,
    label: "Upper / Lower",
    ideal: "idéal 4 j / sem",
    icon: "accessibility-outline" as const,
    points: ["Chaque muscle 2x / sem", "Bon équilibre volume / récup"],
  },
  {
    v: "ppl" as const,
    label: "PPL",
    ideal: "idéal 5 à 6 j / sem",
    icon: "git-branch-outline" as const,
    points: ["Push · Pull · Legs", "Très bon si tu t'entraînes souvent"],
  },
  {
    v: "split" as const,
    label: "Split + rappels",
    ideal: "idéal 5 j / sem",
    icon: "scan-circle-outline" as const,
    points: ["1 groupe principal + rappels", "Plus de focus, moins de hasard"],
  },
  {
    v: "home" as const,
    label: "À la maison",
    ideal: "déplacement",
    icon: "home-outline" as const,
    points: ["Poids du corps", "Simple quand tu n'as pas de matériel"],
  },
];

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
  split: "ppl" | "fullbody" | "split" | "upper_lower" | "home";
  is_travel?: boolean;
  training_days?: number[] | null;
  training_times?: Record<string, string> | null;
  block_weeks?: { volume?: number; puissance?: number; force?: number };
  cycle_pattern: string[];
  started_at: string;
  active: boolean;
  current_week: number;
  weeks: ProgramWeek[];
};

type CalendarSyncWorkout = {
  id: string;
  date: string;
  title: string;
  focus: string;
  duration_min: number;
  exercises: Exercise[];
  session_type?: string;
  training_time?: string | null;
};

// Rest timer defaults per session_type
const REST_DEFAULTS: Record<string, number> = {
  force: 240,      // 4 min
  puissance: 180,  // 3 min
  volume: 75,      // 1 min 15
  endurance: 45,
};

const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const EXERCISE_VISUALS: ImageSourcePropType[] = [
  require("../../assets/images/fitai-hero-activities-hd.png"),
  require("../../assets/images/fitai-hero-program-hd.png"),
  require("../../assets/images/fitai-hero-dashboard-hd.png"),
  require("../../assets/images/fitai-hero-progress-hd.png"),
  require("../../assets/images/fitai-hydration-card-hd.png"),
];

const DEFAULT_TODAY_EXERCISES: Exercise[] = [
  { name: "Squat", sets: 4, reps: "8-10 reps", rest_s: 90, checked: true, is_recommended: true },
  { name: "Développé couché", sets: 4, reps: "8-10 reps", rest_s: 90, checked: true, is_recommended: true },
  { name: "Rowing barre", sets: 4, reps: "8-10 reps", rest_s: 90, checked: true },
  { name: "Fentes marchées", sets: 3, reps: "10-12 reps", rest_s: 60, checked: true },
  { name: "Gainage planche", sets: 3, reps: "45-60 s", rest_s: 45, checked: true },
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

function formatSecondsLabel(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function normalizeTrainingTime(value?: string | null) {
  const match = String(value || "").match(/^(\d{1,2})[:hH]?(\d{2})?$/);
  if (!match) return "18:30";
  const hour = Math.max(5, Math.min(23, parseInt(match[1] || "18", 10)));
  const minute = Math.max(0, Math.min(59, parseInt(match[2] || "00", 10)));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function splitTrainingTime(value?: string | null) {
  const normalized = normalizeTrainingTime(value);
  const [hour, minute] = normalized.split(":").map((part) => parseInt(part, 10));
  return { hour, minute };
}

function defaultTrainingDays(frequency: number) {
  if (frequency >= 7) return [0, 1, 2, 3, 4, 5, 6];
  if (frequency >= 5) return [0, 1, 2, 3, 4];
  if (frequency >= 4) return [0, 1, 3, 4];
  if (frequency <= 2) return [0, 3];
  return [0, 2, 4];
}

function sessionLabelForIndex(dayIndex: number, trainingDays?: number[] | null) {
  const day = trainingDays?.[dayIndex];
  if (typeof day === "number" && WEEKDAY_SHORT[day]) return WEEKDAY_SHORT[day];
  return `J${dayIndex + 1}`;
}

function splitLabel(split?: string) {
  if (split === "upper_lower") return "Upper / Lower";
  return SPLIT_LABELS[split || ""] || (split || "Training").toUpperCase();
}

function toLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayFromIso(dateIso: string) {
  const d = new Date(`${dateIso}T12:00:00`);
  return (d.getDay() + 6) % 7;
}

function trainingTimeForDate(program: TrainingProgram | null, dateIso: string) {
  const weekday = weekdayFromIso(dateIso);
  return program?.training_times?.[String(weekday)] || null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseProgramDate(value?: string) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function plannedWorkoutsFromProgram(program: TrainingProgram | null): CalendarSyncWorkout[] {
  if (!program) return [];
  const start = parseProgramDate(program.started_at);
  const trainingDays = (program.training_days?.length ? program.training_days : defaultTrainingDays(program.frequency))
    .map((day) => Number(day) % 7)
    .sort((a, b) => a - b);
  const events: CalendarSyncWorkout[] = [];
  for (let offset = 0; offset < program.weeks_total * 7; offset += 1) {
    const date = addDays(start, offset);
    const weekday = (date.getDay() + 6) % 7;
    const daySlot = trainingDays.indexOf(weekday);
    if (daySlot < 0) continue;
    const weekIndex = Math.floor(offset / 7) + 1;
    const week = program.weeks.find((item) => item.week_index === weekIndex);
    const day = week?.days[daySlot] || week?.days[0];
    if (!week || !day) continue;
    events.push({
      id: `program-${program.id}-${weekIndex}-${day.day_index}`,
      date: toLocalIsoDate(date),
      title: `${splitLabel(program.split)} ${sessionLabelForIndex(day.day_index, trainingDays)}`,
      focus: day.focus || program.goal_label || "Séance FIT AI",
      duration_min: 45,
      exercises: day.exercises.filter((exercise) => exercise.checked !== false),
      session_type: week.session_type,
      training_time: program.training_times?.[String(weekday)] || null,
    });
  }
  return events;
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDateTime(dateIso: string, hour = 18, minute = 0) {
  const [year, month, day] = dateIso.split("-");
  return `${year}${month}${day}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
}

function icsUtcNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildTrainingCalendar(workouts: CalendarSyncWorkout[]) {
  const stamp = icsUtcNow();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FIT AI//Planning Entrainement//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FIT AI - Planning",
  ];
  workouts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((workout) => {
      const { hour, minute } = splitTrainingTime(workout.training_time);
      const start = icsDateTime(workout.date, hour, minute);
      const duration = Math.max(20, workout.duration_min || 45);
      const endDate = new Date(`${workout.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
      endDate.setMinutes(endDate.getMinutes() + duration);
      const end = icsDateTime(toLocalIsoDate(endDate), endDate.getHours(), endDate.getMinutes());
      const exercises = workout.exercises
        .map((exercise) => `${exercise.name} - ${exercise.sets} x ${exercise.reps}`)
        .join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsEscape(workout.id)}@fit-ai`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(`FIT AI - ${workout.focus || workout.title}`)}`,
        `DESCRIPTION:${icsEscape(`${workout.title}\n${workout.session_type || "Séance"} · ${duration} min\n${exercises}`)}`,
        "END:VEVENT"
      );
    });
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

async function getOrCreateFitAiCalendarId() {
  const existing = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const current = existing.find((item) => item.title === "FIT AI" && item.allowsModifications);
  if (current?.id) return current.id;

  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return Calendar.createCalendarAsync({
      title: "FIT AI",
      color: "#B6FF3F",
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.sourceId,
      source: defaultCalendar.source,
      name: "FIT AI",
      ownerAccount: "FIT AI",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  return Calendar.createCalendarAsync({
    title: "FIT AI",
    color: "#B6FF3F",
    entityType: Calendar.EntityTypes.EVENT,
    source: { name: "FIT AI", isLocalAccount: true, type: Calendar.SourceType.LOCAL },
    name: "FIT AI",
    ownerAccount: "FIT AI",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

async function syncWorkoutsToNativeCalendar(workouts: CalendarSyncWorkout[]) {
  if (Platform.OS === "web") return 0;
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) return 0;
  const calendarId = await getOrCreateFitAiCalendarId();
  let count = 0;
  for (const workout of workouts.slice(0, 120)) {
    const { hour, minute } = splitTrainingTime(workout.training_time);
    const startDate = new Date(`${workout.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + Math.max(20, workout.duration_min || 45));
    const exercises = workout.exercises
      .map((exercise) => `${exercise.name} - ${exercise.sets} x ${exercise.reps}`)
      .join("\n");
    try {
      await Calendar.createEventAsync(calendarId, {
        title: `FIT AI - ${workout.focus || workout.title}`,
        startDate,
        endDate,
        notes: `${workout.title}\n${workout.session_type || "Séance"} · ${workout.duration_min || 45} min\n${exercises}`,
        alarms: [{ relativeOffset: -60 }],
      });
      count += 1;
    } catch (e) {
      console.warn("native calendar event", e);
    }
  }
  return count;
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
  const router = useRouter();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<TrainingTab>("today");
  const [simpleMode, setSimpleMode] = useState(false);
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
  const [syncingAgenda, setSyncingAgenda] = useState(false);
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
  const [setupFreq, setSetupFreq] = useState<2 | 3 | 4 | 5 | 6>(3);
  const [setupDays, setSetupDays] = useState<number[]>([0, 2, 4]);
  const [setupSplit, setSetupSplit] = useState<"ppl" | "fullbody" | "split" | "upper_lower" | "home">("ppl");
  const [setupGoal, setSetupGoal] = useState("Masse");
  const [setupBlocks, setSetupBlocks] = useState<{ volume: number; puissance: number; force: number }>({ volume: 1, puissance: 1, force: 1 });
  const [setupChangeMode, setSetupChangeMode] = useState<"stable" | "changed">("stable");
  const [setupShowRecommendation, setSetupShowRecommendation] = useState(false);
  const [setupSameTime, setSetupSameTime] = useState(true);
  const [setupDefaultTime, setSetupDefaultTime] = useState("18:30");
  const [setupTrainingTimes, setSetupTrainingTimes] = useState<Record<string, string>>({});
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

  // Guided session flow
  const [sessionRunnerOpen, setSessionRunnerOpen] = useState(false);
  const [startingToday, setStartingToday] = useState(false);
  const [runnerWorkout, setRunnerWorkout] = useState<Workout | null>(null);
  const [runnerIndex, setRunnerIndex] = useState(0);
  const [runnerDrafts, setRunnerDrafts] = useState<Record<string, SessionDraft>>({});
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, a, lib, prog, simple] = await Promise.all([
        api<Workout[]>("/workouts/week"),
        api<Activity>(`/activity?date=${today}`),
        api<{ exercises: LibExercise[]; session_types: SessionTypes }>("/exercises/library"),
        api<{ program: TrainingProgram | null }>("/program/current").catch(() => ({ program: null })),
        getSimpleMode().catch(() => false),
      ]);
      setWeek(w);
      setActivity(a);
      setSteps(String(a.steps || ""));
      setCardioMin(String(a.cardio_minutes || ""));
      setCardioType(a.cardio_type || "");
      setLibrary(lib.exercises);
      setSessionTypes(lib.session_types);
      setProgram(prog.program || null);
      setSimpleMode(Boolean(simple));
      if (simple) setTab("today");
      if (prog.program && expandedWeek === null) {
        setExpandedWeek(prog.program.current_week);
      }
    } catch (e) {
      console.warn("training load", e);
    }
  }, [today, expandedWeek]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    readDefaultTrainingTime()
      .then((time) => {
        setSetupDefaultTime((current) => (current === "18:30" ? time : normalizeTrainingTime(current || time)));
        setSetupTrainingTimes((current) => (Object.keys(current).length ? current : { "0": time, "2": time, "4": time }));
      })
      .catch(() => undefined);
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      await api(`/workouts/generate?session_type=${generateType}`, { method: "POST" });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const completeWorkout = async (id: string, options: { showShare?: boolean } = {}) => {
    const showShare = options.showShare ?? true;
    await api(`/workouts/${id}/complete`, { method: "POST" });
    // Build share card data
    if (showShare) try {
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

  const uncompleteWorkout = async (id: string) => {
    await api(`/workouts/${id}/uncomplete`, { method: "POST" });
    await load();
    await loadHistory();
    if (tab === "calendar") loadCalendar(calMonth);
  };

  const deleteHistoryWorkout = (workout: Workout) => {
    Alert.alert(
      "Supprimer la séance",
      "La séance, ses performances et ses points directs seront retirés de l'historique.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/workouts/${workout.id}`, { method: "DELETE" });
              setHistoryExpanded(null);
              await load();
              await loadHistory();
              if (tab === "calendar") loadCalendar(calMonth);
            } catch {
              Alert.alert("Erreur", "Impossible de supprimer cette séance.");
            }
          },
        },
      ]
    );
  };

  const toggleWorkoutComplete = async (workout: Workout) => {
    if (workout.completed) {
      await uncompleteWorkout(workout.id);
      return;
    }
    await completeWorkout(workout.id, { showShare: false });
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

  const syncPlanningToPhoneAgenda = useCallback(async () => {
    setSyncingAgenda(true);
    try {
      const planned = plannedWorkoutsFromProgram(program);
      const byDate = new Map<string, CalendarSyncWorkout>();
      planned.forEach((item) => byDate.set(item.date, item));
      week.forEach((workout) => {
        if (!workout.date) return;
        byDate.set(workout.date, {
          id: workout.id,
          date: workout.date,
          title: workout.title,
          focus: workout.focus,
          duration_min: workout.duration_min,
          exercises: workout.exercises.filter((exercise) => exercise.checked !== false),
          session_type: workout.session_type,
          training_time: trainingTimeForDate(program, workout.date),
        });
      });
      const events = Array.from(byDate.values()).filter((item) => item.exercises.length > 0);
      if (events.length === 0) {
        Alert.alert("Agenda", "Aucune séance à synchroniser pour le moment.");
        return;
      }

      if (Platform.OS !== "web") {
        const synced = await syncWorkoutsToNativeCalendar(events);
        if (synced > 0) {
          Alert.alert("Agenda synchronisé", `${synced} séance${synced > 1 ? "s" : ""} ajoutée${synced > 1 ? "s" : ""} dans le calendrier FIT AI.`);
          return;
        }
      }

      const ics = buildTrainingCalendar(events);
      const filename = `fit-ai-planning-${toLocalIsoDate(new Date())}.ics`;

      if (Platform.OS === "web" && typeof window !== "undefined" && typeof document !== "undefined") {
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        Alert.alert("Agenda prêt", "Le fichier calendrier a été téléchargé.");
        return;
      }

      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) {
        Alert.alert("Agenda indisponible", "Impossible de créer le fichier calendrier sur ce téléphone.");
        return;
      }
      const uri = `${baseDir}${filename}`;
      await FileSystem.writeAsStringAsync(uri, ics, { encoding: FileSystem.EncodingType.UTF8 });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Agenda prêt", "Le partage natif n'est pas disponible sur ce téléphone.");
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: "Ajouter mes séances FIT AI à l'agenda",
        mimeType: "text/calendar",
        UTI: "com.apple.ical.ics",
      });
    } catch (e) {
      console.warn("sync agenda", e);
      Alert.alert("Synchronisation impossible", "Impossible de préparer l'agenda pour le moment.");
    } finally {
      setSyncingAgenda(false);
    }
  }, [program, week]);

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

  const pauseRestTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setRestRunning(false);
  }, []);

  const resumeRestTimer = useCallback(() => {
    if (restRemaining <= 0 || timerIntervalRef.current) return;
    finishedRef.current = false;
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
  }, [beep, restRemaining]);

  const toggleRestTimer = useCallback(() => {
    if (restRunning) pauseRestTimer();
    else resumeRestTimer();
  }, [pauseRestTimer, restRunning, resumeRestTimer]);

  const adjustRest = useCallback((delta: number) => {
    setRestRemaining((prev) => Math.max(0, prev + delta));
    setRestTotal((prev) => Math.max(prev + delta, prev));
  }, []);

  const startOrToggleRestTimer = useCallback((seconds: number) => {
    if (restRemaining > 0) {
      toggleRestTimer();
      return;
    }
    startRestTimer(seconds);
  }, [restRemaining, startRestTimer, toggleRestTimer]);

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
      const dayDefaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
      const freq = overrides?.frequency ?? setupFreq;
      const selectedDays = overrides?.training_days ?? (setupDays.length === freq ? setupDays : dayDefaults[freq] ?? setupDays);
      const trainingTimes = Object.fromEntries(
        selectedDays.map((day) => [
          String(day),
          normalizeTrainingTime(setupSameTime ? setupDefaultTime : setupTrainingTimes[String(day)] || setupDefaultTime),
        ])
      );
      const created = await api<TrainingProgram>("/program/create", {
        method: "POST",
        body: {
          weeks: overrides?.weeks ?? setupWeeks,
          frequency: freq,
          training_days: selectedDays,
          training_times: trainingTimes,
          split: overrides?.split ?? setupSplit,
          goal_label: overrides?.goal_label ?? setupGoal,
          block_weeks: setupBlocks,
        },
      });
      setProgram(created);
      setExpandedWeek(1);
      setProgramSetupOpen(false);
      await load();
      if (tab === "calendar") await loadCalendar(calMonth);
    } catch (e: any) {
      Alert.alert("Programme", e?.message || "Impossible d'appliquer ce programme pour le moment.");
    } finally {
      setCreatingProgram(false);
    }
  };

  const openProgramSetup = () => {
    setSetupChangeMode("stable");
    if (program) {
      setSetupGoal(program.goal_label || setupGoal);
      setSetupWeeks(program.weeks_total || setupWeeks);
      const freq = Math.max(2, Math.min(6, program.frequency || setupFreq)) as 2 | 3 | 4 | 5 | 6;
      setSetupFreq(freq);
      setSetupSplit((program.split || setupSplit) as "ppl" | "fullbody" | "split" | "upper_lower" | "home");
      setSetupBlocks({
        volume: Math.max(1, Math.min(4, Number(program.block_weeks?.volume || 1))),
        puissance: Math.max(1, Math.min(4, Number(program.block_weeks?.puissance || 1))),
        force: Math.max(1, Math.min(4, Number(program.block_weeks?.force || 1))),
      });
      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
      const days = program.training_days?.length ? program.training_days : defaults[freq] || setupDays;
      setSetupDays(days);
      const times = program.training_times || {};
      const firstTime = normalizeTrainingTime(times[String(days[0])] || setupDefaultTime);
      setSetupDefaultTime(firstTime);
      setSetupTrainingTimes(Object.fromEntries(days.map((day) => [String(day), normalizeTrainingTime(times[String(day)] || firstTime)])));
      setSetupSameTime(days.every((day) => normalizeTrainingTime(times[String(day)] || firstTime) === firstTime));
    }
    setProgramSetupOpen(true);
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
    if (tab === "history") await loadHistory();
  };

  const moveExerciseInEditor = (from: number, to: number) => {
    if (!editWorkout || to < 0 || to >= editWorkout.exercises.length) return;
    const next = editWorkout.exercises.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setEditWorkout({ ...editWorkout, exercises: next });
  };

  const startGuidedSession = (workout: Workout) => {
    const exercises = workout.exercises.filter((e) => e.checked !== false);
    const drafts: Record<string, SessionDraft> = {};
    exercises.forEach((ex) => {
      drafts[ex.name] = {
        sets: String(ex.sets || 3),
        reps: String(ex.reps || "10"),
        weight: "",
        rest: String(getRestForExercise(ex.name, workout.session_type) || ex.rest_s || 60),
        pr: false,
        done: false,
      };
    });
    setRunnerWorkout({ ...workout, exercises });
    setRunnerDrafts(drafts);
    setRunnerIndex(0);
    setSessionResult(null);
    setSessionRunnerOpen(true);
  };

  const startTodayWorkout = async (workout: Workout) => {
    if (startingToday) return;
    if (!workout.id.startsWith("prog:")) {
      startGuidedSession(workout);
      return;
    }
    setStartingToday(true);
    try {
      const [, programId, weekIndex, dayIndex] = workout.id.split(":");
      const materialized = await api<Workout>("/program/day-workout", {
        method: "POST",
        body: {
          program_id: programId,
          week_index: parseInt(weekIndex || "1", 10),
          day_index: parseInt(dayIndex || "0", 10),
          date: today,
        },
      });
      await load();
      startGuidedSession(materialized);
    } catch (e) {
      console.warn("program day workout fallback", e);
      startGuidedSession(workout);
    } finally {
      setStartingToday(false);
    }
  };

  const toggleTodayWorkoutCheck = async (workout: Workout) => {
    if (workout.id.startsWith("draft:")) {
      setProgramSetupOpen(true);
      return;
    }
    if (!workout.id.startsWith("prog:")) {
      await toggleWorkoutComplete(workout);
      return;
    }
    setStartingToday(true);
    try {
      const [, programId, weekIndex, dayIndex] = workout.id.split(":");
      const materialized = await api<Workout>("/program/day-workout", {
        method: "POST",
        body: {
          program_id: programId,
          week_index: parseInt(weekIndex || "1", 10),
          day_index: parseInt(dayIndex || "0", 10),
          date: today,
        },
      });
      await completeWorkout(materialized.id, { showShare: false });
    } finally {
      setStartingToday(false);
    }
  };

  const updateRunnerDraft = (exerciseName: string, patch: Partial<SessionDraft>) => {
    setRunnerDrafts((prev) => ({
      ...prev,
      [exerciseName]: { ...prev[exerciseName], ...patch },
    }));
  };

  const adjustRunnerDraftNumber = (
    exerciseName: string,
    field: "sets" | "reps" | "weight" | "rest",
    delta: number,
    minimum = 0
  ) => {
    const current = runnerDrafts[exerciseName]?.[field] || "0";
    const numeric = field === "weight" ? parseFloat(current || "0") : parseInt(current || "0", 10);
    const next = Math.max(minimum, (Number.isFinite(numeric) ? numeric : 0) + delta);
    updateRunnerDraft(exerciseName, {
      [field]: field === "weight" ? String(Math.round(next * 10) / 10) : String(Math.round(next)),
    });
  };

  const validateRunnerExercise = async () => {
    if (!runnerWorkout) return;
    const exercises = runnerWorkout.exercises.filter((e) => e.checked !== false);
    const exercise = exercises[runnerIndex];
    if (!exercise) return;
    const draft = runnerDrafts[exercise.name] || {
      sets: String(exercise.sets || 3),
      reps: String(exercise.reps || "10"),
      weight: "",
      rest: String(exercise.rest_s || getRestForExercise(exercise.name, runnerWorkout.session_type) || 60),
      pr: false,
      done: false,
    };
    const weight = parseFloat(draft?.weight || "0");
    const reps = parseInt((draft?.reps || "").toString().match(/\d+/)?.[0] || "0", 10);
    const sets = parseInt(draft?.sets || "1", 10) || 1;
    if (weight > 0 && reps > 0 && !runnerWorkout.id.startsWith("prog:") && !runnerWorkout.id.startsWith("draft:")) {
      try {
        await api(`/workouts/${runnerWorkout.id}/perf`, {
          method: "POST",
          body: {
            workout_id: runnerWorkout.id,
            exercise_name: exercise.name,
            weight_kg: weight,
            reps,
            sets,
            notes: draft?.pr ? "PR" : undefined,
          },
        });
      } catch (e) {
        console.warn("runner perf", e);
      }
    }
    const nextDrafts = {
      ...runnerDrafts,
      [exercise.name]: { ...draft, done: true },
    };
    setRunnerDrafts(nextDrafts);
    const allDone = exercises.every((ex) => nextDrafts[ex.name]?.done);
    if (allDone) {
      await finishGuidedSession(nextDrafts);
      return;
    }
    const nextIndex = exercises.findIndex((ex, index) => index !== runnerIndex && !nextDrafts[ex.name]?.done);
    if (nextIndex >= 0) setRunnerIndex(nextIndex);
  };

  const finishGuidedSession = async (drafts: Record<string, SessionDraft> = runnerDrafts) => {
    if (!runnerWorkout) return;
    const exercises = runnerWorkout.exercises.filter((e) => e.checked !== false);
    let volume = 0;
    let restSeconds = 0;
    let prs = 0;
    exercises.forEach((ex) => {
      const draft = drafts[ex.name];
      const sets = parseInt(draft?.sets || String(ex.sets || 1), 10) || 1;
      const reps = parseInt((draft?.reps || ex.reps || "0").toString().match(/\d+/)?.[0] || "0", 10) || 0;
      const weight = parseFloat(draft?.weight || "0") || 0;
      const rest = parseInt(draft?.rest || String(ex.rest_s || 60), 10) || 60;
      volume += sets * reps * weight;
      restSeconds += Math.max(0, sets - 1) * rest;
      if (draft?.pr) prs += 1;
    });
    try {
      if (!runnerWorkout.id.startsWith("draft:") && !runnerWorkout.id.startsWith("prog:")) {
        await api(`/workouts/${runnerWorkout.id}/complete`, { method: "POST" });
        setWeek((prev) => {
          const exists = prev.some((item) => item.id === runnerWorkout.id);
          if (exists) {
            return prev.map((item) => item.id === runnerWorkout.id ? { ...item, completed: true } : item);
          }
          return [{ ...runnerWorkout, completed: true }, ...prev];
        });
      }
    } catch (e) {
      console.warn("runner complete", e);
    }
    const duration = Math.max(runnerWorkout.duration_min || 0, Math.round((runnerWorkout.duration_min || 35) + restSeconds / 60));
    const calories = Math.round(duration * 5.4 + volume / 85);
    setSessionResult({
      prs,
      volume: Math.round(volume),
      duration,
      calories,
      xp: 100 + prs * 20,
    });
    setSessionRunnerOpen(false);
    if (!runnerWorkout.id.startsWith("draft:")) await load();
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
  const selectedProgramWeek = expandedWeek || program?.current_week || 1;
  const activeProgramWeek = program?.weeks.find((w) => w.week_index === selectedProgramWeek);
  const selectedDay = activeProgramWeek?.days.find((d) => {
    const fromWorkout = todayWorkout?.focus || todayWorkout?.title;
    return fromWorkout ? d.focus.toLowerCase().includes(fromWorkout.toLowerCase().split(" ")[0]) : false;
  }) || activeProgramWeek?.days[0];
  const plannedTodayWorkout: Workout | null = todayWorkout || (program && activeProgramWeek && selectedDay ? {
    id: `prog:${program.id}:${activeProgramWeek.week_index}:${selectedDay.day_index}`,
    date: today,
    title: `${program.split.toUpperCase()} ${sessionLabelForIndex(selectedDay.day_index, program.training_days)}`,
    focus: selectedDay.focus,
    duration_min: 45,
    exercises: selectedDay.exercises.map((exercise) => ({ ...exercise, checked: exercise.checked !== false })),
    completed: false,
    session_type: activeProgramWeek.session_type,
  } : {
    id: "draft:fullbody-j1",
    date: today,
    title: "FULLBODY J1",
    focus: "Force + Hypertrophie",
    duration_min: 45,
    exercises: DEFAULT_TODAY_EXERCISES,
    completed: false,
    session_type: "volume",
  });
  const todayExercises = plannedTodayWorkout?.exercises.filter((e) => e.checked !== false) || [];
  const runnerExercises = runnerWorkout?.exercises.filter((e) => e.checked !== false) || [];
  const runnerExercise = runnerExercises[runnerIndex] || null;
  const runnerDraft = runnerExercise ? runnerDrafts[runnerExercise.name] : null;
  const runnerProgress = runnerExercises.length > 0 ? Math.round(((runnerIndex + 1) / runnerExercises.length) * 100) : 0;
  const runnerRestSeconds = runnerDraft
    ? (restRemaining > 0 ? restRemaining : parseInt(runnerDraft.rest || "0", 10) || runnerExercise?.rest_s || 60)
    : restRemaining;
  const programProgress = program?.weeks_total
    ? Math.min(100, Math.round(((program.current_week + 1) / program.weeks_total) * 100))
    : 0;
  const todayPlanLabel = program
    ? `${(program.split || "fullbody").toUpperCase()} ${sessionLabelForIndex(selectedDay?.day_index ?? 0, program.training_days)}`
    : plannedTodayWorkout?.title || "FULLBODY J1";
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
      <ImageBackground
        source={require("../../assets/images/fitai-hero-program-hd.png")}
        style={styles.trainingHero}
        imageStyle={styles.trainingHeroImage}
        resizeMode="cover"
      >
        <View style={styles.trainingHeroShade} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroCaption}>Ton parcours</Text>
            <Text style={styles.title}>Transforme-toi</Text>
            <MotivationalScript style={styles.heroScript}>libère ton esprit.</MotivationalScript>
          </View>
          <View style={styles.heroProgress}>
            <Text style={styles.heroProgressValue}>{programProgress}%</Text>
            <Text style={styles.heroProgressLabel}>terminé</Text>
          </View>
        </View>

        {!simpleMode && (
        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setTab("today")} style={[styles.tabChip, tab === "today" && styles.tabChipActive]} testID="training-tab-today">
            <Ionicons name="leaf-outline" size={13} color={tab === "today" ? "#102108" : colors.textMuted} />
            <Text style={[styles.tabText, tab === "today" && styles.tabTextActive]}>Aujourd&apos;hui</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab("recommendation")} style={[styles.tabChip, tab === "recommendation" && styles.tabChipActive]} testID="training-tab-recommendation">
            <Ionicons name="sparkles-outline" size={13} color={tab === "recommendation" ? "#102108" : colors.textMuted} />
            <Text style={[styles.tabText, tab === "recommendation" && styles.tabTextActive]}>Recommandation IA</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab("calendar")} style={[styles.tabChip, tab === "calendar" && styles.tabChipActive]} testID="training-tab-calendar">
            <Ionicons name="calendar-outline" size={13} color={tab === "calendar" ? "#102108" : colors.textMuted} />
            <Text style={[styles.tabText, tab === "calendar" && styles.tabTextActive]}>Calendrier</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab("history")} style={[styles.tabChip, tab === "history" && styles.tabChipActive]} testID="training-tab-history">
            <Ionicons name="time-outline" size={13} color={tab === "history" ? "#102108" : colors.textMuted} />
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Historique</Text>
          </TouchableOpacity>
        </View>
        )}
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "today" && (
          <>
        {plannedTodayWorkout && (
          <Card testID="today-workout-card" style={styles.todayWorkoutCard}>
            <View style={styles.todayCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayCardEyebrow}>Ma séance du jour</Text>
                <Text style={styles.todayCardStatus}>
                  {plannedTodayWorkout.completed ? "Terminée · touche la coche verte pour annuler" : "Programme prévu pour aujourd'hui"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleTodayWorkoutCheck(plannedTodayWorkout)}
                activeOpacity={0.84}
                disabled={startingToday}
                style={[styles.todayCheckButton, plannedTodayWorkout.completed && styles.todayCheckButtonDone, startingToday && { opacity: 0.55 }]}
                testID="today-workout-toggle"
              >
                <Ionicons name={plannedTodayWorkout.completed ? "checkmark" : "ellipse-outline"} size={18} color={plannedTodayWorkout.completed ? "#102108" : colors.primaryLight} />
              </TouchableOpacity>
            </View>

            <View style={styles.todayMainRow}>
              <ImageBackground
                source={exerciseVisualFor(plannedTodayWorkout.focus || plannedTodayWorkout.title, 0)}
                style={styles.todayThumb}
                imageStyle={styles.todayThumbImage}
                resizeMode="cover"
              >
                <View style={styles.todayThumbShade} />
              </ImageBackground>
              <View style={{ flex: 1 }}>
                <View style={styles.todayMetaRow}>
                  <Ionicons name="barbell" size={14} color={colors.primaryLight} />
                  <Text style={styles.todayMetaText}>Aujourd&apos;hui</Text>
                  <Text style={styles.todayDot}>•</Text>
                  <Text style={styles.todayMetaText}>{plannedTodayWorkout.duration_min} min</Text>
                  <Text style={styles.todayDot}>•</Text>
                  <Text style={styles.todayMetaText}>{todayExercises.length} exercices</Text>
                </View>
                <Text style={styles.todayCardTitle}>{todayPlanLabel}</Text>
                <Text style={styles.todayCardSub} numberOfLines={2}>
                  {plannedTodayWorkout.focus || todayExercises.slice(0, 3).map((ex) => ex.name).join(", ")}
                </Text>
                <View style={styles.todaySmallPill}>
                  <Ionicons name={plannedTodayWorkout.completed ? "checkmark-circle" : "radio-button-off"} size={12} color={colors.primaryLight} />
                  <Text style={styles.todaySmallPillText}>{plannedTodayWorkout.completed ? "Validée aujourd'hui" : "À faire aujourd'hui"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.todayActionRow}>
              <TouchableOpacity
                onPress={() => startTodayWorkout(plannedTodayWorkout)}
                activeOpacity={0.86}
                disabled={startingToday}
                style={[styles.startTodayButton, startingToday && { opacity: 0.7 }]}
                testID="complete-workout-button"
              >
                <Ionicons name="play-circle" size={18} color="#102108" />
                <Text style={styles.startTodayText}>{startingToday ? "Préparation..." : "Commencer ma séance du jour"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => plannedTodayWorkout.id.startsWith("draft:") ? setProgramSetupOpen(true) : openEditor(plannedTodayWorkout)}
                style={styles.todayEditIconButton}
                testID="edit-today-workout"
              >
                <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
              </TouchableOpacity>
            </View>

            <View style={styles.plannedExerciseList}>
              <View style={styles.plannedExerciseHeader}>
                <Text style={styles.plannedExerciseTitle}>Exercices prévus</Text>
                <Text style={styles.plannedExerciseCount}>{todayExercises.length} au programme</Text>
              </View>
              {todayExercises.map((exercise, index) => (
                <View key={`${exercise.name}-${index}`} style={styles.plannedExerciseRow} testID={`planned-exercise-${index}`}>
                  <ImageBackground
                    source={exerciseVisualFor(exercise.name, index)}
                    style={styles.plannedExerciseThumb}
                    imageStyle={styles.plannedExerciseThumbImage}
                    resizeMode="cover"
                  >
                    <View style={styles.plannedExerciseShade} />
                    <Text style={styles.plannedExerciseIndex}>{index + 1}</Text>
                  </ImageBackground>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.plannedExerciseName} numberOfLines={1}>{exercise.name}</Text>
                    <Text style={styles.plannedExerciseMeta}>{exercise.sets} séries · {exercise.reps} · repos {exercise.rest_s || 60}s</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                </View>
              ))}
            </View>

            {plannedTodayWorkout.completed && (
              <Button
                title="Partager ma performance"
                variant="primary"
                onPress={async () => {
                  try {
                    const sType = (plannedTodayWorkout.session_type || "").toString();
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
                      duration_min: plannedTodayWorkout.duration_min,
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
        )}

        {program && (
          <View testID="my-program-section" style={styles.programSection}>
            <View style={styles.programSectionHeader}>
              <Text style={styles.programSectionTitle}>Mon programme</Text>
              <Text style={styles.programSectionHint}>{program.frequency} séance{program.frequency > 1 ? "s" : ""} / semaine</Text>
            </View>
            <ProgramWeekSelector
              weeksTotal={program.weeks_total}
              currentWeek={program.current_week}
              selectedWeek={selectedProgramWeek}
              onSelect={setExpandedWeek}
            />
            {activeProgramWeek && (
              <ProgramJourneyCard
                week={activeProgramWeek}
                totalWeeks={program.weeks_total}
                currentWeek={program.current_week}
                isCurrent={program.current_week === activeProgramWeek.week_index}
                selectedDay={selectedDay}
                trainingDays={program.training_days}
                onEditDay={(dayIndex) => openProgramDayEditor(program, activeProgramWeek.week_index, dayIndex)}
              />
            )}
            {!simpleMode && (
              <View style={styles.programBottomButtonRow} testID="program-bottom-modify-row">
                <TouchableOpacity onPress={openProgramSetup} style={[styles.actionBtn, styles.programBottomButton]} testID="program-modify-bottom">
                  <Ionicons name="create-outline" size={14} color={colors.primaryLight} />
                  <Text style={[typography.small, { color: colors.primaryLight, fontWeight: "800" }]}>Modifier</Text>
                </TouchableOpacity>
                {program.is_travel ? (
                  <TouchableOpacity
                    onPress={endTravelMode}
                    disabled={travelBusy}
                    style={[styles.actionBtn, styles.programBottomButton, travelBusy && { opacity: 0.5 }]}
                    testID="summary-end-travel"
                  >
                    <Ionicons name="arrow-undo" size={14} color={colors.primaryLight} />
                    <Text style={[typography.small, { color: colors.primaryLight, fontWeight: "800" }]}>Reprendre</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setTravelOpen(true)}
                    disabled={travelBusy}
                    style={[styles.actionBtn, styles.programBottomButton, travelBusy && { opacity: 0.5 }]}
                    testID="summary-travel"
                  >
                    <Ionicons name="airplane-outline" size={14} color={colors.primaryLight} />
                    <Text style={[typography.small, { color: colors.primaryLight, fontWeight: "800" }]}>Déplacement</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {!program && (
          <View style={styles.programSection} testID="program-picker-lower">
            <View style={styles.programSectionHeader}>
              <Text style={styles.programSectionTitle}>Choisir mon programme</Text>
              <Text style={styles.programSectionHint}>Le plan se calera sur ta séance du jour.</Text>
            </View>
            <ProgramCarousel
              onSelectProgram={(goalLabel, freq, split, weeks) =>
                createProgram({ goal_label: goalLabel, frequency: freq, split, weeks: weeks || presetByGoal(goalLabel).defaultWeeks })
              }
              loading={creatingProgram}
            />
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
          </>
        )}

        {tab === "recommendation" && !simpleMode && (
          <>
            <Card testID="ai-recommendation-tab" style={{ gap: spacing.md }}>
              <SectionTitle title="Recommandation IA" />
              <Text style={styles.structureSetupSub}>
                Choisis ton objectif et ton nombre de séances. FIT AI te propose ensuite la structure la plus logique.
              </Text>

              <Text style={[typography.caption, { marginTop: spacing.xs }]}>Objectif</Text>
              <View style={styles.setupOptionRow}>
                {PROGRAM_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => {
                      setSetupGoal(preset.goalLabel);
                      setSetupWeeks(preset.defaultWeeks);
                      setSetupFreq(preset.defaultFrequency as 2 | 3 | 4 | 5 | 6);
                      setSetupSplit(recommendedSplitForFrequency(preset.defaultFrequency));
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
                      setSetupDays(defaults[preset.defaultFrequency] || [0, 2, 4]);
                      setSetupShowRecommendation(true);
                    }}
                    style={[styles.setupOption, setupGoal === preset.goalLabel && styles.setupOptionOn]}
                    testID={`recommendation-goal-${preset.id}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupGoal === preset.goalLabel && styles.setupOptionLabelOn]}>{preset.goalLabel}</Text>
                    <Text style={styles.setupOptionSub}>{preset.defaultWeeks} sem.</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[typography.caption, { marginTop: spacing.xs }]}>Séances par semaine</Text>
              <View style={styles.setupOptionRow}>
                {([2, 3, 4, 5, 6] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => {
                      setSetupFreq(f);
                      setSetupSplit(recommendedSplitForFrequency(f));
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
                      setSetupDays(defaults[f]);
                      setSetupShowRecommendation(true);
                    }}
                    style={[styles.setupOption, setupFreq === f && styles.setupOptionOn]}
                    testID={`recommendation-freq-${f}`}
                  >
                    <Text style={[styles.setupOptionLabel, setupFreq === f && styles.setupOptionLabelOn]}>{f}j</Text>
                    <Text style={styles.setupOptionSub}>{f <= 3 ? "Full body" : f === 4 ? "Upper / Lower" : "PPL"}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <StructureRecommendationPanel
                setupSplit={setupSplit}
                setupFreq={setupFreq}
                setupGoal={setupGoal}
                setupShowRecommendation={setupShowRecommendation}
                setSetupSplit={setSetupSplit}
                setSetupShowRecommendation={setSetupShowRecommendation}
              />

              <Button
                title={creatingProgram ? "Application..." : program ? "Appliquer cette structure" : "Créer avec cette structure"}
                onPress={() => createProgram()}
                loading={creatingProgram}
                icon={<Ionicons name="checkmark-circle" size={16} color="#102108" />}
                testID="recommendation-apply-structure"
              />
            </Card>
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
              title="Synchroniser l'agenda du téléphone"
              variant="primary"
              loading={syncingAgenda}
              onPress={syncPlanningToPhoneAgenda}
              icon={<Ionicons name="calendar-outline" size={15} color="#102108" />}
              style={{ marginTop: spacing.sm }}
              testID="calendar-sync-phone"
            />

            <Button
              title="Mettre à jour le calendrier"
              variant="secondary"
              loading={calLoading}
              onPress={() => loadCalendar(calMonth)}
              icon={<Ionicons name="sync-outline" size={15} color={colors.primaryLight} />}
              style={{ marginTop: spacing.sm }}
              testID="calendar-refresh"
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
                        <View style={styles.historyPointsPill}>
                          <Ionicons name="star" size={12} color={colors.primaryLight} />
                          <Text style={styles.historyPointsText}>+{w.points_earned || 100} pts</Text>
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
                        <View style={styles.historyActionRow}>
                          <TouchableOpacity
                            onPress={() => openEditor(w)}
                            style={styles.historyActionButton}
                            testID={`history-edit-${w.id}`}
                          >
                            <Ionicons name="create-outline" size={14} color={colors.primaryLight} />
                            <Text style={styles.historyActionText}>Modifier</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => uncompleteWorkout(w.id)}
                            style={styles.historyActionButton}
                            testID={`history-uncomplete-${w.id}`}
                          >
                            <Ionicons name="arrow-undo-outline" size={14} color={colors.primaryLight} />
                            <Text style={styles.historyActionText}>Annuler</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => deleteHistoryWorkout(w)}
                            style={[styles.historyActionButton, styles.historyDeleteButton]}
                            testID={`history-delete-${w.id}`}
                          >
                            <Ionicons name="trash-outline" size={14} color={colors.alert} />
                            <Text style={[styles.historyActionText, { color: colors.alert }]}>Supprimer</Text>
                          </TouchableOpacity>
                        </View>
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
      {(restRunning || restRemaining > 0) && !sessionRunnerOpen && (
        <View style={styles.timerOverlay} testID="rest-timer-overlay">
          <View style={styles.timerCard}>
            <Ionicons name="timer-outline" size={14} color={colors.primaryLight} />
            <Text style={styles.timerBig}>{formatSecondsLabel(restRemaining)}</Text>
            <View style={styles.timerProgressTrack}>
              <View style={[styles.timerProgressFill, { width: `${restTotal > 0 ? Math.min(100, (1 - restRemaining / restTotal) * 100) : 0}%` }]} />
            </View>
            <View style={styles.timerMiniActions}>
              <TouchableOpacity onPress={toggleRestTimer} style={styles.timerPlayBtn} testID="timer-play-toggle">
                <Ionicons name={restRunning ? "pause" : "play"} size={13} color="#102108" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustRest(-15)} style={styles.timerBtn} testID="timer-minus">
                <Text style={styles.timerBtnTxt}>-15</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustRest(15)} style={styles.timerBtn} testID="timer-plus">
                <Text style={styles.timerBtnTxt}>+15</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={stopRestTimer} style={[styles.timerBtn, { backgroundColor: colors.alert }]} testID="timer-stop">
                <Ionicons name="close" size={12} color="#fff" />
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

      <Modal visible={sessionRunnerOpen && !!runnerWorkout && !!runnerExercise} transparent animationType="slide" onRequestClose={() => setSessionRunnerOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={[styles.modalCard, { padding: 0, overflow: "hidden" }]} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            {runnerExercise && runnerDraft ? (
              <>
                <ImageBackground
                  source={exerciseVisualFor(runnerExercise.name, runnerIndex)}
                  style={styles.runnerHero}
                  imageStyle={styles.runnerHeroImage}
                  resizeMode="cover"
                >
                  <View style={styles.runnerHeroShade} />
                  <View style={styles.runnerHeroTop}>
                    <TouchableOpacity onPress={() => setSessionRunnerOpen(false)} style={styles.runnerIconButton} testID="runner-close">
                      <Ionicons name="chevron-back" size={20} color={colors.textMain} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={styles.runnerExerciseName}>{runnerExercise.name}</Text>
                      <Text style={styles.runnerExerciseCount}>Exercice {runnerIndex + 1}/{runnerExercises.length}</Text>
                    </View>
                    <TouchableOpacity onPress={() => updateRunnerDraft(runnerExercise.name, { pr: !runnerDraft.pr })} style={[styles.runnerPrPill, runnerDraft.pr && styles.runnerPrPillOn]} testID="runner-pr">
                      <Ionicons name="sparkles" size={12} color={runnerDraft.pr ? "#102108" : colors.primaryLight} />
                      <Text style={[styles.runnerPrText, runnerDraft.pr && { color: "#102108" }]}>PR</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.runnerProgressBlock}>
                    <View style={styles.runnerProgressTop}>
                      <Text style={styles.runnerProgressLabel}>Progression de la séance</Text>
                      <Text style={styles.runnerProgressPct}>{runnerProgress}%</Text>
                    </View>
                    <View style={styles.runnerProgressTrack}>
                      <View style={[styles.runnerProgressFill, { width: `${runnerProgress}%` }]} />
                    </View>
                  </View>
                </ImageBackground>

                <View style={styles.runnerBody}>
                  <View style={styles.runnerStepperWrap}>
                    <TouchableOpacity
                      onPress={() => setRunnerIndex(Math.max(0, runnerIndex - 1))}
                      disabled={runnerIndex === 0}
                      style={[styles.runnerStepArrow, runnerIndex === 0 && { opacity: 0.35 }]}
                      testID="runner-prev-exercise"
                    >
                      <Ionicons name="chevron-back" size={18} color={colors.textMain} />
                    </TouchableOpacity>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.runnerExerciseRail}>
                      {runnerExercises.map((exercise, index) => {
                        const isActive = index === runnerIndex;
                        const isDone = !!runnerDrafts[exercise.name]?.done;
                        return (
                          <TouchableOpacity
                            key={`${exercise.name}-${index}`}
                            onPress={() => setRunnerIndex(index)}
                            activeOpacity={0.84}
                            style={[styles.runnerExerciseChip, isActive && styles.runnerExerciseChipActive, isDone && styles.runnerExerciseChipDone]}
                            testID={`runner-exercise-${index}`}
                          >
                            <View style={[styles.runnerExerciseChipIndex, isDone && styles.runnerExerciseChipIndexDone]}>
                              <Text style={[styles.runnerExerciseChipIndexText, isDone && { color: "#102108" }]}>{index + 1}</Text>
                            </View>
                            <Text style={[styles.runnerExerciseChipText, isActive && styles.runnerExerciseChipTextActive]} numberOfLines={1}>{exercise.name}</Text>
                            {isDone ? <Ionicons name="checkmark-circle" size={14} color={colors.primaryLight} /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => setRunnerIndex(Math.min(runnerExercises.length - 1, runnerIndex + 1))}
                      disabled={runnerIndex >= runnerExercises.length - 1}
                      style={[styles.runnerStepArrow, runnerIndex >= runnerExercises.length - 1 && { opacity: 0.35 }]}
                      testID="runner-next-exercise"
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.textMain} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.runnerSeriesCard}>
                    <View style={styles.runnerPanelHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.runnerSeriesTitle}>Paramètres de l&apos;exercice</Text>
                        <Text style={styles.runnerSeriesSub}>Séries terminées : {runnerDraft.done ? runnerDraft.sets || "0" : "0"} / {runnerDraft.sets || runnerExercise.sets || 0}</Text>
                      </View>
                      <TouchableOpacity style={styles.runnerAdvicePill} activeOpacity={0.84}>
                        <Ionicons name="bulb-outline" size={13} color={colors.primaryLight} />
                        <Text style={styles.runnerAdviceText}>Conseils</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.runnerParamGrid}>
                      <View style={styles.runnerParamCard}>
                        <TextInput
                          value={runnerDraft.reps}
                          onChangeText={(text) => updateRunnerDraft(runnerExercise.name, { reps: text.replace(/[^0-9-]/g, "") })}
                          keyboardType="numeric"
                          placeholder="8-10"
                          placeholderTextColor={colors.textMuted}
                          style={styles.runnerParamInput}
                        />
                        <Text style={styles.runnerParamLabel}>répétitions</Text>
                        <View style={styles.runnerTinyStepper}>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "reps", -1, 1)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="remove" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "reps", 1, 1)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="add" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.runnerParamCard}>
                        <TextInput
                          value={runnerDraft.sets}
                          onChangeText={(text) => updateRunnerDraft(runnerExercise.name, { sets: text.replace(/[^0-9]/g, "") })}
                          keyboardType="numeric"
                          placeholder="4"
                          placeholderTextColor={colors.textMuted}
                          style={styles.runnerParamInput}
                        />
                        <Text style={styles.runnerParamLabel}>séries</Text>
                        <View style={styles.runnerTinyStepper}>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "sets", -1, 1)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="remove" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "sets", 1, 1)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="add" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.runnerParamCard}>
                        <View style={styles.runnerWeightLine}>
	                          <TextInput
	                            value={runnerDraft.weight}
	                            onChangeText={(text) => updateRunnerDraft(runnerExercise.name, { weight: text.replace(/[^0-9.]/g, "") })}
	                            keyboardType="numeric"
	                            placeholder="0"
	                            placeholderTextColor={colors.textMuted}
	                            style={styles.runnerWeightInput}
	                          />
                          <Text style={styles.runnerParamUnit}>kg</Text>
                        </View>
                        <Text style={styles.runnerParamLabel}>charge</Text>
                        <View style={styles.runnerTinyStepper}>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "weight", -2.5, 0)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="remove" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "weight", 2.5, 0)} style={styles.runnerTinyStepButton}>
                            <Ionicons name="add" size={11} color={colors.primaryLight} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    <View style={styles.runnerRestPrRow}>
                      <View style={styles.runnerRestPanel}>
                        <View style={styles.runnerRestHeader}>
                          <Ionicons name="timer-outline" size={14} color={colors.primaryLight} />
                          <Text style={styles.runnerRestTitle}>Repos proposé</Text>
                          <TouchableOpacity onPress={() => updateRunnerDraft(runnerExercise.name, { rest: String(runnerExercise.rest_s || getRestForExercise(runnerExercise.name, runnerWorkout?.session_type)) })}>
                            <Text style={styles.runnerRestModify}>Modifier</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.runnerRestCircle}>
                          <Text style={styles.runnerRestTime}>{formatSecondsLabel(runnerRestSeconds)}</Text>
	                          <View style={styles.runnerRestControls}>
	                            <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "rest", -15, 0)} style={styles.runnerRestButton}>
	                              <Ionicons name="remove" size={12} color={colors.primaryLight} />
	                            </TouchableOpacity>
	                            <TouchableOpacity
	                              onPress={() => startOrToggleRestTimer(parseInt(runnerDraft.rest || "0", 10) || runnerExercise.rest_s || 60)}
	                              style={[styles.runnerRestPlayButton, restRemaining > 0 && styles.runnerRestPlayButtonActive]}
	                              testID="runner-rest-play"
	                            >
	                              <Text style={styles.runnerRestPlayText}>{restRemaining > 0 ? formatSecondsLabel(restRemaining) : "Start"}</Text>
	                            </TouchableOpacity>
	                            <TouchableOpacity onPress={() => adjustRunnerDraftNumber(runnerExercise.name, "rest", 15, 0)} style={styles.runnerRestButton}>
	                              <Ionicons name="add" size={12} color={colors.primaryLight} />
	                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.runnerRestHint}>Repos recommandé : {runnerExercise.rest_s || getRestForExercise(runnerExercise.name, runnerWorkout?.session_type)} sec</Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => updateRunnerDraft(runnerExercise.name, { pr: !runnerDraft.pr })}
                        activeOpacity={0.84}
                        style={[styles.runnerPrCheckCard, runnerDraft.pr && styles.runnerPrCheckCardOn]}
                        testID="runner-pr-checkbox"
                      >
                        <View style={styles.runnerPrIconLine}>
                          <Ionicons name="trophy-outline" size={15} color={colors.primaryLight} />
                          <Text style={styles.runnerPrCheckTitle}>C&apos;est un PR</Text>
                          <View style={[styles.runnerPrCheckbox, runnerDraft.pr && styles.runnerPrCheckboxOn]}>
                            {runnerDraft.pr ? <Ionicons name="checkmark" size={14} color="#102108" /> : null}
                          </View>
                        </View>
                        <Text style={styles.runnerPrCheckText}>Coche cette case si tu bats ton record perso sur cet exercice.</Text>
                        <View style={styles.runnerAiAdviceBox}>
                          <Ionicons name="sparkles-outline" size={12} color={colors.amber} />
                          <Text style={styles.runnerAiAdviceText}>Charge la fois 1 · Charge PR proche de ton meilleur vol.</Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.runnerBottomAction}>
                      <Button
                        title={runnerDraft.done ? "Exercice validé" : "Terminer / valider l'exercice"}
                        onPress={validateRunnerExercise}
                        disabled={runnerDraft.done}
                        icon={<Ionicons name="checkmark-circle" size={16} color="#102108" />}
                        testID="runner-validate"
                        style={{ flex: 1, marginTop: 0 }}
                      />
                      <TouchableOpacity
                        onPress={() => setRunnerIndex(Math.min(runnerExercises.length - 1, runnerIndex + 1))}
                        disabled={runnerIndex >= runnerExercises.length - 1}
                        style={[styles.runnerNextTextButton, runnerIndex >= runnerExercises.length - 1 && { opacity: 0.4 }]}
                        testID="runner-next-link"
                      >
                        <Text style={styles.runnerNextText}>Exercice suivant</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.primaryLight} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </>
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      </Modal>
      <Modal visible={!!sessionResult} transparent animationType="fade" onRequestClose={() => setSessionResult(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sessionDoneCard} testID="session-result-modal">
            <View style={styles.doneCheck}>
              <Ionicons name="checkmark" size={42} color={colors.primaryLight} />
            </View>
            <Text style={styles.doneTitle}>Séance terminée !</Text>
            <Text style={styles.doneSubtitle}>Incroyable, tu l&apos;as fait.</Text>
            {sessionResult ? (
              <>
                <View style={styles.doneMetricGrid}>
                  <DoneMetric icon="barbell-outline" label="Volume total" value={`${sessionResult.volume.toLocaleString("fr-FR")} kg`} />
                  <DoneMetric icon="timer-outline" label="Temps total" value={`${sessionResult.duration} min`} />
                  <DoneMetric icon="flame-outline" label="Calories" value={`${sessionResult.calories} kcal`} />
                  <DoneMetric icon="sparkles-outline" label="PR battus" value={`${sessionResult.prs}`} />
                </View>
                <View style={styles.doneXpBox}>
                  <Ionicons name="star" size={20} color={colors.primaryLight} />
                  <Text style={styles.doneXpText}>+{sessionResult.xp} XP</Text>
                </View>
              </>
            ) : null}
            <Button
              title="Voir mes trophées"
              onPress={() => {
                setSessionResult(null);
                router.push("/(tabs)/challenges");
              }}
              icon={<Ionicons name="trophy-outline" size={16} color="#102108" />}
              testID="session-result-close"
            />
          </View>
        </View>
      </Modal>

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
              <Text style={styles.modalTitle}>{program ? "Nouveaux objectifs" : "Crée ton programme"}</Text>
              <TouchableOpacity onPress={() => setProgramSetupOpen(false)} testID="program-setup-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
              {program ? (
                <View style={styles.goalUpdateIntro} testID="program-goal-update-intro">
                  <Text style={styles.goalUpdateTitle}>On ajuste seulement ce qui compte.</Text>
                  <Text style={styles.goalUpdateText}>
                    Si ton alimentation, ton activité et ton poids n&apos;ont pas changé, FIT AI garde tes bases et adapte surtout la structure. S&apos;il y a eu des changements, on repose les questions clés et on relance un programme cohérent.
                  </Text>
                  <View style={styles.setupOptionRow}>
                    <TouchableOpacity
                      onPress={() => setSetupChangeMode("stable")}
                      style={[styles.setupOption, setupChangeMode === "stable" && styles.setupOptionOn]}
                      testID="program-update-stable"
                    >
                      <Text style={[styles.setupOptionLabel, setupChangeMode === "stable" && styles.setupOptionLabelOn]}>Rien n&apos;a changé</Text>
                      <Text style={styles.setupOptionSub}>Même poids, rythme, alimentation</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setSetupChangeMode("changed")}
                      style={[styles.setupOption, setupChangeMode === "changed" && styles.setupOptionOn]}
                      testID="program-update-changed"
                    >
                      <Text style={[styles.setupOptionLabel, setupChangeMode === "changed" && styles.setupOptionLabelOn]}>Il y a du changement</Text>
                      <Text style={styles.setupOptionSub}>Objectif, poids ou activité</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Objectif</Text>
              <View style={styles.setupOptionRow}>
                {PROGRAM_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => {
                      setSetupGoal(preset.goalLabel);
                      setSetupWeeks(preset.defaultWeeks);
                      setSetupFreq(preset.defaultFrequency as 2 | 3 | 4 | 5 | 6);
                      setSetupSplit(preset.defaultSplit as "ppl" | "fullbody" | "split" | "upper_lower" | "home");
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
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
                {([2, 3, 4, 5, 6] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => {
                      setSetupFreq(f);
                      const defaults: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
                      setSetupDays(defaults[f]);
                    }}
                    style={[styles.setupOption, setupFreq === f && styles.setupOptionOn]}
                    testID={`setup-freq-${f}`}
                  >
                      <Text style={[styles.setupOptionLabel, setupFreq === f && styles.setupOptionLabelOn]}>{f}j</Text>
                      <Text style={styles.setupOptionSub}>
                        {f === 2 ? "Minimal" : f === 3 ? "Optimal" : f === 4 ? "Structuré" : "Expert"}
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

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Heure d&apos;entraînement</Text>
              <View style={styles.setupOptionRow}>
                <TouchableOpacity
                  onPress={() => setSetupSameTime(true)}
                  style={[styles.setupOption, setupSameTime && styles.setupOptionOn]}
                  testID="setup-time-same"
                >
                  <Text style={[styles.setupOptionLabel, setupSameTime && styles.setupOptionLabelOn]}>Même heure</Text>
                  <Text style={styles.setupOptionSub}>Tous les jours choisis</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSetupSameTime(false)}
                  style={[styles.setupOption, !setupSameTime && styles.setupOptionOn]}
                  testID="setup-time-by-day"
                >
                  <Text style={[styles.setupOptionLabel, !setupSameTime && styles.setupOptionLabelOn]}>Par jour</Text>
                  <Text style={styles.setupOptionSub}>Horaires différents</Text>
                </TouchableOpacity>
              </View>
              {setupSameTime ? (
                <TextInput
                  value={setupDefaultTime}
                  onChangeText={setSetupDefaultTime}
                  onBlur={() => setSetupDefaultTime(normalizeTrainingTime(setupDefaultTime))}
                  placeholder="18:30"
                  placeholderTextColor={colors.textMuted}
                  style={styles.setupTimeInput}
                  testID="setup-time-default"
                />
              ) : (
                <View style={styles.setupTimeGrid}>
                  {setupDays.map((day) => (
                    <View key={day} style={styles.setupTimeCell}>
                      <Text style={styles.setupTimeLabel}>{WEEKDAY_SHORT[day]}</Text>
                      <TextInput
                        value={setupTrainingTimes[String(day)] || setupDefaultTime}
                        onChangeText={(text) => setSetupTrainingTimes((prev) => ({ ...prev, [String(day)]: text }))}
                        onBlur={() => setSetupTrainingTimes((prev) => ({ ...prev, [String(day)]: normalizeTrainingTime(prev[String(day)] || setupDefaultTime) }))}
                        placeholder="18:30"
                        placeholderTextColor={colors.textMuted}
                        style={styles.setupTimeMiniInput}
                        testID={`setup-time-${day}`}
                      />
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.84}
                onPress={() => {
                  setProgramSetupOpen(false);
                  setTab("recommendation");
                }}
                style={styles.structureSetupShortcut}
                testID="program-open-ai-recommendation"
              >
                <View style={styles.structureChoiceIcon}>
                  <Ionicons name="sparkles-outline" size={22} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.structureChoiceTitle}>Recommandation IA</Text>
                  <Text style={styles.structurePointText}>Choisir la bonne structure se fait maintenant dans son onglet dédié.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <Text style={[typography.caption, { marginTop: spacing.md }]}>Durée du programme</Text>
              <View style={styles.setupOptionRow}>
                {[6, 8, 10, 12, 16, 24].map((w) => (
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
                  {[1, 2, 3, 4].map((n) => (
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
              title={creatingProgram ? "Application..." : program ? "Appliquer et lancer le nouveau programme" : `Créer mon programme (${setupWeeks} sem.)`}
              onPress={() => createProgram()}
              loading={creatingProgram}
              icon={<Ionicons name={program ? "checkmark-circle" : "rocket"} size={16} color="#fff" />}
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
              {editWorkout && editWorkout.exercises.length > 0 ? (
                <View style={styles.orderBox} testID="editor-order-box">
                  <Text style={styles.orderTitle}>Ordre des exercices</Text>
                  <Text style={styles.orderHint}>Utilise la poignée pour repérer les exercices, puis monte ou descends l&apos;ordre.</Text>
                  {editWorkout.exercises.map((ex, index) => {
                    const isOn = ex.checked !== false;
                    return (
                      <View key={`${ex.name}-${index}`} style={[styles.orderRow, !isOn && { opacity: 0.46 }]}>
                        <Ionicons name="reorder-three-outline" size={20} color={colors.textMuted} />
                        <Text style={styles.orderIndex}>{index + 1}</Text>
                        <Text style={styles.orderName} numberOfLines={1}>{ex.name}</Text>
                        <TouchableOpacity
                          onPress={() => moveExerciseInEditor(index, index - 1)}
                          disabled={index === 0}
                          style={[styles.orderButton, index === 0 && { opacity: 0.35 }]}
                          testID={`editor-order-up-${index}`}
                        >
                          <Ionicons name="chevron-up" size={15} color={colors.primaryLight} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => moveExerciseInEditor(index, index + 1)}
                          disabled={index === editWorkout.exercises.length - 1}
                          style={[styles.orderButton, index === editWorkout.exercises.length - 1 && { opacity: 0.35 }]}
                          testID={`editor-order-down-${index}`}
                        >
                          <Ionicons name="chevron-down" size={15} color={colors.primaryLight} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => toggleExerciseInEditor(ex.name)} style={styles.orderButton} testID={`editor-order-toggle-${index}`}>
                          <Ionicons name={isOn ? "close" : "add"} size={15} color={isOn ? colors.alert : colors.primaryLight} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
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

function recommendedSplitForFrequency(frequency: number): TrainingProgram["split"] {
  if (frequency <= 3) return "fullbody";
  if (frequency === 4) return "upper_lower";
  return "ppl";
}

function StructureRecommendationPanel({
  setupSplit,
  setupFreq,
  setupGoal,
  setupShowRecommendation,
  setSetupSplit,
  setSetupShowRecommendation,
}: {
  setupSplit: TrainingProgram["split"];
  setupFreq: number;
  setupGoal: string;
  setupShowRecommendation: boolean;
  setSetupSplit: (split: TrainingProgram["split"]) => void;
  setSetupShowRecommendation: (value: boolean | ((value: boolean) => boolean)) => void;
}) {
  return (
    <View style={styles.structureSetupPanel} testID="program-structure-picker">
      <View style={styles.structureSetupHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.structureSetupTitle}>Choisis la bonne structure</Text>
          <Text style={styles.structureSetupSub}>Le plus important : répartir les muscles sur la semaine sans exploser le volume.</Text>
        </View>
        <View style={styles.sciencePill}>
          <Ionicons name="shield-checkmark-outline" size={12} color={colors.primaryLight} />
          <Text style={styles.sciencePillText}>fondé science</Text>
        </View>
      </View>
      <View style={styles.structureCardStack}>
        {STRUCTURE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.v}
            activeOpacity={0.86}
            onPress={() => {
              setSetupSplit(option.v);
              setSetupShowRecommendation(false);
            }}
            style={[styles.structureChoiceCard, setupSplit === option.v && styles.structureChoiceCardOn]}
            testID={`setup-split-${option.v}`}
          >
            <View style={[styles.structureChoiceIcon, setupSplit === option.v && styles.structureChoiceIconOn]}>
              <Ionicons name={option.icon} size={24} color={setupSplit === option.v ? "#102108" : colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.structureChoiceTop}>
                <Text style={styles.structureChoiceTitle}>{option.label}</Text>
                <Text style={styles.structureChoiceIdeal}>{option.ideal}</Text>
              </View>
              {option.points.map((point) => (
                <View key={point} style={styles.structurePointRow}>
                  <Ionicons name="checkmark-circle-outline" size={13} color={colors.primaryLight} />
                  <Text style={styles.structurePointText}>{point}</Text>
                </View>
              ))}
            </View>
            <Ionicons name={setupSplit === option.v ? "star" : "chevron-forward"} size={18} color={setupSplit === option.v ? colors.primaryLight : colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.structureRulesBox}>
        <RuleLine icon="bar-chart-outline" text="Le volume hebdo compte le plus." />
        <RuleLine icon="repeat-outline" text="La fréquence aide à mieux répartir le travail." />
        <RuleLine icon="hourglass-outline" text="Le meilleur plan est celui que tu tiens." />
      </View>
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => setSetupShowRecommendation((value) => !value)}
        style={styles.recommendationButton}
        testID="program-show-recommendation"
      >
        <Ionicons name="sparkles-outline" size={17} color="#102108" />
        <Text style={styles.recommendationButtonText}>{setupShowRecommendation ? "Masquer la recommandation" : "Voir ma recommandation IA"}</Text>
      </TouchableOpacity>
      {setupShowRecommendation ? (
        <View style={styles.recommendationSetupCard} testID="program-ai-recommendation">
          <Text style={styles.recommendationKicker}>Recommandation FIT AI</Text>
          <Text style={styles.recommendationTitle}>{splitRecommendationTitle(setupSplit, setupFreq)}</Text>
          <Text style={styles.recommendationText}>{splitRecommendationReason(setupSplit, setupFreq)}</Text>
          <View style={styles.recommendationMetaRow}>
            <MiniSetupSignal icon="flame-outline" label="Objectif" value={setupGoal} />
            <MiniSetupSignal icon="calendar-outline" label="Fréquence" value={`${setupFreq} j / sem`} />
            <MiniSetupSignal icon="time-outline" label="Temps" value="45 min" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function splitRecommendationTitle(split: TrainingProgram["split"], frequency: number): string {
  if (split === "fullbody") return `Full body ${Math.min(frequency, 3)}x / semaine`;
  if (split === "upper_lower") return "Upper / Lower 4x / semaine";
  if (split === "ppl") return `PPL ${Math.max(5, frequency)}x / semaine`;
  if (split === "home") return "Programme maison";
  return "Split + rappels";
}

function splitRecommendationReason(split: TrainingProgram["split"], frequency: number): string {
  if (split === "fullbody") return "Parfait si tu veux progresser avec peu de séances : chaque groupe musculaire revient plusieurs fois sans surcharge.";
  if (split === "upper_lower") return "Très bon équilibre à 4 séances : le haut et le bas du corps ont assez de place pour progresser et récupérer.";
  if (split === "ppl") return frequency >= 5
    ? "Cohérent quand tu t'entraînes souvent : Push, Pull et Legs restent lisibles et les exercices sont mieux regroupés."
    : "PPL est plus solide avec 5 séances ou plus. Si tu restes à 3 jours, Full body sera souvent plus efficace.";
  if (split === "home") return "Utile en déplacement ou sans matériel. FIT AI privilégie les mouvements au poids du corps faciles à répéter.";
  return "Bon pour un focus plus précis, avec des rappels pour éviter d'oublier un groupe musculaire.";
}

function RuleLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.structureRuleLine}>
      <Ionicons name={icon} size={14} color={colors.primaryLight} />
      <Text style={styles.structureRuleText}>{text}</Text>
    </View>
  );
}

function MiniSetupSignal({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.miniSetupSignal}>
      <Ionicons name={icon} size={14} color={colors.primaryLight} />
      <Text style={styles.miniSetupLabel}>{label}</Text>
      <Text style={styles.miniSetupValue}>{value}</Text>
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
  trainingHero: { minHeight: 242, justifyContent: "flex-end", paddingTop: spacing.lg },
  trainingHeroImage: { opacity: 0.96 },
  trainingHeroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,11,8,0.40)" },
  header: { minHeight: 150, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  heroEyebrow: { ...typography.caption, color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  heroTitleRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  heroCaption: { ...typography.body, color: "rgba(255,255,255,0.82)", marginBottom: 2 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0 },
  heroProgram: { ...typography.small, color: "rgba(255,255,255,0.78)", marginTop: spacing.sm, maxWidth: 210 },
  heroScript: { fontSize: 29, lineHeight: 33, marginTop: 2 },
  heroProgress: { width: 78, height: 78, borderRadius: 39, borderWidth: 7, borderColor: colors.primaryLight, backgroundColor: "rgba(2,18,12,0.58)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroProgressValue: { fontSize: 20, fontWeight: "900", color: "#FFFFFF" },
  heroProgressLabel: { fontSize: 9, color: "rgba(255,255,255,0.72)", marginTop: -2 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 130, marginTop: -6 },
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
  orderBox: { gap: 7, marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.07)" },
  orderTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  orderHint: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, fontWeight: "700" },
  orderRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  orderIndex: { width: 22, color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  orderName: { flex: 1, color: colors.textMain, fontSize: 12.5, fontWeight: "800" },
  orderButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: GLASS_BORDER },
  rmBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(74,222,128,0.15)", padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, borderWidth: 1, borderColor: GLASS_BORDER },
  rmValue: { fontSize: 24, fontWeight: "800", color: colors.primaryLight, marginTop: 2 },
  perfRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  // Tabs
  tabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tabChip: { flexGrow: 1, flexBasis: "46%", minHeight: 38, paddingVertical: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.55)" },
  tabTextActive: { color: "#102108" },
  // History
  histDot: { width: 8, height: 8, borderRadius: 4 },
  historyUncompleteButton: { minHeight: 38, marginTop: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.25)", backgroundColor: "rgba(182,255,63,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  historyUncompleteText: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  historyPointsPill: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.08)" },
  historyPointsText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  historyActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  historyActionButton: { flex: 1, minWidth: 96, minHeight: 38, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.25)", backgroundColor: "rgba(182,255,63,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  historyActionText: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  historyDeleteButton: { borderColor: "rgba(255,94,94,0.35)", backgroundColor: "rgba(255,94,94,0.08)" },
  // Timer overlay
  timerOverlay: { position: "absolute", right: spacing.md, bottom: spacing.xl, alignItems: "flex-end", padding: spacing.xs, zIndex: 100, elevation: 10 },
  timerCard: { backgroundColor: "rgba(6,20,10,0.97)", padding: spacing.sm, borderRadius: radius.full, alignItems: "center", borderWidth: 1, borderColor: colors.primaryLight, width: 172, gap: 4 },
  timerBig: { fontSize: 22, lineHeight: 25, fontWeight: "900", color: colors.primaryLight },
  timerProgressTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, width: "100%", overflow: "hidden" },
  timerProgressFill: { height: "100%", backgroundColor: colors.primaryLight, borderRadius: 3 },
  timerMiniActions: { flexDirection: "row", gap: 5, marginTop: 2, alignItems: "center", justifyContent: "center" },
  timerPlayBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: "rgba(255,255,255,0.34)" },
  timerBtn: { minWidth: 30, height: 28, paddingHorizontal: 6, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(74,222,128,0.15)", borderWidth: 1, borderColor: colors.primaryLight },
  timerBtnTxt: { fontSize: 10.5, fontWeight: "800", color: colors.primaryLight },
  timerSaveCfg: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, marginTop: 4 },
  runnerHero: { minHeight: 270, justifyContent: "space-between", padding: spacing.lg },
  runnerHeroImage: { opacity: 0.92 },
  runnerHeroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,10,6,0.52)" },
  runnerHeroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  runnerIconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  runnerExerciseName: { color: colors.textMain, fontSize: 19, fontWeight: "900", textAlign: "center" },
  runnerExerciseCount: { color: colors.textSecondary, fontSize: 11, fontWeight: "800", marginTop: 2 },
  runnerPrPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: "rgba(182,255,63,0.10)" },
  runnerPrPillOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  runnerPrText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  runnerProgressBlock: { padding: spacing.md, borderRadius: radius.md, backgroundColor: "rgba(2,18,12,0.66)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  runnerProgressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  runnerProgressLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" },
  runnerProgressPct: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  runnerProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.13)" },
  runnerProgressFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primaryLight },
  runnerBody: { padding: spacing.lg, gap: spacing.md },
  runnerStepperWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  runnerStepArrow: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: GLASS_BORDER },
  runnerExerciseRailBlock: { gap: 8 },
  runnerRailTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  runnerExerciseRail: { gap: 8, paddingRight: spacing.sm },
  runnerExerciseChip: {
    minWidth: 132,
    maxWidth: 178,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  runnerExerciseChipActive: { backgroundColor: "rgba(182,255,63,0.12)", borderColor: "rgba(182,255,63,0.28)" },
  runnerExerciseChipDone: { backgroundColor: "rgba(74,222,128,0.11)" },
  runnerExerciseChipIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  runnerExerciseChipIndexDone: { backgroundColor: colors.primaryLight },
  runnerExerciseChipIndexText: { color: colors.textSecondary, fontSize: 11, fontWeight: "900" },
  runnerExerciseChipText: { flex: 1, color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" },
  runnerExerciseChipTextActive: { color: colors.textMain },
  runnerSeriesCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS },
  runnerPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  runnerSeriesTitle: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  runnerSeriesSub: { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 3 },
  runnerAdvicePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.08)" },
  runnerAdviceText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  runnerParamGrid: { flexDirection: "row", gap: spacing.sm },
  runnerParamCard: { flex: 1, minHeight: 112, alignItems: "center", justifyContent: "space-between", padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", backgroundColor: "rgba(255,255,255,0.055)" },
  runnerParamInput: { minWidth: 0, color: colors.textMain, fontSize: 26, lineHeight: 30, fontWeight: "900", paddingVertical: 0, textAlign: "center" },
  runnerParamLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "900" },
  runnerParamUnit: { color: colors.textMuted, fontSize: 11, fontWeight: "900", marginBottom: 5, width: 20, textAlign: "left" },
  runnerWeightLine: { width: "100%", minHeight: 34, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 2 },
  runnerWeightInput: { width: 58, color: colors.textMain, fontSize: 24, lineHeight: 30, fontWeight: "900", paddingVertical: 0, textAlign: "right" },
  runnerTinyStepper: { flexDirection: "row", gap: 6 },
  runnerTinyStepButton: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)" },
  runnerModifyPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.08)" },
  runnerModifyText: { color: colors.primaryLight, fontSize: 9.5, fontWeight: "900" },
  runnerFields: { flexDirection: "row", gap: spacing.sm },
  runnerField: { flex: 1 },
  runnerFieldLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase", marginBottom: 5 },
  runnerInputWrap: { minHeight: 58, flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.07)", paddingHorizontal: spacing.sm },
  runnerInput: { flex: 1, color: colors.textMain, fontSize: 25, fontWeight: "900", paddingVertical: 8, minWidth: 0 },
  runnerSuffix: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
  runnerRestPrRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  runnerRestPanel: { flex: 1, gap: spacing.sm, alignItems: "center", padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.045)" },
  runnerRestHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  runnerRestTitle: { flex: 1, color: colors.textMain, fontSize: 11.5, fontWeight: "900" },
  runnerRestModify: { color: colors.primaryLight, fontSize: 10, fontWeight: "900" },
  runnerRestCircle: { width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,18,12,0.62)" },
  runnerRestTime: { color: colors.textMain, fontSize: 25, lineHeight: 30, fontWeight: "900", textAlign: "center", padding: 0 },
  runnerRestControls: { flexDirection: "row", gap: 8, marginTop: 4 },
  runnerRestButton: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER },
  runnerRestPlayButton: { minWidth: 46, height: 26, paddingHorizontal: 7, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  runnerRestPlayButtonActive: { minWidth: 58 },
  runnerRestPlayText: { color: "#102108", fontSize: 10, fontWeight: "900" },
  runnerRestHint: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textAlign: "center" },
  runnerPrCheckCard: { flex: 1.08, gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)" },
  runnerPrCheckCardOn: { borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.10)" },
  runnerPrIconLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  runnerPrCheckbox: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderBright, backgroundColor: "rgba(0,0,0,0.18)" },
  runnerPrCheckboxOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  runnerPrCheckTitle: { flex: 1, color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  runnerPrCheckText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  runnerAiAdviceBox: { flexDirection: "row", gap: 5, padding: 7, borderRadius: radius.sm, backgroundColor: "rgba(255,179,63,0.10)", borderWidth: 1, borderColor: "rgba(255,179,63,0.18)" },
  runnerAiAdviceText: { flex: 1, color: colors.textSecondary, fontSize: 10.5, lineHeight: 14, fontWeight: "700" },
  runnerBottomAction: { gap: spacing.sm },
  runnerNextTextButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 4 },
  runnerNextText: { color: colors.primaryLight, fontSize: 11.5, fontWeight: "900" },
  runnerNavRow: { flexDirection: "row", gap: spacing.sm },
  runnerNavButton: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: radius.full, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)" },
  runnerNavText: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  sessionDoneCard: { marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: "rgba(5,18,12,0.98)", alignItems: "center", gap: spacing.md },
  doneCheck: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.08)" },
  doneTitle: { color: colors.textMain, fontSize: 25, fontWeight: "900", textAlign: "center" },
  doneSubtitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", marginTop: -spacing.sm },
  doneMetricGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  doneMetric: { width: "47.5%", minHeight: 82, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)", padding: spacing.sm },
  doneMetricValue: { color: colors.textMain, fontSize: 14, fontWeight: "900", marginTop: 4 },
  doneMetricLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800", marginTop: 2, textAlign: "center" },
  doneXpBox: { width: "100%", minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.09)" },
  doneXpText: { color: colors.primaryLight, fontSize: 21, fontWeight: "900" },
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
  weekChecklistTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  weekChecklistEyebrow: { color: colors.primaryLight, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  weekChecklistTitle: { color: colors.textMain, fontSize: 19, fontWeight: "900", marginTop: 2 },
  weekChecklistText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 2 },
  weekChecklistCircle: { width: 86, height: 86, borderRadius: 43, borderWidth: 8, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,18,12,0.58)" },
  weekChecklistCircleValue: { color: colors.textMain, fontSize: 20, fontWeight: "900" },
  weekChecklistCircleLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "800", marginTop: -1 },
  weekWorkoutDots: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  weekWorkoutDotWrap: { width: "30.8%", minHeight: 82, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)", padding: spacing.sm },
  weekWorkoutDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderBright, backgroundColor: "rgba(0,0,0,0.18)" },
  weekWorkoutDotDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  weekWorkoutDotLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", textAlign: "center", width: "100%" },
  weekObjectiveBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.08)" },
  weekObjectiveLabel: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  weekObjectiveText: { color: colors.textMain, fontSize: 15, fontWeight: "900", marginTop: 2 },
  programWeekScroller: { gap: 8, paddingVertical: spacing.sm, paddingRight: spacing.lg },
  programWeekDot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.05)" },
  programWeekDotDone: { backgroundColor: "rgba(182,255,63,0.12)", borderColor: "rgba(182,255,63,0.24)" },
  programWeekDotCurrent: { borderColor: colors.primaryLight },
  programWeekDotSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  programWeekDotText: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
  programWeekDotTextOn: { color: "#102108" },
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
  programBottomActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  programBottomTitle: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  programBottomText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
  programBottomButtonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", maxWidth: 210 },
  programBottomButton: { minHeight: 36 },
  // Setup modal
  goalUpdateIntro: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.08)" },
  goalUpdateTitle: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  goalUpdateText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 5 },
  setupOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  setupOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: GLASS_BORDER, flex: 1, minWidth: 90, alignItems: "center" },
  setupOptionOn: { backgroundColor: "rgba(74,222,128,0.18)", borderColor: colors.primaryLight },
  setupOptionLabel: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  setupOptionLabelOn: { color: colors.primaryLight },
  setupOptionSub: { fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 2 },
  structureSetupPanel: { marginTop: spacing.md, gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(182,255,63,0.20)", backgroundColor: "rgba(255,255,255,0.045)" },
  structureSetupShortcut: { marginTop: spacing.md, minHeight: 74, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(182,255,63,0.20)", backgroundColor: "rgba(182,255,63,0.07)" },
  structureSetupHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  structureSetupTitle: { color: colors.textMain, fontSize: 20, lineHeight: 24, fontWeight: "900" },
  structureSetupSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 4 },
  sciencePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER },
  sciencePillText: { color: colors.primaryLight, fontSize: 9.5, fontWeight: "900" },
  structureCardStack: { gap: 9 },
  structureChoiceCard: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)" },
  structureChoiceCardOn: { borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.14)" },
  structureChoiceIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.18)" },
  structureChoiceIconOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  structureChoiceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: 4 },
  structureChoiceTitle: { flex: 1, color: colors.textMain, fontSize: 15, fontWeight: "900" },
  structureChoiceIdeal: { color: colors.textSecondary, fontSize: 10, fontWeight: "900" },
  structurePointRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  structurePointText: { flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  structureRulesBox: { gap: 7, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.18)", backgroundColor: "rgba(182,255,63,0.07)" },
  structureRuleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  structureRuleText: { flex: 1, color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" },
  recommendationButton: { minHeight: 46, borderRadius: radius.full, backgroundColor: colors.primaryLight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  recommendationButtonText: { color: "#102108", fontSize: 13.5, fontWeight: "900" },
  recommendationSetupCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.28)", backgroundColor: "rgba(4,24,14,0.74)" },
  recommendationKicker: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  recommendationTitle: { color: colors.textMain, fontSize: 20, fontWeight: "900" },
  recommendationText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  recommendationMetaRow: { flexDirection: "row", gap: 8 },
  miniSetupSignal: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", padding: 6, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)" },
  miniSetupLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "900", marginTop: 2 },
  miniSetupValue: { color: colors.textMain, fontSize: 11, fontWeight: "900", marginTop: 1, textAlign: "center" },
  setupTimeInput: { minHeight: 46, marginTop: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.07)", color: colors.textMain, fontSize: 18, fontWeight: "900", textAlign: "center", paddingHorizontal: spacing.md },
  setupTimeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  setupTimeCell: { width: "30.5%", minHeight: 64, gap: 4, padding: 7, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)" },
  setupTimeLabel: { color: colors.primaryLight, fontSize: 11, fontWeight: "900", textAlign: "center" },
  setupTimeMiniInput: { minHeight: 34, borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.18)", color: colors.textMain, fontSize: 13, fontWeight: "900", textAlign: "center", paddingHorizontal: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
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
  todayWorkoutCard: { gap: spacing.md, padding: spacing.md, borderColor: "rgba(255,255,255,0.13)", backgroundColor: "rgba(6,21,14,0.62)" },
  todayCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  todayCardEyebrow: { color: colors.textMain, fontSize: 17, fontWeight: "900" },
  todayCardStatus: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  todayCheckButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderBright,
    backgroundColor: "rgba(182,255,63,0.08)",
  },
  todayCheckButtonDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  todayMainRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  todayThumb: { width: 106, height: 96, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  todayThumbImage: { borderRadius: radius.md, opacity: 0.92 },
  todayThumbShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,14,8,0.20)" },
  todayMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  todayMetaText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "800" },
  todayDot: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
  todayCardTitle: { color: colors.textMain, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  todayCardSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 4 },
  todaySmallPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, marginTop: 9, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  todaySmallPillText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  profileCompanionRow: { flexDirection: "row", gap: spacing.sm },
  companionTile: { flex: 1, minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)", padding: spacing.sm },
  companionVisual: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "rgba(182,255,63,0.09)", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  companionLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  companionValue: { color: colors.textMain, fontSize: 12.5, fontWeight: "900", marginTop: 2 },
  todayExerciseRail: { gap: spacing.sm, paddingRight: spacing.lg },
  todayExerciseMiniCard: { width: 122, minHeight: 132, borderRadius: radius.md, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.055)", padding: 8 },
  todayExerciseMiniImage: { height: 58, borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end", padding: 6, marginBottom: 8 },
  todayExerciseMiniImageInner: { borderRadius: radius.sm },
  todayExerciseMiniShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,12,8,0.28)" },
  todayExerciseMiniIndex: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  todayExerciseMiniName: { color: colors.textMain, fontSize: 12, fontWeight: "900" },
  todayExerciseMiniMeta: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 3 },
  todayActionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  startTodayButton: { flex: 1, minHeight: 44, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, shadowColor: colors.primaryLight, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  startTodayText: { color: "#102108", fontSize: 13, fontWeight: "900" },
  todayEditIconButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.06)" },
  plannedExerciseList: { gap: 7, paddingTop: spacing.xs },
  plannedExerciseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  plannedExerciseTitle: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  plannedExerciseCount: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  plannedExerciseRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: 7, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.055)" },
  plannedExerciseThumb: { width: 48, height: 44, borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end", padding: 5 },
  plannedExerciseThumbImage: { borderRadius: radius.sm },
  plannedExerciseShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,12,8,0.24)" },
  plannedExerciseIndex: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  plannedExerciseName: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  plannedExerciseMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 3 },
  mobilityCard: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(6,21,14,0.48)" },
  mobilityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  mobilityTitle: { color: colors.textMain, fontSize: 13.5, fontWeight: "900" },
  mobilityText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  optionalPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.06)" },
  optionalPillText: { color: colors.textSecondary, fontSize: 10.5, fontWeight: "800" },
  lowerFeatureBlock: { gap: spacing.sm },
  lowerFeatureHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  lowerFeatureTitle: { color: colors.textMain, fontSize: 16, fontWeight: "900" },
  lowerFeatureAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.18)" },
  lowerFeatureActionText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  programSection: { gap: spacing.sm },
  programSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  programSectionTitle: { color: colors.textMain, fontSize: 17, fontWeight: "900" },
  programSectionHint: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "right" },
  refaireButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.18)" },
  refaireText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  programJourneyCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)", backgroundColor: "rgba(6,21,14,0.56)" },
  programJourneyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  programJourneyStatusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  programJourneyWeek: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  programJourneyStatusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.13)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  programJourneyStatusText: { color: colors.primaryLight, fontSize: 8.5, fontWeight: "900" },
  programJourneyMeta: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
  programJourneyPlanPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1 },
  programJourneyPlanText: { fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  programPhaseStack: { gap: 7 },
  programPhaseRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.045)" },
  programPhaseRowActive: { borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.07)" },
  programPhaseAccent: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  programPhaseTitle: { color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  programPhaseDetail: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  programPhaseBars: { width: 38, height: 28, flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 3 },
  programPhaseBar: { width: 4, borderRadius: 3 },
  programDayStack: { gap: 7 },
  programJourneyDay: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  programJourneyDayActive: { backgroundColor: "rgba(182,255,63,0.09)", borderColor: "rgba(182,255,63,0.22)" },
  programJourneyDayBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  programJourneyDayBadgeActive: { backgroundColor: colors.primary },
  programJourneyDayBadgeText: { color: colors.textSecondary, fontSize: 12, fontWeight: "900" },
  programJourneyDayBadgeTextActive: { color: "#102108" },
  programJourneyDayTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  programJourneyDayTitle: { flex: 1, color: colors.textMain, fontSize: 13.5, fontWeight: "900" },
  programJourneyDayText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 3 },
  todayTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  todayTagText: { color: colors.primaryLight, fontSize: 9.5, fontWeight: "900" },
  todayVisualWrap: {
    minHeight: 318,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
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

function DoneMetric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.doneMetric}>
      <Ionicons name={icon} size={16} color={colors.primaryLight} />
      <Text style={styles.doneMetricValue}>{value}</Text>
      <Text style={styles.doneMetricLabel}>{label}</Text>
    </View>
  );
}

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

function ProgramWeekSelector({
  weeksTotal,
  currentWeek,
  selectedWeek,
  onSelect,
}: {
  weeksTotal: number;
  currentWeek: number;
  selectedWeek: number;
  onSelect: (week: number) => void;
}) {
  const count = Math.max(1, Math.min(24, weeksTotal || 1));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.programWeekScroller}
      testID="program-week-selector"
    >
      {Array.from({ length: count }).map((_, index) => {
        const week = index + 1;
        const active = week === selectedWeek;
        const current = week === currentWeek;
        const done = week < currentWeek;
        return (
          <TouchableOpacity
            key={week}
            onPress={() => onSelect(week)}
            style={[styles.programWeekDot, done && styles.programWeekDotDone, current && styles.programWeekDotCurrent, active && styles.programWeekDotSelected]}
            testID={`program-week-dot-${week}`}
          >
            <Text style={[styles.programWeekDotText, (active || current) && styles.programWeekDotTextOn]}>{week}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function ProgramJourneyCard({
  week, totalWeeks, currentWeek, isCurrent, selectedDay, trainingDays, onEditDay,
}: {
  week: ProgramWeek;
  totalWeeks: number;
  currentWeek: number;
  isCurrent: boolean;
  selectedDay?: ProgramDay;
  trainingDays?: number[] | null;
  onEditDay: (dayIndex: number) => void;
}) {
  const phase = phaseForWeek(totalWeeks, week.week_index);
  const palette = SESSION_COLOR[week.session_type] || SESSION_COLOR.volume;
  const status = week.week_index < currentWeek ? "TERMINÉE" : isCurrent ? "EN COURS" : "À VENIR";
  const planLabel = week.session_type || "Volume";

  return (
    <View style={styles.programJourneyCard} testID={`program-journey-${week.week_index}`}>
      <View style={styles.programJourneyTop}>
        <View>
          <View style={styles.programJourneyStatusRow}>
            <Text style={styles.programJourneyWeek}>Semaine {week.week_index}</Text>
            <View style={styles.programJourneyStatusPill}>
              <Text style={styles.programJourneyStatusText}>{status}</Text>
            </View>
          </View>
          <Text style={styles.programJourneyMeta}>{phase} · {week.days.length} séances</Text>
        </View>
        <View style={[styles.programJourneyPlanPill, { borderColor: palette.border, backgroundColor: "rgba(255,255,255,0.06)" }]}>
          <Text style={[styles.programJourneyPlanText, { color: palette.fg }]}>{planLabel}</Text>
        </View>
      </View>

      <View style={styles.programDayStack}>
        {week.days.map((d) => {
          const active = selectedDay?.day_index === d.day_index;
          return (
            <TouchableOpacity
              key={d.day_index}
              onPress={() => onEditDay(d.day_index)}
              style={[styles.programJourneyDay, active && styles.programJourneyDayActive]}
              activeOpacity={0.82}
              testID={`program-day-${week.week_index}-${d.day_index}`}
            >
              <View style={[styles.programJourneyDayBadge, active && styles.programJourneyDayBadgeActive]}>
                <Text style={[styles.programJourneyDayBadgeText, active && styles.programJourneyDayBadgeTextActive]}>
                  {sessionLabelForIndex(d.day_index, trainingDays)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.programJourneyDayTop}>
                  <Text style={styles.programJourneyDayTitle} numberOfLines={1}>{d.focus || "Séance"}</Text>
                  {active && (
                    <View style={styles.todayTag}>
                      <Text style={styles.todayTagText}>Aujourd&apos;hui</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.programJourneyDayText} numberOfLines={1}>
                  {d.exercises.length} ex. · {d.exercises.slice(0, 3).map((e) => e.name.split(" ")[0]).join(", ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
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
