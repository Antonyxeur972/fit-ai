import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { BACKEND_URL, readableError } from "@/src/api";
import { Button } from "@/src/components/UI";
import { hasSignedCommitment } from "@/src/lib/commitment";
import { getSubscriptionState } from "@/src/lib/subscription";
import { colors, spacing, typography, radius } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { signInWithGoogle, signInForReview, user, loading: authLoading, authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewUsername, setReviewUsername] = useState("");
  const [reviewPassword, setReviewPassword] = useState("");

  const displayError = error || authError;

  // If sign-in succeeded (user set by deep-link processing), route to next screen.
  useEffect(() => {
    let mounted = true;
    const route = async () => {
      if (authLoading || !user) return;
      if (!user.onboarded) {
        router.replace("/onboarding");
        return;
      }
      const subscription = await getSubscriptionState(user.user_id);
      if (!mounted) return;
      if (subscription.active) {
        router.replace("/(tabs)/dashboard");
        return;
      }
      const signed = await hasSignedCommitment();
      if (!mounted) return;
      router.replace(signed ? "/paywall" : "/commitment");
    };
    route();
    return () => {
      mounted = false;
    };
  }, [user, authLoading, router]);

  const onSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(readableError(e, "Échec de la connexion"));
    } finally {
      setLoading(false);
    }
  };

  const onReviewSignIn = async () => {
    if (!reviewUsername.trim() || !reviewPassword) return;
    setLoading(true);
    setError(null);
    try {
      await signInForReview(reviewUsername.trim(), reviewPassword);
    } catch (e: any) {
      setError(readableError(e, "Identifiants d'examen invalides"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.background}>
      <Image source={require("../assets/images/fitai-hero-progress-hd.png")} style={styles.backgroundImage} resizeMode="cover" />
      <LinearGradient
        colors={["rgba(8,16,12,0.30)", "rgba(6,24,14,0.18)", "rgba(3,8,5,0.90)"]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="login-screen">
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.heroLeaf}>
            <RotatingLeaf size={36} />
          </View>
          <View>
            <Text style={styles.brandText}>FIT AI</Text>
            <Text style={styles.brandSub}>Ton coach. Ton rythme. Tes résultats.</Text>
          </View>
        </View>
        <Text style={styles.eyebrow}>Commencer</Text>
        <Text style={styles.title}>{"Entre dans un parcours\nplus net, plus personnel."}</Text>
        <Text style={styles.subtitle}>
          {"Chaque écran prépare ton plan. Chaque donnée affine ton point de départ. L'expérience reste simple, mais la réflexion derrière ne l'est pas."}
        </Text>

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Expérience guidée</Text>
          <Text style={styles.previewValue}>Connexion, profil, protocole, déblocage Premium.</Text>
          <Text style={styles.previewNote}>Un seul fil visuel, une seule logique de progression.</Text>
        </View>

        <View style={{ flex: 1 }} />

        {displayError && (
          <View style={styles.errorBox} testID="login-error">
            <Ionicons name="alert-circle-outline" size={16} color={colors.alert} />
            <Text style={[typography.small, { color: colors.alert, flex: 1 }]}>{displayError}</Text>
          </View>
        )}

        <Button
          title="Continuer avec Google"
          onPress={onSignIn}
          loading={loading || authLoading}
          testID="login-google-button"
          icon={<Ionicons name="logo-google" size={18} color="#fff" />}
        />
        <TouchableOpacity
          onPress={() => setReviewOpen((value) => !value)}
          style={styles.reviewToggle}
          accessibilityRole="button"
          testID="login-review-toggle"
        >
          <Ionicons name="shield-checkmark-outline" size={15} color="rgba(255,255,255,0.68)" />
          <Text style={styles.reviewToggleText}>Accès examen Google Play</Text>
          <Ionicons name={reviewOpen ? "chevron-up" : "chevron-down"} size={15} color="rgba(255,255,255,0.68)" />
        </TouchableOpacity>
        {reviewOpen && (
          <View style={styles.reviewPanel} testID="login-review-panel">
            <TextInput
              value={reviewUsername}
              onChangeText={setReviewUsername}
              placeholder="Identifiant d'examen"
              placeholderTextColor="rgba(255,255,255,0.46)"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.reviewInput}
              testID="login-review-username"
            />
            <TextInput
              value={reviewPassword}
              onChangeText={setReviewPassword}
              placeholder="Mot de passe"
              placeholderTextColor="rgba(255,255,255,0.46)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.reviewInput}
              testID="login-review-password"
            />
            <Button
              title="Ouvrir le compte d'examen"
              onPress={onReviewSignIn}
              loading={loading}
              disabled={!reviewUsername.trim() || !reviewPassword}
              testID="login-review-submit"
              icon={<Ionicons name="key-outline" size={18} color="#fff" />}
            />
          </View>
        )}
        <Text style={styles.terms}>En continuant, tu acceptes nos conditions et notre politique de confidentialité.</Text>
        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL(`${BACKEND_URL}/terms`)} accessibilityRole="link">
            <Text style={styles.legalLink}>{"Conditions d'utilisation"}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL(`${BACKEND_URL}/privacy`)} accessibilityRole="link">
            <Text style={styles.legalLink}>Confidentialité</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function RotatingLeaf({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ rotate }] }}>
      <Ionicons name="leaf" size={Math.round(size * 0.66)} color={colors.primaryLight} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#06100B" },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", transform: [{ scale: 1.02 }] },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  heroLeaf: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.lg },
  brandText: { fontSize: 22, fontWeight: "600", color: colors.textMain, letterSpacing: 0.6 },
  brandSub: { color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 2, fontWeight: "400" },
  eyebrow: { color: "rgba(182,255,63,0.92)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.1 },
  title: { fontSize: 36, fontWeight: "600", color: colors.textMain, letterSpacing: 0, lineHeight: 40, marginTop: 8 },
  subtitle: { ...typography.body, color: "rgba(255,255,255,0.78)", marginTop: spacing.md, lineHeight: 23 },
  previewCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    padding: spacing.lg,
  },
  previewLabel: { color: "rgba(182,255,63,0.92)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.1 },
  previewValue: { fontSize: 22, fontWeight: "600", color: colors.textMain, marginTop: 8, lineHeight: 28 },
  previewNote: { color: "rgba(255,255,255,0.70)", fontSize: 14, marginTop: 10, lineHeight: 21 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  terms: { ...typography.small, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
  legalLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 },
  legalLink: { color: colors.primaryLight, fontSize: 12, lineHeight: 18, fontWeight: "700", textDecorationLine: "underline" },
  legalDot: { color: "rgba(255,255,255,0.45)" },
  reviewToggle: {
    minHeight: 42,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  reviewToggleText: { color: "rgba(255,255,255,0.68)", fontSize: 12, fontWeight: "600" },
  reviewPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(3,14,10,0.78)",
  },
  reviewInput: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.textMain,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
});
