import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Button, Card } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Step = 0 | 1 | 2 | 3;
type Gender = "male" | "female";
type Goal = "lose" | "maintain" | "gain";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

const GOAL_OPTIONS: { value: Goal; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "lose", label: "Perdre du gras", desc: "Déficit calorique modéré", icon: "trending-down" },
  { value: "maintain", label: "Maintenir", desc: "Équilibre, recomposition", icon: "remove" },
  { value: "gain", label: "Gagner du muscle", desc: "Surplus contrôlé", icon: "trending-up" },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: "sedentary", label: "Sédentaire", desc: "Travail assis, peu d'activité" },
  { value: "light", label: "Léger", desc: "1-3 séances / semaine" },
  { value: "moderate", label: "Modéré", desc: "3-5 séances / semaine" },
  { value: "active", label: "Actif", desc: "6-7 séances / semaine" },
  { value: "very_active", label: "Très actif", desc: "Athlète, métier physique" },
];

export default function Onboarding() {
  const router = useRouter();
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("28");
  const [weight, setWeight] = useState("75");
  const [height, setHeight] = useState("178");
  const [goal, setGoal] = useState<Goal>("lose");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [submitting, setSubmitting] = useState(false);

  const next = () => setStep((s) => Math.min(3, (s + 1)) as Step);
  const prev = () => setStep((s) => Math.max(0, (s - 1)) as Step);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          weight_kg: parseFloat(weight),
          height_cm: parseFloat(height),
          age: parseInt(age, 10),
          gender,
          goal,
          activity_level: activity,
        },
      });
      // Generate workouts
      try {
        await api("/workouts/generate", { method: "POST" });
      } catch {}
      await refreshUser();
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      console.warn("profile submit", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="onboarding-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Étape {step + 1} sur 4</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]} />
        </View>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={100}
      >
        {step === 0 && (
          <>
            <Text style={styles.title}>Salut {user?.name?.split(" ")[0] || ""} 👋</Text>
            <Text style={styles.subtitle}>
              On a besoin de quelques infos pour calculer tes vrais besoins. Pas de motivation fluffy, juste de la science.
            </Text>
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={[typography.caption, { marginBottom: spacing.md }]}>Genre</Text>
              <View style={styles.row}>
                {(["male", "female"] as Gender[]).map((g) => (
                  <TouchableOpacity
                    key={g}
                    testID={`onboarding-gender-${g}`}
                    style={[styles.choice, gender === g && styles.choiceActive]}
                    onPress={() => setGender(g)}
                  >
                    <Ionicons
                      name={g === "male" ? "male" : "female"}
                      size={20}
                      color={gender === g ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.choiceText, gender === g && { color: colors.primary }]}>
                      {g === "male" ? "Homme" : "Femme"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Tes mesures</Text>
            <Text style={styles.subtitle}>Sois précis. Les calculs en dépendent.</Text>
            <Card style={{ marginTop: spacing.lg, gap: spacing.lg }}>
              <NumericField label="Âge" value={age} onChange={setAge} unit="ans" testID="onboarding-age" />
              <NumericField label="Poids" value={weight} onChange={setWeight} unit="kg" testID="onboarding-weight" />
              <NumericField label="Taille" value={height} onChange={setHeight} unit="cm" testID="onboarding-height" />
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Ton objectif</Text>
            <Text style={styles.subtitle}>Choisis ce qui correspond à ce que tu veux RÉELLEMENT.</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              {GOAL_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  testID={`onboarding-goal-${g.value}`}
                  activeOpacity={0.8}
                  style={[styles.optionCard, goal === g.value && styles.optionCardActive]}
                  onPress={() => setGoal(g.value)}
                >
                  <View style={[styles.optionIcon, goal === g.value && { backgroundColor: colors.primary }]}>
                    <Ionicons name={g.icon} size={20} color={goal === g.value ? "#fff" : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{g.label}</Text>
                    <Text style={styles.optionDesc}>{g.desc}</Text>
                  </View>
                  {goal === g.value && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>{"Niveau d'activité"}</Text>
            <Text style={styles.subtitle}>{"Combien tu bouges en moyenne ?"}</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {ACTIVITY_OPTIONS.map((a) => (
                <TouchableOpacity
                  key={a.value}
                  testID={`onboarding-activity-${a.value}`}
                  activeOpacity={0.8}
                  style={[styles.optionCardSmall, activity === a.value && styles.optionCardActive]}
                  onPress={() => setActivity(a.value)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{a.label}</Text>
                    <Text style={styles.optionDesc}>{a.desc}</Text>
                  </View>
                  {activity === a.value && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button title="Retour" onPress={prev} variant="secondary" style={{ flex: 1 }} testID="onboarding-back" />
        ) : null}
        <Button
          title={step === 3 ? "Calculer mes objectifs" : "Continuer"}
          onPress={step === 3 ? submit : next}
          loading={submitting}
          style={{ flex: step > 0 ? 1.4 : 1 }}
          testID="onboarding-next"
        />
      </View>
    </SafeAreaView>
  );
}

function NumericField({
  label,
  value,
  onChange,
  unit,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  testID?: string;
}) {
  return (
    <View>
      <Text style={[typography.caption, { marginBottom: 6 }]}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.inputUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  progressTrack: { height: 6, backgroundColor: colors.primaryPale, borderRadius: radius.full, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radius.full },
  content: { padding: spacing.lg, paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  row: { flexDirection: "row", gap: spacing.sm },
  choice: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
  },
  choiceActive: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  choiceText: { fontSize: 15, color: colors.textMain, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 22, color: colors.textMain, paddingVertical: 14, fontWeight: "600" },
  inputUnit: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  optionCardSmall: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: { fontSize: 16, fontWeight: "600", color: colors.textMain },
  optionDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
