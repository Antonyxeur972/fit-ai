import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { Button } from "@/src/components/UI";
import { hasSignedCommitment } from "@/src/lib/commitment";
import { getSubscriptionState } from "@/src/lib/subscription";
import { colors, spacing, typography, radius } from "@/src/theme";

export default function Login() {
  const router = useRouter();
  const { signInWithGoogle, user, loading: authLoading, authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const subscription = await getSubscriptionState();
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
      setError(e?.message || "Échec de la connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/fitai-hero-activities-hd.png")}
      style={styles.background}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
    >
      <LinearGradient
        colors={["rgba(8,16,12,0.30)", "rgba(6,24,14,0.18)", "rgba(3,8,5,0.90)"]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="login-screen">
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.heroLeaf}>
            <Ionicons name="leaf" size={24} color={colors.primaryLight} />
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
        <Text style={styles.terms}>
          {"En continuant, tu acceptes nos conditions d'utilisation. Tes données restent privées."}
        </Text>
      </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#06100B" },
  backgroundImage: { transform: [{ scale: 1.02 }] },
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
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
});
