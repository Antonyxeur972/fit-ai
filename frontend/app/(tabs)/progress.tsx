import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Dimensions, Animated, PanResponder, Platform } from "react-native";
import { ScreenBackground } from "@/src/components/ScreenBackground";
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

export default function Progress() {
  const [transfos, setTransfos] = useState<Transfo[]>([]);
  const [week, setWeek] = useState<Week | null>(null);
  const [perf, setPerf] = useState<PerfPayload>({ items: [], personal_bests: [] });
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Phase 5: date picker for the photo
  const [uploadDate, setUploadDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

const styles = StyleSheet.create({

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
