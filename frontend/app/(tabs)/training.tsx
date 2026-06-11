import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api } from "@/src/api";
import { Card, Button, SectionTitle, Stat } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Exercise = { name: string; sets: number; reps: string; rest_s: number; checked?: boolean };
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

export default function Training() {
  const today = new Date().toISOString().slice(0, 10);
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

  const load = useCallback(async () => {
    try {
      const [w, a, lib] = await Promise.all([
        api<Workout[]>("/workouts/week"),
        api<Activity>(`/activity?date=${today}`),
        api<{ exercises: LibExercise[]; session_types: SessionTypes }>("/exercises/library"),
      ]);
      setWeek(w);
      setActivity(a);
      setSteps(String(a.steps || ""));
      setCardioMin(String(a.cardio_minutes || ""));
      setCardioType(a.cardio_type || "");
      setLibrary(lib.exercises);
      setSessionTypes(lib.session_types);
    } catch (e) {
      console.warn("training load", e);
    }
  }, [today]);

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
    await load();
  };

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
    await api(`/workouts/${editWorkout.id}`, {
      method: "PUT",
      body: {
        session_type: editWorkout.session_type,
        exercises: filtered,
      },
    });
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
    <SafeAreaView style={styles.safe} edges={["top"]} testID="training-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Programme</Text>
        <Text style={styles.title}>Ton entraînement</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            {todayExercises.map((ex, i) => (
              <TouchableOpacity key={`${ex.name}-${i}`} style={styles.exerciseRow} onPress={() => openPerf(todayWorkout, ex)} testID={`exercise-${i}`} activeOpacity={0.7}>
                <View style={styles.exerciseNum}>
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: "600" }]}>{ex.name}</Text>
                  <Text style={typography.small}>{ex.sets} × {ex.reps} · repos {ex.rest_s}s</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))}
            <Button
              title={todayWorkout.completed ? "Séance terminée ✓" : "Marquer comme terminée"}
              variant={todayWorkout.completed ? "secondary" : "primary"}
              onPress={() => !todayWorkout.completed && completeWorkout(todayWorkout.id)}
              disabled={todayWorkout.completed}
              testID="complete-workout-button"
              style={{ marginTop: spacing.md }}
            />
          </Card>
        ) : (
          <Card>
            <SectionTitle title="Aucune séance" />
            <Text style={typography.small}>Choisis ton type de séance et génère ton plan.</Text>
            <SessionTypeSelector value={generateType} onChange={setGenerateType} sessionTypes={sessionTypes} />
            <Button title="Générer mon programme" onPress={generate} loading={generating} style={{ marginTop: spacing.md }} testID="generate-button" />
          </Card>
        )}

        {/* Generate options always visible */}
        {todayWorkout && (
          <Card testID="generate-card">
            <SectionTitle title="Régénérer la semaine" />
            <SessionTypeSelector value={generateType} onChange={setGenerateType} sessionTypes={sessionTypes} />
            <Button title="Régénérer 7 jours" variant="ghost" onPress={generate} loading={generating} style={{ marginTop: spacing.md }} testID="regenerate-button" />
          </Card>
        )}

        {/* Week plan */}
        <SectionTitle title="Cette semaine" />
        <View style={{ gap: spacing.sm }}>
          {week.length === 0 ? (
            <Text style={typography.small}>Pas encore de programme.</Text>
          ) : week.map((w) => {
            const exCount = w.exercises.filter((e) => e.checked !== false).length;
            return (
              <TouchableOpacity key={w.id} style={[styles.weekRow, w.date === today && styles.weekRowToday]} onPress={() => openEditor(w)} testID={`week-${w.date}`} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.caption]}>
                    {new Date(w.date).toLocaleDateString("fr-FR", { weekday: "long" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: 2 }]}>{w.focus}</Text>
                  <Text style={typography.small}>{w.duration_min} min · {exCount} exercices</Text>
                </View>
                <TypeChip type={(w.session_type as SessionKey) || "volume"} compact />
                <View style={[styles.statusDot, { backgroundColor: w.completed ? colors.primary : colors.border, marginLeft: 8 }]} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

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
              {Object.entries(libByCategory).map(([cat, list]) => (
                <View key={cat} style={{ marginBottom: spacing.md }}>
                  <Text style={[typography.caption, { marginBottom: 8 }]}>{cat}</Text>
                  {list.map((ex) => {
                    const inWk = editWorkout?.exercises.find((e) => e.name === ex.name);
                    const isOn = !!inWk && inWk.checked !== false;
                    return (
                      <TouchableOpacity
                        key={ex.id}
                        onPress={() => toggleExerciseInEditor(ex.name)}
                        style={[styles.exCheck, isOn && styles.exCheckOn]}
                        testID={`editor-ex-${ex.id}`}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                          {isOn && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[typography.body, { fontWeight: isOn ? "700" : "500" }]}>{ex.name}</Text>
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
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6, marginTop: 4 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  focusBadge: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  exerciseRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseNum: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  weekRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  weekRowToday: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
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
});
