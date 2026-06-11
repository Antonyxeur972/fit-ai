import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Card, ProgressRing, MacroBar, SectionTitle, Stat } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type DashboardData = {
  date: string;
  target_calories: number;
  consumed_calories: number;
  remaining_calories: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number; protein_target: number; carbs_target: number; fat_target: number };
  burned: { bmr: number; steps: number; cardio: number; workout: number; total: number };
  activity: { steps: number; cardio_minutes: number };
  workout: { title?: string; focus?: string; completed?: boolean; duration_min?: number } | null;
  meals_count: number;
  balance: number;
};

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<DashboardData>("/dashboard/day");
      setData(d);
    } catch (e) {
      console.warn("dashboard load", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={[typography.body, { padding: spacing.lg }]}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  const progress = data.target_calories > 0 ? data.consumed_calories / data.target_calories : 0;
  const over = data.consumed_calories > data.target_calories;
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={typography.caption}>{today}</Text>
            <Text style={styles.hello}>Salut {user?.name?.split(" ")[0]}</Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="leaf" size={20} color={colors.primary} />
          </View>
        </View>

        {/* Calorie ring */}
        <Card style={{ alignItems: "center", paddingVertical: spacing.xl }} testID="dashboard-calorie-card">
          <ProgressRing progress={progress} size={200} stroke={16} color={over ? colors.alert : colors.primary}>
            <Text style={typography.caption}>Restant</Text>
            <Text style={styles.bigNumber}>{Math.max(0, data.remaining_calories)}</Text>
            <Text style={[typography.small, { color: colors.textSecondary }]}>
              {data.consumed_calories} / {data.target_calories} kcal
            </Text>
          </ProgressRing>
          {over && (
            <View style={styles.overTag}>
              <Ionicons name="alert-circle" size={14} color={colors.alert} />
              <Text style={[typography.small, { color: colors.alert, fontWeight: "600" }]}>
                Tu as dépassé ton objectif de {data.consumed_calories - data.target_calories} kcal
              </Text>
            </View>
          )}
        </Card>

        {/* Macros */}
        <Card testID="dashboard-macros-card">
          <SectionTitle title="Macros aujourd'hui" />
          <MacroBar
            label="Protéines"
            current={data.macros.protein_g}
            target={data.macros.protein_target}
            color={colors.primary}
            testID="macro-protein"
          />
          <MacroBar
            label="Glucides"
            current={data.macros.carbs_g}
            target={data.macros.carbs_target}
            color={colors.primaryLight}
            testID="macro-carbs"
          />
          <MacroBar
            label="Lipides"
            current={data.macros.fat_g}
            target={data.macros.fat_target}
            color="#86C99A"
            testID="macro-fat"
          />
        </Card>

        {/* Energy balance */}
        <Card testID="dashboard-burned-card">
          <SectionTitle title="Dépense énergétique" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md }}>
            <Stat label="Brûlées" value={data.burned.total.toLocaleString("fr-FR")} unit="kcal" />
            <Stat
              label="Balance"
              value={(data.balance >= 0 ? "+" : "") + data.balance}
              unit="kcal"
              align="center"
              valueStyle={{ color: data.balance < 0 ? colors.primary : colors.alert }}
            />
          </View>
          <View style={styles.burnedGrid}>
            <BurnRow icon="flame-outline" label="Métabolisme" value={data.burned.bmr} />
            <BurnRow icon="walk-outline" label="Pas" value={data.burned.steps} />
            <BurnRow icon="heart-outline" label="Cardio" value={data.burned.cardio} />
            <BurnRow icon="barbell-outline" label="Entraînement" value={data.burned.workout} />
          </View>
        </Card>

        {/* Today's workout */}
        <Card testID="dashboard-workout-card">
          <SectionTitle title="Séance du jour" />
          {data.workout && data.workout.title ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/(tabs)/training")}
              style={styles.workoutRow}
            >
              <LinearGradient
                colors={["#2D7C3E", "#4ADE80"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.workoutBadge}
              >
                <Ionicons name="barbell" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.workoutTitle}>
                  {data.workout.title} · {data.workout.focus}
                </Text>
                <Text style={typography.small}>{data.workout.duration_min} min · {data.workout.completed ? "Terminée" : "À faire"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push("/(tabs)/training")} style={{ marginTop: spacing.sm }}>
              <Text style={[typography.body, { color: colors.primary, fontWeight: "600" }]}>
                Génère ton programme →
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Activity quick */}
        <Card testID="dashboard-activity-card">
          <SectionTitle title="Activité" action={
            <TouchableOpacity onPress={() => router.push("/(tabs)/training")} testID="dashboard-activity-edit">
              <Text style={[typography.small, { color: colors.primary, fontWeight: "600" }]}>Modifier</Text>
            </TouchableOpacity>
          } />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Stat label="Pas" value={data.activity.steps.toLocaleString("fr-FR")} testID="activity-steps" />
            <Stat label="Cardio" value={data.activity.cardio_minutes} unit="min" align="center" testID="activity-cardio" />
            <Stat label="Repas" value={data.meals_count} align="center" testID="activity-meals" />
          </View>
        </Card>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function BurnRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.burnRow}>
      <View style={styles.burnIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[typography.body, { flex: 1, color: colors.textMain }]}>{label}</Text>
      <Text style={[typography.body, { fontWeight: "600" }]}>{value.toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  hello: { fontSize: 26, fontWeight: "700", color: colors.textMain, letterSpacing: -0.4, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center",
  },
  bigNumber: { fontSize: 44, fontWeight: "800", color: colors.textMain, letterSpacing: -1.2 },
  overTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, marginTop: spacing.md,
  },
  burnedGrid: { gap: spacing.sm },
  burnRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  burnIcon: { width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  workoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  workoutBadge: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  workoutTitle: { fontSize: 15, fontWeight: "600", color: colors.textMain },
});
