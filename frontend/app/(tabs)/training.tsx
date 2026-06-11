import { useCallback, useState } from "react";
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

type Exercise = { name: string; sets: number; reps: string; rest_s: number };
type Workout = {
  id: string; date: string; title: string; focus: string; duration_min: number;
  exercises: Exercise[]; completed: boolean; intensity?: string;
};
type Activity = { date: string; steps: number; cardio_minutes: number; cardio_type?: string };

export default function Training() {
  const [week, setWeek] = useState<Workout[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [steps, setSteps] = useState("");
  const [cardioMin, setCardioMin] = useState("");
  const [cardioType, setCardioType] = useState("");
  const [generating, setGenerating] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [w, a] = await Promise.all([
        api<Workout[]>("/workouts/week"),
        api<Activity>(`/activity?date=${today}`),
      ]);
      setWeek(w);
      setActivity(a);
      setSteps(String(a.steps || ""));
      setCardioMin(String(a.cardio_minutes || ""));
      setCardioType(a.cardio_type || "");
    } catch (e) {
      console.warn("training load", e);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const generate = async () => {
    setGenerating(true);
    try {
      await api("/workouts/generate", { method: "POST" });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const completeWorkout = async (id: string) => {
    try {
      await api(`/workouts/${id}/complete`, { method: "POST" });
      await load();
    } catch {}
  };

  const saveActivity = async () => {
    try {
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
    } catch {}
  };

  const todayWorkout = week.find((w) => w.date === today);

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
            <SectionTitle title="Séance du jour" />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
              <View style={styles.focusBadge}>
                <Ionicons name="barbell" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h3]}>{todayWorkout.focus}</Text>
                <Text style={typography.small}>{todayWorkout.duration_min} min · Intensité {todayWorkout.intensity || "moderate"}</Text>
              </View>
            </View>
            {todayWorkout.exercises.map((ex, i) => (
              <View key={i} style={styles.exerciseRow} testID={`exercise-${i}`}>
                <View style={styles.exerciseNum}>
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: "600" }]}>{ex.name}</Text>
                  <Text style={typography.small}>{ex.sets} × {ex.reps} · repos {ex.rest_s}s</Text>
                </View>
              </View>
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
            <Text style={typography.small}>Génère ton programme personnalisé.</Text>
            <Button title="Générer mon programme" onPress={generate} loading={generating} style={{ marginTop: spacing.md }} testID="generate-button" />
          </Card>
        )}

        {/* Week plan */}
        <SectionTitle title="Cette semaine" />
        {week.length === 0 ? (
          <Text style={typography.small}>Pas encore de programme.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {week.map((w) => (
              <View key={w.id} style={[styles.weekRow, w.date === today && styles.weekRowToday]} testID={`week-${w.date}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.caption]}>
                    {new Date(w.date).toLocaleDateString("fr-FR", { weekday: "long" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: 2 }]}>{w.focus}</Text>
                  <Text style={typography.small}>{w.duration_min} min</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: w.completed ? colors.primary : colors.border }]} />
              </View>
            ))}
          </View>
        )}

        <Button title="Régénérer la semaine" variant="ghost" onPress={generate} loading={generating} style={{ marginTop: spacing.lg }} testID="regenerate-button" />

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Activity modal */}
      <Modal visible={showActivity} transparent animationType="slide" onRequestClose={() => setShowActivity(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalCard}
            keyboardShouldPersistTaps="handled"
            bottomOffset={20}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Activité du jour</Text>

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Pas</Text>
            <TextInput
              value={steps}
              onChangeText={(t) => setSteps(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              testID="activity-steps-input"
            />

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Cardio (minutes)</Text>
            <TextInput
              value={cardioMin}
              onChangeText={(t) => setCardioMin(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              testID="activity-cardio-input"
            />

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Type de cardio</Text>
            <TextInput
              value={cardioType}
              onChangeText={setCardioType}
              placeholder="Course, vélo, natation..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              testID="activity-cardio-type-input"
            />

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setShowActivity(false)} style={{ flex: 1 }} testID="activity-cancel" />
              <Button title="Enregistrer" onPress={saveActivity} style={{ flex: 1.4 }} testID="activity-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </SafeAreaView>
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
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textMain, marginTop: 6,
  },
});
