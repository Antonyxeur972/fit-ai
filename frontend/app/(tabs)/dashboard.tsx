import { ReactNode, useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal, ImageBackground, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ProgressRing, MacroBar, SectionTitle, Stat, Button } from "@/src/components/UI";
import { ShareCardModal } from "@/src/components/ShareCardModal";
import { Mascot } from "@/src/components/Mascot";
import { StrengthSymbol } from "@/src/components/StrengthSymbol";
import { quoteForToday } from "@/src/lib/motivation";
import { colors, spacing, typography, radius } from "@/src/theme";

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

function GlassCard({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <BlurView intensity={18} tint="dark" style={[glassStyles.card, style]} testID={testID}>
      {children}
    </BlurView>
  );
}
const glassStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(100,255,100,0.15)",
    padding: 16,
  }
});

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weekMacros, setWeekMacros] = useState<WeekMacros | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [stepsInput, setStepsInput] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);
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

  const load = useCallback(async () => {
    try {
      const [d, wm, ps] = await Promise.all([
        api<DashboardData>("/dashboard/day"),
        api<WeekMacros>("/dashboard/week-macros").catch(() => null),
        api<any>("/points/summary").catch(() => null),
      ]);
      setData(d);
      setWeekMacros(wm);
      setPoints(ps);
    } catch (e) {
      console.warn("dashboard load", e);
    }
  }, []);

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

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <ImageBackground source={{ uri: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=90" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={["rgba(0,15,0,0.55)", "rgba(0,20,0,0.25)", "rgba(0,15,0,0.5)", "rgba(0,10,0,0.97)"]} locations={[0, 0.25, 0.60, 0.88]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]}>
          <Text style={[typography.body, { padding: spacing.lg, color: "#fff" }]}>Chargement...</Text>
        </SafeAreaView>
      </View>
    );
  }

  const progress = data.target_calories > 0 ? data.consumed_calories / data.target_calories : 0;
  const over = data.consumed_calories > data.target_calories;
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <View style={{ flex: 1 }} testID="dashboard-screen">
      <ImageBackground source={{ uri: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=90" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={["rgba(0,15,0,0.55)", "rgba(0,20,0,0.25)", "rgba(0,15,0,0.5)", "rgba(0,10,0,0.97)"]} locations={[0, 0.25, 0.60, 0.88]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ade80" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[typography.caption, { color: "rgba(255,255,255,0.6)" }]}>{today}</Text>
              <Text style={styles.hello}>Salut {user?.name?.split(" ")[0]}</Text>
            </View>
            {user?.mascot?.animal ? (
              <Mascot
                animal={user.mascot.animal}
                evolution={(points?.evolution || 1) as 1 | 2 | 3}
                size={48}
                color="#4ade80"
              />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="leaf" size={20} color="#4ade80" />
              </View>
            )}
          </View>

          {/* Phase 5: Quote + Strength + Share */}
          <GlassCard style={styles.heroCard} testID="dashboard-hero-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <StrengthSymbol
                size={62}
                evolution={(points?.evolution || 1) as 1 | 2 | 3}
                strength={points && points.level_span > 0 ? Math.min(1, points.points_in_level / points.level_span) : 0.3}
              />
              <View style={{ flex: 1 }}>
                <Text style={[typography.caption, { color: "#4ade80", letterSpacing: 1.2, fontWeight: "800" }]}>
                  {points?.streak_days && points.streak_days > 1 ? `STREAK · ${points.streak_days}J` : "FORCE"}
                </Text>
                <Text style={[typography.body, { fontWeight: "600", marginTop: 2, color: "#fff", lineHeight: 20 }]}>
                  {quoteForToday(data.workout?.completed ? "post_workout" : "pre_workout")}
                </Text>
                {points && points.points_today > 0 ? (
                  <Text style={[typography.small, { marginTop: 4, color: "#4ade80", fontWeight: "800" }]}>
                    +{points.points_today} pts aujourd&apos;hui
                  </Text>
                ) : null}
              </View>
            </View>
            <Button
              title="Partager ma performance"
              variant="primary"
              onPress={() => setShareOpen(true)}
              icon={<Ionicons name="share-social-outline" size={16} color="#fff" />}
              testID="dashboard-share-button"
              style={{ marginTop: spacing.md }}
            />
          </GlassCard>

          {/* Calorie ring */}
          <GlassCard style={{ alignItems: "center", paddingVertical: spacing.xl }} testID="dashboard-calorie-card">
            <ProgressRing progress={progress} size={200} stroke={16} color={over ? colors.alert : "#4ade80"}>
              <Text style={[typography.caption, { color: "rgba(255,255,255,0.6)" }]}>Restant</Text>
              <Text style={styles.bigNumber}>{Math.max(0, data.remaining_calories)}</Text>
              <Text style={[typography.small, { color: "rgba(255,255,255,0.6)" }]}>
                {data.consumed_calories} / {data.target_calories} kcal
              </Text>
            </ProgressRing>
            {over && (
              <View style={styles.overTag}>
                <Ionicons name="alert-circle" size={14} color={colors.alert} />
                <Text style={[typography.small, { color: colors.alert, fontWeight: "600" }]}>
                  Tu as dépassé ton objectif de {data.consumed_calories - data.target_calories} kcal
                </Text>
              </View>
            )}
          </GlassCard>

          {/* Macros */}
          <GlassCard testID="dashboard-macros-card">
            <SectionTitle title="MACROS AUJOURD'HUI" />
            <MacroBar
              label="Protéines"
              current={data.macros.protein_g}
              target={data.macros.protein_target}
              color="#4ade80"
              testID="macro-protein"
            />
            <MacroBar
              label="Glucides"
              current={data.macros.carbs_g}
              target={data.macros.carbs_target}
              color={colors.primaryLight}
              testID="macro-carbs"
            />
            <MacroBar
              label="Lipides"
              current={data.macros.fat_g}
              target={data.macros.fat_target}
              color="#86C99A"
              testID="macro-fat"
            />
          </GlassCard>

          {/* Weekly macros recap */}
          {weekMacros && weekMacros.tracked_days > 0 && (
            <GlassCard testID="dashboard-week-macros-card">
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
                            backgroundColor: d.calories === 0 ? "rgba(255,255,255,0.1)" : ratio > 1.05 ? colors.alert : isToday ? "#4ade80" : colors.primaryLight,
                          },
                        ]} />
                      </View>
                      <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: isToday ? "#4ade80" : "rgba(255,255,255,0.4)", fontWeight: isToday ? "700" : "500" }]}>
                        {dayLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          )}

          {/* Energy balance */}
          <GlassCard testID="dashboard-burned-card">
            <SectionTitle title="Dépense énergétique" />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md }}>
              <Stat label="Brûlées" value={data.burned.total.toLocaleString("fr-FR")} unit="kcal" />
              <Stat
                label="Balance"
                value={(data.balance >= 0 ? "+" : "") + data.balance}
                unit="kcal"
                align="center"
                valueStyle={{ color: data.balance < 0 ? "#4ade80" : colors.alert }}
              />
            </View>
            <View style={styles.burnedGrid}>
              <BurnRow icon="flame-outline" label="Métabolisme" value={data.burned.bmr} />
              <BurnRow icon="walk-outline" label="Pas" value={data.burned.steps} />
              <BurnRow icon="heart-outline" label="Cardio" value={data.burned.cardio} />
              <BurnRow icon="barbell-outline" label="Entraînement" value={data.burned.workout} />
            </View>
          </GlassCard>

          {/* Today's workout */}
          <GlassCard testID="dashboard-workout-card">
            <SectionTitle title="Séance du jour" />
            {data.workout && data.workout.title ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push("/(tabs)/training")}
                style={styles.workoutRow}
              >
                <LinearGradient
                  colors={["#2D7C3E", "#4ADE80"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.workoutBadge}
                >
                  <Ionicons name="barbell" size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutTitle}>
                    {data.workout.title} · {data.workout.focus}
                  </Text>
                  <Text style={[typography.small, { color: "rgba(255,255,255,0.6)" }]}>{data.workout.duration_min} min · {data.workout.completed ? "Terminée" : "À faire"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => router.push("/(tabs)/training")} style={{ marginTop: spacing.sm }}>
                <Text style={[typography.body, { color: "#4ade80", fontWeight: "600" }]}>
                  Génère ton programme →
                </Text>
              </TouchableOpacity>
            )}
          </GlassCard>

          {/* Activity quick */}
          <GlassCard testID="dashboard-activity-card">
            <SectionTitle title="Activité" action={
              <TouchableOpacity onPress={() => setStepsModal(true)} testID="dashboard-add-steps">
                <View style={styles.addStepsBtn}>
                  <Ionicons name="add" size={16} color="#4ade80" />
                  <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>Pas</Text>
                </View>
              </TouchableOpacity>
            } />
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <View style={styles.activityStatItem}>
                <Ionicons name="footsteps-outline" size={20} color="#4ade80" />
                <Text style={styles.activityStatValue} testID="activity-steps">{data.activity.steps.toLocaleString("fr-FR")}</Text>
                <Text style={styles.activityStatLabel}>Pas</Text>
              </View>
              <View style={styles.activityStatItem}>
                <Ionicons name="heart-outline" size={20} color="#4ade80" />
                <Text style={styles.activityStatValue} testID="activity-cardio">{data.activity.cardio_minutes}</Text>
                <Text style={styles.activityStatLabel}>Cardio</Text>
              </View>
              <View style={styles.activityStatItem}>
                <Ionicons name="restaurant-outline" size={20} color="#4ade80" />
                <Text style={styles.activityStatValue} testID="activity-meals">{data.meals_count}</Text>
                <Text style={styles.activityStatLabel}>Repas</Text>
              </View>
            </View>
          </GlassCard>

          <View style={{ height: spacing.xl }} />
        </ScrollView>

        <Modal visible={stepsModal} transparent animationType="slide" onRequestClose={() => setStepsModal(false)}>
          <View style={styles.modalBg}>
            <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Ajouter des pas</Text>
              <Text style={[typography.small, { marginTop: 4, color: "rgba(255,255,255,0.6)" }]}>Total actuel : {data.activity.steps.toLocaleString("fr-FR")} pas</Text>
              <TextInput
                value={stepsInput}
                onChangeText={(t) => setStepsInput(t.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                placeholder="ex: 3500"
                placeholderTextColor="rgba(255,255,255,0.4)"
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
                    <Text style={[typography.small, { color: "#4ade80", fontWeight: "600" }]}>+{n.toLocaleString("fr-FR")}</Text>
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

        {/* Phase 5: ShareCardModal */}
        <ShareCardModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          data={{
            focus: data.workout?.focus
              ? `${data.workout.focus}${data.workout.completed ? "" : " · à faire"}`
              : "Training du jour",
            duration_min: data.workout?.duration_min,
            mascot: user?.mascot ? { animal: user.mascot.animal, evolution: (points?.evolution || 1) as 1 | 2 | 3 } : null,
            strength_evolution: (points?.evolution || 1) as 1 | 2 | 3,
            strength_value: points && points.level_span > 0 ? Math.min(1, points.points_in_level / points.level_span) : 0.3,
            points_today: points?.points_today || 0,
          }}
        />
      </SafeAreaView>
    </View>
  );
}

function BurnRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.burnRow}>
      <View style={styles.burnIcon}>
        <Ionicons name={icon} size={16} color="#4ade80" />
      </View>
      <Text style={[typography.body, { flex: 1, color: "#fff" }]}>{label}</Text>
      <Text style={[typography.body, { fontWeight: "600", color: "#fff" }]}>{value.toLocaleString("fr-FR")} <Text style={[typography.small, { color: "rgba(255,255,255,0.6)" }]}>kcal</Text></Text>
    </View>
  );
}

function WeekMacroStat({ label, value, target, unit }: { label: string; value: number; target: number; unit?: string }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const onTrack = pct >= 90 && pct <= 110;
  const color = onTrack ? "#4ade80" : pct < 90 ? "rgba(255,255,255,0.6)" : colors.alert;
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[typography.small, { fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: "600" }]}>{label}</Text>
      <Text style={[typography.body, { fontWeight: "700", marginTop: 2, color: "#fff" }]}>
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  heroCard: { gap: 0 },
  hello: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: -0.4, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center",
  },
  bigNumber: { fontSize: 44, fontWeight: "800", color: "#fff", letterSpacing: -1.2 },
  overTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, marginTop: spacing.md,
  },
  burnedGrid: { gap: spacing.sm },
  burnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  burnIcon: { width: 30, height: 30, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center" },
  workoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  workoutBadge: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  workoutTitle: { fontSize: 15, fontWeight: "600", color: "#fff" },
  addStepsBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(74,222,128,0.15)", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.full,
  },
  activityStatItem: {
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  activityStatValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  activityStatLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "rgba(0,20,0,0.95)", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#fff" },
  stepInput: {
    marginTop: spacing.md, padding: spacing.md, fontSize: 22, fontWeight: "600",
    borderWidth: 1, borderColor: "rgba(100,255,100,0.2)", borderRadius: radius.md, color: "#fff",
    backgroundColor: "rgba(0,25,0,0.5)",
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full,
    backgroundColor: "rgba(74,222,128,0.12)", borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
  },
  weekDaysRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 80 },
  weekBarTrack: { width: 18, height: 60, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  weekBarFill: { width: "100%", borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
});
