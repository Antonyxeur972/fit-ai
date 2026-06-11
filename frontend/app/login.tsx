import { useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { Button } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const onSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="login-screen">
      <LinearGradient
        colors={["#E8F5E9", "#FAFAF8", "#FAFAF8"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.7 }}
      />
      <View style={styles.container}>
        <View style={styles.heroLeaf}>
          <Ionicons name="leaf" size={28} color={colors.primary} />
        </View>
        <Text style={typography.caption}>Performance over motivation</Text>
        <Text style={styles.title}>{"Les données\nne mentent pas."}</Text>
        <Text style={styles.subtitle}>
          {"Une app fitness qui te montre exactement où tu en es, et où tu vas. Pas de bullshit motivationnel. Que des données réelles."}
        </Text>

        <View style={styles.previewCard}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1518617840859-acd542e13a99?crop=entropy&cs=srgb&fm=jpg&w=900&q=80" }}
            style={styles.previewImg}
          />
          <View style={styles.previewOverlay}>
            <Text style={styles.previewLabel}>{"Aujourd'hui"}</Text>
            <Text style={styles.previewValue}>1 847 <Text style={styles.previewUnit}>/ 2 200 kcal</Text></Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <Button
          title="Continuer avec Google"
          onPress={onSignIn}
          loading={loading}
          testID="login-google-button"
          icon={<Ionicons name="logo-google" size={18} color="#fff" />}
        />
        <Text style={styles.terms}>
          {"En continuant, tu acceptes nos conditions d'utilisation. Tes données restent privées."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  heroLeaf: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { fontSize: 40, fontWeight: "800", color: colors.textMain, letterSpacing: -1.2, lineHeight: 44, marginTop: 4 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, lineHeight: 22 },
  previewCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImg: { width: "100%", height: 140 },
  previewOverlay: { padding: spacing.md, backgroundColor: colors.surface },
  previewLabel: { ...typography.caption },
  previewValue: { fontSize: 24, fontWeight: "700", color: colors.textMain, marginTop: 4 },
  previewUnit: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
  terms: { ...typography.small, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.md },
});
