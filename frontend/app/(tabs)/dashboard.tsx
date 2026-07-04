import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, ProgressRing, SectionTitle, Stat, Button } from "@/src/components/UI";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import type { MascotAnimal } from "@/src/components/Mascot";
import { MascotPortrait } from "@/src/components/MascotPortrait";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { HydrationCard, useDailyHydration } from "@/src/components/HydrationCard";
import { SleepCard } from "@/src/components/SleepCard";
import { MotivationalScript } from "@/src/components/MotivationalScript";
import { syncPhoneStepsToday } from "@/src/lib/steps";
import { getSimpleMode, setSimpleMode as saveSimpleMode } from "@/src/lib/simpleMode";
import { colors, spacing, typography, radius } from "@/src/theme";

const SPLIT_LABELS: Record<string, string> = {
  ppl: "PPL",
  fullbody: "Full Body",
  split: "Split",
  home: "Home",
};

const STEPS_GOAL = 8000;
const ACTIVE_MINUTES_GOAL = 45;
const WATER_GOAL_ML = 2000;
const XP_PER_LEVEL = 300;

type DashboardData = {
  date: string;
  target_calories: number;
  consumed_calories: number;
  remaining_calories: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number; protein_target: number; carbs_target: number; fat_target: number };
  burned: { bmr: number; steps: number; cardio: number; workout: number; total: number };
  activity: { steps: number; cardio_minutes: number };
  workout: { title?: string; focus?: string; completed?: boolean; duration_min?: number } | null;
  meals_count: number;
  balance: number;
};

type WeekMacros = {
  days: { date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }[];
  avg: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  tracked_days: number;
};

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weekMacros, setWeekMacros] = useState<WeekMacros | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [stepsInput, setStepsInput] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);
  const [syncingSteps, setSyncingSteps] = useState(false);
  const [stepSyncMessage, setStepSyncMessage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState(false);
  const [activeInput, setActiveInput] = useState("");
  const [savingActive, setSavingActive] = useState(false);
  const hydration = useDailyHydration(WATER_GOAL_ML);
  // Phase 5: points / share
  const [points, setPoints] = useState<{
    level: number;
    points_total: number;
    points_in_level: number;
    level_span: number;
    evolution: 1 | 2 | 3;
    points_today: number;
    streak_days: number;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [programSplit, setProgramSplit] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, wm, ps, prog, simple] = await Promise.all([
        api<DashboardData>("/dashboard/day"),
        api<WeekMacros>("/dashboard/week-macros").catch(() => null),
        api<any>("/points/summary").catch(() => null),
        api<{ program: { split?: string } | null }>("/program/current").catch(() => null),
        getSimpleMode().catch(() => false),
      ]);
      setData(d);
      setWeekMacros(wm);
      setPoints(ps);
      setProgramSplit(prog?.program?.split || null);
      setSimpleMode(Boolean(simple));
    } catch (e) {
      console.warn("dashboard load", e);
    }
  }, []);

  const toggleSimpleMode = async () => {
    const next = !simpleMode;
    setSimpleMode(next);
    await saveSimpleMode(next);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addSteps = async () => {
    const n = parseInt(stepsInput || "0", 10);
    if (!n || n <= 0) return;
    setSavingSteps(true);
    try {
      await api("/activity/steps", { method: "POST", body: { steps: n } });
      setStepsInput("");
      setStepsModal(false);
      await load();
    } finally {
      setSavingSteps(false);
    }
  };

  const syncSteps = async () => {
    if (!data) return;
    setSyncingSteps(true);
    setStepSyncMessage(null);
    try {
      const result = await syncPhoneStepsToday(data.activity.steps);
      setStepSyncMessage(result.message);
      if (result.ok && (result.addedSteps || 0) > 0) await load();
    } finally {
      setSyncingSteps(false);
    }
  };

  const saveActiveMinutes = async () => {
    if (!data) return;
    const n = parseInt(activeInput || "0", 10);
    if (Number.isNaN(n) || n < 0) return;
    setSavingActive(true);
    try {
      await api("/activity", {
        method: "POST",
        body: {
          date: data.date,
          steps: data.activity.steps,
          cardio_minutes: n,
          cardio_type: "Minutes actives",
        },
      });
      setActiveModal(false);
      await load();
    } finally {
      setSavingActive(false);
    }
  };

  if (!data) {
    return (
      <ScreenBackground bg="dashboard">
        <Text style={[typography.body, { padding: spacing.lg }]}>Chargement...</Text>
      </ScreenBackground>
    );
  }

  const progress = data.target_calories > 0 ? data.consumed_calories / data.target_calories : 0;
  const over = data.consumed_calories > data.target_calories;
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const firstName = user?.name?.split(" ")[0] || "Élise";
  const activeBurned = Math.max(0, (data.burned.steps || 0) + (data.burned.cardio || 0) + (data.burned.workout || 0));
  const stepsProgress = Math.min(1, data.activity.steps / STEPS_GOAL);
  const activeMinutesProgress = Math.min(1, data.activity.cardio_minutes / ACTIVE_MINUTES_GOAL);
  const workoutDone = Boolean(data.workout?.completed);
  const dailyStepXp = Math.floor((data.activity.steps || 0) / 4000) * 5;
  const waterXp = hydration.amountMl >= WATER_GOAL_ML ? 20 : 0;
  const workoutXp = workoutDone ? 100 : 0;
  const fallbackXp = dailyStepXp + waterXp + workoutXp;
  const totalXp = points?.points_total ?? fallbackXp;
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXp % XP_PER_LEVEL;

  if (simpleMode) {
    return (
      <ScreenBackground bg="dashboard">
        <ScrollView
          testID="dashboard-simple-screen"
          contentContainerStyle={styles.simpleContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.simpleHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroDate}>{today}</Text>
              <Text style={styles.simpleHello}>Bonjour,{"\n"}{firstName}</Text>
            </View>
            {user?.mascot?.animal ? (
              <View style={styles.mascotHeroCircle}>
                <MascotPortrait animal={user.mascot.animal as MascotAnimal} size={124} active />
              </View>
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="leaf" size={20} color={colors.primary} />
              </View>
            )}
          </View>

          <Card style={styles.simpleMainCard} testID="dashboard-simple-calories">
            <Text style={styles.simpleLabel}>Calories à viser</Text>
            <Text style={styles.simpleCalories}>{data.target_calories.toLocaleString("fr-FR")}</Text>
            <Text style={styles.simpleSub}>
              {`${Math.max(0, data.remaining_calories).toLocaleString("fr-FR")} kcal restantes aujourd'hui`}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/meals")} style={styles.simplePrimaryButton} testID="dashboard-simple-add-meal">
              <Ionicons name="restaurant-outline" size={20} color="#102108" />
              <Text style={styles.simplePrimaryText}>Ajouter un repas</Text>
            </TouchableOpacity>
          </Card>

          <Card style={styles.simpleWorkoutCard} testID="dashboard-simple-workout">
            <Text style={styles.simpleLabel}>Programme</Text>
            <Text style={styles.simpleWorkoutTitle}>{data.workout?.focus || "Séance du jour"}</Text>
            <Text style={styles.simpleSub}>
              {data.workout?.duration_min || ACTIVE_MINUTES_GOAL} min · {workoutDone ? "terminée" : "prête"}
            </Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/training")} style={styles.simplePrimaryButton} testID="dashboard-simple-start-workout">
              <Ionicons name="play-circle" size={21} color="#102108" />
              <Text style={styles.simplePrimaryText}>Commencer ma séance</Text>
            </TouchableOpacity>
          </Card>

          <View style={styles.simpleCheckRow}>
            <SimpleCross label="Repas" done={data.meals_count > 0} />
            <SimpleCross label="Entraînement" done={workoutDone} />
          </View>

          <Card style={styles.simplePointsCard} testID="dashboard-simple-points">
            <View style={{ flex: 1 }}>
              <Text style={styles.simpleLabel}>Récompense</Text>
              <Text style={styles.simplePoints}>+100 points</Text>
              <Text style={styles.simpleSub}>par séance terminée</Text>
            </View>
            <TouchableOpacity onPress={() => setShareOpen(true)} style={styles.simpleShareButton} testID="dashboard-simple-share">
              <Ionicons name="share-social-outline" size={20} color={colors.primaryLight} />
              <Text style={styles.simpleShareText}>Partager</Text>
            </TouchableOpacity>
          </Card>

          <TouchableOpacity onPress={toggleSimpleMode} style={styles.simpleModeToggle} testID="dashboard-simple-toggle">
            <Ionicons name="settings-outline" size={18} color={colors.primaryLight} />
            <Text style={styles.simpleModeToggleText}>Basculer vers la version complète</Text>
          </TouchableOpacity>
        </ScrollView>

        <ShareCardModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          data={{
            focus: SPLIT_LABELS[programSplit || ""] || "Training",
            duration_min: data.workout?.duration_min,
            mascot: user?.mascot ? { animal: user.mascot.animal, evolution: (points?.evolution || 1) as 1 | 2 | 3 } : null,
            strength_evolution: (points?.evolution || 1) as 1 | 2 | 3,
            strength_value: points && points.level_span > 0 ? Math.min(1, points.points_in_level / points.level_span) : 0.3,
            points_today: points?.points_today || 0,
          }}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground bg="dashboard">
      <ScrollView
        testID="dashboard-screen"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroStage}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroDate}>{today}</Text>
              <Text style={styles.hello}>Bonjour,{"\n"}{firstName} !</Text>
              <Text style={styles.heroSubtitle}>Prête à te dépasser aujourd&apos;hui ?</Text>
              <MotivationalScript style={styles.heroScript}>déploie ton énergie.</MotivationalScript>
              <View style={styles.todayGoals}>
                <GoalPill icon="barbell-outline" label={data.workout?.focus || "Séance"} value={workoutDone ? "terminée" : "à faire"} />
                <GoalPill icon="walk-outline" label="Pas" value={`${Math.round(stepsProgress * 100)}%`} />
                <GoalPill icon="water-outline" label="Eau" value={`${Math.round(hydration.progress * 100)}%`} />
              </View>
            </View>
          {user?.mascot?.animal ? (
            <View style={styles.mascotHeroCircle}>
              <MascotPortrait animal={user.mascot.animal as MascotAnimal} size={124} active />
            </View>
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="leaf" size={20} color={colors.primary} />
            </View>
          )}
          </View>

          <Card style={styles.heroCard} testID="dashboard-hero-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <ProgressRing progress={workoutDone ? 1 : Math.max(0.12, activeMinutesProgress)} size={74} stroke={7}>
                <Text style={styles.heroRingValue}>{workoutDone ? "100%" : `${Math.round(Math.max(activeMinutesProgress, 0.12) * 100)}%`}</Text>
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <Text style={styles.objectiveLabel}>Objectif du jour</Text>
                <Text style={styles.objectiveTitle}>{data.workout?.focus || "Boucle active"}</Text>
                <Text style={styles.objectiveMeta}>
                  {data.workout?.duration_min || ACTIVE_MINUTES_GOAL} min · {workoutDone ? "séance validée" : "à valider"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push("/(tabs)/training")} style={styles.continueBtn} testID="dashboard-continue-workout">
                <Text style={styles.continueText}>Commencer séance</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <LevelProgressCard level={level} xpInLevel={xpInLevel} totalXp={totalXp} />

        <CalorieRemainingCard
          consumed={data.consumed_calories}
          remaining={data.remaining_calories}
          target={data.target_calories}
          proteinCurrent={data.macros.protein_g}
          proteinTarget={data.macros.protein_target}
          progress={progress}
          over={over}
          onAddMeal={() => router.push("/(tabs)/meals")}
        />

        <Card testID="dashboard-quests-card" style={{ gap: spacing.sm }}>
          <SectionTitle title="Quêtes du jour" />
          <QuestRow
            icon="walk"
            label="Tous les 4 000 pas"
            value={`${Math.min(2, Math.floor(data.activity.steps / 4000))}/2 paliers`}
            progress={Math.min(1, data.activity.steps / 8000)}
            reward={`+${dailyStepXp || 5} XP`}
            done={data.activity.steps >= 4000}
          />
          <QuestRow
            icon="barbell"
            label="Terminer la séance du jour"
            value={workoutDone ? "1/1" : "0/1"}
            progress={workoutDone ? 1 : 0}
            reward="+100 XP"
            done={workoutDone}
          />
          <QuestRow
            icon="water"
            label="Boire 2 L d'eau"
            value={`${(hydration.amountMl / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/2 L`}
            progress={hydration.progress}
            reward="+20 XP"
            done={hydration.amountMl >= WATER_GOAL_ML}
          />
        </Card>

        <View style={styles.statsGrid} testID="dashboard-focus-stats">
          <TodayMetricCard
            icon="flame"
            label="Dépense active"
            value={activeBurned.toLocaleString("fr-FR")}
            unit="kcal estimées"
          />
          <TodayMetricCard
            icon="footsteps"
            label="Pas du jour"
            value={data.activity.steps.toLocaleString("fr-FR")}
            unit={`/ ${STEPS_GOAL.toLocaleString("fr-FR")} pas`}
            progress={stepsProgress}
            actionLabel={syncingSteps ? "Sync..." : "Synchroniser"}
            onAction={syncSteps}
          />
          <TodayMetricCard
            icon="pulse"
            label="Minutes actives"
            value={data.activity.cardio_minutes}
            unit={`/ ${ACTIVE_MINUTES_GOAL} min`}
            progress={activeMinutesProgress}
            actionLabel="Ajouter"
            onAction={() => {
              setActiveInput(String(data.activity.cardio_minutes || ""));
              setActiveModal(true);
            }}
          />
        </View>

        <HydrationCard goalMl={WATER_GOAL_ML} />

        <SleepCard />

        {/* Weekly macros recap */}
        {weekMacros && weekMacros.tracked_days > 0 && (
          <Card testID="dashboard-week-macros-card">
            <SectionTitle title={`Macros · 7 derniers jours (${weekMacros.tracked_days}j suivis)`} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm, marginBottom: spacing.md }}>
              <WeekMacroStat label="kcal/jour" value={weekMacros.avg.calories} target={weekMacros.targets.calories} />
              <WeekMacroStat label="Protéines" value={weekMacros.avg.protein_g} target={weekMacros.targets.protein_g} unit="g" />
              <WeekMacroStat label="Glucides" value={weekMacros.avg.carbs_g} target={weekMacros.targets.carbs_g} unit="g" />
              <WeekMacroStat label="Lipides" value={weekMacros.avg.fat_g} target={weekMacros.targets.fat_g} unit="g" />
            </View>
            <View style={styles.weekDaysRow}>
              {weekMacros.days.map((d) => {
                const ratio = weekMacros.targets.calories > 0 ? d.calories / weekMacros.targets.calories : 0;
                const heightPct = Math.min(100, Math.max(4, ratio * 100));
                const isToday = d.date === data.date;
                const dayLabel = new Date(d.date).toLocaleDateString("fr-FR", { weekday: "narrow" });
                return (
                  <View key={d.date} style={{ alignItems: "center", flex: 1 }}>
                    <View style={styles.weekBarTrack}>
                      <View style={[
                        styles.weekBarFill,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: d.calories === 0 ? colors.border : ratio > 1.05 ? colors.alert : isToday ? colors.primary : colors.primaryLight,
                        },
                      ]} />
                    </View>
                    <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: isToday ? colors.primary : colors.textMuted, fontWeight: isToday ? "700" : "500" }]}>
                      {dayLabel}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Energy balance */}
        <Card testID="dashboard-burned-card">
          <SectionTitle title="Dépense énergétique" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md }}>
            <Stat label="Brûlées" value={data.burned.total.toLocaleString("fr-FR")} unit="kcal" />
            <Stat
              label="Balance"
              value={(data.balance >= 0 ? "+" : "") + data.balance}
              unit="kcal"
              align="center"
              valueStyle={{ color: data.balance < 0 ? colors.primary : colors.alert }}
            />
          </View>
          <View style={styles.burnedGrid}>
            <BurnRow icon="flame-outline" label="Métabolisme" value={data.burned.bmr} />
            <BurnRow icon="walk-outline" label="Pas" value={data.burned.steps} />
            <BurnRow icon="heart-outline" label="Cardio" value={data.burned.cardio} />
            <BurnRow icon="barbell-outline" label="Entraînement" value={data.burned.workout} />
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />
        <TouchableOpacity onPress={toggleSimpleMode} style={styles.simpleModeToggle} testID="dashboard-full-simple-toggle">
          <Ionicons name="phone-portrait-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.simpleModeToggleText}>Passer en version simplifiée</Text>
        </TouchableOpacity>
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal visible={stepsModal} transparent animationType="slide" onRequestClose={() => setStepsModal(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ajouter des pas</Text>
            <Text style={[typography.small, { marginTop: 4 }]}>Total actuel : {data.activity.steps.toLocaleString("fr-FR")} pas</Text>
            <Button
              title="Synchroniser depuis le téléphone"
              onPress={syncSteps}
              loading={syncingSteps}
              variant="secondary"
              style={{ marginTop: spacing.md }}
              testID="steps-sync-phone"
              icon={<Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />}
            />
            {stepSyncMessage ? (
              <Text style={[typography.small, { marginTop: spacing.sm, color: colors.textSecondary }]}>{stepSyncMessage}</Text>
            ) : null}
            <TextInput
              value={stepsInput}
              onChangeText={(t) => setStepsInput(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              placeholder="ex: 3500"
              placeholderTextColor={colors.textMuted}
              style={styles.stepInput}
              testID="dashboard-steps-input"
              autoFocus
            />
            <View style={styles.quickRow}>
              {[500, 1000, 2500, 5000].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setStepsInput(String((parseInt(stepsInput || "0", 10) || 0) + n))}
                  style={styles.quickChip}
                  testID={`steps-quick-${n}`}
                >
                  <Text style={[typography.small, { color: colors.primaryLight, fontWeight: "600" }]}>+{n.toLocaleString("fr-FR")}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Annuler" variant="secondary" onPress={() => { setStepsInput(""); setStepsModal(false); }} style={{ flex: 1 }} testID="steps-cancel" />
              <Button title="Ajouter" onPress={addSteps} loading={savingSteps} style={{ flex: 1.4 }} testID="steps-add-confirm" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={activeModal} transparent animationType="slide" onRequestClose={() => setActiveModal(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Minutes actives</Text>
            <Text style={[typography.small, { marginTop: 4 }]}>Course, vélo, marche rapide ou cardio ajouté manuellement.</Text>
            <TextInput
              value={activeInput}
              onChangeText={(t) => setActiveInput(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              placeholder="ex: 45"
              placeholderTextColor={colors.textMuted}
              style={styles.stepInput}
              testID="dashboard-active-input"
              autoFocus
            />
            <View style={styles.quickRow}>
              {[10, 20, 30, 45].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setActiveInput(String((parseInt(activeInput || "0", 10) || 0) + n))}
                  style={styles.quickChip}
                  testID={`active-quick-${n}`}
                >
                  <Text style={[typography.small, { color: colors.primaryLight, fontWeight: "600" }]}>+{n} min</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Annuler" variant="secondary" onPress={() => setActiveModal(false)} style={{ flex: 1 }} testID="active-cancel" />
              <Button title="Enregistrer" onPress={saveActiveMinutes} loading={savingActive} style={{ flex: 1.4 }} testID="active-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Phase 5: ShareCardModal */}
      <ShareCardModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        data={{
          focus: SPLIT_LABELS[programSplit || ""] || "Training",
          duration_min: data.workout?.duration_min,
          mascot: user?.mascot ? { animal: user.mascot.animal, evolution: (points?.evolution || 1) as 1 | 2 | 3 } : null,
          strength_evolution: (points?.evolution || 1) as 1 | 2 | 3,
          strength_value: points && points.level_span > 0 ? Math.min(1, points.points_in_level / points.level_span) : 0.3,
          points_today: points?.points_today || 0,
        }}
      />
    </ScreenBackground>
  );
}

function BurnRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.burnRow}>
      <View style={styles.burnIcon}>
        <Ionicons name={icon} size={16} color={colors.primaryLight} />
      </View>
      <Text style={[typography.body, { flex: 1 }]}>{label}</Text>
      <Text style={[typography.body, { fontWeight: "600" }]}>{value.toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
    </View>
  );
}

function GoalPill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.goalPill}>
      <Ionicons name={icon} size={13} color={colors.primaryLight} />
      <Text style={styles.goalPillText}>{label}</Text>
      <Text style={styles.goalPillValue}>{value}</Text>
    </View>
  );
}

function SimpleCross({ label, done }: { label: string; done: boolean }) {
  return (
    <Card style={[styles.simpleCrossCard, done && styles.simpleCrossCardDone]}>
      <View style={[styles.simpleCrossIcon, done && styles.simpleCrossIconDone]}>
        <Ionicons name={done ? "checkmark" : "close"} size={30} color={done ? "#102108" : "rgba(255,255,255,0.76)"} />
      </View>
      <Text style={styles.simpleCrossLabel}>{label}</Text>
    </Card>
  );
}

function LevelProgressCard({ level, xpInLevel, totalXp }: { level: number; xpInLevel: number; totalXp: number }) {
  const pct = Math.min(100, (xpInLevel / XP_PER_LEVEL) * 100);
  return (
    <Card testID="dashboard-level-card" style={styles.levelCard}>
      <View style={styles.levelBadge}>
        <Text style={styles.levelBadgeLabel}>Niveau</Text>
        <Text style={styles.levelBadgeValue}>{level}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.levelTopLine}>
          <Text style={styles.levelTitle}>Progression XP</Text>
          <Text style={styles.levelXp}>{xpInLevel} / {XP_PER_LEVEL} XP</Text>
        </View>
        <View style={styles.levelTrack}>
          <View style={[styles.levelFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.levelHint}>Chaque 300 XP débloque un nouveau niveau · total {totalXp.toLocaleString("fr-FR")} XP</Text>
      </View>
    </Card>
  );
}

function CalorieRemainingCard({
  consumed,
  remaining,
  target,
  proteinCurrent,
  proteinTarget,
  progress,
  over,
  onAddMeal,
}: {
  consumed: number;
  remaining: number;
  target: number;
  proteinCurrent: number;
  proteinTarget: number;
  progress: number;
  over: boolean;
  onAddMeal: () => void;
}) {
  const proteinRemaining = Math.max(0, proteinTarget - proteinCurrent);
  return (
    <Card style={styles.calorieHeroCard} testID="dashboard-calorie-card">
      <View style={styles.calorieHeroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.calorieHeroLabel}>Calories restantes</Text>
          <Text style={styles.calorieHeroValue}>{Math.max(0, remaining).toLocaleString("fr-FR")}</Text>
          <Text style={styles.calorieHeroMeta}>
            {consumed.toLocaleString("fr-FR")} / {target.toLocaleString("fr-FR")} kcal consommées
          </Text>
          <Text style={styles.calorieHeroMeta}>
            {proteinRemaining.toLocaleString("fr-FR")} g de protéines restantes
          </Text>
        </View>
        <ProgressRing progress={progress} size={94} stroke={9} color={over ? colors.alert : colors.primaryLight}>
          <Text style={[styles.calorieRingText, over && { color: colors.alert }]}>
            {Math.round(Math.min(1.25, progress) * 100)}%
          </Text>
        </ProgressRing>
      </View>
      {over ? (
        <View style={styles.overTag}>
          <Ionicons name="alert-circle" size={14} color={colors.alert} />
          <Text style={[typography.small, { color: colors.alert, fontWeight: "700", flex: 1 }]}>
            Dépassement de {(consumed - target).toLocaleString("fr-FR")} kcal aujourd&apos;hui
          </Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={onAddMeal} style={styles.addMealButton} testID="dashboard-add-meal">
        <Ionicons name="restaurant-outline" size={17} color="#102108" />
        <Text style={styles.addMealButtonText}>Ajouter mes repas</Text>
        <Ionicons name="chevron-forward" size={16} color="#102108" />
      </TouchableOpacity>
    </Card>
  );
}

function QuestRow({
  icon,
  label,
  value,
  progress,
  reward,
  done,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  progress: number;
  reward: string;
  done: boolean;
}) {
  return (
    <View style={styles.questRow}>
      <View style={styles.questIcon}>
        <Ionicons name={icon} size={16} color={colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.questTop}>
          <Text style={styles.questLabel}>{label}</Text>
          <Text style={styles.questValue}>{value}</Text>
        </View>
        <View style={styles.questTrack}>
          <View style={[styles.questFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
        </View>
      </View>
      <View style={[styles.questReward, done && styles.questRewardDone]}>
        <Text style={[styles.questRewardText, done && styles.questRewardTextDone]}>{reward}</Text>
        <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={15} color={done ? "#102108" : colors.primaryLight} />
      </View>
    </View>
  );
}

function TodayMetricCard({
  icon,
  label,
  value,
  unit,
  progress,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  unit: string;
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={styles.metricIcon}>
          <Ionicons name={icon} size={15} color={colors.primaryLight} />
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
      {typeof progress === "number" ? (
        <View style={styles.metricTrack}>
          <View style={[styles.metricFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.metricAction}>
          <Ionicons name="sync-outline" size={12} color={colors.primaryLight} />
          <Text style={styles.metricActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function WeekMacroStat({ label, value, target, unit }: { label: string; value: number; target: number; unit?: string }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const onTrack = pct >= 90 && pct <= 110;
  const color = onTrack ? colors.primaryLight : pct < 90 ? colors.textSecondary : colors.alert;
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[typography.caption, { fontWeight: "600" }]}>{label}</Text>
      <Text style={[typography.body, { fontWeight: "700", marginTop: 2 }]}>
        {value.toLocaleString("fr-FR")}{unit ? <Text style={[typography.small, { fontSize: 11 }]}> {unit}</Text> : null}
      </Text>
      {target > 0 && (
        <Text style={[typography.small, { fontSize: 10, color, fontWeight: "700", marginTop: 1 }]}>
          {pct}% obj.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 130 },
  simpleContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 130 },
  simpleHeader: { minHeight: 160, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: spacing.md },
  simpleHello: { fontSize: 46, lineHeight: 49, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0, marginTop: spacing.sm },
  simpleMainCard: { minHeight: 240, justifyContent: "center", gap: spacing.sm, borderColor: "rgba(182,255,63,0.28)", backgroundColor: "rgba(3,22,15,0.68)" },
  simpleWorkoutCard: { minHeight: 210, justifyContent: "center", gap: spacing.sm, backgroundColor: "rgba(25,45,24,0.68)" },
  simpleLabel: { color: colors.primaryLight, fontSize: 15, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  simpleCalories: { color: colors.textMain, fontSize: 74, lineHeight: 78, fontWeight: "900", letterSpacing: 0 },
  simpleSub: { color: colors.textSecondary, fontSize: 17, lineHeight: 24, fontWeight: "700" },
  simplePrimaryButton: { marginTop: spacing.md, minHeight: 64, borderRadius: radius.full, backgroundColor: colors.primaryLight, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  simplePrimaryText: { color: "#102108", fontSize: 19, fontWeight: "900" },
  simpleWorkoutTitle: { color: colors.textMain, fontSize: 36, lineHeight: 40, fontWeight: "900", letterSpacing: 0 },
  simpleCheckRow: { flexDirection: "row", gap: spacing.md },
  simpleCrossCard: { flex: 1, minHeight: 142, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "rgba(3,22,15,0.58)" },
  simpleCrossCardDone: { borderColor: "rgba(182,255,63,0.36)" },
  simpleCrossIcon: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  simpleCrossIconDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  simpleCrossLabel: { color: colors.textMain, fontSize: 18, fontWeight: "900" },
  simplePointsCard: { minHeight: 132, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: "rgba(3,22,15,0.66)" },
  simplePoints: { color: colors.textMain, fontSize: 34, lineHeight: 38, fontWeight: "900", marginTop: 2 },
  simpleShareButton: { minHeight: 54, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.10)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  simpleShareText: { color: colors.primaryLight, fontSize: 14, fontWeight: "900" },
  simpleModeToggle: { minHeight: 58, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(3,22,15,0.56)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  simpleModeToggleText: { color: colors.primaryLight, fontSize: 14, fontWeight: "900" },
  heroStage: { minHeight: 390, justifyContent: "space-between", paddingTop: spacing.sm },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroCard: { gap: 0, backgroundColor: "rgba(3,22,15,0.58)", borderColor: "rgba(255,255,255,0.18)" },
  heroDate: { ...typography.caption, color: "rgba(255,255,255,0.84)", textTransform: "capitalize", fontWeight: "600" },
  hello: { fontSize: 39, lineHeight: 41, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0, marginTop: spacing.sm, maxWidth: 220 },
  heroSubtitle: { ...typography.body, color: "rgba(255,255,255,0.82)", marginTop: spacing.sm, maxWidth: 220, lineHeight: 21 },
  heroScript: { fontSize: 25, lineHeight: 29, marginTop: spacing.sm, maxWidth: 245 },
  todayGoals: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md, maxWidth: 305 },
  goalPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.full, backgroundColor: "rgba(4,22,14,0.58)", borderWidth: 1, borderColor: "rgba(182,255,63,0.18)" },
  goalPillText: { color: "rgba(255,255,255,0.78)", fontSize: 10.5, fontWeight: "800" },
  goalPillValue: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  heroRingValue: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  objectiveLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  objectiveTitle: { color: colors.textMain, fontSize: 16, fontWeight: "900", marginTop: 1 },
  objectiveMeta: { color: colors.textSecondary, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  continueBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", maxWidth: 112 },
  continueText: { color: "#102108", fontSize: 10.5, fontWeight: "900", textAlign: "center" },
  avatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: "rgba(74,222,128,0.2)", borderWidth: 1, borderColor: "rgba(74,222,128,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  mascotHeroCircle: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.13)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.34)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  levelCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderColor: "rgba(182,255,63,0.30)" },
  levelBadge: { width: 62, height: 62, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.12)" },
  levelBadgeLabel: { color: colors.primaryLight, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  levelBadgeValue: { color: colors.textMain, fontSize: 24, lineHeight: 27, fontWeight: "900" },
  levelTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  levelTitle: { color: colors.textMain, fontSize: 14, fontWeight: "900" },
  levelXp: { color: colors.primaryLight, fontSize: 11.5, fontWeight: "900" },
  levelTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)", marginTop: spacing.sm },
  levelFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primaryLight },
  levelHint: { color: colors.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 6, fontWeight: "700" },
  calorieHeroCard: { gap: spacing.md, borderColor: "rgba(182,255,63,0.28)", backgroundColor: "rgba(3,22,15,0.66)" },
  calorieHeroTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  calorieHeroLabel: { color: colors.primaryLight, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  calorieHeroValue: { color: colors.textMain, fontSize: 46, lineHeight: 50, fontWeight: "900", marginTop: 3 },
  calorieHeroMeta: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "800", marginTop: 2 },
  calorieRingText: { color: colors.textMain, fontSize: 16, fontWeight: "900" },
  addMealButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  addMealButtonText: { color: "#102108", fontSize: 14, fontWeight: "900" },
  questRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 52 },
  questIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  questTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: 5 },
  questLabel: { color: colors.textMain, fontSize: 12.5, fontWeight: "800", flex: 1 },
  questValue: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
  questTrack: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.11)" },
  questFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primaryLight },
  questReward: { minWidth: 70, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.10)" },
  questRewardDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  questRewardText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  questRewardTextDone: { color: "#102108" },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
  metricCard: { flex: 1, minHeight: 142, padding: spacing.sm, borderRadius: radius.md },
  metricTop: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 24 },
  metricIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.10)" },
  metricLabel: { color: colors.textSecondary, fontSize: 10.5, fontWeight: "900", flexShrink: 1 },
  metricValue: { color: colors.textMain, fontSize: 20, lineHeight: 24, fontWeight: "900", marginTop: spacing.sm },
  metricUnit: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800", marginTop: 1 },
  metricTrack: { height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)", marginTop: spacing.sm },
  metricFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primaryLight },
  metricAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 6, paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: "rgba(182,255,63,0.10)", marginTop: "auto", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  metricActionText: { color: colors.primaryLight, fontSize: 9.5, fontWeight: "900" },
  bigNumber: { fontSize: 44, fontWeight: "800", color: "#FFFFFF", letterSpacing: -1.2 },
  overTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(248,113,113,0.18)", borderWidth: 1, borderColor: "rgba(248,113,113,0.4)",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, marginTop: spacing.md,
  },
  burnedGrid: { gap: spacing.sm },
  burnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  burnIcon: { width: 30, height: 30, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center" },
  addStepsBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full,
  },
  activityActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncStepsBtn: { backgroundColor: "rgba(53,214,232,0.13)", borderColor: "rgba(53,214,232,0.34)" },
  syncMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSheet, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalHandle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#FFFFFF" },
  stepInput: {
    marginTop: spacing.md, padding: spacing.md, fontSize: 22, fontWeight: "600",
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full,
    backgroundColor: "rgba(74,222,128,0.15)", borderWidth: 1, borderColor: "rgba(74,222,128,0.3)",
  },
  weekDaysRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 80 },
  weekBarTrack: { width: 18, height: 60, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  weekBarFill: { width: "100%", borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
});
