import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { ProgressRing } from "@/src/components/UI";
import { PROGRAMS, type Freq, type Split } from "@/src/components/ProgramCarousel";
import { markCommitmentSigned } from "@/src/lib/commitment";
import { normalizeTrainingTimePreference, readDefaultTrainingTime, saveDefaultTrainingTime } from "@/src/lib/trainingPreferences";
import { colors, radius, spacing, typography } from "@/src/theme";

type Step =
  | "cadence"
  | "priority"
  | "obstacles"
  | "activity"
  | "protein"
  | "loading"
  | "diagnosis"
  | "strategy"
  | "pact";
type Priority = "muscle" | "fat_loss" | "energy";
type Obstacle = "time" | "food" | "discipline" | "recovery" | "motivation" | "schedule";
type ProteinHabit = "meat" | "mixed" | "plant" | "unknown";
type StructureKey = "fullbody" | "upper_lower" | "ppl" | "split";

type Profile = {
  weight_kg?: number;
  height_cm?: number;
  age?: number;
  gender?: string;
  goal?: string;
  activity_level?: string;
  daily_calories?: number;
  protein_g?: number;
  measurement_complete?: boolean;
};

type ProgramPlan = {
  title: string;
  split: string;
  detail: string;
  motivation: string;
  sessions: { day: string; title: string; focus: string }[];
  featureNotes: string[];
  structure: StructureKey;
};

const STEPS: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "cadence", label: "Rythme", icon: "calendar-outline" },
  { key: "priority", label: "Objectif", icon: "compass-outline" },
  { key: "obstacles", label: "Freins", icon: "trail-sign-outline" },
  { key: "activity", label: "Défi", icon: "flash-outline" },
  { key: "protein", label: "Protéines", icon: "nutrition-outline" },
  { key: "loading", label: "Analyse", icon: "leaf-outline" },
  { key: "diagnosis", label: "Diagnostic", icon: "pulse-outline" },
  { key: "strategy", label: "Stratégie", icon: "map-outline" },
  { key: "pact", label: "Pacte", icon: "finger-print-outline" },
];

const LOADING_LINES = [
  "Nous analysons ton profil.",
  "Nous estimons ton apport calorique actuel.",
  "Nous calibrons une cible sûre.",
  "Nous alignons ton programme FIT AI.",
] as const;

const COMMITMENT_STEP_BACKGROUNDS: Record<Exclude<Step, "cadence">, ImageSourcePropType> = {
  priority: require("../assets/images/fitai-hero-activities-hd.png"),
  obstacles: require("../assets/images/fitai-hero-activities-hd.png"),
  activity: require("../assets/images/fitai-hero-program-hd.png"),
  protein: require("../assets/images/fitai-hero-meals-hd.png"),
  loading: require("../assets/images/fitai-hero-dashboard-hd.png"),
  diagnosis: require("../assets/images/fitai-hero-progress-hd.png"),
  strategy: require("../assets/images/fitai-hero-program-hd.png"),
  pact: require("../assets/images/fitai-hero-progress-hd.png"),
};

const CADENCE_OPTIONS = [
  { value: 2, label: "2", detail: "/ semaine", icon: "leaf-outline", testID: "commitment-day-2" },
  { value: 3, label: "3", detail: "/ semaine", icon: "flame-outline", testID: "commitment-day-3" },
  { value: 4, label: "4", detail: "/ semaine", icon: "git-branch-outline", testID: "commitment-day-4" },
  { value: 5, label: "5", detail: "/ semaine", icon: "flower-outline", testID: "commitment-day-5" },
  { value: 6, label: "+5", detail: "Mode expert", icon: "trail-sign-outline", testID: "commitment-day-expert" },
] as const;

const PRIORITIES: { value: Priority; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "muscle", label: "Construire du muscle", detail: "Surplus contrôlé, progression, densité musculaire.", icon: "barbell-outline" },
  { value: "fat_loss", label: "Affiner la silhouette", detail: "Déficit mesuré, rythme stable, énergie préservée.", icon: "flame-outline" },
  { value: "energy", label: "Retrouver de l'énergie", detail: "Sommeil, régularité, structure facile à tenir.", icon: "leaf-outline" },
];

const OBSTACLES: { value: Obstacle; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "time", label: "Temps limité", detail: "Séances plus compactes.", icon: "time-outline" },
  { value: "food", label: "Nutrition irrégulière", detail: "Repères simples à répéter.", icon: "restaurant-outline" },
  { value: "discipline", label: "Régularité fragile", detail: "Besoin d'un cadre plus direct.", icon: "repeat-outline" },
  { value: "recovery", label: "Récupération moyenne", detail: "Fatigue, sommeil, stress.", icon: "moon-outline" },
  { value: "motivation", label: "Motivation instable", detail: "Besoin de relances et de victoires visibles.", icon: "flash-outline" },
  { value: "schedule", label: "Agenda variable", detail: "Le planning change souvent.", icon: "calendar-outline" },
];

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sédentaire", factor: 1.22 },
  { value: "light", label: "Léger", factor: 1.35 },
  { value: "moderate", label: "Modéré", factor: 1.48 },
  { value: "active", label: "Actif", factor: 1.62 },
  { value: "very_active", label: "Très actif", factor: 1.75 },
] as const;

const PROTEIN_OPTIONS: { value: ProteinHabit; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "meat", label: "Viande / poisson", detail: "Repères protéiques plus simples.", icon: "restaurant-outline" },
  { value: "mixed", label: "Mixte", detail: "Animal + végétal au quotidien.", icon: "leaf-outline" },
  { value: "plant", label: "Végétal", detail: "Tofu, légumineuses, substituts.", icon: "nutrition-outline" },
  { value: "unknown", label: "Je ne sais pas", detail: "FIT AI démarre avec une estimation prudente.", icon: "help-circle-outline" },
];

const STRUCTURE_OPTIONS: {
  key: StructureKey;
  title: string;
  ideal: string;
  bullets: string[];
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}[] = [
  {
    key: "fullbody",
    title: "Full body",
    ideal: "idéal 2 à 3 j / sem",
    bullets: ["Chaque muscle 2 à 3x / sem", "Simple, complet, très efficace"],
    icon: "body-outline",
    accent: "#B6FF3F",
  },
  {
    key: "upper_lower",
    title: "Upper / Lower",
    ideal: "idéal 4 j / sem",
    bullets: ["Chaque muscle 2x / sem", "Bon équilibre volume / récup"],
    icon: "accessibility-outline",
    accent: "#58B7FF",
  },
  {
    key: "ppl",
    title: "PPL",
    ideal: "idéal 5 à 6 j / sem",
    bullets: ["Push · Pull · Legs x2", "Très bon si tu t'entraînes souvent"],
    icon: "git-branch-outline",
    accent: "#FFB44A",
  },
  {
    key: "split",
    title: "Split + rappels",
    ideal: "idéal 5 à 8 j / sem",
    bullets: ["1 groupe principal + rappels", "Plus de focus, sans oublier les rappels"],
    icon: "scan-circle-outline",
    accent: "#D7FF73",
  },
];

const ANALYSIS_COPY: Record<string, readonly string[]> = {
  cadence: [
    "Nous posons un rythme réaliste.",
    "Nous évitons un volume trop ambitieux dès le départ.",
    "Nous préparons la prochaine question.",
  ],
  priority: [
    "Nous clarifions la priorité du cycle.",
    "Nous séparons motivation et vrai objectif.",
    "Nous préparons la prochaine question.",
  ],
  obstacles: [
    "Nous repérons les freins à traiter.",
    "Nous simplifions le futur plan.",
    "Nous préparons la prochaine question.",
  ],
  activity: [
    "Nous ajustons ta dépense réelle.",
    "Nous évitons une cible trop basse ou trop haute.",
    "Nous préparons la prochaine question.",
  ],
  protein: [
    "Nous consolidons ton profil nutritionnel.",
    "Nous calculons une cible calorique prudente.",
    "Nous générons ton diagnostic FIT AI.",
  ],
  diagnosis: [
    "Nous traduisons le diagnostic en stratégie.",
    "Nous choisissons le programme le plus cohérent.",
    "Nous préparons ton plan d'action.",
  ],
  strategy: [
    "Nous finalisons ton engagement.",
    "Nous rassemblons les repères clés à suivre.",
    "Nous préparons ton pacte FIT AI.",
  ],
};

function priorityFromGoal(goal?: string): Priority {
  if (goal === "lose") return "fat_loss";
  if (goal === "gain") return "muscle";
  return "energy";
}

function activityFactor(level?: string): number {
  return ACTIVITY_OPTIONS.find((item) => item.value === level)?.factor || 1.48;
}

function estimateBmr(weight: number, height: number, age: number, gender?: string): number {
  const male = gender !== "female";
  return male ? 10 * weight + 6.25 * height - 5 * age + 5 : 10 * weight + 6.25 * height - 5 * age - 161;
}

function clampCalories(calories: number, bmr: number): number {
  const floor = Math.max(1400, Math.round(bmr * 1.08));
  const ceiling = Math.max(floor + 150, Math.min(3800, Math.round(bmr * 1.9)));
  return Math.max(floor, Math.min(ceiling, calories));
}

function estimateCurrentCalories(params: {
  profile: Profile;
  weight: number;
  height: number;
  age: number;
  activity: string;
  dailyProteinServings: number | null;
  proteinHabit: ProteinHabit;
}): number {
  if (params.profile.daily_calories) return Math.round(params.profile.daily_calories);
  const bmr = estimateBmr(params.weight, params.height, params.age, params.profile.gender);
  const maintenance = bmr * activityFactor(params.activity);
  const proteinLift = params.dailyProteinServings === null
    ? 0
    : params.dailyProteinServings >= 4
      ? 120
      : params.dailyProteinServings >= 2
        ? 40
        : -90;
  const habitAdjust = params.proteinHabit === "plant" ? -50 : params.proteinHabit === "unknown" ? -30 : 0;
  return Math.round(maintenance + proteinLift + habitAdjust);
}

function estimateSafeTargetCalories(currentCalories: number, maintenance: number, priority: Priority): number {
  const bmrGuess = maintenance / activityFactor("moderate");
  if (priority === "fat_loss") {
    const baseline = Math.min(currentCalories, maintenance);
    return clampCalories(Math.round(baseline * 0.86), bmrGuess);
  }
  if (priority === "muscle") {
    const baseline = Math.max(currentCalories, maintenance);
    return clampCalories(Math.round(baseline * 1.08), bmrGuess);
  }
  return clampCalories(Math.round((currentCalories * 0.45) + (maintenance * 0.55)), bmrGuess);
}

function estimateProteinTarget(weight: number, proteinHabit: ProteinHabit, knownProtein?: number): number {
  if (knownProtein) return Math.round(knownProtein);
  const factor = proteinHabit === "plant" ? 2.05 : proteinHabit === "unknown" ? 1.8 : 1.9;
  return Math.round(weight * factor);
}

function estimateHydration(weight: number, trainingDays: number): number {
  return Math.round(weight * 0.032 * 10) / 10 + (trainingDays >= 4 ? 0.35 : 0.2);
}

function obstacleTitles(selected: Obstacle[]): string[] {
  return selected.map((value) => OBSTACLES.find((item) => item.value === value)?.label || value);
}

function chooseProgram(priority: Priority, trainingDays: number): { title: string; goalLabel: string; split: Split; freq: Freq; detail: string; sourceTitle: string } {
  if (priority === "fat_loss") {
    return { title: "Sèche", goalLabel: "Perte de gras", split: "fullbody", freq: trainingDays >= 4 ? 4 : 3, detail: "Le cycle orienté perte de gras de l'app, avec séances denses et cardio intégré.", sourceTitle: "Sèche" };
  }
  if (priority === "muscle") {
    if (trainingDays >= 5) {
      return { title: "Prise de Masse", goalLabel: "Masse", split: "ppl", freq: 5, detail: "Le cycle volume de l'app pour pousser la progression musculaire semaine après semaine.", sourceTitle: "Prise de Masse" };
    }
    return { title: "Hypertrophie", goalLabel: "Hypertrophie", split: trainingDays <= 3 ? "fullbody" : "ppl", freq: trainingDays >= 4 ? 4 : 3, detail: "Le cycle le plus cohérent pour construire du muscle sans surcharger le volume.", sourceTitle: "Hypertrophie" };
  }
  return { title: "Hypertrophie", goalLabel: "Hypertrophie", split: trainingDays <= 3 ? "fullbody" : "split", freq: trainingDays >= 4 ? 4 : 3, detail: "Le programme le plus équilibré de l'app pour retrouver un cadre durable et de l'énergie.", sourceTitle: "Hypertrophie" };
}

function recommendedStructure(trainingDays: number, priority: Priority): StructureKey {
  if (trainingDays <= 3) return "fullbody";
  if (trainingDays === 4) return "upper_lower";
  if (trainingDays <= 6) return priority === "muscle" ? "ppl" : "upper_lower";
  return "split";
}

function buildProgramPlan(trainingDays: number, priority: Priority, obstacles: Obstacle[]): ProgramPlan {
  const selected = chooseProgram(priority, trainingDays);
  const source = PROGRAMS.find((program) => program.title === selected.sourceTitle);
  const compact = trainingDays <= 3 || obstacles.includes("time") || obstacles.includes("schedule");
  const structure = recommendedStructure(trainingDays, priority);
  const sessions = selected.split === "fullbody"
    ? [
        { day: "Lun", title: "Poussée complète", focus: "Poussée, jambes, gainage" },
        { day: "Mer", title: "Tirage & posture", focus: "Dos, chaîne postérieure" },
        { day: "Sam", title: "Densité douce", focus: "Jambes, core, cardio léger" },
      ]
    : selected.split === "ppl"
      ? [
          { day: "Lun", title: "Push", focus: "Pectoraux, épaules, triceps" },
          { day: "Mar", title: "Pull", focus: "Dos, posture, biceps" },
          { day: "Jeu", title: "Legs", focus: "Quadriceps, ischios, mollets" },
          { day: "Ven", title: "Rappel haut", focus: "Volume et point faible" },
          { day: "Sam", title: "Bas + core", focus: "Jambes, gainage, souffle" },
        ].slice(0, selected.freq)
      : [
          { day: "Lun", title: "Pectoraux", focus: "Poussée et volume" },
          { day: "Mar", title: "Dos", focus: "Tirage et posture" },
          { day: "Jeu", title: "Jambes", focus: "Force et chaîne postérieure" },
          { day: "Ven", title: "Épaules / bras", focus: "Finition et équilibre" },
        ].slice(0, selected.freq);

  return {
    title: selected.title,
    split: `${selected.freq} séances / semaine`,
    detail: source?.description || selected.detail,
    motivation: compact
      ? "Chaque séance compte. Même courte, elle renforce le rythme que tu veux garder."
      : "Tu ne cherches pas la séance parfaite. Tu construis un système qui te fait progresser chaque semaine.",
    sessions,
    featureNotes: [
      "Activer mes notifications pour mes séances et ne rater aucune séance.",
      "Vérifier l'apport protéique pour rester au bon niveau chaque jour.",
      "Programmer les rappels d'hydratation pour garder le niveau d'énergie stable.",
    ],
    structure,
  };
}

export default function CommitmentExperience() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [step, setStep] = useState<Step>("cadence");
  const [trainingDays, setTrainingDays] = useState<number>(4);
  const [priority, setPriority] = useState<Priority>("muscle");
  const [obstacles, setObstacles] = useState<Obstacle[]>(["time"]);
  const [profile, setProfile] = useState<Profile>({});
  const [activityInput, setActivityInput] = useState<string>("moderate");
  const [dailyProteinServings, setDailyProteinServings] = useState<string>("2");
  const [proteinHabit, setProteinHabit] = useState<ProteinHabit>("mixed");
  const [preferredTrainingTime, setPreferredTrainingTime] = useState("18:30");
  const [selectedStructure, setSelectedStructure] = useState<StructureKey | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [signed, setSigned] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [loadingTarget, setLoadingTarget] = useState<Step>("diagnosis");
  const [loadingSource, setLoadingSource] = useState<Exclude<Step, "loading">>("protein");
  const holdStart = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    api<Profile>("/profile")
      .then((nextProfile) => {
        setProfile(nextProfile);
        if (nextProfile.goal) setPriority(priorityFromGoal(nextProfile.goal));
        if (nextProfile.activity_level) setActivityInput(nextProfile.activity_level);
      })
      .catch(() => setProfile({}));
  }, []);

  useEffect(() => {
    readDefaultTrainingTime()
      .then(setPreferredTrainingTime)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (step !== "loading") return;
    const lines = ANALYSIS_COPY[loadingSource] || LOADING_LINES;
    setLoadingPhase(0);
    const phaseTimer = setInterval(() => {
      setLoadingPhase((current) => (current < lines.length - 1 ? current + 1 : current));
    }, 1100);
    const doneTimer = setTimeout(() => setStep(loadingTarget), loadingTarget === "diagnosis" ? 5200 : 3400);
    return () => {
      clearInterval(phaseTimer);
      clearTimeout(doneTimer);
    };
  }, [loadingSource, loadingTarget, step]);

  const currentStepIndex = STEPS.findIndex((item) => item.key === step);
  const loadingLines = ANALYSIS_COPY[loadingSource] || LOADING_LINES;
  const sapProgress = Math.max(0.16, Math.min(1, (loadingPhase + 1) / loadingLines.length));
  const loadingMessage = loadingLines[Math.min(loadingPhase, loadingLines.length - 1)];

  const analysis = useMemo(() => {
    const weight = Math.max(40, profile.weight_kg || 75);
    const height = Math.max(135, profile.height_cm || 178);
    const age = profile.age || 28;
    const activity = activityInput || profile.activity_level || "moderate";
    const servings = dailyProteinServings.trim() === "" || proteinHabit === "unknown" ? null : Math.max(0, Math.min(8, parseInt(dailyProteinServings, 10) || 0));
    const bmr = estimateBmr(weight, height, age, profile.gender);
    const maintenance = Math.round(bmr * activityFactor(activity));
    const currentCalories = estimateCurrentCalories({ profile, weight, height, age, activity, dailyProteinServings: servings, proteinHabit });
    const targetCalories = estimateSafeTargetCalories(currentCalories, maintenance, priority);
    const proteinTarget = estimateProteinTarget(weight, proteinHabit, profile.protein_g);
    const currentProtein = servings === null
      ? Math.round(weight * 1.15)
      : Math.max(35, Math.round(servings * 28 + (proteinHabit === "plant" ? 8 : proteinHabit === "meat" ? 14 : 11)));
    const proteinDelta = proteinTarget - currentProtein;
    const fatTarget = Math.max(45, Math.round(weight * 0.8));
    const carbsTarget = Math.max(90, Math.round((targetCalories - proteinTarget * 4 - fatTarget * 9) / 4));
    const hydration = estimateHydration(weight, trainingDays);
    const program = buildProgramPlan(trainingDays, priority, obstacles);
    const calorieDelta = targetCalories - currentCalories;
    const obstacleText = obstacleTitles(obstacles);
    return {
      currentCalories,
      maintenance,
      targetCalories,
      calorieDelta,
      proteinTarget,
      currentProtein,
      proteinDelta,
      carbsTarget,
      fatTarget,
      hydration,
      obstacleText,
      program,
      readiness: Math.max(66, Math.min(94, 80 + trainingDays * 2 - obstacles.length * 3)),
      safeNote: priority === "fat_loss" ? "Déficit modéré pour protéger l'énergie et éviter les coupes agressives." : priority === "muscle" ? "Surplus contenu pour construire sans dériver inutilement." : "Point d'équilibre pensé pour relancer le rythme sans surcharge.",
      objective: priority === "muscle"
        ? `+${Math.max(2, Math.round(weight * 0.045 * 10) / 10)} kg de muscle`
        : priority === "fat_loss"
          ? `-${Math.max(3, Math.round(weight * 0.06 * 10) / 10)} kg de gras`
          : "Énergie stable et rythme régulier",
      objectiveDetail: priority === "muscle"
        ? "en 12 à 16 semaines avec un surplus contrôlé"
        : priority === "fat_loss"
          ? "en préservant tes muscles et ta récupération"
          : "avant de pousser plus fort sur le cycle suivant",
      weight,
      height,
      bmi: Math.round((weight / ((height / 100) * (height / 100))) * 10) / 10,
    };
  }, [activityInput, dailyProteinServings, obstacles, priority, profile, proteinHabit, trainingDays]);

  const beginAnalysis = (target: Step) => {
    setLoadingSource(step === "loading" ? "protein" : (step as Exclude<Step, "loading">));
    setLoadingTarget(target);
    setStep("loading");
  };

  const startFromCadence = () => {
    const normalized = normalizeTrainingTimePreference(preferredTrainingTime);
    setPreferredTrainingTime(normalized);
    saveDefaultTrainingTime(normalized).catch(() => undefined);
    next();
  };

  const next = () => {
    const nextStep = STEPS[Math.min(STEPS.length - 1, currentStepIndex + 1)]?.key;
    if (!nextStep) return;
    if (nextStep === "loading") {
      beginAnalysis("diagnosis");
      return;
    }
    if (["cadence", "priority", "obstacles", "activity", "diagnosis", "strategy"].includes(step)) {
      beginAnalysis(nextStep);
      return;
    }
    setStep(nextStep);
  };

  const prev = () => {
    const previousStep = STEPS[Math.max(0, currentStepIndex - 1)]?.key;
    if (previousStep) setStep(previousStep);
  };

  const toggleObstacle = (value: Obstacle) => {
    setObstacles((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  const beginHold = () => {
    if (signed) return;
    holdStart.current = Date.now();
    setHoldProgress(0);
    holdTimer.current = setInterval(() => {
      if (!holdStart.current) return;
      const pct = Math.min(1, (Date.now() - holdStart.current) / 2000);
      setHoldProgress(pct);
      if (pct >= 1) {
        if (holdTimer.current) clearInterval(holdTimer.current);
        holdTimer.current = null;
        setSigned(true);
        markCommitmentSigned().catch(() => undefined);
      }
    }, 40);
  };

  const endHold = () => {
    if (signed) return;
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
    setHoldProgress(0);
  };

  const continueToPaywall = async () => {
    await markCommitmentSigned();
    router.replace("/paywall");
  };

  if (step === "cadence") {
    return (
      <LandingMockup
        selectedTrainingDays={trainingDays}
        preferredTrainingTime={preferredTrainingTime}
        onNext={startFromCadence}
        onTrainingDays={setTrainingDays}
        onTrainingTimeChange={setPreferredTrainingTime}
        onTrainingTimeBlur={() => setPreferredTrainingTime(normalizeTrainingTimePreference(preferredTrainingTime))}
      />
    );
  }

  const backgroundSource = COMMITMENT_STEP_BACKGROUNDS[step];

  return (
    <View style={styles.background}>
      <Image source={backgroundSource} style={styles.backgroundImage} resizeMode="cover" />
      <LinearGradient colors={["rgba(8,16,12,0.30)", "rgba(8,18,12,0.10)", "rgba(3,8,5,0.84)"]} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFillObject} />
      <LinearGradient
        colors={["rgba(104,146,160,0.92)", "rgba(104,146,160,0.40)", "rgba(104,146,160,0.00)"]}
        locations={[0, 0.62, 1]}
        pointerEvents="none"
        style={styles.backgroundStatusMask}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="commitment-screen">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Ionicons name="leaf" size={22} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>FIT AI</Text>
              <Text style={styles.brandSub}>Ton coach. Ton rythme. Tes résultats.</Text>
            </View>
          </View>
          {step === "priority" && (
            <>
              <HeroBlock script="objectif principal" title="Quel est le résultat que tu veux obtenir en premier ?" subtitle="On choisit la priorité dominante du cycle avant de toucher aux calories et au programme." />
              <View style={styles.luxuryPanel}>
                <View style={styles.optionStack}>
                  {PRIORITIES.map((item) => (
                    <ChoiceRow key={item.value} label={item.label} detail={item.detail} icon={item.icon} active={priority === item.value} onPress={() => setPriority(item.value)} />
                  ))}
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Continuer" />
            </>
          )}

          {step === "obstacles" && (
            <>
              <HeroBlock script="points de friction" title="Qu'est-ce qui te freine le plus aujourd'hui ?" subtitle="Tu peux cocher plusieurs réponses. FIT AI s'en sert pour simplifier le plan au bon endroit." />
              <View style={styles.luxuryPanel}>
                <Text style={styles.sectionLabel}>Freins à traiter en priorité</Text>
                <Text style={styles.helper}>Sélection multiple activée.</Text>
                <View style={styles.optionStack}>
                  {OBSTACLES.map((item) => (
                    <ChoiceRow key={item.value} label={item.label} detail={item.detail} icon={item.icon} active={obstacles.includes(item.value)} onPress={() => toggleObstacle(item.value)} />
                  ))}
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Continuer" />
            </>
          )}

          {step === "activity" && (
            <>
              <HeroBlock script="défi quotidien" title="Quel niveau de défi ton quotidien impose déjà à ton corps ?" subtitle="On tient compte du sport, mais aussi de la marche, du travail, des déplacements et de la fatigue réelle de tes journées." />
              <View style={styles.luxuryPanel}>
                <Text style={styles.sectionLabel}>Défi de fond</Text>
                <Text style={styles.helper}>On calibre le programme sur ton vrai terrain de jeu, pas sur une semaine idéale.</Text>
                <View style={styles.optionStack}>
                  {ACTIVITY_OPTIONS.map((item) => (
                    <ChoiceRow key={item.value} label={item.label} detail={`Charge quotidienne · facteur ${item.factor.toFixed(2)}`} icon="flash-outline" active={activityInput === item.value} onPress={() => setActivityInput(item.value)} />
                  ))}
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Continuer" />
            </>
          )}

          {step === "protein" && (
            <>
              <HeroBlock script="repères protéines" title="Comment manges-tu tes protéines la plupart du temps ?" subtitle="Type de source et nombre de portions par jour nous aident à estimer ton apport actuel sans te faire sur-contrôler." />
              <View style={styles.luxuryPanel}>
                <Text style={styles.sectionLabel}>Source dominante</Text>
                <View style={styles.optionStack}>
                  {PROTEIN_OPTIONS.map((item) => (
                    <ChoiceRow key={item.value} label={item.label} detail={item.detail} icon={item.icon} active={proteinHabit === item.value} onPress={() => setProteinHabit(item.value)} />
                  ))}
                </View>
                <Text style={styles.question}>Combien de portions protéinées par jour ?</Text>
                <Text style={styles.helper}>Exemple : viande, poisson, oeufs, tofu, tempeh, yaourt grec, légumineuses ou substitut principal.</Text>
                <View style={styles.servingRow}>
                  {[0, 1, 2, 3, 4].map((value) => (
                    <TouchableOpacity key={value} onPress={() => setDailyProteinServings(String(value))} style={[styles.servingChip, dailyProteinServings === String(value) && styles.servingChipOn]}>
                      <Text style={[styles.servingText, dailyProteinServings === String(value) && styles.servingTextOn]}>{value}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setProteinHabit("unknown");
                      setDailyProteinServings("");
                    }}
                    style={[styles.servingUnknown, proteinHabit === "unknown" && styles.servingChipOn]}
                  >
                    <Text style={[styles.servingUnknownText, proteinHabit === "unknown" && styles.servingTextOn]}>Je ne sais pas</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={() => beginAnalysis("diagnosis")} nextTitle="Lancer l'analyse" />
            </>
          )}

          {step === "loading" && (
            <>
              <HeroBlock script="analyse en cours" title="Nous transformons tes réponses en protocole FIT AI." subtitle="Quelques secondes pour relier ton rythme, ton objectif, ton poids et tes repères nutritionnels." />
              <View style={styles.loadingPanel}>
                <View style={styles.loadingLeafWrap}>
                  <View style={[styles.loadingGlow, { opacity: 0.28 + loadingPhase * 0.14 }]} />
                  <ProgressRing size={124} stroke={12} progress={sapProgress} color={colors.primary} trackColor="rgba(255,255,255,0.07)">
                    <View style={styles.loadingLeafCore}>
                      <RotatingLeaf size={54} />
                    </View>
                  </ProgressRing>
                </View>
                <Text style={styles.loadingCaption}>La sève monte, le plan prend forme.</Text>
                <Text style={styles.loadingLineActive}>{loadingMessage}</Text>
                <Text style={styles.loadingHint}>{"Analyse biométrique, nutritionnelle et rythme d'entraînement en cours."}</Text>
              </View>
            </>
          )}

          {step === "diagnosis" && (
            <>
              <HeroBlock script="diagnostic FIT AI" title="Ton cap nutrition est simple." subtitle="On garde seulement les repères utiles pour agir dès demain : calories, protéines, objectif physique." />
              <View style={styles.objectiveHeroCard}>
                <View style={styles.objectiveIcon}>
                  <Ionicons name={priority === "fat_loss" ? "flame-outline" : priority === "muscle" ? "barbell-outline" : "leaf-outline"} size={28} color="#122108" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.objectiveKicker}>OBJECTIF</Text>
                  <Text style={styles.objectiveHeroTitle}>{analysis.objective}</Text>
                  <Text style={styles.objectiveHeroSub}>{analysis.objectiveDetail}</Text>
                </View>
              </View>
              <View style={styles.nutritionDeltaPanel}>
                <Text style={styles.sectionLabel}>À ajuster par jour</Text>
                <View style={styles.deltaRow}>
                  <DeltaTile
                    icon="flame-outline"
                    label="Calories"
                    value={analysis.calorieDelta >= 0 ? `+${analysis.calorieDelta}` : `${analysis.calorieDelta}`}
                    unit="kcal / jour"
                    detail={`cible ${analysis.targetCalories.toLocaleString("fr-FR")} kcal`}
                  />
                  <DeltaTile
                    icon="nutrition-outline"
                    label="Protéines"
                    value={analysis.proteinDelta >= 0 ? `+${analysis.proteinDelta}` : `${analysis.proteinDelta}`}
                    unit="g / jour"
                    detail={`viser ${analysis.proteinTarget} g`}
                  />
                </View>
                <View style={styles.deltaExplain}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={colors.primaryLight} />
                  <Text style={styles.deltaExplainText}>{analysis.safeNote}</Text>
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Construire ma stratégie" nextTestID="commitment-diagnosis-next" />
            </>
          )}

          {step === "strategy" && (
            <>
              {!showRecommendation ? (
                <>
                  <HeroBlock script="fondé sur la science" title="Choisis la bonne structure" subtitle="Le plus important : entraîner chaque groupe musculaire environ 2x / semaine et garder un volume réaliste." />
                  <View style={styles.structureStack}>
                    {STRUCTURE_OPTIONS.map((option) => {
                      const active = (selectedStructure || analysis.program.structure) === option.key;
                      const recommended = analysis.program.structure === option.key;
                      return (
                        <StructureCard
                          key={option.key}
                          option={option}
                          active={active}
                          recommended={recommended}
                          onPress={() => setSelectedStructure(option.key)}
                        />
                      );
                    })}
                  </View>
                  <View style={styles.structureRules}>
                    <RuleRow icon="bar-chart-outline" text="Le volume hebdo compte le plus." />
                    <RuleRow icon="repeat-outline" text="La fréquence aide surtout à mieux répartir le travail." />
                    <RuleRow icon="hourglass-outline" text="Le meilleur plan est celui que tu tiens dans le temps." />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setShowRecommendation(true)}
                    style={styles.primaryWideButton}
                    testID="commitment-show-ai-recommendation"
                  >
                    <Ionicons name="sparkles-outline" size={18} color="#122108" />
                    <Text style={styles.primaryWideButtonText}>Voir ma recommandation IA</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.84} style={styles.secondaryWideButton} testID="commitment-existing-program">
                    <Ionicons name="add-circle-outline" size={18} color={colors.primaryLight} />
                    <Text style={styles.secondaryWideButtonText}>{"J'ai déjà un programme : ajouter"}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <HeroBlock script="recommandation FIT AI" title="Ta structure recommandée" subtitle={`Pour ${trainingDays} séances / semaine, FIT AI privilégie une structure claire, modifiable et durable.`} />
                  <RecommendationPanel
                    structureKey={selectedStructure || analysis.program.structure}
                    trainingDays={trainingDays}
                    priority={priority}
                    onChooseOther={() => setShowRecommendation(false)}
                    onApply={() => next()}
                  />
                </>
              )}
            </>
          )}

          {step === "pact" && (
            <>
              <HeroBlock script={"signature d'engagement"} title={"Tu n'achètes pas une promesse. Tu entres dans une méthode."} subtitle={"Maintiens la signature 2 secondes. Ce n'est pas juridique, c'est un point de bascule avant l'abonnement."} />
              <View style={styles.contract}>
                <Text style={styles.contractTitle}>Pacte FIT AI</Text>
                <Text style={styles.contractBody}>{"Je m'engage à suivre mon protocole, à protéger mon énergie et à juger mes progrès sur plusieurs semaines, jamais sur une seule mauvaise journée."}</Text>
                <View style={styles.contractPoints}>
                  <ContractPoint text={`${trainingDays} séances par semaine`} />
                  <ContractPoint text={`${analysis.targetCalories.toLocaleString("fr-FR")} kcal comme cible de départ`} />
                  <ContractPoint text={`${analysis.proteinTarget} g de protéines et ${analysis.hydration.toFixed(1)} L d'hydratation`} />
                </View>
                <View style={styles.signatureLine}>
                  <Text style={styles.signature}>{signed ? user?.name || "Signature digitale" : "Maintenir pour signer"}</Text>
                  <Text style={styles.date}>{new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.9} onPressIn={beginHold} onPressOut={endHold} disabled={signed} style={[styles.holdButton, signed && styles.holdButtonSigned]} testID="commitment-hold-sign">
                  <View style={[styles.holdFill, { width: `${holdProgress * 100}%` }]} />
                  <Ionicons name={signed ? "checkmark-circle" : "finger-print-outline"} size={20} color={signed ? "#071207" : colors.primaryLight} />
                  <Text style={[styles.holdText, signed && styles.holdTextSigned]}>{signed ? "Pacte signé" : "Maintenir 2 secondes"}</Text>
                </TouchableOpacity>
              </View>
              <FooterNav onPrev={prev} onNext={continueToPaywall} nextTitle="Débloquer Premium" nextDisabled={!signed} nextTestID="commitment-continue" />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function LandingMockup({
  selectedTrainingDays,
  preferredTrainingTime,
  onNext,
  onTrainingDays,
  onTrainingTimeChange,
  onTrainingTimeBlur,
}: {
  selectedTrainingDays: number;
  preferredTrainingTime: string;
  onNext: () => void;
  onTrainingDays: (value: number) => void;
  onTrainingTimeChange: (value: string) => void;
  onTrainingTimeBlur: () => void;
}) {
  return (
    <View style={styles.cadenceScreen} testID="commitment-screen">
      <Image source={require("../assets/images/fitai-hero-progress-hd.png")} style={styles.backgroundImage} resizeMode="cover" />
      <LinearGradient
        colors={["rgba(5,18,13,0.08)", "rgba(5,18,13,0.18)", "rgba(3,8,5,0.92)"]}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["rgba(98,148,164,0.68)", "rgba(98,148,164,0.18)", "rgba(98,148,164,0.00)"]}
        locations={[0, 0.58, 1]}
        pointerEvents="none"
        style={styles.cadenceSkyWash}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.cadenceContent} showsVerticalScrollIndicator={false}>
          <View style={styles.cadenceBrandRow}>
            <View style={styles.cadenceLeafMark}>
              <RotatingLeaf size={44} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>FIT AI</Text>
              <Text style={styles.brandSub}>Départ intelligent</Text>
            </View>
            <View style={styles.thinkingPill}>
              <RotatingLeaf size={18} />
              <Text style={styles.thinkingText}>réflexion</Text>
            </View>
          </View>

          <View style={styles.cadenceHero}>
            <View style={styles.scriptPill}>
              <Ionicons name="leaf" size={13} color={colors.primaryLight} />
              <Text style={styles.script}>protocole personnel</Text>
            </View>
            <Text style={styles.cadenceTitle}>
              Combien de séances peux-tu vraiment garder dans une <Text style={styles.cadenceTitleAccent}>vraie semaine ?</Text>
            </Text>
            <Text style={styles.cadenceSubtitle}>
              On commence par ton rythme réel. Le bon programme est celui que tu peux répéter.
            </Text>
          </View>

          <View style={styles.thinkingCard}>
            <View style={styles.thinkingOrb}>
              <RotatingLeaf size={62} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.thinkingCardTitle}>FIT AI réfléchit à ton rythme</Text>
              <Text style={styles.thinkingCardText}>La cadence choisie servira à générer le volume du programme, sans te surcharger.</Text>
            </View>
          </View>

          <View style={styles.cadencePanel}>
            <View style={styles.cadencePanelHeader}>
              <View style={styles.cadencePanelTitle}>
                <Ionicons name="leaf" size={20} color={colors.primaryLight} />
                <Text style={styles.sectionLabel}>rythme réaliste</Text>
              </View>
              <Text style={styles.cadencePanelHint}>{"Pourquoi c'est important ?"}</Text>
            </View>
            <View style={styles.cadenceOptionRow}>
              {CADENCE_OPTIONS.map((item) => {
                const active = selectedTrainingDays === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    activeOpacity={0.84}
                    onPress={() => onTrainingDays(item.value)}
                    style={[styles.cadenceOption, active && styles.cadenceOptionActive]}
                    testID={item.testID}
                  >
                    <Text style={[styles.cadenceOptionNumber, active && styles.cadenceOptionNumberActive]}>{item.label}</Text>
                    <Text style={[styles.cadenceOptionDetail, active && styles.cadenceOptionDetailActive]}>{item.detail}</Text>
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={active ? colors.primaryLight : "rgba(24,36,20,0.54)"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.cadenceSecurityRow}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryLight} />
              <Text style={styles.cadenceSecurityText}>{"On s'en sert pour choisir le bon volume, sans te surcharger."}</Text>
            </View>
          </View>

          <View style={styles.cadenceTimePanel}>
            <View style={styles.cadenceTimeIcon}>
              <Ionicons name="time-outline" size={21} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cadenceTimeTitle}>Heure d&apos;entraînement habituelle</Text>
              <Text style={styles.cadenceTimeText}>Elle servira pour les rappels et le calendrier.</Text>
            </View>
            <TextInput
              value={preferredTrainingTime}
              onChangeText={onTrainingTimeChange}
              onBlur={onTrainingTimeBlur}
              placeholder="18:30"
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="numbers-and-punctuation"
              style={styles.cadenceTimeInput}
              testID="commitment-training-time"
            />
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={onNext} style={styles.cadenceContinue} testID="commitment-generate">
            <Text style={styles.cadenceContinueText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={24} color="#122108" />
          </TouchableOpacity>
          <View style={styles.cadenceProgressRow}>
            <View style={[styles.cadenceProgressItem, styles.cadenceProgressItemActive]} />
            <View style={styles.cadenceProgressItem} />
            <View style={styles.cadenceProgressItem} />
            <View style={styles.cadenceProgressItem} />
            <View style={styles.cadenceProgressItem} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function RotatingLeaf({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[styles.rotatingLeaf, { width: size, height: size, borderRadius: size / 2, transform: [{ rotate }] }]}>
      <Ionicons name="leaf" size={Math.round(size * 0.56)} color={colors.primaryLight} />
    </Animated.View>
  );
}

function HeroBlock({ script, title, subtitle }: { script: string; title: string; subtitle: string }) {
  return (
    <View style={styles.hero}>
      <View style={styles.scriptPill}>
        <Ionicons name="leaf" size={13} color={colors.primaryLight} />
        <Text style={styles.script}>{script}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function FooterNav({
  onPrev,
  onNext,
  nextTitle,
  nextDisabled,
  nextTestID,
}: {
  onPrev?: () => void;
  onNext: () => void;
  nextTitle: string;
  nextDisabled?: boolean;
  nextTestID?: string;
}) {
  return (
    <View style={styles.footerRow}>
      {onPrev ? (
        <TouchableOpacity activeOpacity={0.86} onPress={onPrev} style={styles.mockupBackButton}>
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.86)" />
          <Text style={styles.mockupBackText}>Retour</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.mockupBackPlaceholder} />
      )}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onNext}
        disabled={nextDisabled}
        style={[styles.mockupNextButton, nextDisabled && styles.mockupNextDisabled]}
        testID={nextTestID}
      >
        <Text style={styles.mockupNextText}>{nextTitle}</Text>
        <Ionicons name="arrow-forward" size={22} color="#122108" />
      </TouchableOpacity>
    </View>
  );
}

function ChoiceRow({ label, detail, icon, active, onPress }: { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={[styles.choice, active && styles.choiceOn]}>
      <View style={[styles.choiceIcon, active && styles.choiceIconOn]}>
        <Ionicons name={icon} size={17} color={active ? "#071207" : colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{label}</Text>
        <Text style={[styles.choiceDetail, active && styles.choiceDetailOn]}>{detail}</Text>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={18} color={colors.primaryLight} /> : null}
    </TouchableOpacity>
  );
}

function DeltaTile({ icon, label, value, unit, detail }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; unit: string; detail: string }) {
  return (
    <View style={styles.deltaTile}>
      <View style={styles.deltaIcon}>
        <Ionicons name={icon} size={18} color="#122108" />
      </View>
      <Text style={styles.deltaLabel}>{label}</Text>
      <View style={styles.deltaValueRow}>
        <Text style={styles.deltaValue}>{value}</Text>
        <Text style={styles.deltaUnit}>{unit}</Text>
      </View>
      <Text style={styles.deltaDetail}>{detail}</Text>
    </View>
  );
}

function StructureCard({
  option,
  active,
  recommended,
  onPress,
}: {
  option: (typeof STRUCTURE_OPTIONS)[number];
  active: boolean;
  recommended: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} style={[styles.structureCard, active && styles.structureCardActive]}>
      <View style={[styles.structureIcon, { backgroundColor: option.accent }]}>
        <Ionicons name={option.icon} size={30} color="#122108" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.structureTopLine}>
          <Text style={styles.structureTitle}>{option.title}</Text>
          <View style={styles.structureIdealPill}>
            <Text style={styles.structureIdealText}>{option.ideal}</Text>
          </View>
        </View>
        {option.bullets.map((bullet) => (
          <View key={bullet} style={styles.structureBullet}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#35511C" />
            <Text style={styles.structureBulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.structureCheck, active && styles.structureCheckActive]}>
        <Ionicons name={active ? "star" : recommended ? "sparkles-outline" : "ellipse-outline"} size={18} color={active ? "#122108" : "#35511C"} />
      </View>
    </TouchableOpacity>
  );
}

function RuleRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.ruleRow}>
      <Ionicons name={icon} size={17} color={colors.primaryLight} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function RecommendationPanel({
  structureKey,
  trainingDays,
  priority,
  onChooseOther,
  onApply,
}: {
  structureKey: StructureKey;
  trainingDays: number;
  priority: Priority;
  onChooseOther: () => void;
  onApply: () => void;
}) {
  const option = STRUCTURE_OPTIONS.find((item) => item.key === structureKey) || STRUCTURE_OPTIONS[0];
  const alternatives = STRUCTURE_OPTIONS.filter((item) => item.key !== structureKey).slice(0, 3);
  const objectiveLabel = priority === "fat_loss" ? "Perte de gras" : priority === "muscle" ? "Masse" : "Énergie";
  const formatTitle = structureKey === "fullbody"
    ? `Full body ${Math.min(trainingDays, 3)}x / semaine`
    : structureKey === "upper_lower"
      ? "Upper / Lower 4x / semaine"
      : structureKey === "ppl"
        ? `PPL ${Math.max(5, trainingDays)}x / semaine`
        : "Split + rappels";
  const whyTitle = structureKey === "ppl" ? "Pourquoi pas Full body ?" : "Pourquoi pas PPL à 3 jours ?";
  const whyBody = structureKey === "ppl"
    ? "Avec 5 séances ou plus, le PPL donne assez de place à chaque groupe sans compresser les exercices."
    : "En 3 jours, un PPL stimule souvent chaque groupe moins souvent. Le Full body donne plus de rappels sur la semaine.";

  return (
    <View style={styles.recommendationStack}>
      <View style={styles.recMetaRow}>
        <MiniSignal icon="flame-outline" label="Objectif" value={objectiveLabel} />
        <MiniSignal icon="calendar-outline" label="Fréquence" value={`${trainingDays} j / sem`} />
        <MiniSignal icon="time-outline" label="Temps" value="45 min" />
        <MiniSignal icon="bar-chart-outline" label="Niveau" value="Intermédiaire" />
      </View>
      <View style={styles.recMainCard}>
        <Text style={styles.sectionLabel}>Format recommandé</Text>
        <View style={styles.recTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recTitle}>{formatTitle}</Text>
            <View style={styles.recBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#122108" />
              <Text style={styles.recBadgeText}>Le plus adapté</Text>
            </View>
          </View>
          <View style={[styles.recBodyIcon, { borderColor: option.accent }]}>
            <Ionicons name={option.icon} size={46} color={option.accent} />
          </View>
        </View>
        {option.bullets.concat(["Plus simple à suivre qu'un split mal réparti", "Bonne dépense énergétique à chaque séance"]).slice(0, 4).map((line) => (
          <View key={line} style={styles.recReasonRow}>
            <Ionicons name="checkmark-circle-outline" size={17} color={colors.primaryLight} />
            <Text style={styles.recReasonText}>{line}</Text>
          </View>
        ))}
      </View>
      <View style={styles.whyCard}>
        <Ionicons name="help-circle-outline" size={18} color={colors.primaryLight} />
        <View style={{ flex: 1 }}>
          <Text style={styles.whyTitle}>{whyTitle}</Text>
          <Text style={styles.whyBody}>{whyBody}</Text>
        </View>
      </View>
      <View style={styles.alternativePanel}>
        <Text style={styles.sectionLabel}>{"Si tu t'entraînes plus"}</Text>
        <View style={styles.alternativeRow}>
          {alternatives.map((item) => (
            <TouchableOpacity key={item.key} activeOpacity={0.84} onPress={onChooseOther} style={styles.alternativeChip}>
              <Ionicons name="calendar-outline" size={15} color={colors.primaryLight} />
              <Text style={styles.alternativeChipText}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.74)" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity activeOpacity={0.9} onPress={onApply} style={styles.primaryWideButton} testID="commitment-apply-structure">
        <Ionicons name="checkmark-circle-outline" size={19} color="#122108" />
        <Text style={styles.primaryWideButtonText}>Appliquer cette structure</Text>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.84} onPress={onChooseOther} style={styles.secondaryWideButton} testID="commitment-choose-other-structure">
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.primaryLight} />
        <Text style={styles.secondaryWideButtonText}>Choisir parmi les autres options</Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniSignal({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.miniSignal}>
      <Ionicons name={icon} size={16} color={colors.primaryLight} />
      <Text style={styles.miniSignalLabel}>{label}</Text>
      <Text style={styles.miniSignalValue}>{value}</Text>
    </View>
  );
}

function ContractPoint({ text }: { text: string }) {
  return (
    <View style={styles.contractPoint}>
      <Ionicons name="checkmark-circle" size={16} color="#0A1B0E" />
      <Text style={styles.contractPointText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cadenceScreen: { flex: 1, backgroundColor: "#06100B" },
  cadenceSkyWash: { position: "absolute", left: 0, right: 0, top: 0, height: 150 },
  cadenceContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  cadenceBrandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cadenceLeafMark: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.42)",
  },
  rotatingLeaf: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.12)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  thinkingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: "rgba(8,24,14,0.56)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.24)",
  },
  thinkingText: { color: colors.primaryLight, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  cadenceHero: { gap: spacing.md, paddingTop: spacing.xl },
  cadenceTitle: {
    color: colors.textMain,
    fontSize: 43,
    lineHeight: 50,
    fontWeight: "900",
    letterSpacing: 0,
    textShadowColor: "rgba(0,0,0,0.46)",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 3 },
  },
  cadenceTitleAccent: { color: colors.primaryLight },
  cadenceSubtitle: { color: "rgba(255,255,255,0.86)", fontSize: 18, lineHeight: 29, fontWeight: "500", maxWidth: 600 },
  thinkingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
    backgroundColor: "rgba(5,18,12,0.66)",
  },
  thinkingOrb: {
    width: 82,
    height: 82,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  thinkingCardTitle: { color: colors.textMain, fontSize: 17, fontWeight: "900" },
  thinkingCardText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cadencePanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(96,111,72,0.70)",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  cadencePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cadencePanelTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cadencePanelHint: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700" },
  cadenceOptionRow: { flexDirection: "row", gap: spacing.sm },
  cadenceOption: {
    flex: 1,
    minHeight: 150,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderWidth: 1.3,
    borderColor: "rgba(255,255,255,0.34)",
    backgroundColor: "rgba(247,245,231,0.90)",
  },
  cadenceOptionActive: {
    borderColor: colors.primaryLight,
    backgroundColor: "rgba(108,132,54,0.78)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.40,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  cadenceOptionNumber: { color: "#162412", fontSize: 36, fontWeight: "900", lineHeight: 41 },
  cadenceOptionNumberActive: { color: colors.primaryLight },
  cadenceOptionDetail: { color: "#162412", fontSize: 13, fontWeight: "700", textAlign: "center", minHeight: 36 },
  cadenceOptionDetailActive: { color: "rgba(255,255,255,0.92)" },
  cadenceSecurityRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm },
  cadenceSecurityText: { color: "rgba(255,255,255,0.82)", fontSize: 15, lineHeight: 21, flex: 1, fontWeight: "600" },
  cadenceTimePanel: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.24)",
    backgroundColor: "rgba(6,24,15,0.64)",
  },
  cadenceTimeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.14)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
  },
  cadenceTimeTitle: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  cadenceTimeText: { color: "rgba(255,255,255,0.70)", fontSize: 12.5, lineHeight: 17, marginTop: 2, fontWeight: "700" },
  cadenceTimeInput: {
    width: 86,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.28)",
    backgroundColor: "rgba(255,255,255,0.10)",
    color: colors.textMain,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  cadenceContinue: {
    minHeight: 70,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  cadenceContinueText: { color: "#122108", fontSize: 21, fontWeight: "900" },
  cadenceProgressRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  cadenceProgressItem: { flex: 1, height: 8, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.16)" },
  cadenceProgressItemActive: { backgroundColor: colors.primaryLight },
  mockupScreen: { flex: 1, backgroundColor: "#06100B" },
  mockupImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  mockupLayer: { ...StyleSheet.absoluteFillObject },
  mockupTouchArea: { position: "absolute", borderRadius: 999 },
  mockupSelectedArea: {
    position: "absolute",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(190,255,70,0.96)",
    backgroundColor: "rgba(182,255,63,0.08)",
    shadowColor: "#B6FF3F",
    shadowOpacity: 0.42,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  mockupSelectedInner: {
    flex: 1,
    margin: 4,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  mockupStatusMask: { position: "absolute", left: 0, right: 0, top: 0, height: 96 },
  background: { flex: 1, backgroundColor: "#06100B" },
  backgroundStatusMask: { position: "absolute", left: 0, right: 0, top: 0, height: 112 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", transform: [{ scale: 1.02 }] },
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: 2 },
  mark: { width: 58, height: 58, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.13)", borderWidth: 1.3, borderColor: "rgba(255,255,255,0.45)" },
  brand: { color: colors.textMain, fontSize: 29, lineHeight: 32, fontWeight: "800", letterSpacing: 0 },
  brandSub: { color: "rgba(255,255,255,0.72)", fontSize: 12.5, marginTop: 2, fontWeight: "400" },
  stepRail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, marginBottom: spacing.sm, padding: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(229,235,220,0.28)" },
  stepRailItem: { width: 38, height: 38, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(80,92,90,0.45)" },
  stepRailItemActive: { backgroundColor: colors.primaryLight, shadowColor: colors.primaryLight, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  hero: { paddingTop: spacing.sm, gap: 10 },
  scriptPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(12,29,12,0.52)", borderWidth: 1, borderColor: "rgba(182,255,63,0.16)" },
  script: { fontSize: 12, lineHeight: 15, color: "rgba(182,255,63,0.94)", fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { color: colors.textMain, fontSize: 36, lineHeight: 42, fontWeight: "800", letterSpacing: 0, textShadowColor: "rgba(0,0,0,0.42)", textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 } },
  subtitle: { color: "rgba(255,255,255,0.84)", fontSize: 16, lineHeight: 25, fontWeight: "400", maxWidth: 620 },
  sectionLabel: { color: "rgba(182,255,63,0.94)", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  question: { color: "rgba(255,255,255,0.94)", fontSize: 17, fontWeight: "800" },
  helper: { color: "rgba(255,255,255,0.66)", fontSize: 12.5, lineHeight: 18, marginTop: -4 },
  luxuryPanel: { gap: spacing.md, padding: spacing.lg, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(74,88,56,0.74)", shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  panelSoft: { padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(72,90,50,0.74)" },
  featurePanel: { gap: spacing.sm, padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(45,68,52,0.78)" },
  dayRow: { flexDirection: "row", gap: spacing.sm },
  dayChip: { flex: 1, minHeight: 84, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.05)" },
  dayChipOn: { borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.15)" },
  dayNumber: { color: colors.textMain, fontSize: 29, fontWeight: "600" },
  dayNumberOn: { color: colors.primaryLight },
  dayLabel: { ...typography.caption, marginTop: 2 },
  optionStack: { gap: 12 },
  choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 76, borderRadius: 22, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1.2, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.90)" },
  choiceOn: { borderColor: colors.primaryLight, backgroundColor: "rgba(139,161,70,0.82)" },
  choiceIcon: { width: 38, height: 38, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(84,104,54,0.14)" },
  choiceIconOn: { backgroundColor: colors.primaryLight },
  choiceText: { color: "#182414", fontWeight: "800", fontSize: 16 },
  choiceTextOn: { color: colors.primaryLight },
  choiceDetail: { color: "rgba(24,36,20,0.62)", fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  choiceDetailOn: { color: "rgba(255,255,255,0.78)" },
  inputGrid: { flexDirection: "row", gap: spacing.sm },
  inputCard: { flex: 1, minHeight: 124, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.92)" },
  inputLabel: { color: "rgba(24,36,20,0.62)", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.md },
  input: { flex: 1, color: "#122108", fontSize: 32, fontWeight: "800", paddingVertical: 0, letterSpacing: 0 },
  inputUnit: { color: "rgba(24,36,20,0.70)", fontSize: 14, fontWeight: "900", marginBottom: 5 },
  servingRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  servingChip: { minWidth: 54, minHeight: 50, paddingHorizontal: spacing.md, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.90)" },
  servingChipOn: { borderColor: colors.primaryLight, backgroundColor: "rgba(139,161,70,0.82)" },
  servingText: { color: "#182414", fontSize: 17, fontWeight: "800" },
  servingTextOn: { color: colors.primaryLight },
  servingUnknown: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.90)" },
  servingUnknownText: { color: "#182414", fontSize: 13, fontWeight: "800" },
  footerRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm },
  mockupBackPlaceholder: { width: 0 },
  mockupBackButton: { minHeight: 58, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(30,42,30,0.46)" },
  mockupBackText: { color: "rgba(255,255,255,0.86)", fontSize: 14, fontWeight: "800" },
  mockupNextButton: { flex: 1, minHeight: 64, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, backgroundColor: colors.primaryLight, shadowColor: colors.primaryLight, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  mockupNextDisabled: { opacity: 0.42 },
  mockupNextText: { color: "#122108", fontSize: 18, fontWeight: "800" },
  loadingPanel: { gap: spacing.lg, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)", backgroundColor: "rgba(68,84,49,0.78)", alignItems: "center" },
  loadingLeafWrap: { width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.05)", overflow: "hidden" },
  loadingGlow: { position: "absolute", inset: 18, borderRadius: 999, backgroundColor: "rgba(182,255,63,0.18)" },
  loadingLeafCore: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,18,12,0.82)", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  loadingCaption: { color: "rgba(182,255,63,0.92)", fontSize: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  loadingLineActive: { color: colors.textMain, fontWeight: "500", fontSize: 18, lineHeight: 28, textAlign: "center", maxWidth: 260 },
  loadingHint: { color: "rgba(255,255,255,0.44)", fontSize: 12.5, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  objectiveHeroCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.44)", backgroundColor: "rgba(247,250,230,0.94)", shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  objectiveIcon: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, shadowColor: colors.primaryLight, shadowOpacity: 0.44, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  objectiveKicker: { color: "rgba(18,33,8,0.58)", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  objectiveHeroTitle: { color: "#122108", fontSize: 28, lineHeight: 34, fontWeight: "900", letterSpacing: 0, marginTop: 2 },
  objectiveHeroSub: { color: "rgba(18,33,8,0.68)", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 4 },
  nutritionDeltaPanel: { gap: spacing.md, padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(45,68,52,0.78)" },
  deltaRow: { flexDirection: "row", gap: spacing.sm },
  deltaTile: { flex: 1, minHeight: 154, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.93)" },
  deltaIcon: { width: 34, height: 34, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.78)" },
  deltaLabel: { color: "rgba(18,33,8,0.58)", fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: spacing.sm },
  deltaValueRow: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 5, marginTop: 3 },
  deltaValue: { color: "#122108", fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: 0 },
  deltaUnit: { color: "rgba(18,33,8,0.64)", fontSize: 11, fontWeight: "900", marginBottom: 5 },
  deltaDetail: { color: "rgba(18,33,8,0.60)", fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: spacing.sm },
  deltaExplain: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 18, backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  deltaExplainText: { color: colors.textMain, flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  scorePanel: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: 26, backgroundColor: "rgba(247,250,230,0.94)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  scoreLabel: { color: "rgba(10,27,14,0.60)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  scoreTitle: { color: "#0A1B0E", fontSize: 40, lineHeight: 46, fontWeight: "700", letterSpacing: 0, marginTop: 2, fontFamily: "Georgia" },
  scoreSub: { color: "rgba(10,27,14,0.68)", lineHeight: 19, fontSize: 13, maxWidth: 230 },
  scoreRing: { width: 70, height: 70, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.84)" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metricCard: { width: "48%", minHeight: 136, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.92)" },
  metricLabel: { color: "rgba(24,36,20,0.62)", fontSize: 11, fontWeight: "900", marginTop: spacing.sm, textTransform: "uppercase" },
  metricValue: { color: "#122108", fontSize: 18, fontWeight: "900", marginTop: 4 },
  metricSub: { color: "rgba(24,36,20,0.56)", fontSize: 10.5, lineHeight: 14, marginTop: 4 },
  insightStack: { gap: spacing.sm },
  insightCard: { padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)", backgroundColor: "rgba(68,84,49,0.66)", gap: spacing.sm },
  insightTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  insightIcon: { width: 34, height: 34, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.13)" },
  insightTitle: { color: colors.textMain, fontSize: 15, fontWeight: "800" },
  insightValue: { color: colors.primaryLight, fontSize: 13, fontWeight: "900", marginTop: 2 },
  insightBody: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19 },
  structureStack: { gap: spacing.sm },
  structureCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 118, padding: spacing.md, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.90)" },
  structureCardActive: { borderColor: colors.primaryLight, backgroundColor: "rgba(232,238,196,0.95)", shadowColor: colors.primaryLight, shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  structureIcon: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  structureTopLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs, flexWrap: "wrap" },
  structureTitle: { color: "#122108", fontSize: 20, fontWeight: "900", letterSpacing: 0 },
  structureIdealPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(70,84,42,0.14)" },
  structureIdealText: { color: "rgba(18,33,8,0.62)", fontSize: 10.5, fontWeight: "900" },
  structureBullet: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  structureBulletText: { color: "rgba(18,33,8,0.70)", fontSize: 12.5, lineHeight: 17, fontWeight: "700", flex: 1 },
  structureCheck: { width: 38, height: 38, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(78,97,42,0.12)" },
  structureCheckActive: { backgroundColor: colors.primaryLight },
  structureRules: { gap: spacing.sm, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(182,255,63,0.20)", backgroundColor: "rgba(17,38,20,0.66)" },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ruleText: { color: "rgba(255,255,255,0.82)", flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  primaryWideButton: { minHeight: 62, borderRadius: radius.full, backgroundColor: colors.primaryLight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, shadowColor: colors.primaryLight, shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  primaryWideButtonText: { color: "#122108", fontSize: 16, fontWeight: "900" },
  secondaryWideButton: { minHeight: 56, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.26)", backgroundColor: "rgba(10,28,15,0.54)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  secondaryWideButtonText: { color: colors.primaryLight, fontSize: 14, fontWeight: "900" },
  recommendationStack: { gap: spacing.md },
  recMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  miniSignal: { width: "48%", minHeight: 72, padding: spacing.sm, borderRadius: 18, borderWidth: 1, borderColor: "rgba(182,255,63,0.20)", backgroundColor: "rgba(15,36,20,0.70)", justifyContent: "center", gap: 3 },
  miniSignalLabel: { color: "rgba(255,255,255,0.58)", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  miniSignalValue: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  recMainCard: { gap: spacing.md, padding: spacing.lg, borderRadius: 26, borderWidth: 1, borderColor: "rgba(182,255,63,0.30)", backgroundColor: "rgba(30,54,26,0.82)", shadowColor: colors.primaryLight, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  recTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  recTitle: { color: colors.textMain, fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: 0 },
  recBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  recBadgeText: { color: "#122108", fontSize: 11, fontWeight: "900" },
  recBodyIcon: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  recReasonRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)" },
  recReasonText: { color: "rgba(255,255,255,0.82)", flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  whyCard: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(18,35,24,0.72)" },
  whyTitle: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  whyBody: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  alternativePanel: { gap: spacing.sm },
  alternativeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  alternativeChip: { flexGrow: 1, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(13,32,18,0.68)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  alternativeChipText: { color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  programHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  modifyPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.28)", backgroundColor: "rgba(182,255,63,0.08)" },
  modifyPillText: { color: colors.primaryLight, fontSize: 11, fontWeight: "900" },
  programTitle: { color: colors.textMain, fontSize: 24, fontWeight: "800", letterSpacing: 0 },
  programSplit: { color: colors.primaryLight, fontSize: 13, fontWeight: "900", marginTop: 4, textTransform: "uppercase" },
  programText: { ...typography.body, color: "rgba(255,255,255,0.78)", lineHeight: 22 },
  recoveryPill: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: "rgba(53,214,232,0.10)", borderWidth: 1, borderColor: "rgba(53,214,232,0.24)" },
  recoveryText: { color: colors.textMain, flex: 1, fontWeight: "700" },
  sessionStack: { gap: spacing.sm },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.48)", backgroundColor: "rgba(246,244,229,0.94)" },
  sessionDay: { width: 46, height: 46, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(53,214,232,0.12)", borderWidth: 1, borderColor: "rgba(53,214,232,0.24)" },
  sessionDayText: { color: colors.aqua, fontWeight: "900", fontSize: 12 },
  sessionMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  sessionTag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(162,198,101,0.20)", borderWidth: 1, borderColor: "rgba(132,165,79,0.28)" },
  sessionTagText: { color: "#122108", fontSize: 11, fontWeight: "800" },
  sessionTitle: { color: "#122108", fontWeight: "900", fontSize: 16 },
  sessionFocus: { color: "rgba(24,36,20,0.68)", fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  goalHeadline: { color: colors.textMain, fontSize: 22, lineHeight: 28, fontWeight: "600", marginTop: spacing.sm },
  objective: { ...typography.body, color: colors.textSecondary, lineHeight: 23, marginTop: spacing.sm },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  featureDot: { width: 26, height: 26, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  featureText: { color: colors.textMain, flex: 1, lineHeight: 19, fontWeight: "700" },
  featureFootnote: { color: "rgba(255,255,255,0.62)", fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  timeline: { padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", backgroundColor: "rgba(68,84,49,0.62)" },
  timelineRow: { flexDirection: "row", gap: spacing.md },
  timelineRail: { alignItems: "center", width: 18 },
  timelineDot: { width: 12, height: 12, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  timelineLine: { flex: 1, width: 1, backgroundColor: "rgba(182,255,63,0.30)", marginTop: 4 },
  timelineMoment: { color: colors.primaryLight, fontSize: 12, fontWeight: "900" },
  timelineTitle: { color: colors.textMain, fontWeight: "700", marginTop: 2 },
  timelineBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  contract: { gap: spacing.lg, padding: spacing.lg, borderRadius: 26, backgroundColor: "rgba(247,250,230,0.94)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  contractTitle: { color: "#0A1B0E", fontSize: 24, fontWeight: "600", letterSpacing: 0.2 },
  contractBody: { color: "rgba(10,27,14,0.72)", lineHeight: 22, fontSize: 15 },
  contractPoints: { gap: spacing.sm },
  contractPoint: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: 14, backgroundColor: "rgba(10,27,14,0.06)" },
  contractPointText: { color: "#0A1B0E", fontWeight: "800", flex: 1 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "rgba(10,27,14,0.18)", paddingTop: spacing.md },
  signature: { fontFamily: "Georgia", fontStyle: "italic", color: "#0A1B0E", fontSize: 28, lineHeight: 34 },
  date: { color: "rgba(10,27,14,0.56)", marginTop: 4, fontSize: 12, fontWeight: "700" },
  holdButton: { minHeight: 60, borderRadius: radius.full, overflow: "hidden", borderWidth: 1, borderColor: "rgba(10,27,14,0.22)", backgroundColor: "#0A1B0E", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  holdButtonSigned: { backgroundColor: colors.primaryLight },
  holdFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(182,255,63,0.38)" },
  holdText: { color: colors.primaryLight, fontWeight: "900" },
  holdTextSigned: { color: "#071207" },
});
