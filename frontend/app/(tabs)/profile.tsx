import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, TextInput, Modal, Switch, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { GlassCard, ScreenBg, Stat, Button } from "@/src/components/UI";
import { Silhouette, SILHOUETTE_LABELS } from "@/src/components/Silhouette";
import { SilhouettePicker } from "@/src/components/SilhouettePicker";
import { Mascot, MascotAnimal, MASCOT_LABELS } from "@/src/components/Mascot";
import { MascotPicker } from "@/src/components/MascotPicker";
import { StrengthSymbol } from "@/src/components/StrengthSymbol";
import { scheduleReminders, Reminder } from "@/src/lib/notifications";
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

const BG_URI = "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&q=90";

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

  // Phase 4: silhouette edit modal
  const [silhouetteModal, setSilhouetteModal] = useState(false);
  const [silSex, setSilSex] = useState<"male" | "female">("male");
  const [silLevel, setSilLevel] = useState(3);
  const [savingSil, setSavingSil] = useState(false);

  // Phase 4: 1RM estimate modal
  const [forceModal, setForceModal] = useState(false);
  const [squatKg, setSquatKg] = useState("");
  const [squatReps, setSquatReps] = useState("");
  const [benchKg, setBenchKg] = useState("");
  const [benchReps, setBenchReps] = useState("");
  const [dlKg, setDlKg] = useState("");
  const [dlReps, setDlReps] = useState("");
  const [savingForce, setSavingForce] = useState(false);

  // Phase 5: Mascot modal
  const [mascotModal, setMascotModal] = useState(false);
  const [pickedMascot, setPickedMascot] = useState<MascotAnimal | null>(null);
  const [savingMascot, setSavingMascot] = useState(false);

  // Phase 5: Notification reminders
  const [notifModal, setNotifModal] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [savingReminders, setSavingReminders] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Phase 5: Points
  const [points, setPoints] = useState<{
    level: number; points_total: number; points_in_level: number; level_span: number; evolution: 1 | 2 | 3; points_today: number; streak_days: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, transfos, ps] = await Promise.all([
        api<Profile>("/profile"),
        api<BodyComp>("/body/composition").catch(() => ({ available: false } as BodyComp)),
        api<TransfoLite[]>("/transformations").catch(() => [] as TransfoLite[]),
        api<any>("/points/summary").catch(() => null),
      ]);
      setProfile(p);
      setWaist(String(p.waist_cm || ""));
      setNeck(String(p.neck_cm || ""));
      setHips(String(p.hips_cm || ""));
      setComposition(c);
      setPoints(ps);
      const views = { front: false, back: false };
      transfos.forEach((t) => {
        const v = (t.view || "front").toLowerCase();
        if (v === "front" || v === "side") views.front = true;
        if (v === "back") views.back = true;
      });
      if (!views.front && !views.back) views.front = true;
      setTransfoViews(views);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sync reminders local state from user notif_prefs
  useEffect(() => {
    if (user?.notif_prefs?.reminders) {
      setReminders(user.notif_prefs.reminders);
    }
  }, [user?.notif_prefs]);

  // sync silhouette modal seed values with currently-stored user data
  const openSilhouette = () => {
    setSilSex((user?.silhouette?.sex as any) || (profile.gender as any) || "male");
    setSilLevel(user?.silhouette?.level || 3);
    setSilhouetteModal(true);
  };

  const saveSilhouette = async () => {
    setSavingSil(true);
    try {
      await api("/users/me/silhouette", {
        method: "PUT",
        body: { sex: silSex, level: silLevel },
      });
      await refreshUser();
      setSilhouetteModal(false);
    } finally {
      setSavingSil(false);
    }
  };

  const openForce = () => {
    setSquatKg(""); setSquatReps("");
    setBenchKg(""); setBenchReps("");
    setDlKg(""); setDlReps("");
    setForceModal(true);
  };

  const saveForce = async () => {
    setSavingForce(true);
    try {
      await api("/workouts/estimate-1rm", {
        method: "POST",
        body: {
          squat_kg: parseFloat(squatKg) || null,
          squat_reps: parseInt(squatReps, 10) || null,
          bench_kg: parseFloat(benchKg) || null,
          bench_reps: parseInt(benchReps, 10) || null,
          deadlift_kg: parseFloat(dlKg) || null,
          deadlift_reps: parseInt(dlReps, 10) || null,
        },
      });
      await refreshUser();
      await load();
      setForceModal(false);
    } finally {
      setSavingForce(false);
    }
  };

  // Phase 5: mascot save
  const openMascot = () => {
    setPickedMascot((user?.mascot?.animal as MascotAnimal) || null);
    setMascotModal(true);
  };
  const saveMascot = async () => {
    if (!pickedMascot) return;
    setSavingMascot(true);
    try {
      await api("/users/me/mascot", { method: "PUT", body: { animal: pickedMascot } });
      await refreshUser();
      setMascotModal(false);
    } finally {
      setSavingMascot(false);
    }
  };

  // Phase 5: notification reminders
  const addReminder = (kind: "workout" | "protein") => {
    const id = `tmp_${Date.now()}`;
    setReminders((arr) => [
      ...arr,
      {
        id, kind, hour: kind === "protein" ? 21 : 19, minute: kind === "protein" ? 30 : 0,
        enabled: true, days_of_week: [0, 1, 2, 3, 4, 5, 6], label: null,
      },
    ]);
  };
  const updateReminder = (id: string, patch: Partial<Reminder>) => {
    setReminders((arr) => arr.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeReminder = (id: string) => {
    setReminders((arr) => arr.filter((r) => r.id !== id));
  };
  const saveReminders = async () => {
    setSavingReminders(true);
    try {
      await api("/users/me/notif-prefs", {
        method: "PUT",
        body: { reminders },
      });
      await refreshUser();
      try {
        await scheduleReminders(reminders as Reminder[]);
      } catch (e) {
        console.warn("scheduleReminders", e);
      }
      setNotifModal(false);
    } finally {
      setSavingReminders(false);
    }
  };

  const evolution: 1 | 2 | 3 = (points?.evolution || 1) as 1 | 2 | 3;
  const strengthVal = points && points.level_span > 0 ? Math.min(1, points.points_in_level / points.level_span) : 0.3;

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
    <ScreenBg uri={BG_URI}>
    <SafeAreaView style={{flex:1, backgroundColor:"transparent"}} edges={["top"]} testID="profile-screen">
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
              <Text style={[typography.h3, {color:"#fff"}]}>{user?.name}</Text>
              <TouchableOpacity onPress={() => { setNameInput(user?.name || ""); setNameModal(true); }} testID="edit-name-button">
                <Ionicons name="pencil-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>{user?.email}</Text>
          </View>
        </View>

        {/* Phase 5: Mascot + Strength symbol */}
        <GlassCard testID="mascot-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Ta mascotte</Text>
            <TouchableOpacity onPress={openMascot} testID="edit-mascot">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>
                {user?.mascot ? "Changer" : "Choisir"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
            {user?.mascot?.animal ? (
              <Mascot animal={user.mascot.animal} evolution={evolution} size={88} color={colors.primary} strokeWidth={2} />
            ) : (
              <View style={[styles.mascotPlaceholder]}>
                <Ionicons name="paw-outline" size={32} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, {color:"#fff"}]}>
                {user?.mascot?.animal ? MASCOT_LABELS[user.mascot.animal as MascotAnimal] : "Pas encore choisie"}
              </Text>
              <Text style={[typography.small, { marginTop: 2, color:"rgba(255,255,255,0.6)" }]}>
                Elle évolue avec ta force, sans afficher un niveau chiffré.
              </Text>
            </View>
            <StrengthSymbol size={56} evolution={evolution} strength={strengthVal} />
          </View>
          {points && points.points_today > 0 ? (
            <Text style={[typography.small, { marginTop: spacing.md, color: "#4ade80", fontWeight: "800" }]}>
              +{points.points_today} pts aujourd&apos;hui · streak {points.streak_days}j
            </Text>
          ) : null}
        </GlassCard>

        {/* Phase 5: Notifications */}
        <GlassCard testID="notif-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Rappels & notifs</Text>
            <TouchableOpacity onPress={() => setNotifModal(true)} testID="edit-notifs">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>
                Gérer
              </Text>
            </TouchableOpacity>
          </View>
          {reminders.length === 0 ? (
            <Text style={[typography.small, { marginTop: spacing.sm, color: "rgba(255,255,255,0.4)" }]}>
              Aucun rappel programmé. Crée tes propres horaires pour séance et check protéines.
            </Text>
          ) : (
            <View style={{ marginTop: spacing.sm, gap: 8 }}>
              {reminders.map((r) => (
                <View key={r.id} style={styles.notifRow}>
                  <Ionicons name={r.kind === "workout" ? "barbell-outline" : "nutrition-outline"} size={16} color={r.enabled ? "#4ade80" : "rgba(255,255,255,0.4)"} />
                  <Text style={[typography.body, { flex: 1, color: r.enabled ? "#fff" : "rgba(255,255,255,0.4)" }]}>
                    {r.kind === "workout" ? "Séance" : "Check protéines"} · {String(r.hour).padStart(2, "0")}:{String(r.minute).padStart(2, "0")}
                  </Text>
                  <View style={[styles.notifPill, { backgroundColor: r.enabled ? colors.primary : colors.border }]}>
                    <Text style={{ color: r.enabled ? "#fff" : colors.textMuted, fontSize: 10, fontWeight: "800" }}>
                      {r.enabled ? "ON" : "OFF"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {/* Silhouette + 1RM card (Phase 4) */}
        <GlassCard testID="silhouette-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Ta silhouette</Text>
            <TouchableOpacity onPress={openSilhouette} testID="edit-silhouette">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>
                {user?.silhouette ? "Modifier" : "Choisir"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
            <Silhouette
              sex={(user?.silhouette?.sex as any) || (profile.gender as any) || "male"}
              level={user?.silhouette?.level || 3}
              size={90}
              active
            />
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, {color:"#fff"}]}>
                {SILHOUETTE_LABELS[user?.silhouette?.level || 3]}
              </Text>
              <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>
                Niveau {user?.silhouette?.level || 3} sur 5 ·{" "}
                {(user?.silhouette?.sex || profile.gender) === "female" ? "Femme" : "Homme"}
              </Text>
              <Text style={[typography.small, { marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.4)" }]}>
                {user?.silhouette
                  ? "Mise à jour rapide depuis ce profil."
                  : "Indique ta morphologie actuelle pour personnaliser tes objectifs."}
              </Text>
            </View>
          </View>
        </GlassCard>

        <GlassCard testID="force-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Mes 1RM estimés</Text>
            <TouchableOpacity onPress={openForce} testID="edit-force">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>
                {user?.force_metrics?.squat || user?.force_metrics?.bench || user?.force_metrics?.deadlift ? "Mettre à jour" : "Estimer"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Squat" value={user?.force_metrics?.squat ? user.force_metrics.squat.toFixed(0) : "—"} unit="kg" testID="force-squat" />
            <Stat label="Bench" value={user?.force_metrics?.bench ? user.force_metrics.bench.toFixed(0) : "—"} unit="kg" align="center" testID="force-bench" />
            <Stat label="Deadlift" value={user?.force_metrics?.deadlift ? user.force_metrics.deadlift.toFixed(0) : "—"} unit="kg" align="center" testID="force-dl" />
          </View>
          {!user?.force_metrics?.squat && !user?.force_metrics?.bench && !user?.force_metrics?.deadlift && (
            <Text style={[typography.small, { marginTop: 8, color: "rgba(255,255,255,0.4)" }]}>
              Renseigne tes meilleurs efforts (charge × reps) pour calculer ton 1RM Epley. Tu peux aussi les enregistrer pendant tes séances dans Training.
            </Text>
          )}
        </Card>

        {/* Body Avatar */}
        {composition?.available && composition.muscle_groups && (
          <GlassCard testID="body-avatar-card">
            <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
              <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Ton avatar de force</Text>
              <TouchableOpacity onPress={() => setAvatarOpen(true)} testID="avatar-detail">
                <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>Détails</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {transfoViews.front && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition.muscle_groups} view="front" />
                    <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.4)" }]}>Face</Text>
                  </View>
                )}
                {transfoViews.back && (
                  <View style={{ alignItems: "center" }}>
                    <BodyAvatar groups={composition.muscle_groups} view="back" />
                    <Text style={[typography.small, { fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.4)" }]}>Dos</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {composition.muscle_groups.map((g) => (
                  <View key={g.group} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MUSCLE_COLOR(g.score_pct) }} />
                      <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>{g.group}</Text>
                    </View>
                    <Text style={[typography.small, { color: MUSCLE_COLOR(g.score_pct), fontWeight: "700" }]}>{g.score_pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
            {!transfoViews.back && (
              <Text style={[typography.small, { marginTop: spacing.sm, color: "rgba(255,255,255,0.4)", fontSize: 11 }]}>
                Ajoute une photo « Dos » dans Progression pour voir ton avatar de dos.
              </Text>
            )}
          </GlassCard>
        )}

        {/* Body composition */}
        <GlassCard testID="body-comp-card">
          <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase"}}>Composition corporelle</Text>
            <TouchableOpacity onPress={() => setMeasureModal(true)} testID="edit-measures">
              <Text style={[typography.small, { color: "#4ade80", fontWeight: "700" }]}>
                {composition?.body_fat?.has_measurements ? "Modifier" : "Mesurer"}
              </Text>
            </TouchableOpacity>
          </View>
          {composition?.available && composition.body_fat ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
                <Stat label="% gras" value={composition.body_fat.percent} unit="%" testID="bf-percent" />
                <Stat label="Masse maigre" value={composition.body_fat.lean_kg} unit="kg" align="center" />
                <Stat label="Muscle estimé" value={composition.body_fat.muscle_kg_est} unit="kg" align="center" />
              </View>
              <Text style={[typography.small, { marginTop: 8, color: "rgba(255,255,255,0.4)" }]}>
                Méthode : {composition.body_fat.method}
                {!composition.body_fat.has_measurements && " — Ajoute tour de taille + cou pour plus de précision."}
              </Text>
            </>
          ) : (
            <Text style={[typography.small, { marginTop: spacing.sm, color:"rgba(255,255,255,0.6)" }]}>Profil incomplet.</Text>
          )}
        </GlassCard>

        {/* Strength level */}
        {composition?.strength && (
          <GlassCard testID="strength-card">
            <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8}}>Niveau de force</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
              <View style={styles.tierBadge}>
                <Text style={styles.tierText}>{composition.strength.overall_tier}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h2, { lineHeight: 32, color:"#fff" }]}>
                  {composition.strength.overall_score_pct}<Text style={[typography.small, { fontSize: 14, color:"rgba(255,255,255,0.6)" }]}> /100</Text>
                </Text>
                <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>Score global vs benchmarks intermédiaire</Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {composition.strength.scores.filter((s) => s.best_1rm > 0).slice(0, 5).map((s) => (
                <View key={s.exercise} style={styles.scoreRow}>
                  <Text style={[typography.small, { flex: 1, color: "#fff", fontWeight: "600" }]} numberOfLines={1}>
                    {s.exercise}
                  </Text>
                  <Text style={[typography.small, { color: "rgba(255,255,255,0.6)" }]}>
                    {s.best_1rm} / {s.target_for_intermediate} kg
                  </Text>
                  <View style={[styles.scoreBadge, { backgroundColor: MUSCLE_COLOR(s.score_pct) + "20" }]}>
                    <Text style={[typography.small, { color: MUSCLE_COLOR(s.score_pct), fontWeight: "800" }]}>{s.score_pct}%</Text>
                  </View>
                </View>
              ))}
              {composition.strength.scores.every((s) => s.best_1rm === 0) && (
                <Text style={[typography.small, {color:"rgba(255,255,255,0.6)"}]}>Log tes premières perfs dans Training pour activer ton score.</Text>
              )}
            </View>
          </GlassCard>
        )}

        <GlassCard testID="profile-targets-card">
          <Text style={{fontSize:10, color:"#4ade80", fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8}}>Tes objectifs</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Stat label="Calories" value={profile.daily_calories?.toLocaleString("fr-FR") || "—"} unit="kcal" />
            <Stat label="BMR" value={profile.bmr?.toLocaleString("fr-FR") || "—"} unit="kcal" align="center" />
            <Stat label="Objectif" value={profile.goal ? GOAL_LABEL[profile.goal] || profile.goal : "—"} align="center" valueStyle={{ fontSize: 14 }} />
          </View>
        </GlassCard>

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
      {/* Phase 5: Mascot modal */}
      <Modal visible={mascotModal} transparent animationType="slide" onRequestClose={() => setMascotModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Choisis ta mascotte</Text>
              <TouchableOpacity onPress={() => setMascotModal(false)} testID="mascot-modal-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <MascotPicker selected={pickedMascot} onChange={setPickedMascot} evolution={evolution} size={80} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setMascotModal(false)} style={{ flex: 1 }} testID="mascot-cancel" />
              <Button title="Enregistrer" onPress={saveMascot} loading={savingMascot} style={{ flex: 1.4 }} testID="mascot-save" disabled={!pickedMascot} />
            </View>
            <View style={{ height: spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Phase 5: Notifications modal */}
      <Modal visible={notifModal} transparent animationType="slide" onRequestClose={() => setNotifModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "92%" }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Mes rappels</Text>
              <TouchableOpacity onPress={() => setNotifModal(false)} testID="notif-modal-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.small, { marginTop: 4 }]}>
              Ajoute autant de rappels que tu veux. Aucune notif n&apos;est envoyée sans ta validation.
            </Text>
            <ScrollView style={{ maxHeight: 400, marginTop: spacing.md }} contentContainerStyle={{ gap: 8 }}>
              {reminders.map((r) => (
                <View key={r.id} style={styles.reminderRow}>
                  <Ionicons name={r.kind === "workout" ? "barbell-outline" : "nutrition-outline"} size={16} color={colors.primary} />
                  <TouchableOpacity
                    onPress={() => { setEditingReminder(r); setShowTimePicker(true); }}
                    style={styles.reminderTime}
                    testID={`reminder-time-${r.id}`}
                  >
                    <Text style={[typography.h3, { fontSize: 18 }]}>
                      {String(r.hour).padStart(2, "0")}:{String(r.minute).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[typography.small, { flex: 1 }]} numberOfLines={1}>
                    {r.kind === "workout" ? "Séance" : "Protéines"}
                  </Text>
                  <Switch
                    value={r.enabled}
                    onValueChange={(v) => updateReminder(r.id, { enabled: v })}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#fff"
                    testID={`reminder-toggle-${r.id}`}
                  />
                  <TouchableOpacity onPress={() => removeReminder(r.id)} hitSlop={10} testID={`reminder-remove-${r.id}`}>
                    <Ionicons name="trash-outline" size={16} color={colors.alert} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button title="+ Rappel séance" onPress={() => addReminder("workout")} variant="secondary" style={{ flex: 1 }} testID="reminder-add-workout" />
                <Button title="+ Check protéines" onPress={() => addReminder("protein")} variant="secondary" style={{ flex: 1 }} testID="reminder-add-protein" />
              </View>
            </ScrollView>
            <Button title="Enregistrer" onPress={saveReminders} loading={savingReminders} style={{ marginTop: spacing.lg }} testID="reminders-save" />
            <View style={{ height: spacing.md }} />
          </View>
        </View>
        {showTimePicker && editingReminder && (
          <DateTimePicker
            value={(() => { const d = new Date(); d.setHours(editingReminder.hour); d.setMinutes(editingReminder.minute); return d; })()}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selected) => {
              if (Platform.OS !== "ios") setShowTimePicker(false);
              if (event.type === "dismissed") { setEditingReminder(null); return; }
              if (selected) {
                updateReminder(editingReminder.id, { hour: selected.getHours(), minute: selected.getMinutes() });
              }
              if (Platform.OS === "ios") setShowTimePicker(false);
              setEditingReminder(null);
            }}
          />
        )}
      </Modal>

      {/* Silhouette modal */}
      <Modal visible={silhouetteModal} transparent animationType="slide" onRequestClose={() => setSilhouetteModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Choisis ta silhouette</Text>
              <TouchableOpacity onPress={() => setSilhouetteModal(false)} testID="silhouette-modal-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <SilhouettePicker
                sex={silSex}
                level={silLevel}
                onChange={(s, lv) => {
                  setSilSex(s);
                  setSilLevel(lv);
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setSilhouetteModal(false)} style={{ flex: 1 }} testID="silhouette-cancel" />
              <Button title="Enregistrer" onPress={saveSilhouette} loading={savingSil} style={{ flex: 1.4 }} testID="silhouette-save" />
            </View>
            <View style={{ height: spacing.md }} />
          </View>
        </View>
      </Modal>

      {/* Force / 1RM modal */}
      <Modal visible={forceModal} transparent animationType="slide" onRequestClose={() => setForceModal(false)}>
        <View style={styles.modalBg}>
          <KeyboardAwareScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Estimer mes 1RM</Text>
              <TouchableOpacity onPress={() => setForceModal(false)} testID="force-modal-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.small, { marginTop: 4 }]}>
              Indique ton meilleur effort (charge × reps) sur chaque mouvement. Formule Epley appliquée.
            </Text>
            <ForceLiftRow label="Squat" wKey={squatKg} rKey={squatReps} setW={setSquatKg} setR={setSquatReps} testID="force-squat" />
            <ForceLiftRow label="Développé couché" wKey={benchKg} rKey={benchReps} setW={setBenchKg} setR={setBenchReps} testID="force-bench" />
            <ForceLiftRow label="Soulevé de terre" wKey={dlKg} rKey={dlReps} setW={setDlKg} setR={setDlReps} testID="force-dl" />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Button title="Annuler" variant="secondary" onPress={() => setForceModal(false)} style={{ flex: 1 }} testID="force-cancel" />
              <Button title="Enregistrer" onPress={saveForce} loading={savingForce} style={{ flex: 1.4 }} testID="force-save" />
            </View>
            <View style={{ height: spacing.lg }} />
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </SafeAreaView>
    </ScreenBg>
  );
}

function ForceLiftRow({
  label, wKey, rKey, setW, setR, testID,
}: { label: string; wKey: string; rKey: string; setW: (v: string) => void; setR: (v: string) => void; testID: string }) {
  const w = parseFloat(wKey || "0");
  const r = parseInt(rKey || "0", 10);
  const est = w > 0 && r > 0 ? (r === 1 ? Math.round(w * 10) / 10 : Math.round(w * (1 + Math.min(r, 12) / 30) * 10) / 10) : 0;
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[typography.caption, { marginBottom: 6 }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: colors.surface }}>
          <TextInput
            testID={`${testID}-kg`}
            value={wKey}
            onChangeText={(t) => setW(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            style={{ flex: 1, paddingVertical: 12, fontSize: 16, fontWeight: "700", color: colors.textMain }}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>kg</Text>
        </View>
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>×</Text>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: colors.surface }}>
          <TextInput
            testID={`${testID}-reps`}
            value={rKey}
            onChangeText={(t) => setR(t.replace(/[^0-9]/g, ""))}
            keyboardType="numeric"
            style={{ flex: 1, paddingVertical: 12, fontSize: 16, fontWeight: "700", color: colors.textMain }}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>reps</Text>
        </View>
      </View>
      {est > 0 && (
        <Text style={[typography.small, { color: colors.primary, fontWeight: "800", marginTop: 4 }]}>
          1RM estimé · {est} kg
        </Text>
      )}
    </View>
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
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  userHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: radius.full },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.md, marginTop: spacing.md },
  tierBadge: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: radius.full },
  tierText: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, borderBottomWidth: 0 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, minWidth: 50, alignItems: "center" },
  diagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 4, alignSelf: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.textMain, marginTop: 6 },
  mascotPlaceholder: {
    width: 88, height: 88, borderRadius: radius.full,
    backgroundColor: "rgba(74,222,128,0.15)", borderWidth: 1.5, borderColor: "#4ade80",
    alignItems: "center", justifyContent: "center",
  },
  notifRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  notifPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  reminderRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  reminderTime: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.primaryPale, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.primary,
  },
});
