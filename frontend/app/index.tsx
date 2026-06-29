import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { hasSignedCommitment } from "@/src/lib/commitment";
import { getSubscriptionState } from "@/src/lib/subscription";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    let mounted = true;
    const route = async () => {
      if (loading) return;
      if (!user) {
        router.replace("/login");
        return;
      }
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
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
