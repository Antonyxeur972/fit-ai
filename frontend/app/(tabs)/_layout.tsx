import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useSubscription } from "@/src/subscription";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, loading, ready } = useSubscription();

  // If the subscription expires/is cancelled while the user is already
  // inside the app, send them back to the paywall instead of leaving them
  // with access they no longer pay for.
  useEffect(() => {
    if (!ready || loading || isPro) return;
    router.replace("/paywall/offer");
  }, [ready, loading, isPro, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,      // #4ADE80 bright green
        tabBarInactiveTintColor: "rgba(255,255,255,0.38)",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
        tabBarStyle: {
          backgroundColor: "rgba(6,15,9,0.97)",
          borderTopColor: "rgba(74,222,128,0.15)",
          borderTopWidth: 1,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Aujourd'hui",
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-dashboard",
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: "Repas",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-meals",
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-training",
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Challenges",
          tabBarIcon: ({ color, size }) => <Ionicons name="flame-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-challenges",
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progression",
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-progress",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
