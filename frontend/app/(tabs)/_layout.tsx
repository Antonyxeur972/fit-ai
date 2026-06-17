import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors, radius } from "@/src/theme";

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const TAB_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
    dashboard: { icon: "pulse-outline", label: "Accueil" },
    meals: { icon: "restaurant-outline", label: "Repas" },
    progress: { icon: "trending-up-outline", label: "Progression" },
    profile: { icon: "person-outline", label: "Profil" },
  };

  // Visible tabs (exclude challenges from bar)
  const visibleRoutes = state.routes.filter((r) => r.name !== "challenges" && r.name !== "training");

  // Insert FAB in middle (after meals, before progress)
  const leftTabs = visibleRoutes.filter((r) => r.name === "dashboard" || r.name === "meals");
  const rightTabs = visibleRoutes.filter((r) => r.name === "progress" || r.name === "profile");

  const renderTab = (route: typeof state.routes[0]) => {
    const { options } = descriptors[route.key];
    const isFocused = state.routes[state.index]?.name === route.name;
    const cfg = TAB_CONFIG[route.name];
    if (!cfg) return null;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        style={styles.tab}
        testID={options.tabBarButtonTestID}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
      >
        <Ionicons
          name={cfg.icon}
          size={22}
          color={isFocused ? colors.primary : "rgba(255,255,255,0.38)"}
        />
        <Text style={[styles.tabLabel, { color: isFocused ? colors.primary : "rgba(255,255,255,0.38)" }]}>
          {cfg.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom, height: 64 + insets.bottom }]}>
      <View style={styles.inner}>
        {/* Left tabs */}
        {leftTabs.map(renderTab)}

        {/* Central FAB */}
        <View style={styles.fabWrapper}>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/training")}
            style={styles.fab}
            testID="tab-training"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Right tabs */}
        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(4,12,6,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    flex: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  fabWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Accueil",
          tabBarButtonTestID: "tab-dashboard",
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: "Repas",
          tabBarButtonTestID: "tab-meals",
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
          tabBarButtonTestID: "tab-training",
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Challenges",
          tabBarButtonTestID: "tab-challenges",
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progression",
          tabBarButtonTestID: "tab-progress",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
