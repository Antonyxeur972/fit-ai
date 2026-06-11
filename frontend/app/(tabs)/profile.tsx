import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { Card, SectionTitle, Stat, Button } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Profile = {
  weight_kg?: number; height_cm?: number; age?: number;
  goal?: string; gender?: string; activity_level?: string;
  bmr?: number; daily_calories?: number;
  protein_g?: number; carbs_g?: number; fat_g?: number;
  waist_cm?: number; neck_cm?: number; hips_cm?: number;
};

type BodyComp = {
  available: boolean;
  body_fat?: { percent: number; method: string; fat_kg: number; lean_kg: number; muscle_kg_est: number; has_measurements: boolean };
  strength?: { overall_score_pct: number; overall_tier: string; scores: { exercise: string; best_1rm: number; target_for_intermediate: number; ratio_bw: number; score_pct: number; tier: string }[] };
  muscle_groups?: { group: string; score_pct: number; status: string }[];
};

type TransfoLite = { id: string; view?: string };

const GOAL_LABEL: Record<string, string> = { lose: "Perte de gras", maintain: "Maintien", gain: "Prise de muscle" };
const MUSCLE_COLOR = (score: number) => score >= 100 ? colors.primary : score >= 50 ? "#F59E0B" : colors.alert;

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile>({});
  const [composition, setComposition] = useState<BodyComp | null>(null);
  const [transfoViews, setTransfoViews] = useState<{ front: boolean; back: boolean }>({ front: false, back: false });

  const [nameModal, setNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [measureModal, setMeasureModal] = useState(false);
  const [waist, setWaist] = useState("");
  const [neck, setNeck] = useState("");
  const [hips, setHips] = useState("");
  const [savingMeasures, setSavingMeasures] = useState(false);

  const [avatarOpen, setAvatarOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, transfos] = await Promise.all([
        api<Profile>("/profile"),
        api<BodyComp>("/body/composition").catch(() => ({ available: false } as BodyComp)),
        api<TransfoLite[]>("/transformations").catch(() => [] as TransfoLite[]),
      ]);
      setProfile(p);
      setWaist(String(p.waist_cm || ""));
      setNeck(String(p.neck_cm || ""));
      setHips(String(p.hips_cm || ""));
      setComposition(c);
      const views = { front: false, back: false };
      transfos.forEach((t) => {
        const v = (t.view || "front").toLowerCase();
        if (v === "front" || v === "side") views.front = true;
        if (v === "back") views.back = true;
      });
      // Default: show front if no photos uploaded yet
      if (!views.front && !views.back) views.front = true;
      setTransfoViews(views);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveName = async () => {
    const n = nameInput.trim();
    if (!n) return;
    setSavingName(true);
    try {
      await api("/auth/me", { method: "PUT", body: { name: n } });
      await refreshUser();
      setNameModal(false);
    } finally {
      setSavingName(false);
    }
  };

  const saveMeasures = async () => {
    setSavingMeasures(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          weight_kg: profile.weight_kg, height_cm: profile.height_cm, age: profile.age,
          gender: profile.gender, goal: profile.goal, activity_level: profile.activity_level,
          waist_cm: parseFloat(waist) || null,
          neck_cm: parseFloat(neck) || null,
          hips_cm: parseFloat(hips) || null,
        },
      });
      setMeasureModal(false);
      await load();
    } finally {
      setSavingMeasures(false);
    }
  };

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[typography.h3]}>{user?.name}</Text>
              <TouchableOpacity onPress={() => { setNameInput(user?.name || ""); setNameModal(true); }} testID="edit-name-button">
                <Ionicons name="pencil-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={typography.small}>{user?.email}</Text>
          </View>
        </View>

        {/* Body Avatar */}
        {composition?.available && composition.muscle_groups && (
          <Card testID="body-avatar-card">
            <SectionTitle title="Ton avatar de force" action={
              <TouchableOpacity onPress={() => setAvatarOpen(true)} testID="avatar-detail">
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Détails</Text>
              </TouchableOpacity>
            } />
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {transfoViews.front && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition.muscle_groups} view="front" />
                    <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: colors.textMuted }]}>Face</Text>
                  </View>
                )}
                {transfoViews.back && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition.muscle_groups} view="back" />
                    <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: colors.textMuted }]}>Dos</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {composition.muscle_groups.map((g) => (
                  <View key={g.group} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MUSCLE_COLOR(g.score_pct) }} />
                      <Text style={typography.small}>{g.group}</Text>
                    </View>
                    <Text style={[typography.small, { color: MUSCLE_COLOR(g.score_pct), fontWeight: "700" }]}>{g.score_pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
            {!transfoViews.back && (
              <Text style={[typography.small, { marginTop: spacing.sm, color: colors.textMuted, fontSize: 11 }]}>
                Ajoute une photo « Dos » dans Progression pour voir ton avatar de dos.
              </Text>
            )}
          </Card>
        )}

        {/* Body composition */}
        <Card testID="body-comp-card">
          <SectionTitle title="Composition corporelle" action={
            <TouchableOpacity onPress={() => setMeasureModal(true)} testID="edit-measures">
              <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>
                {composition?.body_fat?.has_measurements ? "Modifier" : "Mesurer"}
              </Text>
            </TouchableOpacity>
          } />
          {composition?.available && composition.body_fat ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
                <Stat label="% gras" value={composition.body_fat.percent} unit="%" testID="bf-percent" />
                <Stat label="Masse maigre" value={composition.body_fat.lean_kg} unit="kg" align="center" />
                <Stat label="Muscle estimé" value={composition.body_fat.muscle_kg_est} unit="kg" align="center" />
              </View>
              <Text style={[typography.small, { marginTop: 8, color: colors.textMuted }]}>
                Méthode : {composition.body_fat.method}
                {!composition.body_fat.has_measurements && " — Ajoute tour de taille + cou pour plus de précision."}
              </Text>
            </>
          ) : (
            <Text style={[typography.small, { marginTop: spacing.sm }]}>Profil incomplet.</Text>
          )}
        </Card>

        {/* Strength level */}
        {composition?.strength && (
          <Card testID="strength-card">
            <SectionTitle title="Niveau de force" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={styles.tierBadge}>
                <Text style={styles.tierText}>{composition.strength.overall_tier}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h2, { lineHeight: 32 }]}>
                  {composition.strength.overall_score_pct}<Text style={[typography.small, { fontSize: 14 }]}> /100</Text>
                </Text>
                <Text style={typography.small}>Score global vs benchmarks intermédiaire</Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {composition.strength.scores.filter((s) => s.best_1rm > 0).slice(0, 5).map((s) => (
                <View key={s.exercise} style={styles.scoreRow}>
                  <Text style={[typography.small, { flex: 1, color: colors.textMain, fontWeight: "600" }]} numberOfLines={1}>
                    {s.exercise}
                  </Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {s.best_1rm} / {s.target_for_intermediate} kg
                  </Text>
                  <View style={[styles.scoreBadge, { backgroundColor: MUSCLE_COLOR(s.score_pct) + "20" }]}>
                    <Text style={[typography.small, { color: MUSCLE_COLOR(s.score_pct), fontWeight: "800" }]}>{s.score_pct}%</Text>
                  </View>
                </View>
              ))}
              {composition.strength.scores.every((s) => s.best_1rm === 0) && (
                <Text style={typography.small}>Log tes premières perfs dans Training pour activer ton score.</Text>
              )}
            </View>
          </Card>
        )}

        <Card testID="profile-targets-card">
          <SectionTitle title="Tes objectifs" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Calories" value={profile.daily_calories?.toLocaleString("fr-FR") || "—"} unit="kcal" />
            <Stat label="BMR" value={profile.bmr?.toLocaleString("fr-FR") || "—"} unit="kcal" align="center" />
            <Stat label="Objectif" value={profile.goal ? GOAL_LABEL[profile.goal] || profile.goal : "—"} align="center" valueStyle={{ fontSize: 14 }} />
          </View>
        </Card>

        <Button
          title="Modifier mon profil"
          variant="secondary"
          onPress={() => router.push("/onboarding")}
          testID="edit-profile-button"
          icon={<Ionicons name="create-outline" size={18} color={colors.primary} />}
        />

        <TouchableOpacity onPress={signOut} style={styles.logout} testID="logout-button">
          <Ionicons name="log-out-outline" size={18} color={colors.alert} />
          <Text style={[typography.body, { color: colors.alert, fontWeight: "600" }]}>Déconnexion</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Edit name modal */}
      <Modal visible={nameModal} transparent animationType="slide" onRequestClose={() => setNameModal(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Modifier mon prénom</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Ton prénom"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
              testID="name-input"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Annuler" variant="secondary" onPress={() => setNameModal(false)} style={{ flex: 1 }} testID="name-cancel" />
              <Button title="Enregistrer" onPress={saveName} loading={savingName} style={{ flex: 1.4 }} testID="name-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Edit measurements modal */}
      <Modal visible={measureModal} transparent animationType="slide" onRequestClose={() => setMeasureModal(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Mesures (US Navy)</Text>
            <Text style={[typography.small, { marginTop: 4 }]}>
              Ces mesures permettent d&apos;estimer ton % de gras à ~3% près (vs ~5-7% avec Deurenberg).
            </Text>
            <Text style={[typography.caption, { marginTop: spacing.md }]}>Tour de taille (cm)</Text>
            <TextInput value={waist} onChangeText={(t) => setWaist(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} placeholder="85" placeholderTextColor={colors.textMuted} testID="waist-input" />
            <Text style={[typography.caption, { marginTop: spacing.md }]}>Tour de cou (cm)</Text>
            <TextInput value={neck} onChangeText={(t) => setNeck(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} placeholder="38" placeholderTextColor={colors.textMuted} testID="neck-input" />
            {profile.gender === "female" && (
              <>
                <Text style={[typography.caption, { marginTop: spacing.md }]}>Tour de hanches (cm) — requis pour femmes</Text>
                <TextInput value={hips} onChangeText={(t) => setHips(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" style={styles.input} placeholder="95" placeholderTextColor={colors.textMuted} testID="hips-input" />
              </>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setMeasureModal(false)} style={{ flex: 1 }} testID="measure-cancel" />
              <Button title="Enregistrer" onPress={saveMeasures} loading={savingMeasures} style={{ flex: 1.4 }} testID="measure-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      {/* Avatar detail modal */}
      <Modal visible={avatarOpen} transparent animationType="slide" onRequestClose={() => setAvatarOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Diagnostic musculaire</Text>
              <TouchableOpacity onPress={() => setAvatarOpen(false)} testID="avatar-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.lg, marginBottom: spacing.lg }}>
                {transfoViews.front && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition?.muscle_groups || []} size={180} view="front" />
                    <Text style={[typography.small, { marginTop: 4, color: colors.textSecondary, fontWeight: "600" }]}>Face</Text>
                  </View>
                )}
                {transfoViews.back && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition?.muscle_groups || []} size={180} view="back" />
                    <Text style={[typography.small, { marginTop: 4, color: colors.textSecondary, fontWeight: "600" }]}>Dos</Text>
                  </View>
                )}
              </View>
              {composition?.muscle_groups?.map((g) => (
                <View key={g.group} style={styles.diagRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.body, { fontWeight: "700" }]}>{g.group}</Text>
                    <Text style={[typography.small, { color: MUSCLE_COLOR(g.score_pct) }]}>
                      {g.status === "fort" ? "✓ Niveau solide" : g.status === "moyen" ? "Continue à pousser" : "À développer en priorité"}
                    </Text>
                  </View>
                  <Text style={[typography.h3, { color: MUSCLE_COLOR(g.score_pct) }]}>{g.score_pct}%</Text>
                </View>
              ))}
              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Stylized body avatar with colored muscle zones (front OR back view)
function BodyAvatar({ groups, size = 110, view = "front" }: { groups: { group: string; score_pct: number }[]; size?: number; view?: "front" | "back" }) {
  const get = (g: string) => MUSCLE_COLOR(groups.find((x) => x.group === g)?.score_pct || 0);
  const w = size, h = size * 1.6;
  const isBack = view === "back";
  return (
    <Svg width={w} height={h} viewBox="0 0 100 160">
      <Defs>
        <LinearGradient id={`bodyBg-${view}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F5F5F0" />
          <Stop offset="1" stopColor="#EBEBE6" />
        </LinearGradient>
      </Defs>
      {/* Body silhouette outline (same for both views) */}
      <Path
        d="M50 6 C 58 6, 60 14, 60 18 C 60 22, 58 26, 50 26 C 42 26, 40 22, 40 18 C 40 14, 42 6, 50 6 Z
           M 38 30 L 62 30 L 70 38 L 78 60 L 76 64 L 70 56 L 68 70 L 70 92 L 67 130 L 63 150 L 56 150 L 54 110 L 50 110 L 46 110 L 44 150 L 37 150 L 33 130 L 30 92 L 32 70 L 30 56 L 24 64 L 22 60 L 30 38 L 38 30 Z"
        fill={`url(#bodyBg-${view})`}
        stroke="#D5D5CE"
        strokeWidth="1"
      />

      {isBack ? (
        <>
          {/* BACK VIEW */}
          {/* Trapèze / haut du dos (Épaules) */}
          <Path d="M 42 30 L 50 28 L 58 30 L 56 38 L 50 36 L 44 38 Z" fill={get("Épaules")} opacity="0.85" />
          {/* Deltoïdes arrière */}
          <Path d="M 32 36 L 30 50 L 38 44 L 39 36 Z" fill={get("Épaules")} opacity="0.85" />
          <Path d="M 68 36 L 70 50 L 62 44 L 61 36 Z" fill={get("Épaules")} opacity="0.85" />
          {/* Grand dorsal (large) */}
          <Path d="M 38 40 L 62 40 L 64 70 L 50 78 L 36 70 Z" fill={get("Dos")} opacity="0.9" />
          {/* Triceps (Bras) */}
          <Path d="M 26 52 L 22 70 L 26 72 L 30 56 Z" fill={get("Bras")} opacity="0.85" />
          <Path d="M 74 52 L 78 70 L 74 72 L 70 56 Z" fill={get("Bras")} opacity="0.85" />
          {/* Lombaire (Core) */}
          <Path d="M 44 78 L 56 78 L 56 90 L 44 90 Z" fill={get("Core")} opacity="0.7" />
          {/* Fessiers + ischios (Jambes) */}
          <Path d="M 36 90 L 50 92 L 36 130 L 32 130 Z" fill={get("Jambes")} opacity="0.85" />
          <Path d="M 64 90 L 50 92 L 64 130 L 68 130 Z" fill={get("Jambes")} opacity="0.85" />
          <Path d="M 36 130 L 33 148 L 40 148 L 44 130 Z" fill={get("Jambes")} opacity="0.7" />
          <Path d="M 64 130 L 67 148 L 60 148 L 56 130 Z" fill={get("Jambes")} opacity="0.7" />
        </>
      ) : (
        <>
          {/* FRONT VIEW */}
          {/* Shoulders/Épaules */}
          <Path d="M 36 30 L 32 36 L 28 50 L 38 38 Z" fill={get("Épaules")} opacity="0.85" />
          <Path d="M 64 30 L 68 36 L 72 50 L 62 38 Z" fill={get("Épaules")} opacity="0.85" />
          {/* Pectoraux */}
          <Path d="M 39 32 L 50 36 L 61 32 L 60 50 L 50 54 L 40 50 Z" fill={get("Pectoraux")} opacity="0.85" />
          {/* Bras (biceps) */}
          <Path d="M 27 50 L 23 70 L 26 72 L 30 56 Z" fill={get("Bras")} opacity="0.85" />
          <Path d="M 73 50 L 77 70 L 74 72 L 70 56 Z" fill={get("Bras")} opacity="0.85" />
          {/* Core / abdo */}
          <Path d="M 42 56 L 58 56 L 58 78 L 42 78 Z" fill={get("Core")} opacity="0.85" />
          {/* Dos (side lines / obliques) */}
          <Path d="M 33 38 L 30 56 L 32 70 L 36 56 Z" fill={get("Dos")} opacity="0.5" />
          <Path d="M 67 38 L 70 56 L 68 70 L 64 56 Z" fill={get("Dos")} opacity="0.5" />
          {/* Jambes */}
          <Path d="M 36 92 L 33 130 L 37 148 L 44 148 L 46 110 L 42 92 Z" fill={get("Jambes")} opacity="0.85" />
          <Path d="M 64 92 L 67 130 L 63 148 L 56 148 L 54 110 L 58 92 Z" fill={get("Jambes")} opacity="0.85" />
        </>
      )}

      {/* Head detail */}
      <Circle cx="50" cy="18" r="9" fill="#E8E8E0" stroke="#D5D5CE" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  userHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: radius.full },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, marginTop: spacing.md },
  tierBadge: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: radius.full },
  tierText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, minWidth: 50, alignItems: "center" },
  diagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textMain, marginTop: 6 },
});
