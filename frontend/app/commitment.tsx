import { useEffect, useMemo, useRef, useState } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import type { ImageSourcePropType, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Button, ProgressRing } from "@/src/components/UI";
import { PROGRAMS, type Freq, type Split } from "@/src/components/ProgramCarousel";
import { markCommitmentSigned } from "@/src/lib/commitment";
import { ensureNotifPermission } from "@/src/lib/notifications";
import { colors, radius, spacing, typography } from "@/src/theme";

type Step =
  | "cadence"
  | "priority"
  | "obstacles"
  | "weight"
  | "activity"
  | "protein"
  | "loading"
  | "diagnosis"
  | "strategy"
  | "pact";
type Priority = "muscle" | "fat_loss" | "energy";
type Obstacle = "time" | "food" | "discipline" | "recovery" | "motivation" | "schedule";
type ProteinHabit = "meat" | "mixed" | "plant" | "unknown";

type Profile = {
  weight_kg?: number;
  height_cm?: number;
  age?: number;
  gender?: string;
  goal?: string;
  activity_level?: string;
  daily_calories?: number;
  protein_g?: number;
};

type ProgramPlan = {
  title: string;
  split: string;
  detail: string;
  motivation: string;
  sessions: { day: string; title: string; focus: string }[];
  featureNotes: string[];
};

const STEPS: { key: Step; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "cadence", label: "Rythme", icon: "calendar-outline" },
  { key: "priority", label: "Objectif", icon: "compass-outline" },
  { key: "obstacles", label: "Freins", icon: "trail-sign-outline" },
  { key: "weight", label: "Poids", icon: "body-outline" },
  { key: "activity", label: "Activité", icon: "walk-outline" },
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
  weight: require("../assets/images/fitai-hero-progress-hd.png"),
  activity: require("../assets/images/fitai-hero-program-hd.png"),
  protein: require("../assets/images/fitai-hero-meals-hd.png"),
  loading: require("../assets/images/fitai-hero-dashboard-hd.png"),
  diagnosis: require("../assets/images/fitai-hero-progress-hd.png"),
  strategy: require("../assets/images/fitai-hero-program-hd.png"),
  pact: require("../assets/images/fitai-hero-progress-hd.png"),
};

const MOCKUP_TOUCH_AREAS = [
  { id: "commitment-day-2", label: "2 séances par semaine", x: 0.065, y: 0.655, width: 0.17, height: 0.15, trainingDays: 2 },
  { id: "commitment-day-3", label: "3 séances par semaine", x: 0.235, y: 0.655, width: 0.17, height: 0.15, trainingDays: 3 },
  { id: "commitment-day-4", label: "4 séances par semaine", x: 0.407, y: 0.655, width: 0.17, height: 0.15, trainingDays: 4 },
  { id: "commitment-day-5", label: "5 séances par semaine", x: 0.58, y: 0.655, width: 0.17, height: 0.15, trainingDays: 5 },
  { id: "commitment-day-expert", label: "Mode expert, plus de 5 séances par semaine", x: 0.745, y: 0.655, width: 0.19, height: 0.15, trainingDays: 6 },
  { id: "commitment-generate", label: "Continuer", x: 0.035, y: 0.875, width: 0.93, height: 0.085, action: "continue" },
] as const;

type MockupTouchArea = (typeof MOCKUP_TOUCH_AREAS)[number];
type MockupTrainingArea = Extract<MockupTouchArea, { trainingDays: number }>;

function isMockupTrainingArea(area: MockupTouchArea): area is MockupTrainingArea {
  return "trainingDays" in area;
}

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
  weight: [
    "Nous recalons tes mensurations.",
    "Nous fiabilisons les estimations calories et protéines.",
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
  if (priority === "fat_loss") return clampCalories(Math.min(currentCalories, maintenance) - 260, maintenance / activityFactor("moderate"));
  if (priority === "muscle") return clampCalories(Math.max(currentCalories, maintenance) + 180, maintenance / activityFactor("moderate"));
  return clampCalories(Math.round((currentCalories + maintenance) / 2), maintenance / activityFactor("moderate"));
}

function estimateProteinTarget(weight: number, proteinHabit: ProteinHabit, knownProtein?: number): number {
  if (knownProtein) return Math.round(knownProtein);
  const factor = proteinHabit === "plant" ? 2.05 : proteinHabit === "unknown" ? 1.8 : 1.9;
  return Math.round(weight * factor);
}

function estimateHydration(weight: number, trainingDays: number): number {
  return Math.round(weight * 0.032 * 10) / 10 + (trainingDays >= 4 ? 0.35 : 0.2);
}

function splitLabel(split: Split): string {
  if (split === "fullbody") return "Full Body";
  if (split === "ppl") return "PPL";
  return "Split musculaire";
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

function buildProgramPlan(trainingDays: number, priority: Priority, obstacles: Obstacle[]): ProgramPlan {
  const selected = chooseProgram(priority, trainingDays);
  const source = PROGRAMS.find((program) => program.title === selected.sourceTitle);
  const compact = trainingDays <= 3 || obstacles.includes("time") || obstacles.includes("schedule");
  const sessions = selected.split === "fullbody"
    ? [
        { day: "Lun", title: "Full body A", focus: "Poussée, jambes, gainage" },
        { day: "Mer", title: "Full body B", focus: "Tirage, chaîne postérieure" },
        { day: "Sam", title: "Full body C", focus: "Densité, cardio doux" },
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
    title: `${selected.title} · ${splitLabel(selected.split)}`,
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
  const [weightInput, setWeightInput] = useState("75");
  const [heightInput, setHeightInput] = useState("178");
  const [activityInput, setActivityInput] = useState<string>("moderate");
  const [dailyProteinServings, setDailyProteinServings] = useState<string>("2");
  const [proteinHabit, setProteinHabit] = useState<ProteinHabit>("mixed");
  const [holdProgress, setHoldProgress] = useState(0);
  const [signed, setSigned] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [loadingTarget, setLoadingTarget] = useState<Step>("diagnosis");
  const [loadingSource, setLoadingSource] = useState<Exclude<Step, "loading">>("protein");
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
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
        if (nextProfile.weight_kg) setWeightInput(String(Math.round(nextProfile.weight_kg)));
        if (nextProfile.height_cm) setHeightInput(String(Math.round(nextProfile.height_cm)));
        if (nextProfile.activity_level) setActivityInput(nextProfile.activity_level);
      })
      .catch(() => setProfile({}));
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
    const weight = Math.max(40, parseFloat(weightInput || "0") || profile.weight_kg || 75);
    const height = Math.max(135, parseFloat(heightInput || "0") || profile.height_cm || 178);
    const age = profile.age || 28;
    const activity = activityInput || profile.activity_level || "moderate";
    const servings = dailyProteinServings.trim() === "" || proteinHabit === "unknown" ? null : Math.max(0, Math.min(8, parseInt(dailyProteinServings, 10) || 0));
    const bmr = estimateBmr(weight, height, age, profile.gender);
    const maintenance = Math.round(bmr * activityFactor(activity));
    const currentCalories = estimateCurrentCalories({ profile, weight, height, age, activity, dailyProteinServings: servings, proteinHabit });
    const targetCalories = estimateSafeTargetCalories(currentCalories, maintenance, priority);
    const proteinTarget = estimateProteinTarget(weight, proteinHabit, profile.protein_g);
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
      carbsTarget,
      fatTarget,
      hydration,
      obstacleText,
      program,
      readiness: Math.max(66, Math.min(94, 80 + trainingDays * 2 - obstacles.length * 3)),
      safeNote: priority === "fat_loss" ? "Déficit modéré pour protéger l'énergie et éviter les coupes agressives." : priority === "muscle" ? "Surplus contenu pour construire sans dériver inutilement." : "Point d'équilibre pensé pour relancer le rythme sans surcharge.",
      objective: priority === "muscle"
        ? `${Math.max(1.4, Math.round(weight * 0.025 * 10) / 10)} à ${Math.max(3, Math.round(weight * 0.05 * 10) / 10)} kg de muscle sur 12 à 16 semaines`
        : priority === "fat_loss"
          ? `${Math.max(2, Math.round(weight * 0.04 * 10) / 10)} à ${Math.max(4, Math.round(weight * 0.08 * 10) / 10)} kg de gras en moins sans casser la récupération`
          : "2 semaines pour stabiliser l'énergie, puis 8 semaines pour reconstruire la constance",
      weight,
      height,
      bmi: Math.round((weight / ((height / 100) * (height / 100))) * 10) / 10,
    };
  }, [activityInput, dailyProteinServings, heightInput, obstacles, priority, profile, proteinHabit, trainingDays, weightInput]);

  const beginAnalysis = (target: Step) => {
    setLoadingSource(step === "loading" ? "protein" : (step as Exclude<Step, "loading">));
    setLoadingTarget(target);
    setStep("loading");
  };

  const next = () => {
    const nextStep = STEPS[Math.min(STEPS.length - 1, currentStepIndex + 1)]?.key;
    if (!nextStep) return;
    if (nextStep === "loading") {
      beginAnalysis("diagnosis");
      return;
    }
    if (["cadence", "priority", "obstacles", "weight", "activity", "diagnosis", "strategy"].includes(step)) {
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

  const enableNotifications = async () => {
    if (notifBusy || notifEnabled) return;
    setNotifBusy(true);
    try {
      const ok = await ensureNotifPermission();
      setNotifEnabled(ok);
    } finally {
      setNotifBusy(false);
    }
  };

  if (step === "cadence") {
    return <LandingMockup selectedTrainingDays={trainingDays} onNext={next} onTrainingDays={setTrainingDays} />;
  }

  const backgroundSource = COMMITMENT_STEP_BACKGROUNDS[step];

  return (
    <ImageBackground source={backgroundSource} style={styles.background} imageStyle={styles.backgroundImage} resizeMode="cover">
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
            <Text style={styles.stepCount}>{currentStepIndex + 1}/{STEPS.length}</Text>
          </View>
          <StepRail activeIndex={currentStepIndex} />

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

          {step === "weight" && (
            <>
              <HeroBlock script="poids actuel" title={"Quel poids veux-tu que l'on utilise pour partir juste ?"} subtitle={"C'est la donnée qui influence le plus les calories, les protéines et l'hydratation."} />
              <View style={styles.luxuryPanel}>
                <Text style={styles.sectionLabel}>Mensurations de départ</Text>
                <Text style={styles.helper}>{"Tu peux corriger les deux. FIT AI s'appuie dessus pour estimer un point de départ plus propre."}</Text>
                <View style={styles.inputGrid}>
                  <InputCard label="Poids actuel" value={weightInput} unit="kg" onChange={setWeightInput} testID="commitment-weight-input" />
                  <InputCard label="Taille" value={heightInput} unit="cm" onChange={setHeightInput} />
                </View>
                <View style={styles.metricsGrid}>
                  <MetricCard icon="body-outline" label="Poids retenu" value={`${analysis.weight.toFixed(0)} kg`} sub="valeur utilisée pour les calculs" />
                  <MetricCard icon="resize-outline" label="Taille retenue" value={`${analysis.height.toFixed(0)} cm`} sub="modifiable à tout moment ici" />
                  <MetricCard icon="analytics-outline" label="IMC estimé" value={`${analysis.bmi.toFixed(1)}`} sub="repère brut, non utilisé seul" />
                  <MetricCard icon="shield-outline" label="Approche FIT AI" value="prudente" sub="cible calorique ensuite sécurisée" />
                </View>
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Continuer" nextTestID="commitment-data-next" />
            </>
          )}

          {step === "activity" && (
            <>
              <HeroBlock script="activité quotidienne" title="À quel point tu bouges déjà dans tes journées ?" subtitle="On ne parle pas seulement sport, mais aussi métier, marche, déplacements et rythme général." />
              <View style={styles.luxuryPanel}>
                <Text style={styles.sectionLabel}>{"Niveau d'activité"}</Text>
                <View style={styles.optionStack}>
                  {ACTIVITY_OPTIONS.map((item) => (
                    <ChoiceRow key={item.value} label={item.label} detail={`Facteur ${item.factor.toFixed(2)}`} icon="walk-outline" active={activityInput === item.value} onPress={() => setActivityInput(item.value)} />
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
                      <Ionicons name="leaf" size={38} color={colors.primaryLight} />
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
              <HeroBlock script="diagnostic FIT AI" title="Un objectif calorique crédible, sans mettre l'utilisateur en danger." subtitle="On estime d'abord ton apport actuel, puis on propose une cible de départ prudente et exploitable." />
              <View style={styles.scorePanel}>
                <View>
                  <Text style={styles.scoreLabel}>Indice de départ</Text>
                  <Text style={styles.scoreTitle}>{analysis.readiness}/100</Text>
                  <Text style={styles.scoreSub}>{"Le potentiel est bon si on traite d'abord "}{analysis.obstacleText.slice(0, 2).join(" et ").toLowerCase() || "les frictions du quotidien"}.</Text>
                </View>
                <View style={styles.scoreRing}>
                  <Ionicons name="sparkles-outline" size={30} color="#071207" />
                </View>
              </View>
              <View style={styles.metricsGrid}>
                <MetricCard icon="flame-outline" label="Apport estimé actuel" value={`${analysis.currentCalories.toLocaleString("fr-FR")} kcal`} sub="estimation de départ" />
                <MetricCard icon="analytics-outline" label="Maintenance" value={`${analysis.maintenance.toLocaleString("fr-FR")} kcal`} sub="niveau d'équilibre probable" />
                <MetricCard icon="shield-checkmark-outline" label="Cible sûre" value={`${analysis.targetCalories.toLocaleString("fr-FR")} kcal`} sub={analysis.safeNote} />
                <MetricCard icon="water-outline" label="Hydratation" value={`${analysis.hydration.toFixed(1)} L`} sub="objectif quotidien" />
              </View>
              <View style={styles.insightStack}>
                <InsightCard icon="nutrition-outline" title="Apport protéique" value={`${analysis.proteinTarget} g / jour`} body="Cible pensée pour soutenir la progression, avec marge renforcée si l'alimentation est surtout végétale." />
                <InsightCard icon="fast-food-outline" title="Répartition simple" value={`P ${analysis.proteinTarget}g · G ${analysis.carbsTarget}g · L ${analysis.fatTarget}g`} body="Un cadre clair pour les repas, sans chercher une précision anxieuse dès la première semaine." />
                <InsightCard icon="trending-up-outline" title="Direction choisie" value={analysis.calorieDelta >= 0 ? `+${analysis.calorieDelta} kcal` : `${analysis.calorieDelta} kcal`} body="On s'éloigne du point actuel par paliers modérés pour protéger l'énergie et l'adhérence." />
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Construire ma stratégie" nextTestID="commitment-diagnosis-next" />
            </>
          )}

          {step === "strategy" && (
            <>
              <HeroBlock script="stratégie cohérente" title="Le plan suit les programmes déjà proposés dans l'app." subtitle="On reste cohérent avec le catalogue FIT AI, puis on enveloppe le programme avec nutrition, notifications et hydratation." />
              <View style={styles.luxuryPanel}>
                <Text style={styles.programTitle}>{analysis.program.title}</Text>
                <Text style={styles.programSplit}>{analysis.program.split}</Text>
                <Text style={styles.programText}>{analysis.program.detail}</Text>
                <View style={styles.recoveryPill}>
                  <Ionicons name="sparkles-outline" size={15} color={colors.aqua} />
                  <Text style={styles.recoveryText}>{analysis.program.motivation}</Text>
                </View>
              </View>
              <View style={styles.sessionStack}>
                {analysis.program.sessions.map((session) => (
                  <SessionRow key={`${session.day}-${session.title}`} {...session} />
                ))}
              </View>
              <View style={styles.panelSoft}>
                <Text style={styles.sectionLabel}>Objectif accomplissable</Text>
                <Text style={styles.goalHeadline}>{analysis.objective}</Text>
                <Text style={styles.objective}>{"Le cycle démarre avec des calories sûres, puis s'ajuste avec les données réelles de repas, séances et récupération."}</Text>
              </View>
              <View style={styles.featurePanel}>
                <Text style={styles.sectionLabel}>Fonctionnalités à activer</Text>
                {analysis.program.featureNotes.map((note) => (
                  <FeatureRow key={note} text={note} />
                ))}
                <View style={styles.notificationPrompt}>
                  <View style={styles.notificationPromptIcon}>
                    <Ionicons name={notifEnabled ? "checkmark-circle" : "notifications-outline"} size={18} color={notifEnabled ? "#071207" : colors.primaryLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notificationPromptTitle}>{notifEnabled ? "Notifications prêtes" : "Activer mes notifications"}</Text>
                    <Text style={styles.notificationPromptBody}>
                      {notifEnabled
                        ? "Tu pourras recevoir tes rappels de séances, motivation, protéines et hydratation."
                        : "On te proposera des rappels de séances, de motivation, de protéines et d'hydratation pour rester dans le rythme."}
                    </Text>
                  </View>
                </View>
                <Button
                  title={notifEnabled ? "Notifications activées" : "Activer mes rappels"}
                  onPress={enableNotifications}
                  loading={notifBusy}
                  disabled={notifEnabled}
                  icon={<Ionicons name={notifEnabled ? "checkmark-circle" : "notifications-outline"} size={16} color={notifEnabled ? "#071207" : colors.primaryLight} style={{ marginRight: 8 }} />}
                />
              </View>
              <View style={styles.timeline}>
                <TimelineRow moment="7 jours" title="Cadre posé" body="Calories, protéines, hydratation et premières séances deviennent lisibles." />
                <TimelineRow moment="30 jours" title="Régularité visible" body="Les séances ratées baissent et le rythme devient plus automatique." />
                <TimelineRow moment="12 semaines" title="Cycle exploitable" body="Le programme se raffine selon tes données, pas selon une promesse vague." last />
              </View>
              <FooterNav onPrev={prev} onNext={next} nextTitle="Signer mon pacte" nextTestID="commitment-next-pact" />
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
    </ImageBackground>
  );
}

function LandingMockup({
  selectedTrainingDays,
  onNext,
  onTrainingDays,
}: {
  selectedTrainingDays: number;
  onNext: () => void;
  onTrainingDays: (value: number) => void;
}) {
  const windowSize = useWindowDimensions();

  return (
    <ImageBackground
      source={require("../assets/images/fitai-signup-hero-main.png")}
      style={[styles.mockupScreen, { width: windowSize.width, height: windowSize.height }]}
      resizeMode="cover"
      testID="commitment-screen"
    >
      <View style={styles.mockupLayer}>
        <LinearGradient
          colors={["rgba(112,154,169,1)", "rgba(112,154,169,0.96)", "rgba(112,154,169,0.00)"]}
          locations={[0, 0.62, 1]}
          pointerEvents="none"
          style={styles.mockupStatusMask}
        />
        {MOCKUP_TOUCH_AREAS.map((area) => {
          const onPress = isMockupTrainingArea(area) ? () => onTrainingDays(area.trainingDays) : onNext;
          return (
            <Pressable
              key={area.id}
              accessibilityLabel={area.label}
              accessibilityRole="button"
              onPress={onPress}
              style={[styles.mockupTouchArea, mockupAreaStyle(area)]}
              testID={area.id}
            />
          );
        })}
        {MOCKUP_TOUCH_AREAS.filter(isMockupTrainingArea).filter((area) => area.trainingDays === selectedTrainingDays).map((area) => (
          <View key={`selected-${area.id}`} pointerEvents="none" style={[styles.mockupSelectedArea, mockupAreaStyle(area)]} testID={`commitment-selected-${area.trainingDays}`}>
            <View style={styles.mockupSelectedInner} />
          </View>
        ))}
      </View>
    </ImageBackground>
  );
}

function mockupAreaStyle(area: (typeof MOCKUP_TOUCH_AREAS)[number]): ViewStyle {
  return {
    left: `${area.x * 100}%`,
    top: `${area.y * 100}%`,
    width: `${area.width * 100}%`,
    height: `${area.height * 100}%`,
  };
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

function StepRail({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.stepRail}>
      {STEPS.map((item, index) => (
        <View key={item.key} style={[styles.stepRailItem, index === activeIndex && styles.stepRailItemActive]}>
          <Ionicons name={item.icon} size={18} color={index === activeIndex ? "#081406" : "rgba(255,255,255,0.78)"} />
        </View>
      ))}
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

function MetricCard({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub: string }) {
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={18} color={colors.aqua} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function InsightCard({ icon, title, value, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; body: string }) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightTop}>
        <View style={styles.insightIcon}>
          <Ionicons name={icon} size={16} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.insightTitle}>{title}</Text>
          <Text style={styles.insightValue}>{value}</Text>
        </View>
      </View>
      <Text style={styles.insightBody}>{body}</Text>
    </View>
  );
}

function SessionRow({ day, title, focus }: { day: string; title: string; focus: string }) {
  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionDay}>
        <Text style={styles.sessionDayText}>{day}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionTitle}>{title}</Text>
        <Text style={styles.sessionFocus}>{focus}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.48)" />
    </View>
  );
}

function TimelineRow({ moment, title, body, last }: { moment: string; title: string; body: string; last?: boolean }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelineDot} />
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.md }}>
        <Text style={styles.timelineMoment}>{moment}</Text>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineBody}>{body}</Text>
      </View>
    </View>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot}>
        <Ionicons name="sparkles-outline" size={14} color="#071207" />
      </View>
      <Text style={styles.featureText}>{text}</Text>
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

function InputCard({ label, value, unit, onChange, testID }: { label: string; value: string; unit: string; onChange: (value: string) => void; testID?: string }) {
  return (
    <View style={styles.inputCard}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput value={value} onChangeText={(next) => onChange(next.replace(/[^0-9.,]/g, "").replace(",", "."))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textMuted} style={styles.input} testID={testID} />
        <Text style={styles.inputUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mockupScreen: { flex: 1, backgroundColor: "#06100B" },
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
  backgroundStatusMask: { position: "absolute", left: 0, right: 0, top: 0, height: 132 },
  backgroundImage: { transform: [{ scale: 1.02 }] },
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.sm },
  mark: { width: 58, height: 58, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.13)", borderWidth: 1.3, borderColor: "rgba(255,255,255,0.45)" },
  brand: { color: colors.textMain, fontSize: 29, lineHeight: 32, fontWeight: "800", letterSpacing: 0 },
  brandSub: { color: "rgba(255,255,255,0.72)", fontSize: 12.5, marginTop: 2, fontWeight: "400" },
  stepCount: { color: "rgba(255,255,255,0.88)", fontSize: 16, fontWeight: "600", letterSpacing: 0, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(38,48,52,0.40)" },
  stepRail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: spacing.sm, marginBottom: spacing.md, padding: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.20)", backgroundColor: "rgba(229,235,220,0.22)" },
  stepRailItem: { width: 38, height: 38, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(80,92,90,0.45)" },
  stepRailItemActive: { backgroundColor: colors.primaryLight, shadowColor: colors.primaryLight, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  hero: { paddingTop: spacing.xl, gap: spacing.md },
  scriptPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(12,29,12,0.52)", borderWidth: 1, borderColor: "rgba(182,255,63,0.16)" },
  script: { fontSize: 12, lineHeight: 15, color: "rgba(182,255,63,0.94)", fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { color: colors.textMain, fontSize: 38, lineHeight: 45, fontWeight: "800", letterSpacing: 0, textShadowColor: "rgba(0,0,0,0.42)", textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 } },
  subtitle: { color: "rgba(255,255,255,0.84)", fontSize: 16, lineHeight: 25, fontWeight: "400", maxWidth: 620 },
  sectionLabel: { color: "rgba(182,255,63,0.94)", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  question: { color: "rgba(255,255,255,0.94)", fontSize: 17, fontWeight: "800" },
  helper: { color: "rgba(255,255,255,0.66)", fontSize: 12.5, lineHeight: 18, marginTop: -4 },
  luxuryPanel: { gap: spacing.md, padding: spacing.lg, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.26)", backgroundColor: "rgba(68,84,49,0.62)", shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  panelSoft: { padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.20)", backgroundColor: "rgba(72,90,50,0.62)" },
  featurePanel: { gap: spacing.sm, padding: spacing.lg, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.20)", backgroundColor: "rgba(45,68,52,0.70)" },
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
  loadingPanel: { gap: spacing.lg, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", backgroundColor: "rgba(68,84,49,0.70)", alignItems: "center" },
  loadingLeafWrap: { width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.05)", overflow: "hidden" },
  loadingGlow: { position: "absolute", inset: 18, borderRadius: 999, backgroundColor: "rgba(182,255,63,0.18)" },
  loadingLeafCore: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,18,12,0.82)", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  loadingCaption: { color: "rgba(182,255,63,0.92)", fontSize: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  loadingLineActive: { color: colors.textMain, fontWeight: "500", fontSize: 18, lineHeight: 28, textAlign: "center", maxWidth: 260 },
  loadingHint: { color: "rgba(255,255,255,0.44)", fontSize: 12.5, lineHeight: 19, textAlign: "center", maxWidth: 280 },
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
  programTitle: { color: colors.textMain, fontSize: 24, fontWeight: "800", letterSpacing: 0 },
  programSplit: { color: colors.primaryLight, fontSize: 13, fontWeight: "900", marginTop: -8, textTransform: "uppercase" },
  programText: { ...typography.body, color: "rgba(255,255,255,0.78)", lineHeight: 22 },
  recoveryPill: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: "rgba(53,214,232,0.10)", borderWidth: 1, borderColor: "rgba(53,214,232,0.24)" },
  recoveryText: { color: colors.textMain, flex: 1, fontWeight: "700" },
  sessionStack: { gap: spacing.sm },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(247,245,231,0.90)" },
  sessionDay: { width: 42, height: 42, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(53,214,232,0.12)", borderWidth: 1, borderColor: "rgba(53,214,232,0.22)" },
  sessionDayText: { color: colors.aqua, fontWeight: "900", fontSize: 12 },
  sessionTitle: { color: "#122108", fontWeight: "900" },
  sessionFocus: { color: "rgba(24,36,20,0.60)", fontSize: 12, marginTop: 2 },
  goalHeadline: { color: colors.textMain, fontSize: 22, lineHeight: 28, fontWeight: "600", marginTop: spacing.sm },
  objective: { ...typography.body, color: colors.textSecondary, lineHeight: 23, marginTop: spacing.sm },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 },
  featureDot: { width: 26, height: 26, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  featureText: { color: colors.textMain, flex: 1, lineHeight: 19, fontWeight: "700" },
  notificationPrompt: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: 22, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.10)" },
  notificationPromptIcon: { width: 34, height: 34, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,18,12,0.65)", borderWidth: 1, borderColor: "rgba(182,255,63,0.24)" },
  notificationPromptTitle: { color: colors.textMain, fontSize: 15, fontWeight: "700" },
  notificationPromptBody: { color: "rgba(255,255,255,0.66)", fontSize: 12.5, lineHeight: 18, marginTop: 3 },
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
