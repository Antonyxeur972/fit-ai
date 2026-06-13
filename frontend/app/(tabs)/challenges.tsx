import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Button, SectionTitle } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

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
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={typography.caption}>30 jours · à la maison</Text>
        <Text style={styles.title}>Challenges</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && active.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
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
                <Ionicons name={(c.icon as any) || "flame"} size={14} color={selectedId === c.id ? colors.surface : colors.primary} />
                <Text style={[typography.small, { fontWeight: "700", color: selectedId === c.id ? colors.surface : colors.primary }]}>
                  {c.name}
                </Text>
                <View style={[styles.streakBadge, selectedId === c.id && { backgroundColor: colors.surface }]}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: selectedId === c.id ? colors.primary : colors.surface }}>
                    🔥 {c.streak}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected challenge detail */}
        {selected && (
          <Card testID={`challenge-detail-${selected.type}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h3]}>{selected.name}</Text>
                <Text style={typography.small}>
                  {selected.completed_count}/30 jours · niveau {selected.level} · streak {selected.streak}
                </Text>
              </View>
              <TouchableOpacity onPress={() => abandon(selected.id)} testID={`challenge-abandon-${selected.id}`}>
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Progress bar day 1 → 30 */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(selected.completed_count / 30) * 100}%` }]} />
            </View>

            {/* 30 days grid */}
            <View style={styles.daysGrid}>
              {selected.days.map((d) => (
                <TouchableOpacity
                  key={d.day_index}
                  onPress={() => !d.completed && !d.is_rest && checkDay(selected.id, d.day_index)}
                  disabled={d.completed || d.is_rest}
                  style={[
                    styles.dayCell,
                    d.is_rest && styles.dayCellRest,
                    d.completed && styles.dayCellDone,
                  ]}
                  testID={`challenge-day-${d.day_index}`}
                >
                  <Text style={[styles.dayCellNum, d.completed && { color: colors.surface }]}>
                    {d.day_index + 1}
                  </Text>
                  <Text style={[styles.dayCellReps, d.completed && { color: colors.surface }]}>
                    {d.is_rest ? "Repos" : `×${d.target_reps}`}
                  </Text>
                  {d.completed && (
                    <Ionicons name="checkmark" size={11} color={colors.surface} style={{ position: "absolute", top: 2, right: 2 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {selected.completed_count >= 30 - selected.days.filter((d) => d.is_rest).length && (
              <View style={styles.endCard} testID="challenge-completed-card">
                <Ionicons name="trophy" size={28} color={colors.primary} />
                <Text style={[typography.h3, { marginTop: 4 }]}>Challenge terminé !</Text>
                <Text style={[typography.small, { textAlign: "center", marginTop: 4 }]}>
                  Jour 1: {selected.days[0]?.target_reps} reps → Jour 30: {selected.days[29]?.target_reps} reps
                </Text>
                <Text style={[typography.small, { color: colors.primary, fontWeight: "700", marginTop: 4 }]}>
                  +{Math.round(((selected.days[29]?.target_reps || 0) / Math.max(1, selected.days[0]?.target_reps || 1) - 1) * 100)}% de progression
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Available blueprints */}
        <SectionTitle title="Démarrer un challenge" />
        {blueprints.map((bp) => {
          const alreadyActive = active.some((c) => c.type === bp.type && c.active);
          return (
            <Card key={bp.type} style={{ marginBottom: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View style={styles.bpIcon}>
                  <Ionicons name={(bp.icon as any) || "flame"} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { fontWeight: "700" }]}>{bp.name}</Text>
                  <Text style={typography.small}>{bp.muscle} · à la maison · 30 jours</Text>
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
            </Card>
          );
        })}

        <Text style={[typography.small, { textAlign: "center", marginTop: spacing.lg, color: colors.textMuted }]}>
          Les jours validés s&apos;ajoutent à ton historique d&apos;entraînement.
        </Text>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 30, fontWeight: "800", color: colors.textMain },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  activeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  activeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  streakBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.primary },
  progressTrack: { height: 6, backgroundColor: colors.background, borderRadius: 3, marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.md },
  dayCell: { width: "13.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  dayCellRest: { backgroundColor: colors.primaryPale, borderColor: "#D5EAD8" },
  dayCellDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayCellNum: { fontSize: 11, fontWeight: "800", color: colors.textMain },
  dayCellReps: { fontSize: 9, color: colors.textMuted, fontWeight: "600", marginTop: 1 },
  endCard: { alignItems: "center", padding: spacing.lg, marginTop: spacing.md, backgroundColor: colors.primaryPale, borderRadius: radius.lg, borderWidth: 1, borderColor: "#D5EAD8" },
  bpIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
});
