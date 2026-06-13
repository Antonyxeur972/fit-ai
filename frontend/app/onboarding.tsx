import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Button, Card } from "@/src/components/UI";
import { SilhouettePicker } from "@/src/components/SilhouettePicker";
import { MascotPicker } from "@/src/components/MascotPicker";
import { MascotAnimal } from "@/src/components/Mascot";
import { colors, spacing, typography, radius } from "@/src/theme";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Gender = "male" | "female";
type Goal = "lose" | "maintain" | "gain";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

const STEPS_COUNT = 7;

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

  // Phase 4: Silhouette + 1RM
  const [silhouetteLevel, setSilhouetteLevel] = useState<number>(3);
  const [silhouetteSex, setSilhouetteSex] = useState<Gender>(gender);

  // Phase 5: Mascot
  const [mascot, setMascot] = useState<MascotAnimal | null>(null);

  const [squatKg, setSquatKg] = useState("");
  const [squatReps, setSquatReps] = useState("");
  const [benchKg, setBenchKg] = useState("");
  const [benchReps, setBenchReps] = useState("");
  const [deadliftKg, setDeadliftKg] = useState("");
  const [deadliftReps, setDeadliftReps] = useState("");
  const [skipForce, setSkipForce] = useState(false);

  const next = () => setStep((s) => Math.min(STEPS_COUNT - 1, (s + 1)) as Step);
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
      // Save silhouette
      try {
        await api("/users/me/silhouette", {
          method: "PUT",
          body: { sex: silhouetteSex, level: silhouetteLevel },
        });
      } catch {}

      // Save mascot (Phase 5)
      if (mascot) {
        try {
          await api("/users/me/mascot", {
            method: "PUT",
            body: { animal: mascot },
          });
        } catch {}
      }

      // Save 1RM estimations only if user provided at least one valid value
      if (!skipForce) {
        const hasAny =
          (parseFloat(squatKg) > 0 && parseInt(squatReps, 10) > 0) ||
          (parseFloat(benchKg) > 0 && parseInt(benchReps, 10) > 0) ||
          (parseFloat(deadliftKg) > 0 && parseInt(deadliftReps, 10) > 0);
        if (hasAny) {
          try {
            await api("/workouts/estimate-1rm", {
              method: "POST",
              body: {
                squat_kg: parseFloat(squatKg) || null,
                squat_reps: parseInt(squatReps, 10) || null,
                bench_kg: parseFloat(benchKg) || null,
                bench_reps: parseInt(benchReps, 10) || null,
                deadlift_kg: parseFloat(deadliftKg) || null,
                deadlift_reps: parseInt(deadliftReps, 10) || null,
              },
            });
          } catch {}
        }
      }

      // Generate workouts (legacy week)
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
        <Text style={typography.caption}>Étape {step + 1} sur {STEPS_COUNT}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS_COUNT) * 100}%` }]} />
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
                    onPress={() => {
                      setGender(g);
                      setSilhouetteSex(g);
                    }}
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

        {step === 4 && (
          <>
            <Text style={styles.title}>Ta silhouette actuelle</Text>
            <Text style={styles.subtitle}>
              Choisis le visuel qui ressemble le plus à ton corps aujourd&apos;hui. Ça sert de point de départ.
            </Text>
            <Card style={{ marginTop: spacing.lg }}>
              <SilhouettePicker
                sex={silhouetteSex}
                level={silhouetteLevel}
                onChange={(sx, lv) => {
                  setSilhouetteSex(sx);
                  setSilhouetteLevel(lv);
                }}
              />
              <Text style={[typography.small, { marginTop: spacing.md, color: colors.textMuted }]}>
                Tu pourras toujours la modifier depuis ton profil.
              </Text>
            </Card>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>Ta mascotte</Text>
            <Text style={styles.subtitle}>
              Choisis ton animal totem. Il évoluera avec toi (chaque pallier de progression).
            </Text>
            <Card style={{ marginTop: spacing.lg }}>
              <MascotPicker
                selected={mascot}
                onChange={setMascot}
                evolution={1}
                size={84}
              />
              <Text style={[typography.small, { marginTop: spacing.md, color: colors.textMuted }]}>
                Tu pourras la changer depuis ton profil à tout moment.
              </Text>
            </Card>
          </>
        )}

        {step === 6 && (
          <>
            <Text style={styles.title}>Tes records (optionnel)</Text>
            <Text style={styles.subtitle}>
              Indique ton meilleur effort par exercice (charge × reps). On calcule ton 1RM. Sans ces données, ton profil reste plus pauvre.
            </Text>
            <Card style={{ marginTop: spacing.lg, gap: spacing.md }}>
              <LiftRow label="Squat" wKey={squatKg} rKey={squatReps} setW={setSquatKg} setR={setSquatReps} testID="lift-squat" />
              <LiftRow label="Développé couché" wKey={benchKg} rKey={benchReps} setW={setBenchKg} setR={setBenchReps} testID="lift-bench" />
              <LiftRow label="Soulevé de terre" wKey={deadliftKg} rKey={deadliftReps} setW={setDeadliftKg} setR={setDeadliftReps} testID="lift-deadlift" />
              <TouchableOpacity onPress={() => setSkipForce(!skipForce)} style={styles.skipBtn} testID="lift-skip">
                <Ionicons
                  name={skipForce ? "checkbox" : "square-outline"}
                  size={18}
                  color={skipForce ? colors.primary : colors.textSecondary}
                />
                <Text style={[typography.small, { color: colors.textSecondary }]}>
                  Je ne connais pas mes records pour l&apos;instant
                </Text>
              </TouchableOpacity>
            </Card>
          </>
        )}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button title="Retour" onPress={prev} variant="secondary" style={{ flex: 1 }} testID="onboarding-back" />
        ) : null}
        <Button
          title={step === STEPS_COUNT - 1 ? "Terminer & calculer" : "Continuer"}
          onPress={step === STEPS_COUNT - 1 ? submit : next}
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

function LiftRow({
  label,
  wKey,
  rKey,
  setW,
  setR,
  testID,
}: {
  label: string;
  wKey: string;
  rKey: string;
  setW: (v: string) => void;
  setR: (v: string) => void;
  testID: string;
}) {
  const w = parseFloat(wKey || "0");
  const r = parseInt(rKey || "0", 10);
  const est = w > 0 && r > 0 ? (r === 1 ? Math.round(w * 10) / 10 : Math.round(w * (1 + Math.min(r, 12) / 30) * 10) / 10) : 0;
  return (
    <View style={styles.liftRow}>
      <Text style={[typography.body, { fontWeight: "700", flex: 1 }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <View style={styles.liftInputWrap}>
          <TextInput
            testID={`${testID}-kg`}
            value={wKey}
            onChangeText={(t) => setW(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="kg"
            placeholderTextColor={colors.textMuted}
            style={styles.liftInput}
          />
        </View>
        <Text style={[typography.small, { color: colors.textMuted, fontWeight: "700" }]}>×</Text>
        <View style={styles.liftInputWrap}>
          <TextInput
            testID={`${testID}-reps`}
            value={rKey}
            onChangeText={(t) => setR(t.replace(/[^0-9]/g, ""))}
            keyboardType="numeric"
            placeholder="reps"
            placeholderTextColor={colors.textMuted}
            style={styles.liftInput}
          />
        </View>
      </View>
      {est > 0 ? (
        <View style={styles.estPill}>
          <Text style={styles.estTxt}>1RM ≈ {est}</Text>
        </View>
      ) : null}
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
  liftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    flexWrap: "wrap",
  },
  liftInputWrap: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
  },
  liftInput: { fontSize: 15, paddingVertical: 8, color: colors.textMain, fontWeight: "700" },
  estPill: {
    backgroundColor: colors.primaryPale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    marginLeft: "auto",
  },
  estTxt: { color: colors.primary, fontWeight: "800", fontSize: 11 },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
});
