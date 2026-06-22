import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { useSubscription } from "@/src/subscription";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isPro, loading: subLoading, ready: subReady } = useSubscription();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.onboarded) {
      router.replace("/onboarding");
      return;
    }
    if (subReady && subLoading) return; // wait for entitlement check before gating
    if (subReady && !isPro) {
      router.replace(user.pact_signed ? "/paywall/offer" : "/paywall/motivation");
      return;
    }
    router.replace("/(tabs)/dashboard");
  }, [user, loading, isPro, subLoading, subReady, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
