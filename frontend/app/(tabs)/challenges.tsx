import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { GlassCard, ScreenBg, Button, SectionTitle } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

const BG_URI = "https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800&q=90";

type ChallengeDay = {
  day_index: number;
  is_rest: boolean;
  target_reps: number;
  label: string;
  completed: boolean;
  completed_at?: string;
};

type Challenge = {
  id: string;
  type: string;
  name: string;
  icon: string;
  muscle: string;
  exercise: string;
  level: number;
  active: boolean;
  started_at: string;
  days: ChallengeDay[];
  streak: number;
  completed_count: number;
};

type Blueprint = { type: string; name: string; muscle: string; icon: string; exercise: string };

export default function ChallengesTab() {
  const [active, setActive] = useState<Challenge[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ac, bp] = await Promise.allSettled([
        api<{ items: Challenge[] }>("/challenges/active"),
        api<{ items: Blueprint[] }>("/challenges/blueprints"),
      ]);
      const activeItems = ac.status === "fulfilled" ? (ac.value.items || []) : [];
      const bpItems = bp.status === "fulfilled" ? (bp.value.items || []) : [];
      setActive(activeItems);
      setBlueprints(bpItems);
      if (activeItems[0]) setSelectedId(activeItems[0].id);
    } catch (e) {
      console.warn("challenges load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startChallenge = async (type: string) => {
    setStarting(type);
    try {
      const ch = await api<Challenge>("/challenges/start", { method: "POST", body: { type } });
      setActive((prev) => [ch, ...prev.filter((c) => c.type !== type)]);
      setSelectedId(ch.id);
    } finally {
      setStarting(null);
    }
  };

  const checkDay = async (challengeId: string, dayIndex: number) => {
    try {
      const r = await api<{ challenge: Challenge }>(`/challenges/${challengeId}/check-day`, {
        method: "POST",
        body: { day_index: dayIndex },
      });
      setActive((prev) => prev.map((c) => (c.id === challengeId ? r.challenge : c)));
    } catch {}
  };

  const abandon = async (challengeId: string) => {
    try {
      await api(`/challenges/${challengeId}`, { method: "DELETE" });
      setActive((prev) => prev.filter((c) => c.id !== challengeId));
    } catch {}
  };

  const selected = active.find((c) => c.id === selectedId) || null;

  return (
    <ScreenBg uri={BG_URI}>
      <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.dateText}>30 jours · à la maison</Text>
        <Text style={styles.title}>Challenges</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && active.length === 0 ? (
          <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
        ) : null}

        {/* Active challenges chips */}
        {active.length > 0 && (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {active.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setSelectedId(c.id)}
                style={[styles.activeChip, selectedId === c.id && styles.activeChipOn]}
                testID={`challenge-tab-${c.type}`}
              >
                <Ionicons name={(c.icon as any) || "flame"} size={14} color={selectedId === c.id ? "#fff" : "#4ade80"} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: selectedId === c.id ? "#fff" : "#4ade80" }}>
                  {c.name}
                </Text>
                <View style={[styles.streakBadge, selectedId === c.id && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }}>
                    🔥 {c.streak}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected challenge detail */}
        {selected && (
          <GlassCard testID={`challenge-detail-${selected.type}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h3, { color: "#fff" }]}>{selected.name}</Text>
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
                  {selected.completed_count}/30 jours · niveau {selected.level} · streak {selected.streak}
                </Text>
              </View>
              <TouchableOpacity onPress={() => abandon(selected.id)} testID={`challenge-abandon-${selected.id}`}>
                <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(selected.completed_count / 30) * 100}%` }]} />
            </View>

            <View style={styles.daysGrid}>
              {selected.days.map((d) => (
                <TouchableOpacity
                  key={d.day_index}
                  onPress={() => !d.completed && !d.is_rest && checkDay(selected.id, d.day_index)}
                  disabled={d.completed || d.is_rest}
                  style={[styles.dayCell, d.is_rest && styles.dayCellRest, d.completed && styles.dayCellDone]}
                  testID={`challenge-day-${d.day_index}`}
                >
                  <Text style={[styles.dayCellNum, d.completed && { color: "#fff" }]}>{d.day_index + 1}</Text>
                  <Text style={[styles.dayCellReps, d.completed && { color: "#fff" }]}>
                    {d.is_rest ? "Repos" : `×${d.target_reps}`}
                  </Text>
                  {d.completed && (
                    <Ionicons name="checkmark" size={11} color="#fff" style={{ position: "absolute", top: 2, right: 2 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {selected.completed_count >= 30 - selected.days.filter((d) => d.is_rest).length && (
              <View style={styles.endCard} testID="challenge-completed-card">
                <Ionicons name="trophy" size={28} color="#4ade80" />
                <Text style={[typography.h3, { marginTop: 4, color: "#fff" }]}>Challenge terminé !</Text>
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 4 }}>
                  Jour 1: {selected.days[0]?.target_reps} reps → Jour 30: {selected.days[29]?.target_reps} reps
                </Text>
                <Text style={{ fontSize: 13, color: "#4ade80", fontWeight: "700", marginTop: 4 }}>
                  +{Math.round(((selected.days[29]?.target_reps || 0) / Math.max(1, selected.days[0]?.target_reps || 1) - 1) * 100)}% de progression
                </Text>
              </View>
            )}
          </GlassCard>
        )}

        {/* Available blueprints */}
        <Text style={styles.sectionLabel}>Démarrer un challenge</Text>
        {blueprints.map((bp) => {
          const alreadyActive = active.some((c) => c.type === bp.type && c.active);
          return (
            <GlassCard key={bp.type}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={styles.bpIcon}>
                  <Ionicons name={(bp.icon as any) || "flame"} size={22} color="#4ade80" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>{bp.name}</Text>
                  <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{bp.muscle} · à la maison · 30 jours</Text>
                </View>
                <Button
                  title={alreadyActive ? "En cours" : "Démarrer"}
                  variant={alreadyActive ? "secondary" : "primary"}
                  onPress={() => !alreadyActive && startChallenge(bp.type)}
                  disabled={alreadyActive || starting === bp.type}
                  loading={starting === bp.type}
                  testID={`challenge-start-${bp.type}`}
                />
              </View>
            </GlassCard>
          );
        })}

        <Text style={{ fontSize: 13, textAlign: "center", marginTop: spacing.lg, color: "rgba(255,255,255,0.35)" }}>
          Les jours validés s&apos;ajoutent à ton historique d&apos;entraînement.
        </Text>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
      </SafeAreaView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  dateText: { fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "600" },
  title: { fontSize: 30, fontWeight: "800", color: "#fff" },
  sectionLabel: { fontSize: 10, color: "#4ade80", fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  activeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: "rgba(0,25,0,0.5)", borderWidth: 1, borderColor: "rgba(74,222,128,0.4)" },
  activeChipOn: { backgroundColor: "#16a34a", borderColor: "#4ade80" },
  streakBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: "rgba(74,222,128,0.3)" },
  progressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#4ade80", borderRadius: 3 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.md },
  dayCell: { width: "13.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  dayCellRest: { backgroundColor: "rgba(74,222,128,0.12)", borderColor: "rgba(74,222,128,0.25)" },
  dayCellDone: { backgroundColor: "#16a34a", borderColor: "#4ade80" },
  dayCellNum: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.8)" },
  dayCellReps: { fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: "600", marginTop: 1 },
  endCard: { alignItems: "center", padding: spacing.lg, marginTop: spacing.md, backgroundColor: "rgba(74,222,128,0.15)", borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(74,222,128,0.3)" },
  bpIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(74,222,128,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(74,222,128,0.25)" },
});
