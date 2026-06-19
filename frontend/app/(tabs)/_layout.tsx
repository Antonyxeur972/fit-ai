import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: "rgba(255,255,255,0.58)",
        tabBarLabelStyle: { fontSize: 9, fontWeight: "700", letterSpacing: 0 },
        tabBarStyle: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 10,
          backgroundColor: "rgba(3,14,10,0.93)",
          borderTopColor: "rgba(182,255,63,0.16)",
          borderTopWidth: 1,
          height: 66 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          borderRadius: 22,
          marginHorizontal: 10,
          shadowColor: "#000",
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
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
          title: "Programme",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          tabBarButtonTestID: "tab-training",
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: "Activités",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name="add"
              size={34}
              color="#071207"
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                lineHeight: 52,
                textAlign: "center",
                marginTop: -20,
                backgroundColor: focused ? colors.primaryLight : colors.primary,
                overflow: "hidden",
              }}
            />
          ),
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
