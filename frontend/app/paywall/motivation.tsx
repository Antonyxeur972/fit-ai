import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { Button, Card } from "@/src/components/UI";
import { usePaywallFlow } from "@/src/paywallFlow";
import { colors, spacing, typography, radius } from "@/src/theme";

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS_COUNT = 5;

const OBSTACLE_OPTIONS = [
  "Manque de temps",
  "Manque de structure / plan clair",
  "La motivation s'essouffle après 2 semaines",
  "Mauvaise alimentation",
  "Blessures / santé",
];

const GOAL_OPTIONS = [
  "Être fier(e) de mon corps",
  "Avoir plus d'énergie au quotidien",
  "Plus confiance en moi",
  "Rester en bonne santé longtemps",
  "Performer (sport, compétition)",
];

export default function Motivation() {
  const router = useRouter();
  const { user } = useAuth();
  const { answers, setAnswers } = usePaywallFlow();
  const [step, setStep] = useState<Step>(0);

  const next = () => setStep((s) => Math.min(STEPS_COUNT - 1, s + 1) as Step);
  const prev = () => setStep((s) => Math.max(0, s - 1) as Step);

  const canContinue =
    (step === 0 && answers.why_now.trim().length > 0) ||
    (step === 1 && answers.biggest_obstacle.trim().length > 0) ||
    (step === 2 && answers.cost_of_inaction.trim().length > 0) ||
    (step === 3 && answers.deep_goal.trim().length > 0) ||
    step === 4;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="motivation-screen">
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
            <Text style={styles.title}>{user?.name?.split(" ")[0] || "Toi"}, pourquoi maintenant ?</Text>
            <Text style={styles.subtitle}>
              {"Qu'est-ce qui te pousse à changer aujourd'hui, et pas avant ? Sois honnête, ça reste entre toi et l'app."}
            </Text>
            <Card style={{ marginTop: spacing.lg }}>
              <TextInput
                testID="motivation-why-now"
                value={answers.why_now}
                onChangeText={(t) => setAnswers({ ...answers, why_now: t })}
                style={styles.textarea}
                placeholder="Écris ce qui te vient, sans filtre…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
              />
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>{"Qu'est-ce qui t'a empêché de tenir jusqu'ici ?"}</Text>
            <Text style={styles.subtitle}>Choisis ce qui te ressemble le plus.</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {OBSTACLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  testID={`motivation-obstacle-${opt}`}
                  activeOpacity={0.8}
                  style={[styles.optionCard, answers.biggest_obstacle === opt && styles.optionCardActive]}
                  onPress={() => setAnswers({ ...answers, biggest_obstacle: opt })}
                >
                  <Text style={styles.optionTitle}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Si rien ne change dans 12 mois ?</Text>
            <Text style={styles.subtitle}>
              {"Imagine-toi dans un an, exactement dans le même état qu'aujourd'hui. Comment tu te sens ?"}
            </Text>
            <Card style={{ marginTop: spacing.lg }}>
              <TextInput
                testID="motivation-cost"
                value={answers.cost_of_inaction}
                onChangeText={(t) => setAnswers({ ...answers, cost_of_inaction: t })}
                style={styles.textarea}
                placeholder="Décris-le…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
              />
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Ce que tu veux vraiment, au fond</Text>
            <Text style={styles.subtitle}>Au-delà du chiffre sur la balance.</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {GOAL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  testID={`motivation-goal-${opt}`}
                  activeOpacity={0.8}
                  style={[styles.optionCard, answers.deep_goal === opt && styles.optionCardActive]}
                  onPress={() => setAnswers({ ...answers, deep_goal: opt })}
                >
                  <Text style={styles.optionTitle}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>À quel point es-tu déterminé(e) ?</Text>
            <Text style={styles.subtitle}>{"De 1 (pas vraiment) à 10 (à 100%, quoi qu'il arrive)."}</Text>
            <View style={styles.scaleGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity
                  key={n}
                  testID={`motivation-determination-${n}`}
                  activeOpacity={0.8}
                  style={[styles.scalePill, answers.determination === n && styles.scalePillActive]}
                  onPress={() => setAnswers({ ...answers, determination: n })}
                >
                  <Text style={[styles.scaleText, answers.determination === n && { color: "#fff" }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button title="Retour" onPress={prev} variant="secondary" style={{ flex: 1 }} testID="motivation-back" />
        ) : null}
        <Button
          title={step === STEPS_COUNT - 1 ? "Continuer" : "Suivant"}
          onPress={step === STEPS_COUNT - 1 ? () => router.push("/paywall/pact") : next}
          disabled={!canContinue}
          style={{ flex: step > 0 ? 1.4 : 1 }}
          testID="motivation-next"
        />
      </View>
    </SafeAreaView>
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
  textarea: {
    minHeight: 120,
    fontSize: 16,
    color: colors.textMain,
    textAlignVertical: "top",
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  optionTitle: { fontSize: 16, fontWeight: "600", color: colors.textMain },
  scaleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  scalePill: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scalePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scaleText: { fontSize: 16, fontWeight: "700", color: colors.textMain },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
