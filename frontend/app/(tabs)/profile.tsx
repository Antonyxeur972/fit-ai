import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Card, SectionTitle, Stat, Button } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Profile = {
  weight_kg?: number; height_cm?: number; age?: number;
  goal?: string; gender?: string; activity_level?: string;
  bmr?: number; daily_calories?: number;
  protein_g?: number; carbs_g?: number; fat_g?: number;
};

const GOAL_LABEL: Record<string, string> = {
  lose: "Perte de gras",
  maintain: "Maintien",
  gain: "Prise de muscle",
};

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile>({});

  const load = useCallback(async () => {
    try {
      const p = await api<Profile>("/profile");
      setProfile(p);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.userHeader}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" size={28} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[typography.h3]}>{user?.name}</Text>
            <Text style={typography.small}>{user?.email}</Text>
          </View>
        </View>

        <Card testID="profile-targets-card">
          <SectionTitle title="Tes objectifs" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Calories" value={profile.daily_calories?.toLocaleString("fr-FR") || "—"} unit="kcal" />
            <Stat label="BMR" value={profile.bmr?.toLocaleString("fr-FR") || "—"} unit="kcal" align="center" />
            <Stat label="Objectif" value={profile.goal ? GOAL_LABEL[profile.goal] || profile.goal : "—"} align="center" valueStyle={{ fontSize: 14 }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Stat label="Protéines" value={profile.protein_g || "—"} unit="g" />
            <Stat label="Glucides" value={profile.carbs_g || "—"} unit="g" align="center" />
            <Stat label="Lipides" value={profile.fat_g || "—"} unit="g" align="center" />
          </View>
        </Card>

        <Card testID="profile-measures-card">
          <SectionTitle title="Mesures" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Poids" value={profile.weight_kg || "—"} unit="kg" />
            <Stat label="Taille" value={profile.height_cm || "—"} unit="cm" align="center" />
            <Stat label="Âge" value={profile.age || "—"} unit="ans" align="center" />
          </View>
        </Card>

        <Button
          title="Modifier mon profil"
          variant="secondary"
          onPress={() => router.push("/onboarding")}
          testID="edit-profile-button"
          icon={<Ionicons name="create-outline" size={18} color={colors.primary} />}
        />

        <View style={{ height: spacing.md }} />

        <Card>
          <View style={styles.philoBox}>
            <Ionicons name="leaf" size={20} color={colors.primary} style={{ marginBottom: spacing.sm }} />
            <Text style={[typography.body, { color: colors.textMain, fontWeight: "600", fontStyle: "italic" }]}>
              {'"Arrête de chercher la solution magique. Les données ne mentent pas. Mange bien, entraîne-toi, progresse."'}
            </Text>
          </View>
        </Card>

        <TouchableOpacity onPress={signOut} style={styles.logout} testID="logout-button">
          <Ionicons name="log-out-outline" size={18} color={colors.alert} />
          <Text style={[typography.body, { color: colors.alert, fontWeight: "600" }]}>Déconnexion</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  userHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: radius.full },
  philoBox: { alignItems: "flex-start" },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: spacing.md, marginTop: spacing.md,
  },
});
