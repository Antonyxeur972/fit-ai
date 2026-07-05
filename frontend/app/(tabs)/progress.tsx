import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Dimensions, Animated, PanResponder, Platform } from "react-native";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { MotivationalScript } from "@/src/components/MotivationalScript";
import { HydrationCard } from "@/src/components/HydrationCard";
import { SleepCard, readSleepHoursForDate } from "@/src/components/SleepCard";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Button, SectionTitle, WeekBars, LineChart1RM } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Transfo = {
  id: string;
  date: string;
  image_base64: string;
  weight_kg?: number;
  view?: string;
  created_at: string;
};

type Week = {
  days: { date: string; consumed: number; target: number; steps: number; cardio_minutes: number }[];
  avg_consumed: number;
  target: number;
};

type Perf = {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  est_1rm: number;
  created_at: string;
};

type PerfPayload = { items: Perf[]; personal_bests: Perf[] };
type Workout = {
  id: string;
  date: string;
  title: string;
  focus: string;
  duration_min: number;
  completed: boolean;
};

type HistoryWeek = { label: string; sessions: number; duration: number; time: number; sleepAvg: number; sleepLow: boolean };
type MuscleVolumeItem = {
  muscle: string;
  week_total: number;
  total: number;
  series: { week: string; volume: number }[];
  top_exercises: { name: string; volume: number }[];
};
type MuscleVolumePayload = { weeks: string[]; items: MuscleVolumeItem[] };
type Profile = { weight_kg?: number; goal?: string };

export default function Progress() {
  const [transfos, setTransfos] = useState<Transfo[]>([]);
  const [week, setWeek] = useState<Week | null>(null);
  const [perf, setPerf] = useState<PerfPayload>({ items: [], personal_bests: [] });
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [history, setHistory] = useState<Workout[]>([]);
  const [muscleVolume, setMuscleVolume] = useState<MuscleVolumePayload | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [sleepByDate, setSleepByDate] = useState<Record<string, number>>({});
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Phase 5: date picker for the photo
  const [uploadDate, setUploadDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, w, p, wk, hist, mv, pr] = await Promise.all([
        api<Transfo[]>("/transformations"),
        api<Week>("/dashboard/week"),
        api<PerfPayload>("/perf/recent?limit=200"),
        api<Workout[]>("/workouts/week").catch(() => []),
        api<Workout[]>("/workouts/history?limit=40").catch(() => []),
        api<MuscleVolumePayload>("/perf/muscle-volume?weeks=8").catch(() => null),
        api<Profile>("/profile").catch(() => ({})),
      ]);
      setTransfos(list);
      setWeek(w);
      setPerf(p);
      setWorkouts(wk || []);
      setHistory(hist || []);
      setMuscleVolume(mv);
      setProfile(pr || {});
      if (!selectedExercise && p.personal_bests.length > 0) {
        const counts: Record<string, number> = {};
        p.items.forEach((it) => { counts[it.exercise_name] = (counts[it.exercise_name] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top) setSelectedExercise(top);
      }
    } catch (e) {
      console.warn("progress load", e);
    }
  }, [selectedExercise]);

  const loadSleepHistory = useCallback(async () => {
    const today = new Date();
    const entries: [string, number][] = [];
    for (let offset = 0; offset < 84; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const iso = date.toISOString().slice(0, 10);
      entries.push([iso, await readSleepHoursForDate(date)]);
    }
    setSleepByDate(Object.fromEntries(entries));
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    loadSleepHistory();
  }, [load, loadSleepHistory]));

  const upload = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploading(true);
    try {
      // Format date YYYY-MM-DD in local TZ
      const yyyy = uploadDate.getFullYear();
      const mm = String(uploadDate.getMonth() + 1).padStart(2, "0");
      const dd = String(uploadDate.getDate()).padStart(2, "0");
      const taken_at = `${yyyy}-${mm}-${dd}`;
      await api("/transformations", {
        method: "POST",
        body: { image_base64: result.assets[0].base64, mime: "image/jpeg", taken_at },
      });
      await load();
    } catch (e) {
      console.warn(e);
    } finally {
      setUploading(false);
    }
  };

  const totalWeekSteps = week?.days.reduce((s, d) => s + d.steps, 0) || 0;
  const totalCardioMin = week?.days.reduce((s, d) => s + d.cardio_minutes, 0) || 0;
  const totalConsumed = week?.days.reduce((s, d) => s + d.consumed, 0) || 0;
  const burnedEstimate = Math.round(totalWeekSteps * 0.04 + totalCardioMin * 7 + workouts.filter((w) => w.completed).length * 260);
  const historyWeeks = buildHistoryWeeks(history, sleepByDate);
  const weekSleepValues = (week?.days || []).map((day) => sleepByDate[day.date] || 0).filter((hours) => hours > 0);
  const avgWeekSleep = weekSleepValues.length
    ? weekSleepValues.reduce((sum, hours) => sum + hours, 0) / weekSleepValues.length
    : 0;
  const lowWeekSleep = avgWeekSleep > 0 && avgWeekSleep < 6.5;

  // 1RM chart data for the selected exercise (chronological order)
  const chartData = useMemo(() => {
    if (!selectedExercise) return [];
    return perf.items
      .filter((p) => p.exercise_name === selectedExercise)
      .map((p) => ({ x: new Date(p.created_at).getTime(), y: p.est_1rm }))
      .sort((a, b) => a.x - b.x);
  }, [perf.items, selectedExercise]);

  const selectedBest = useMemo(() => {
    if (!selectedExercise) return null;
    return perf.personal_bests.find((p) => p.exercise_name === selectedExercise) || null;
  }, [perf.personal_bests, selectedExercise]);

  const trend = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].y;
    const last = chartData[chartData.length - 1].y;
    const delta = last - first;
    const pct = first > 0 ? (delta / first) * 100 : 0;
    return { delta, pct };
  }, [chartData]);

  const exerciseList = perf.personal_bests
    .slice()
    .sort((a, b) => b.est_1rm - a.est_1rm);

  return (
    <ScreenBackground bg="progress">
      <View style={styles.header}>
        <View>
          <Text style={styles.heroEyebrow}>Suivi</Text>
          <Text style={styles.title}>Ta semaine</Text>
          <Text style={styles.heroSubtitle}>séances, énergie, progrès</Text>
          <MotivationalScript style={styles.heroScript}>chaque effort laisse une trace.</MotivationalScript>
        </View>
        <View style={styles.heroStats}>
          <HeroMetric value={`${trend && trend.pct >= 0 ? "+" : ""}${Math.round(trend?.pct || 0)}%`} label="Force" />
          <HeroMetric value={`${totalCardioMin}`} label="min cardio" />
          <HeroMetric value={totalWeekSteps.toLocaleString("fr-FR")} label="pas" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.wellnessCompactRow}>
          <View style={styles.wellnessCompactItem}>
            <HydrationCard compact />
          </View>
          <View style={styles.wellnessCompactItem}>
            <SleepCard compact />
          </View>
        </View>

        <WeeklyFollowRecap
          steps={totalWeekSteps}
          consumed={totalConsumed}
          burned={burnedEstimate}
          sleepAvg={avgWeekSleep}
          sleepLow={lowWeekSleep}
        />

        <BodyCompositionCard profile={profile} transfos={transfos} />

        <PerformanceExplorerCard
          muscleVolume={muscleVolume}
          perf={perf}
          selectedExercise={selectedExercise}
          setSelectedExercise={setSelectedExercise}
          chartData={chartData}
          selectedBest={selectedBest}
          trend={trend}
          exerciseList={exerciseList}
        />

        <HistoryWeeksCard weeks={historyWeeks} />

        {/* Week chart */}
        <Card testID="week-card">
          <SectionTitle title="Calories cette semaine" />
          {week && <WeekBars days={week.days} target={week.target} testID="week-bars" />}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View>
              <Text style={typography.caption}>Moyenne</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{(week?.avg_consumed || 0).toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
            </View>
            <View>
              <Text style={typography.caption}>Objectif</Text>
              <Text style={[typography.h3, { marginTop: 4, color: colors.primary }]}>{(week?.target || 0).toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
            </View>
          </View>
        </Card>

        {/* Private photo gallery */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
          <SectionTitle title="Galerie privée" />
          <View style={styles.privacyChip}>
            <Ionicons name="lock-closed" size={10} color={colors.primary} />
            <Text style={[typography.small, { color: colors.primary, fontWeight: "700", fontSize: 10 }]}>Privé · sans IA</Text>
          </View>
        </View>

        {/* Phase 5: Date picker (taken-at) */}
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.dateRow}
          testID="transfo-date-pick"
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={[typography.body, { color: colors.textMain, fontWeight: "600" }]}>
            {uploadDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
          <Text style={[typography.small, { marginLeft: "auto", color: colors.primary, fontWeight: "700" }]}>Modifier</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={uploadDate}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, selected) => {
              if (Platform.OS !== "ios") setShowDatePicker(false);
              if (event.type === "dismissed") return;
              if (selected) setUploadDate(selected);
            }}
          />
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            title="Caméra"
            onPress={() => upload(true)}
            loading={uploading}
            icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
            testID="transformation-camera"
            style={{ flex: 1 }}
          />
          <Button
            title="Galerie"
            onPress={() => upload(false)}
            variant="secondary"
            icon={<Ionicons name="images-outline" size={18} color={colors.primary} />}
            testID="transformation-library"
            style={{ flex: 1 }}
          />
        </View>

        {uploading && (
          <View style={[styles.uploadingRow]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={typography.small}>Envoi en cours...</Text>
          </View>
        )}

        {transfos.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", padding: spacing.lg }}>
              <View style={styles.emptyIcon}>
                <Ionicons name="image-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.md }]}>
                Documente ta progression
              </Text>
              <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>
                {"Toutes les 2-4 semaines, ajoute une photo. Galerie 100 % privée, sans IA."}
              </Text>
            </View>
          </Card>
        ) : (
          <PhotoGallery
            transfos={transfos}
            onDelete={async (id) => {
              try {
                await api(`/transformations/${id}`, { method: "DELETE" });
                await load();
              } catch (e) {
                console.warn("delete transfo", e);
              }
            }}
          />
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function WeeklyFollowRecap({
  steps,
  consumed,
  burned,
  sleepAvg,
  sleepLow,
}: {
  steps: number;
  consumed: number;
  burned: number;
  sleepAvg: number;
  sleepLow: boolean;
}) {
  return (
    <Card testID="weekly-follow-recap" style={{ gap: spacing.md }}>
      <SectionTitle title="Récapitulatif de la semaine" />
      <View style={styles.recapGrid}>
        <RecapStat icon="footsteps" label="Pas" value={steps.toLocaleString("fr-FR")} />
        <RecapStat icon="restaurant-outline" label="Calories consommées" value={`${consumed.toLocaleString("fr-FR")} kcal`} />
        <RecapStat icon="flame-outline" label="Calories brûlées" value={`${burned.toLocaleString("fr-FR")} kcal`} />
        <RecapStat icon="moon-outline" label="Sommeil moyen" value={sleepAvg > 0 ? `${sleepAvg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h` : "À saisir"} warning={sleepLow} />
      </View>
      {sleepLow ? (
        <View style={styles.sleepWarningBox} testID="weekly-sleep-warning">
          <Ionicons name="warning-outline" size={15} color={colors.amber} />
          <Text style={styles.sleepWarningText}>Attention, ton sommeil moyen est faible cette semaine.</Text>
        </View>
      ) : null}
    </Card>
  );
}

function BodyCompositionCard({ profile, transfos }: { profile: Profile; transfos: Transfo[] }) {
  const weights = transfos
    .filter((item) => typeof item.weight_kg === "number")
    .map((item) => ({
      date: item.date || item.created_at,
      weight: Number(item.weight_kg),
      time: new Date(item.date || item.created_at).getTime(),
    }))
    .sort((a, b) => a.time - b.time);
  const currentWeight = Number(profile.weight_kg || weights[weights.length - 1]?.weight || 0);
  const startWeight = weights[0]?.weight || currentWeight;
  const delta = currentWeight && startWeight ? currentWeight - startWeight : 0;
  const fatLost = Math.max(0, profile.goal === "lose" ? -delta : Math.min(2.5, Math.max(0, -delta * 0.75)));
  const muscleGain = Math.max(0, profile.goal === "gain" ? delta : Math.min(2.5, Math.max(0, delta * 0.55)));
  const displayWeights = weights.length
    ? weights.slice(-8)
    : currentWeight
      ? [{ date: new Date().toISOString(), weight: currentWeight, time: Date.now() }]
      : [];
  const min = Math.min(...displayWeights.map((p) => p.weight), currentWeight || 999);
  const max = Math.max(...displayWeights.map((p) => p.weight), currentWeight || 0);
  const span = Math.max(1, max - min);

  return (
    <Card testID="body-composition-card" style={{ gap: spacing.md }}>
      <SectionTitle title="Résultats physiques" />
      <View style={styles.bodyMetricGrid}>
        <View style={styles.bodyMetric}>
          <Ionicons name="flame-outline" size={17} color={colors.primaryLight} />
          <Text style={styles.bodyMetricValue}>{fatLost.toFixed(1)} kg</Text>
          <Text style={styles.bodyMetricLabel}>graisse perdue</Text>
        </View>
        <View style={styles.bodyMetric}>
          <Ionicons name="barbell-outline" size={17} color={colors.primaryLight} />
          <Text style={styles.bodyMetricValue}>{muscleGain.toFixed(1)} kg</Text>
          <Text style={styles.bodyMetricLabel}>muscle gagné</Text>
        </View>
      </View>
      <View style={styles.weightCurveBox}>
        <View style={styles.weightCurveTop}>
          <Text style={styles.weightCurveTitle}>Suivi du poids</Text>
          <Text style={styles.weightCurveValue}>{currentWeight ? `${currentWeight.toFixed(1)} kg` : "À saisir"}</Text>
        </View>
        <View style={styles.weightBars}>
          {displayWeights.map((point, index) => (
            <View key={`${point.date}-${index}`} style={styles.weightBarCol}>
              <View style={styles.weightBarTrack}>
                <View style={[styles.weightBarFill, { height: `${Math.max(10, ((point.weight - min) / span) * 80 + 12)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

function PerformanceExplorerCard({
  muscleVolume,
  perf,
  selectedExercise,
  setSelectedExercise,
  chartData,
  selectedBest,
  trend,
  exerciseList,
}: {
  muscleVolume: MuscleVolumePayload | null;
  perf: PerfPayload;
  selectedExercise: string | null;
  setSelectedExercise: (exercise: string) => void;
  chartData: { x: number; y: number }[];
  selectedBest: Perf | null;
  trend: { delta: number; pct: number } | null;
  exerciseList: Perf[];
}) {
  const [mode, setMode] = useState<"muscle" | "exercise">("muscle");
  return (
    <Card testID="performance-explorer-card" style={{ gap: spacing.md }}>
      <View style={styles.performanceHeader}>
        <SectionTitle title="Courbes de progression" />
        <View style={styles.performanceSwitch}>
          <TouchableOpacity onPress={() => setMode("muscle")} style={[styles.performanceSwitchBtn, mode === "muscle" && styles.performanceSwitchOn]}>
            <Text style={[styles.performanceSwitchText, mode === "muscle" && styles.performanceSwitchTextOn]}>Muscle</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode("exercise")} style={[styles.performanceSwitchBtn, mode === "exercise" && styles.performanceSwitchOn]}>
            <Text style={[styles.performanceSwitchText, mode === "exercise" && styles.performanceSwitchTextOn]}>Exercice</Text>
          </TouchableOpacity>
        </View>
      </View>
      {mode === "muscle" ? (
        <MuscleVolumeCard payload={muscleVolume} embedded />
      ) : (
        <ExerciseProgressPanel
          perf={perf}
          selectedExercise={selectedExercise}
          setSelectedExercise={setSelectedExercise}
          chartData={chartData}
          selectedBest={selectedBest}
          trend={trend}
          exerciseList={exerciseList}
        />
      )}
    </Card>
  );
}

function ExerciseProgressPanel({
  selectedExercise,
  setSelectedExercise,
  chartData,
  selectedBest,
  trend,
  exerciseList,
}: {
  perf: PerfPayload;
  selectedExercise: string | null;
  setSelectedExercise: (exercise: string) => void;
  chartData: { x: number; y: number }[];
  selectedBest: Perf | null;
  trend: { delta: number; pct: number } | null;
  exerciseList: Perf[];
}) {
  if (exerciseList.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
        <View style={styles.emptyIcon}>
          <Ionicons name="trending-up" size={28} color={colors.primary} />
        </View>
        <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.md }]}>Aucune perf enregistrée</Text>
        <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>
          Enregistre charge et reps pendant une séance pour voir tes courbes.
        </Text>
      </View>
    );
  }

  return (
    <View testID="rm-card">
      {selectedExercise && (
        <View style={{ marginBottom: spacing.sm }}>
          <Text style={[typography.h2, { lineHeight: 32 }]}>
            {selectedBest?.est_1rm.toFixed(1)} <Text style={[typography.small, { fontSize: 14 }]}>kg</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Text style={[typography.small, { color: colors.textSecondary }]}>Record · {selectedExercise}</Text>
            {trend ? (
              <View style={[styles.trendChip, { backgroundColor: trend.delta >= 0 ? "#DCFCE7" : "#FEE2E2" }]}>
                <Ionicons name={trend.delta >= 0 ? "trending-up" : "trending-down"} size={12} color={trend.delta >= 0 ? colors.primary : colors.alert} />
                <Text style={[typography.small, { fontWeight: "700", color: trend.delta >= 0 ? colors.primary : colors.alert }]}>
                  {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(1)} kg · {trend.pct >= 0 ? "+" : ""}{trend.pct.toFixed(0)}%
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
      <View style={{ alignItems: "center" }}>
        {chartData.length >= 2 ? (
          <LineChart1RM data={chartData} width={320} height={160} testID="rm-chart" />
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={[typography.small, { textAlign: "center" }]}>{"Enregistre une 2e perf pour voir ta courbe d'évolution."}</Text>
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 0 }} style={{ marginTop: spacing.md, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }} testID="rm-exercise-chips">
        {exerciseList.map((pb) => {
          const isOn = pb.exercise_name === selectedExercise;
          return (
            <TouchableOpacity key={pb.exercise_name} onPress={() => setSelectedExercise(pb.exercise_name)} style={[styles.exerciseChip, isOn && styles.exerciseChipOn]} testID={`rm-chip-${pb.exercise_name}`}>
              <Text style={[styles.exerciseChipText, isOn && { color: colors.primary, fontWeight: "700" }]} numberOfLines={1}>{pb.exercise_name}</Text>
              <Text style={[styles.exerciseChipKg, isOn && { color: colors.primary }]}>{pb.est_1rm.toFixed(0)} kg</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RecapStat({ icon, label, value, warning }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; warning?: boolean }) {
  return (
    <View style={[styles.recapStat, warning && styles.recapStatWarning]}>
      <Ionicons name={icon} size={16} color={warning ? colors.amber : colors.primaryLight} />
      <Text style={[styles.recapValue, warning && { color: colors.amber }]}>{value}</Text>
      <Text style={styles.recapLabel}>{label}</Text>
    </View>
  );
}

function MuscleVolumeCard({ payload, embedded = false }: { payload: MuscleVolumePayload | null; embedded?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = payload?.items || [];
  const maxVolume = Math.max(1, ...items.flatMap((item) => item.series.map((point) => point.volume)));
  const Container = embedded ? View : Card;

  return (
    <Container testID="muscle-volume-card" style={{ gap: spacing.md }}>
      <View style={styles.muscleHeader}>
        <SectionTitle title="Kg soulevés par muscle" />
        <View style={styles.muscleWeekChip}>
          <Ionicons name="barbell-outline" size={13} color={colors.primaryLight} />
          <Text style={styles.muscleWeekText}>Semaine</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <Text style={typography.small}>
          Termine une séance avec charges et répétitions pour afficher tes volumes par groupe musculaire.
        </Text>
      ) : (
        items.map((item) => {
          const isOpen = expanded === item.muscle;
          const progress = Math.min(1, item.week_total / Math.max(1, Math.max(...items.map((muscle) => muscle.week_total))));
          return (
            <View key={item.muscle} style={styles.muscleBlock}>
              <TouchableOpacity
                onPress={() => setExpanded(isOpen ? null : item.muscle)}
                style={styles.muscleRow}
                testID={`muscle-volume-${item.muscle}`}
              >
                <View style={styles.muscleIcon}>
                  <Ionicons name={muscleIconFor(item.muscle)} size={18} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.muscleTitleRow}>
                    <Text style={styles.muscleTitle}>{item.muscle}</Text>
                    <Text style={styles.muscleKg}>{Math.round(item.week_total).toLocaleString("fr-FR")} kg</Text>
                  </View>
                  <View style={styles.muscleTrack}>
                    <View style={[styles.muscleFill, { width: `${Math.max(6, progress * 100)}%` }]} />
                  </View>
                </View>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={17} color={colors.textMuted} />
              </TouchableOpacity>
              {isOpen ? (
                <View style={styles.muscleDetail}>
                  <View style={styles.muscleBars}>
                    {item.series.map((point) => (
                      <View key={point.week} style={styles.muscleBarCol}>
                        <View style={styles.muscleBar}>
                          <View style={[styles.muscleBarFill, { height: `${Math.max(5, (point.volume / maxVolume) * 100)}%` }]} />
                        </View>
                        <Text style={styles.muscleBarLabel}>{point.week.slice(5).replace("-", "/")}</Text>
                      </View>
                    ))}
                  </View>
                  {item.top_exercises.length > 0 ? (
                    <View style={styles.muscleTopList}>
                      {item.top_exercises.slice(0, 3).map((exercise) => (
                        <View key={exercise.name} style={styles.muscleTopExercise}>
                          <Text style={styles.muscleTopName} numberOfLines={1}>{exercise.name}</Text>
                          <Text style={styles.muscleTopKg}>{Math.round(exercise.volume).toLocaleString("fr-FR")} kg</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </Container>
  );
}

function muscleIconFor(muscle: string): keyof typeof Ionicons.glyphMap {
  const key = muscle.toLowerCase();
  if (key.includes("jamb") || key.includes("fess")) return "walk-outline";
  if (key.includes("dos")) return "body-outline";
  if (key.includes("pector")) return "barbell-outline";
  if (key.includes("bras") || key.includes("épaule") || key.includes("epaule")) return "fitness-outline";
  if (key.includes("core")) return "ellipse-outline";
  return "barbell-outline";
}

function HistoryWeeksCard({ weeks }: { weeks: HistoryWeek[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleWeeks = expanded ? weeks : weeks.slice(0, 3);
  return (
    <Card testID="history-weeks-card" style={{ gap: spacing.md }}>
      <SectionTitle title="Historique" />
      {weeks.length === 0 ? (
        <Text style={typography.small}>Les semaines précédentes apparaîtront après tes premières séances terminées.</Text>
      ) : (
        <>
          {visibleWeeks.map((week) => (
            <View key={week.label} style={styles.historyWeekRow}>
              <View style={styles.historyWeekIcon}>
                <Ionicons name="calendar-outline" size={15} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyWeekTitle}>{week.label}</Text>
                <Text style={styles.historyWeekText}>
                  {week.sessions} séance{week.sessions > 1 ? "s" : ""} · {week.duration} min
                  {week.sleepAvg > 0 ? ` · sommeil ${week.sleepAvg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h` : ""}
                </Text>
                {week.sleepLow ? (
                  <View style={styles.historySleepWarning}>
                    <Ionicons name="warning-outline" size={12} color={colors.amber} />
                    <Text style={styles.historySleepWarningText}>Sommeil faible</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          ))}
          {weeks.length > 3 ? (
            <TouchableOpacity onPress={() => setExpanded((value) => !value)} style={styles.historyMoreButton} testID="history-see-more">
              <Text style={styles.historyMoreText}>{expanded ? "Voir moins" : "Voir plus"}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.primaryLight} />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </Card>
  );
}

function buildHistoryWeeks(items: Workout[], sleepByDate: Record<string, number>) {
  const groups = new Map<string, HistoryWeek & { key: string }>();
  items.forEach((item) => {
    const d = new Date(item.date);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const label = `Semaine du ${monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
    const current = groups.get(key) || { key, label, sessions: 0, duration: 0, time: monday.getTime(), sleepAvg: 0, sleepLow: false };
    current.sessions += item.completed ? 1 : 0;
    current.duration += item.completed ? item.duration_min || 0 : 0;
    groups.set(key, current);
  });
  return Array.from(groups.values())
    .map((item) => {
      const monday = new Date(item.key);
      const sleepValues: number[] = [];
      for (let offset = 0; offset < 7; offset += 1) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + offset);
        const hours = sleepByDate[d.toISOString().slice(0, 10)] || 0;
        if (hours > 0) sleepValues.push(hours);
      }
      const sleepAvg = sleepValues.length ? sleepValues.reduce((sum, hours) => sum + hours, 0) / sleepValues.length : 0;
      return { ...item, sleepAvg, sleepLow: sleepAvg > 0 && sleepAvg < 6.5 };
    })
    .filter((item) => item.sessions > 0)
    .sort((a, b) => b.time - a.time);
}

// ---- PhotoGallery: chronological + before/after compare ----
function PhotoGallery({
  transfos,
  onDelete,
}: {
  transfos: Transfo[];
  onDelete: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"grid" | "compare">("grid");
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const sortedAsc = useMemo(
    () => transfos.slice().sort(
      (a, b) =>
        new Date(a.date || a.created_at).getTime() -
        new Date(b.date || b.created_at).getTime(),
    ),
    [transfos]
  );

  useMemo(() => {
    if (mode === "compare" && transfos.length >= 2) {
      if (!leftId) setLeftId(sortedAsc[0].id);
      if (!rightId) setRightId(sortedAsc[sortedAsc.length - 1].id);
    }
  }, [mode, transfos.length, leftId, rightId, sortedAsc]);

  const screenW = Dimensions.get("window").width;
  const colWidth = (screenW - 16 * 2 - 16) / 2;

  const confirmDelete = (id: string) => {
    Alert.alert(
      "Supprimer la photo ?",
      "Cette action est définitive.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => onDelete(id) },
      ]
    );
  };

  const formatDate = (t: Transfo) => {
    const d = new Date(t.date || t.created_at);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.galleryModeRow}>
        {([
          { v: "grid" as const, label: "Chronologie", icon: "grid-outline" as const },
          { v: "compare" as const, label: "Avant / Après", icon: "git-compare-outline" as const },
        ]).map((m) => {
          const isOn = mode === m.v;
          return (
            <TouchableOpacity
              key={m.v}
              onPress={() => setMode(m.v)}
              style={[styles.galleryModeChip, isOn && styles.galleryModeChipOn]}
              testID={`gallery-mode-${m.v}`}
            >
              <Ionicons name={m.icon} size={14} color={isOn ? colors.primary : colors.textSecondary} />
              <Text style={[typography.small, { fontWeight: "700", color: isOn ? colors.primary : colors.textSecondary }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === "grid" && (
        <View style={styles.gridWrap}>
          {sortedAsc.slice().reverse().map((t) => (
            <View key={t.id} style={[styles.gridItem, { width: colWidth }]} testID={`gallery-grid-${t.id}`}>
              <SwipeRevealPhoto base64={t.image_base64} width={colWidth - 12} height={(colWidth - 12) * 1.45} />
              <View style={styles.gridFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.small, { fontWeight: "700", color: colors.textMain }]}>
                    {formatDate(t)}
                  </Text>
                  {t.weight_kg ? (
                    <Text style={[typography.small, { fontSize: 11 }]}>{t.weight_kg} kg</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => confirmDelete(t.id)} hitSlop={10} testID={`gallery-delete-${t.id}`}>
                  <Ionicons name="trash-outline" size={16} color={colors.alert} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {mode === "compare" && (
        <Card testID="gallery-compare">
          {transfos.length < 2 ? (
            <Text style={[typography.small, { textAlign: "center", paddingVertical: spacing.md }]}>
              Ajoute au moins 2 photos pour activer le comparatif.
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <ComparePane
                  label="Avant"
                  selectedId={leftId}
                  options={sortedAsc}
                  onPick={setLeftId}
                  width={(screenW - 32 - 16 - 16) / 2}
                />
                <ComparePane
                  label="Après"
                  selectedId={rightId}
                  options={sortedAsc}
                  onPick={setRightId}
                  width={(screenW - 32 - 16 - 16) / 2}
                />
              </View>
              <DeltaSummary
                left={sortedAsc.find((x) => x.id === leftId)}
                right={sortedAsc.find((x) => x.id === rightId)}
              />
            </>
          )}
        </Card>
      )}
    </View>
  );
}

// Swipe-to-reveal: an opaque green tile sits OVER the image. User drags horizontally to reveal.
function SwipeRevealPhoto({ base64, width, height }: { base64: string; width: number; height: number }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        // Only allow dragging right -> reveal
        const v = Math.max(0, Math.min(width, g.dx));
        translateX.setValue(v);
      },
      onPanResponderRelease: (_, g) => {
        const target = g.dx > width * 0.5 ? width : 0;
        Animated.spring(translateX, { toValue: target, useNativeDriver: true, friction: 8 }).start(() => {
          setRevealed(target === width);
        });
      },
    })
  ).current;

  const reset = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start(() => setRevealed(false));
  };

  return (
    <View style={{ width, height, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.border }}>
      <Image
        source={{ uri: `data:image/jpeg;base64,${base64}` }}
        style={{ width, height }}
        resizeMode="cover"
      />
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: colors.primary,
            transform: [{ translateX }],
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Ionicons name="lock-closed" size={28} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", marginTop: 8, fontSize: 12 }}>SWIPE</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 4 }}>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </View>
      </Animated.View>
      {revealed && (
        <TouchableOpacity onPress={reset} style={styles.hideBtn}>
          <Ionicons name="eye-off-outline" size={14} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>Masquer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ComparePane({
  label,
  selectedId,
  options,
  onPick,
  width,
}: {
  label: string;
  selectedId: string | null;
  options: Transfo[];
  onPick: (id: string) => void;
  width: number;
}) {
  const t = options.find((x) => x.id === selectedId) || options[0];
  if (!t) return null;
  const dateStr = new Date(t.date || t.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short",
  });
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={styles.compareLabelRow}>
        <Text style={[typography.small, { fontWeight: "800", color: colors.textMain }]}>{label}</Text>
        <Text style={[typography.small, { fontSize: 10, color: colors.textMuted }]}>{dateStr}</Text>
      </View>
      <SwipeRevealPhoto base64={t.image_base64} width={width} height={width * 1.4} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
        {options.map((o) => {
          const on = o.id === t.id;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => onPick(o.id)}
              style={[styles.thumb, on && styles.thumbOn]}
              testID={`compare-thumb-${o.id}`}
            >
              {/* small dot indicator only — thumb stays hidden */}
              <View style={styles.thumbHidden}>
                <Ionicons name="image-outline" size={16} color={on ? "#fff" : colors.primary} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DeltaSummary({ left, right }: { left?: Transfo; right?: Transfo }) {
  if (!left || !right) return null;
  const daysApart = Math.abs(
    Math.round(
      (new Date(right.created_at).getTime() - new Date(left.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );
  const deltaKg =
    typeof left.weight_kg === "number" && typeof right.weight_kg === "number"
      ? right.weight_kg - left.weight_kg
      : null;
  return (
    <View style={styles.deltaRow}>
      <View style={{ flex: 1 }}>
        <Text style={typography.caption}>Période</Text>
        <Text style={[typography.h3, { marginTop: 2 }]}>{daysApart} <Text style={typography.small}>jours</Text></Text>
      </View>
      {deltaKg !== null && (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={typography.caption}>Variation de poids</Text>
          <Text
            style={[
              typography.h3,
              { marginTop: 2, color: deltaKg < 0 ? colors.primary : deltaKg > 0 ? "#A85B0F" : colors.textMain },
            ]}
          >
            {deltaKg > 0 ? "+" : ""}{deltaKg.toFixed(1)} <Text style={typography.small}>kg</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={styles.heroMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.heroMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({

  header: { minHeight: 310, padding: spacing.lg, paddingBottom: spacing.xl, justifyContent: "space-between" },
  heroEyebrow: { ...typography.caption, color: "rgba(255,255,255,0.82)", fontWeight: "700" },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "900", color: colors.textMain, letterSpacing: 0, marginTop: 4 },
  heroSubtitle: { ...typography.body, color: "rgba(255,255,255,0.82)", marginTop: 2 },
  heroScript: { fontSize: 23, lineHeight: 28, marginTop: spacing.sm, maxWidth: 280 },
  heroStats: { flexDirection: "row", alignItems: "stretch", padding: spacing.sm, backgroundColor: "rgba(2,18,13,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderRadius: radius.md },
  heroMetric: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0, paddingHorizontal: 4 },
  heroMetricValue: { fontSize: 20, fontWeight: "900", color: "#FFFFFF" },
  heroMetricLabel: { fontSize: 10, color: "rgba(255,255,255,0.68)", marginTop: 2 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 130 },
  wellnessCompactRow: { flexDirection: "row", gap: spacing.sm },
  wellnessCompactItem: { flex: 1, minWidth: 0 },
  trendGrid: { gap: spacing.sm },
  trendTile: { minHeight: 82, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm },
  trendTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  trendValue: { fontSize: 12, fontWeight: "900" },
  recapGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  recapStat: { width: "47.5%", minHeight: 84, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, justifyContent: "space-between" },
  recapStatWarning: { borderColor: "rgba(255,179,63,0.36)", backgroundColor: "rgba(255,179,63,0.08)" },
  recapValue: { color: colors.textMain, fontSize: 14, fontWeight: "900", marginTop: 5 },
  recapLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
  sleepWarningBox: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,179,63,0.30)", backgroundColor: "rgba(255,179,63,0.09)" },
  sleepWarningText: { color: colors.amber, fontSize: 11.5, fontWeight: "900", flex: 1 },
  bodyMetricGrid: { flexDirection: "row", gap: spacing.sm },
  bodyMetric: { flex: 1, minHeight: 96, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.07)", padding: spacing.sm, justifyContent: "space-between" },
  bodyMetricValue: { color: colors.textMain, fontSize: 24, fontWeight: "900", marginTop: 4 },
  bodyMetricLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  weightCurveBox: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)" },
  weightCurveTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  weightCurveTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  weightCurveValue: { color: colors.primaryLight, fontSize: 13, fontWeight: "900" },
  weightBars: { height: 82, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  weightBarCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  weightBarTrack: { height: "100%", borderRadius: 8, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "rgba(255,255,255,0.08)" },
  weightBarFill: { width: "100%", borderRadius: 8, backgroundColor: "rgba(88,183,255,0.82)" },
  performanceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  performanceSwitch: { flexDirection: "row", padding: 3, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: colors.border },
  performanceSwitchBtn: { minHeight: 30, paddingHorizontal: 10, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  performanceSwitchOn: { backgroundColor: colors.primaryLight },
  performanceSwitchText: { color: colors.textMuted, fontSize: 11, fontWeight: "900" },
  performanceSwitchTextOn: { color: "#102108" },
  muscleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  muscleWeekChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.08)", paddingHorizontal: 9, minHeight: 28 },
  muscleWeekText: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  muscleBlock: { gap: spacing.sm },
  muscleRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm },
  muscleIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.12)", borderWidth: 1, borderColor: "rgba(182,255,63,0.20)" },
  muscleTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  muscleTitle: { flex: 1, color: colors.textMain, fontSize: 13.5, fontWeight: "900" },
  muscleKg: { color: colors.primaryLight, fontSize: 12.5, fontWeight: "900" },
  muscleTrack: { height: 7, borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.10)", marginTop: 8 },
  muscleFill: { height: "100%", borderRadius: 99, backgroundColor: colors.primaryLight },
  muscleDetail: { marginTop: -2, marginHorizontal: 4, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(3,22,15,0.42)", padding: spacing.sm, gap: spacing.sm },
  muscleBars: { height: 88, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  muscleBarCol: { flex: 1, alignItems: "center", gap: 5 },
  muscleBar: { width: "100%", height: 58, borderRadius: 8, overflow: "hidden", justifyContent: "flex-end", backgroundColor: "rgba(255,255,255,0.08)" },
  muscleBarFill: { width: "100%", borderRadius: 8, backgroundColor: "rgba(182,255,63,0.78)" },
  muscleBarLabel: { color: colors.textMuted, fontSize: 9.5, fontWeight: "800" },
  muscleTopList: { gap: 6 },
  muscleTopExercise: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: spacing.sm },
  muscleTopName: { flex: 1, color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" },
  muscleTopKg: { color: colors.primaryLight, fontSize: 11.5, fontWeight: "900" },
  historyWeekRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm },
  historyWeekIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryPale },
  historyWeekTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900" },
  historyWeekText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  historySleepWarning: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  historySleepWarningText: { color: colors.amber, fontSize: 10.5, fontWeight: "900" },
  historyMoreButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.08)" },
  historyMoreText: { color: colors.primaryLight, fontSize: 12.5, fontWeight: "900" },
  coachHeroCard: { overflow: "hidden", gap: spacing.md },
  coachHeroGlow: { position: "absolute", right: -60, top: -58, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(182,255,63,0.10)" },
  coachHeroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  referenceHeroEyebrow: { fontSize: 11, fontWeight: "900", color: colors.primaryLight, letterSpacing: 0.3 },
  referenceHeroTitle: { fontSize: 27, lineHeight: 31, fontWeight: "800", color: colors.textMain, maxWidth: 250, marginTop: 6 },
  objectiveRing: { width: 82, height: 82, borderRadius: 41, borderWidth: 7, borderColor: colors.primaryLight, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,18,12,0.58)" },
  objectiveRingValue: { color: colors.textMain, fontSize: 20, fontWeight: "900" },
  objectiveRingLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "800", marginTop: -2 },
  coachHeroFeatureRow: { flexDirection: "row", gap: spacing.sm },
  coachFeature: { flex: 1, minHeight: 82, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, justifyContent: "space-between" },
  coachFeatureTitle: { color: colors.textMain, fontSize: 11.5, fontWeight: "900" },
  coachFeatureText: { color: colors.textMuted, fontSize: 10, lineHeight: 13, fontWeight: "700" },
  progressPhonePreview: { flexDirection: "row", gap: spacing.sm },
  progressGraphStack: { flex: 1.05, gap: spacing.sm },
  miniGraph: { minHeight: 68, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(2,16,11,0.62)", padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  miniGraphLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
  miniGraphValue: { color: colors.primaryLight, fontSize: 15, fontWeight: "900", marginTop: 2 },
  miniGraphBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 42 },
  miniGraphBar: { width: 4, borderRadius: 2, backgroundColor: colors.primaryLight, opacity: 0.9 },
  objectiveTimeline: { flex: 1, gap: 8 },
  timelineStep: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)", padding: 8 },
  timelineStepActive: { borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.10)" },
  timelineNode: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  timelineNodeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  timelineNodeText: { color: "#13230A", fontSize: 12, fontWeight: "900" },
  timelineWeek: { color: colors.primaryLight, fontSize: 10.5, fontWeight: "900" },
  timelineTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 1 },
  timelineValue: { color: colors.textMuted, fontSize: 10.5, fontWeight: "900" },
  coachHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  coachAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.12)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.24)",
  },
  coachName: { fontSize: 17, fontWeight: "800", color: colors.textMain },
  coachLine: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 3 },
  coachRecapGrid: { flexDirection: "row", gap: spacing.sm },
  coachMiniMetric: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: spacing.sm,
    justifyContent: "space-between",
  },
  coachMiniMetricValue: { fontSize: 15, fontWeight: "900", color: colors.textMain },
  coachMiniMetricLabel: { fontSize: 10.5, color: colors.textMuted, fontWeight: "700" },
  coachRecommendation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
    backgroundColor: "rgba(182,255,63,0.08)",
  },
  coachRecommendationText: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, flex: 1, fontWeight: "600" },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  transfoImg: { width: 96, height: 128, borderRadius: radius.md, backgroundColor: colors.border },
  uploadingRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm },
  flashChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.primaryPale },
  trendChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  chartEmpty: { width: 320, height: 100, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, paddingHorizontal: spacing.lg },
  exerciseChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexShrink: 0, alignItems: "center" },
  exerciseChipOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  exerciseChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", maxWidth: 130 },
  exerciseChipKg: { fontSize: 10, color: colors.textMuted, fontWeight: "700", marginTop: 1 },
  viewChipsRow: { flexDirection: "row", gap: 8, marginTop: -spacing.sm },
  viewChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  viewChipOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  viewBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: "#D5EAD8" },
  // Gallery
  galleryModeRow: { flexDirection: "row", gap: 6 },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  hideBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  thumbHidden: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryModeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  galleryModeChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  gridItem: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 6, borderWidth: 1, borderColor: colors.border, gap: 4 },
  gridFooter: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 2 },
  privacyChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: colors.primary },
  compareLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  thumb: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  thumbOn: { borderColor: colors.primary, borderWidth: 2 },
  thumbImg: { width: "100%", height: "100%" },
  deltaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
