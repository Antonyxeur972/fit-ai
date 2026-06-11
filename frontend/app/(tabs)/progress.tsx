import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Button, SectionTitle, WeekBars, LineChart1RM } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Transfo = {
  id: string;
  date: string;
  image_base64: string;
  ai_feedback?: string;
  weight_kg?: number;
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

export default function Progress() {
  const [transfos, setTransfos] = useState<Transfo[]>([]);
  const [week, setWeek] = useState<Week | null>(null);
  const [perf, setPerf] = useState<PerfPayload>({ items: [], personal_bests: [] });
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, w, p] = await Promise.all([
        api<Transfo[]>("/transformations"),
        api<Week>("/dashboard/week"),
        api<PerfPayload>("/perf/recent?limit=200"),
      ]);
      setTransfos(list);
      setWeek(w);
      setPerf(p);
      if (!selectedExercise && p.personal_bests.length > 0) {
        // Pre-select exercise with most data points
        const counts: Record<string, number> = {};
        p.items.forEach((it) => { counts[it.exercise_name] = (counts[it.exercise_name] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top) setSelectedExercise(top);
      }
    } catch (e) {
      console.warn("progress load", e);
    }
  }, [selectedExercise]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      await api("/transformations", {
        method: "POST",
        body: { image_base64: result.assets[0].base64, mime: "image/jpeg" },
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
    <SafeAreaView style={styles.safe} edges={["top"]} testID="progress-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Progression</Text>
        <Text style={styles.title}>Ton évolution</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1RM Progression — THE addictive number */}
        <Card testID="rm-card">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <Text style={typography.caption}>Force · Progression 1RM</Text>
            {exerciseList.length > 0 && (
              <View style={styles.flashChip}>
                <Ionicons name="flash" size={12} color={colors.primary} />
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Epley</Text>
              </View>
            )}
          </View>

          {exerciseList.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
              <View style={styles.emptyIcon}>
                <Ionicons name="trending-up" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.md }]}>
                {"Aucune perf enregistrée"}
              </Text>
              <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>
                {"Tape sur un exercice dans Training → enregistre charge × reps. Ta courbe 1RM commence ici."}
              </Text>
            </View>
          ) : (
            <>
              {selectedExercise && (
                <View style={{ marginBottom: spacing.sm }}>
                  <Text style={[typography.h2, { lineHeight: 32 }]}>
                    {selectedBest?.est_1rm.toFixed(1)} <Text style={[typography.small, { fontSize: 14 }]}>kg</Text>
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <Text style={[typography.small, { color: colors.textSecondary }]}>
                      Record · {selectedExercise}
                    </Text>
                    {trend && (
                      <View style={[styles.trendChip, { backgroundColor: trend.delta >= 0 ? "#DCFCE7" : "#FEE2E2" }]}>
                        <Ionicons
                          name={trend.delta >= 0 ? "trending-up" : "trending-down"}
                          size={12}
                          color={trend.delta >= 0 ? colors.primary : colors.alert}
                        />
                        <Text style={[typography.small, { fontWeight: "700", color: trend.delta >= 0 ? colors.primary : colors.alert }]}>
                          {trend.delta >= 0 ? "+" : ""}{trend.delta.toFixed(1)} kg · {trend.pct >= 0 ? "+" : ""}{trend.pct.toFixed(0)}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              <View style={{ alignItems: "center" }}>
                {chartData.length >= 2 ? (
                  <LineChart1RM data={chartData} width={320} height={160} testID="rm-chart" />
                ) : (
                  <View style={styles.chartEmpty}>
                    <Text style={[typography.small, { textAlign: "center" }]}>
                      {"Enregistre une 2e perf pour voir ta courbe d'évolution."}
                    </Text>
                  </View>
                )}
              </View>

              {/* Exercise selector chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 0 }}
                style={{ marginTop: spacing.md, marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}
                testID="rm-exercise-chips"
              >
                {exerciseList.map((pb) => {
                  const isOn = pb.exercise_name === selectedExercise;
                  return (
                    <TouchableOpacity
                      key={pb.exercise_name}
                      onPress={() => setSelectedExercise(pb.exercise_name)}
                      style={[styles.exerciseChip, isOn && styles.exerciseChipOn]}
                      testID={`rm-chip-${pb.exercise_name}`}
                    >
                      <Text style={[styles.exerciseChipText, isOn && { color: colors.primary, fontWeight: "700" }]} numberOfLines={1}>
                        {pb.exercise_name}
                      </Text>
                      <Text style={[styles.exerciseChipKg, isOn && { color: colors.primary }]}>
                        {pb.est_1rm.toFixed(0)} kg
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </Card>

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

        {/* Week activity totals */}
        <Card testID="activity-totals-card">
          <SectionTitle title="Activité de la semaine" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <View>
              <Text style={typography.caption}>Pas totaux</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{totalWeekSteps.toLocaleString("fr-FR")}</Text>
            </View>
            <View>
              <Text style={typography.caption}>Cardio</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{totalCardioMin} <Text style={typography.small}>min</Text></Text>
            </View>
          </View>
        </Card>

        {/* Transformations */}
        <SectionTitle title="Photos de transformation" />
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
            <Text style={typography.small}>Analyse IA en cours...</Text>
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
                {"Toutes les 2-4 semaines, upload une photo. L'IA suit ton évolution."}
              </Text>
            </View>
          </Card>
        ) : (
          transfos.map((t, idx) => (
            <Card key={t.id} testID={`transfo-${t.id}`}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Image source={{ uri: `data:image/jpeg;base64,${t.image_base64}` }} style={styles.transfoImg} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>
                    {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: 2 }]}>
                    {idx === 0 ? "Dernière photo" : `Photo #${transfos.length - idx}`}
                  </Text>
                  {t.weight_kg ? <Text style={typography.small}>{t.weight_kg} kg</Text> : null}
                  {t.ai_feedback ? (
                    <Text style={[typography.small, { marginTop: spacing.sm, color: colors.textMain, lineHeight: 18 }]}>
                      {t.ai_feedback}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6, marginTop: 4 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
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
});
