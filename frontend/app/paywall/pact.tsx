import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Button, Card } from "@/src/components/UI";
import { usePaywallFlow } from "@/src/paywallFlow";
import { colors, spacing, typography } from "@/src/theme";

export default function Pact() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { answers } = usePaywallFlow();
  const [signature, setSignature] = useState(user?.name || "");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goal = answers.deep_goal || "atteindre mon objectif";
  const firstName = user?.name?.split(" ")[0] || "Moi";

  const canSign = signature.trim().length > 1 && confirmed;

  const sign = async () => {
    if (!canSign) return;
    setSubmitting(true);
    setError(null);
    try {
      await api("/users/me/motivation", { method: "PUT", body: answers });
      await api("/users/me/pact", { method: "PUT", body: { full_name: signature.trim() } });
      await refreshUser();
      router.replace("/paywall/offer");
    } catch (e: any) {
      setError(e?.message || "Impossible d'enregistrer ton engagement. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="pact-screen">
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={100}
      >
        <Text style={styles.title}>{"Ton pacte d'engagement"}</Text>
        <Text style={styles.subtitle}>
          Avant de continuer, engage-toi envers toi-même. Pas envers nous.
        </Text>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.pactText}>
            {"Moi, "}
            <Text style={styles.pactStrong}>{firstName}</Text>
            {", je m'engage à suivre mon programme et à tenir mes objectifs, semaine après semaine.\n\n"}
            {"Je le fais pour "}
            <Text style={styles.pactStrong}>{goal.toLowerCase()}</Text>
            {".\n\n"}
            {"Déterminé(e) à "}
            <Text style={styles.pactStrong}>{answers.determination}/10</Text>
            {", je sais que les excuses viendront. Je choisis maintenant de ne pas les écouter."}
          </Text>
        </Card>

        <Text style={[typography.caption, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          Signature
        </Text>
        <Card>
          <TextInput
            testID="pact-signature"
            value={signature}
            onChangeText={setSignature}
            style={styles.signatureInput}
            placeholder="Tape ton nom complet"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </Card>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setConfirmed(!confirmed)}
          testID="pact-confirm"
        >
          <Ionicons
            name={confirmed ? "checkbox" : "square-outline"}
            size={20}
            color={confirmed ? colors.primary : colors.textSecondary}
          />
          <Text style={[typography.small, { flex: 1, color: colors.textSecondary }]}>
            {"Je comprends que cet engagement n'a de valeur que si je le tiens."}
          </Text>
        </TouchableOpacity>

        {error ? (
          <Text style={[typography.small, { color: colors.alert, marginTop: spacing.sm }]}>{error}</Text>
        ) : null}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <Button
          title="Je signe mon engagement"
          onPress={sign}
          loading={submitting}
          disabled={!canSign}
          testID="pact-sign"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  pactText: { ...typography.body, color: colors.textMain, lineHeight: 24 },
  pactStrong: { fontWeight: "700", color: colors.primaryLight },
  signatureInput: { fontSize: 18, color: colors.textMain, paddingVertical: 6, fontWeight: "600" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.lg },
  footer: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
