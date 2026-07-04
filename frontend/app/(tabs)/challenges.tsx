import { useCallback, useState } from "react";
import { Alert, Image, View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { Card, Button, SectionTitle } from "@/src/components/UI";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type PointsSummary = {
  level: number;
  points_total: number;
  points_today: number;
  streak_days: number;
};

type Workout = {
  id: string;
  focus: string;
  title: string;
  completed: boolean;
  duration_min: number;
};

type Week = {
  days: { date: string; consumed: number; target: number; steps: number; cardio_minutes: number }[];
};

type ChallengeDay = {
  day_index?: number;
  label: string;
  target_reps?: number;
  unit?: string;
  completed?: boolean;
  is_rest?: boolean;
};

type ChallengeType = "pushups" | "abs" | "squats" | "plank" | "steps10k" | "running";

type ActiveChallenge = {
  id: string;
  type: ChallengeType;
  name: string;
  icon: string;
  exercise: string;
  started_at: string;
  streak: number;
  completed_count: number;
  days: ChallengeDay[];
};

const TROPHIES = [
  { name: "Persévérant", target: 7 },
  { name: "Inarrêtable", target: 30 },
  { name: "Légende", target: 100 },
];

const BADGES = [3, 7, 14, 30];
const TROPHY_IMAGES = [
  require("../../assets/images/fitai-trophy-1.png"),
  require("../../assets/images/fitai-trophy-2.png"),
  require("../../assets/images/fitai-trophy-3.png"),
];
const BADGE_IMAGES: Record<number, any> = {
  3: require("../../assets/images/fitai-badge-3.png"),
  7: require("../../assets/images/fitai-badge-7.png"),
  14: require("../../assets/images/fitai-badge-14.png"),
  30: require("../../assets/images/fitai-badge-30.png"),
};

export default function ChallengesTab() {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<ActiveChallenge[]>([]);
  const [challengeBusy, setChallengeBusy] = useState<string | null>(null);
  const [participating, setParticipating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ps, w, wk, active] = await Promise.all([
        api<PointsSummary>("/points/summary").catch(() => null),
        api<Week>("/dashboard/week").catch(() => null),
        api<Workout[]>("/workouts/week").catch(() => []),
        api<{ items: ActiveChallenge[] }>("/challenges/active").catch(() => ({ items: [] })),
      ]);
      setPoints(ps);
      setWeek(w);
      setWorkouts(wk || []);
      setActiveChallenges(active.items || []);
    } catch (e) {
      console.warn("rewards load", e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const streak = points?.streak_days || 0;
  const totalXp = points?.points_total || 0;
  const sessionsDone = workouts.filter((w) => w.completed).length;
  const weeklySteps = week?.days.reduce((sum, d) => sum + (d.steps || 0), 0) || 0;
  const cardioMinutes = week?.days.reduce((sum, d) => sum + (d.cardio_minutes || 0), 0) || 0;
  const fullBodyDone = workouts.some((w) => w.completed && `${w.focus} ${w.title}`.toLowerCase().includes("full"));
  const missionCount = [sessionsDone >= 3, weeklySteps >= 20000, cardioMinutes >= 45, fullBodyDone].filter(Boolean).length;
  const chestReady = missionCount >= 3;
  const focusedChallenges = (["pushups", "abs", "squats", "plank", "steps10k", "running"] as const).map((type) => ({
    type,
    challenge: activeChallenges.find((item) => item.type === type),
  }));

  const startChallenge = async (type: ChallengeType) => {
    setChallengeBusy(type);
    try {
      await api("/challenges/start", { method: "POST", body: { type } });
      await load();
    } catch (e: any) {
      Alert.alert("Défi indisponible", e?.message || "Impossible de démarrer ce défi pour le moment.");
    } finally {
      setChallengeBusy(null);
    }
  };

  const validateChallengeDay = async (challenge: ActiveChallenge) => {
    const dayIndex = todayChallengeIndex(challenge);
    setChallengeBusy(challenge.type);
    try {
      await api(`/challenges/${challenge.id}/check-day`, { method: "POST", body: { day_index: dayIndex } });
      await load();
    } catch (e: any) {
      Alert.alert("Validation impossible", e?.message || "Impossible de valider ce jour de défi.");
    } finally {
      setChallengeBusy(null);
    }
  };

  const restartChallenge = async (type: ChallengeType) => {
    await startChallenge(type);
  };

  return (
    <ScreenBackground bg="challenges">
      <View style={styles.header}>
        <View>
          <Text style={styles.heroEyebrow}>Récompenses</Text>
          <Text style={styles.title}>Ton parcours{"\n"}prend de la valeur.</Text>
          <Text style={styles.heroSubtitle}>{streak} jour{streak > 1 ? "s" : ""} de streak · {totalXp.toLocaleString("fr-FR")} XP</Text>
        </View>
        <View style={styles.xpBadge}>
          <Ionicons name="star" size={17} color="#1C2308" />
          <Text style={styles.xpBadgeText}>{totalXp.toLocaleString("fr-FR")}</Text>
          <Text style={styles.xpBadgeSub}>XP</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card testID="trophies-card" style={{ gap: spacing.md }}>
          <SectionTitle title="Trophées" />
          <View style={styles.trophyRow}>
            {TROPHIES.map((trophy, index) => {
              const done = streak >= trophy.target;
              const progress = Math.min(1, streak / trophy.target);
              return (
                <View key={trophy.name} style={[styles.trophyTile, done && styles.trophyTileDone]}>
                  <TrophyArt tier={(index + 1) as 1 | 2 | 3} locked={!done} />
                  <Text style={styles.trophyName}>{trophy.name}</Text>
                  <Text style={styles.trophyTarget}>{trophy.target} séances</Text>
                  <View style={styles.smallTrack}>
                    <View style={[styles.smallFill, { width: `${progress * 100}%` }]} />
                  </View>
                  {done ? <Ionicons name="checkmark-circle" size={16} color={colors.primaryLight} /> : null}
                </View>
              );
            })}
          </View>
        </Card>

        <Card testID="badges-card" style={{ gap: spacing.md }}>
          <SectionTitle title="Badges de progression" />
          <View style={styles.badgeGrid}>
            {BADGES.map((target, index) => {
              const earned = Math.floor(streak / target);
              const cycleProgress = (streak % target) / target;
              return (
                <View key={target} style={styles.badgeTile}>
                  <BadgeArt tier={(index + 1) as 1 | 2 | 3 | 4} target={target} locked={earned === 0} />
                  <Text style={styles.badgeTitle}>{target} jours</Text>
                  <Text style={styles.badgeCount}>x{earned}</Text>
                  <View style={styles.smallTrack}>
                    <View style={[styles.smallFill, { width: `${cycleProgress * 100}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.pathCard}>
            <Text style={styles.pathTitle}>Ton parcours</Text>
            <View style={styles.pathLine}>
              {[7, 30, 100].map((target) => (
                <View key={target} style={styles.pathStep}>
                  <View style={[styles.pathDot, streak >= target && styles.pathDotOn]}>
                    {streak >= target ? <Ionicons name="checkmark" size={13} color="#102108" /> : null}
                  </View>
                  <Text style={styles.pathLabel}>{target}j</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <Card testID="daily-challenges-card" style={{ gap: spacing.md }}>
          <SectionTitle title="Défis quotidiens" />
          {focusedChallenges.map(({ type, challenge }) => (
            <DailyChallengeCard
              key={type}
              type={type}
              challenge={challenge}
              busy={challengeBusy === type}
              onStart={() => startChallenge(type)}
              onRestart={() => restartChallenge(type)}
              onValidate={() => challenge ? validateChallengeDay(challenge) : undefined}
            />
          ))}
        </Card>

        <Card testID="weekly-explorer-card" style={styles.weeklyCard}>
          <View style={styles.weeklyTop}>
            <View style={styles.weeklyIcon}>
              <Ionicons name="compass" size={20} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.weeklyEyebrow}>Défi de la semaine</Text>
              <Text style={styles.weeklyTitle}>Explorateur</Text>
              <Text style={styles.weeklyText}>Bouge chaque jour et repousse tes limites.</Text>
            </View>
            <View style={styles.chestBox}>
              <Ionicons name={chestReady ? "gift" : "lock-closed"} size={22} color={chestReady ? "#1C2308" : colors.amber} />
              <Text style={[styles.chestText, chestReady && { color: "#1C2308" }]}>+250 XP</Text>
            </View>
          </View>

          <View style={styles.missionList}>
            <MissionRow done={sessionsDone >= 3} label="Faire 3 séances" value={`${sessionsDone}/3`} />
            <MissionRow done={weeklySteps >= 20000} label="Atteindre 20 000 pas" value={`${weeklySteps.toLocaleString("fr-FR")}/20 000`} />
            <MissionRow done={cardioMinutes >= 45} label="Bonus cardio" value={`${cardioMinutes}/45 min`} />
            <MissionRow done={fullBodyDone} label="Séance bonus Full Body" value={fullBodyDone ? "validée" : "optionnel"} />
          </View>

          <Button
            title={participating ? (chestReady ? "Coffre prêt" : "Défi en cours") : "Participer"}
            onPress={() => setParticipating(true)}
            variant={participating && !chestReady ? "secondary" : "primary"}
            icon={<Ionicons name={chestReady ? "gift" : "flag"} size={16} color={participating && !chestReady ? colors.primaryLight : "#102108"} />}
            testID="weekly-join"
          />
        </Card>

        <Card testID="total-xp-card" style={styles.totalXpCard}>
          <Ionicons name="sparkles" size={18} color={colors.primaryLight} />
          <Text style={styles.totalXpText}>Total XP</Text>
          <Text style={styles.totalXpValue}>{totalXp.toLocaleString("fr-FR")} XP</Text>
        </Card>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenBackground>
  );
}

function TrophyArt({ tier, locked }: { tier: 1 | 2 | 3; locked: boolean }) {
  return (
    <View style={[styles.trophyArtWrap, locked && styles.artLocked]}>
      <Image source={TROPHY_IMAGES[tier - 1]} resizeMode="contain" style={styles.rewardImage} />
    </View>
  );
}

function BadgeArt({ tier, target, locked }: { tier: 1 | 2 | 3 | 4; target: number; locked: boolean }) {
  return (
    <View style={[styles.badgeArtWrap, locked && styles.artLocked]}>
      <Image source={BADGE_IMAGES[target]} resizeMode="contain" style={styles.rewardImage} />
    </View>
  );
}

function MissionRow({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <View style={styles.missionRow}>
      <View style={[styles.missionCheck, done && styles.missionCheckOn]}>
        <Ionicons name={done ? "checkmark" : "ellipse-outline"} size={14} color={done ? "#102108" : colors.primaryLight} />
      </View>
      <Text style={styles.missionLabel}>{label}</Text>
      <Text style={styles.missionValue}>{value}</Text>
    </View>
  );
}

function todayChallengeIndex(challenge: ActiveChallenge) {
  const start = new Date(challenge.started_at);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.max(0, Math.min((challenge.days?.length || 30) - 1, elapsed));
}

function challengeTargetText(day?: ChallengeDay) {
  if (!day) return "";
  if (day.is_rest) return "Off";
  const unit = day.unit || "reps";
  const target = day.target_reps || 0;
  if (unit === "pas") return "10k";
  if (unit === "sec") return `${target}s`;
  if (unit === "min") return `${target}min`;
  if (unit === "km") return `${target.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}km`;
  return `${target}`;
}

function previewChallengeDays(type: ChallengeType): ChallengeDay[] {
  const rest: Record<ChallengeType, number[]> = {
    pushups: [3, 6, 10, 13, 17, 20, 24, 27],
    abs: [3, 7, 10, 14, 17, 21, 24, 28],
    squats: [3, 6, 10, 13, 17, 20, 24, 27],
    plank: [3, 7, 11, 15, 19, 23, 27],
    steps10k: [],
    running: [3, 7, 11, 15, 19, 23, 27],
  };
  return Array.from({ length: 30 }, (_, index) => {
    if (rest[type].includes(index)) {
      return { day_index: index, label: "Repos actif", target_reps: 0, unit: "", is_rest: true, completed: false };
    }
    if (type === "steps10k") return { day_index: index, label: "10 000 pas", target_reps: 10000, unit: "pas", completed: false };
    if (type === "running") return { day_index: index, label: "Course", target_reps: Math.round((1 + index * 0.11) * 10) / 10, unit: "km", completed: false };
    if (type === "plank") return { day_index: index, label: "Planche", target_reps: 20 + index * 5, unit: "sec", completed: false };
    const base = type === "abs" ? 18 : type === "squats" ? 20 : 10;
    return { day_index: index, label: "Défi", target_reps: Math.round(base * (1 + (index / 29) * 3)), unit: "reps", completed: false };
  });
}

function DailyChallengeCard({
  type,
  challenge,
  busy,
  onStart,
  onRestart,
  onValidate,
}: {
  type: ChallengeType;
  challenge?: ActiveChallenge;
  busy: boolean;
  onStart: () => void;
  onRestart: () => void;
  onValidate: () => void;
}) {
  const meta: Record<ChallengeType, { label: string; icon: keyof typeof Ionicons.glyphMap; subtitle: string }> = {
    pushups: { label: "Défi Pompes", icon: "body-outline", subtitle: "Pectoraux et bras" },
    abs: { label: "Défi Abdos", icon: "fitness-outline", subtitle: "Core et contrôle" },
    squats: { label: "Défi Squats", icon: "barbell-outline", subtitle: "Jambes" },
    plank: { label: "Défi Gainage", icon: "timer-outline", subtitle: "Planche progressive" },
    steps10k: { label: "Défi 10 000 pas", icon: "walk-outline", subtitle: "Tous les jours" },
    running: { label: "Défi Running", icon: "footsteps-outline", subtitle: "Course progressive" },
  };
  const [expanded, setExpanded] = useState(false);
  const label = meta[type].label;
  const icon = meta[type].icon;
  const dayIndex = challenge ? todayChallengeIndex(challenge) : 0;
  const day = challenge?.days?.[dayIndex];
  const doneToday = Boolean(day?.completed);
  const progress = challenge ? Math.min(1, (challenge.completed_count || 0) / Math.max(1, challenge.days.filter((d) => !d.is_rest).length)) : 0;
  const targetLabel = day?.is_rest
    ? "repos actif"
    : `${(day?.target_reps || 0).toLocaleString("fr-FR")} ${day?.unit || "reps"}`;
  return (
    <View style={styles.dailyChallenge}>
      <TouchableOpacity onPress={() => setExpanded((value) => !value)} activeOpacity={0.78} style={styles.dailyChallengeHead}>
        <View style={styles.dailyChallengeIcon}>
          <Ionicons name={icon} size={19} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dailyChallengeTitle}>{label}</Text>
          <Text style={styles.dailyChallengeText}>
            {challenge
              ? `Jour ${dayIndex + 1} · ${targetLabel} · +50 XP`
              : `30 jours · ${meta[type].subtitle} · +50 XP/jour tenu`}
          </Text>
          <View style={styles.smallTrack}>
            <View style={[styles.smallFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.challengeCalendar} testID={`challenge-${type}-calendar`}>
          <View style={styles.challengeCalendarHeader}>
            <Text style={styles.challengeCalendarTitle}>Calendrier 30 jours</Text>
            <Text style={styles.challengeCalendarHint}>Off = récupération</Text>
          </View>
          {(challenge?.days || previewChallengeDays(type)).map((item, index) => (
            <View
              key={index}
              style={[
                styles.challengeDayCard,
                item.is_rest && styles.challengeDayRest,
                item.completed && styles.challengeDayDone,
                challenge && index === dayIndex && styles.challengeDayToday,
              ]}
            >
              <Text style={[styles.challengeDayText, item.completed && styles.challengeDayTextDone]}>J{index + 1}</Text>
              <Text style={[styles.challengeDayTarget, item.completed && styles.challengeDayTextDone]}>
                {challengeTargetText(item)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.challengeActions}>
        <Button
          title={challenge ? (doneToday ? "Validé" : "Valider aujourd'hui") : "Démarrer"}
          onPress={challenge ? onValidate : onStart}
          disabled={doneToday || busy}
          loading={busy}
          variant={challenge && doneToday ? "secondary" : "primary"}
          testID={`challenge-${type}-${challenge ? "check" : "start"}`}
          style={styles.dailyChallengeButton}
        />
        {challenge ? (
          <TouchableOpacity onPress={onRestart} style={styles.restartBtn} testID={`challenge-${type}-restart`}>
            <Ionicons name="refresh" size={14} color={colors.primaryLight} />
            <Text style={styles.restartText}>Recommencer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 300, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, justifyContent: "space-between" },
  heroEyebrow: { fontSize: 22, fontWeight: "900", color: colors.textMain },
  title: { fontSize: 31, lineHeight: 36, fontWeight: "900", color: colors.textMain, marginTop: spacing.sm, maxWidth: 270 },
  heroSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "700", marginTop: spacing.sm },
  xpBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  xpBadgeText: { color: "#1C2308", fontSize: 14, fontWeight: "900" },
  xpBadgeSub: { color: "rgba(28,35,8,0.74)", fontSize: 10, fontWeight: "900" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 130, gap: spacing.md },
  trophyRow: { flexDirection: "row", gap: spacing.sm },
  trophyTile: { flex: 1, minHeight: 166, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, alignItems: "center", gap: 5 },
  trophyTileDone: { borderColor: colors.primaryLight, backgroundColor: "rgba(182,255,63,0.10)" },
  trophyArtWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(3,16,10,0.42)", alignItems: "center", justifyContent: "center" },
  rewardImage: { width: "100%", height: "100%" },
  artLocked: { opacity: 1 },
  trophyIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.10)" },
  trophyIconDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  trophyName: { color: colors.textMain, fontSize: 11.5, fontWeight: "900", textAlign: "center" },
  trophyTarget: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
  smallTrack: { width: "100%", height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.13)", marginTop: 4 },
  smallFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primaryLight },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badgeTile: { width: "47.5%", minHeight: 128, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: spacing.sm, alignItems: "center" },
  badgeArtWrap: { width: 102, height: 102, borderRadius: 28, backgroundColor: "rgba(3,16,10,0.36)", alignItems: "center", justifyContent: "center" },
  badgeTitle: { color: colors.textMain, fontSize: 12, fontWeight: "900", marginTop: 2 },
  badgeHex: { width: 58, height: 58, borderRadius: 17, borderWidth: 2, borderColor: "rgba(182,255,63,0.32)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(3,16,10,0.72)", transform: [{ rotate: "45deg" }] },
  badgeHexOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  badgeNumber: { color: colors.primaryLight, fontSize: 17, fontWeight: "900", transform: [{ rotate: "-45deg" }] },
  badgeNumberOn: { color: "#221704" },
  badgeDays: { color: colors.textMuted, fontSize: 8, fontWeight: "900", marginTop: -2, transform: [{ rotate: "-45deg" }] },
  badgeDaysOn: { color: "rgba(34,23,4,0.74)" },
  badgeCount: { color: colors.primaryLight, fontSize: 12, fontWeight: "900", marginTop: spacing.sm },
  pathCard: { borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(182,255,63,0.24)", backgroundColor: "rgba(182,255,63,0.08)", padding: spacing.md },
  pathTitle: { color: colors.textMain, fontSize: 13, fontWeight: "900", marginBottom: spacing.md },
  pathLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pathStep: { alignItems: "center", flex: 1 },
  pathDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderBright, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  pathDotOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  pathLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800", marginTop: 5 },
  weeklyCard: { gap: spacing.md, borderColor: "rgba(255,179,63,0.34)", backgroundColor: "rgba(28,22,8,0.50)" },
  weeklyTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  weeklyIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,179,63,0.13)", borderWidth: 1, borderColor: "rgba(255,179,63,0.28)" },
  weeklyEyebrow: { color: colors.amber, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase" },
  weeklyTitle: { color: colors.textMain, fontSize: 23, fontWeight: "900", marginTop: 2 },
  weeklyText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  chestBox: { width: 78, height: 70, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,179,63,0.13)", borderWidth: 1, borderColor: "rgba(255,179,63,0.30)" },
  chestText: { color: colors.amber, fontSize: 11, fontWeight: "900", marginTop: 3 },
  missionList: { gap: spacing.sm },
  missionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  missionCheck: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderBright },
  missionCheckOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  missionLabel: { color: colors.textMain, fontSize: 12.5, fontWeight: "800", flex: 1 },
  missionValue: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
  dailyChallenge: { minHeight: 86, gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.055)" },
  dailyChallengeHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dailyChallengeIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(182,255,63,0.10)", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)" },
  dailyChallengeTitle: { color: colors.textMain, fontSize: 13.5, fontWeight: "900" },
  dailyChallengeText: { color: colors.textMuted, fontSize: 11.2, fontWeight: "700", marginTop: 3 },
  challengeCalendar: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: spacing.xs },
  challengeCalendarHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  challengeCalendarTitle: { color: colors.textMain, fontSize: 12.5, fontWeight: "900" },
  challengeCalendarHint: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
  challengeDayCard: { width: "18.5%", minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.055)", paddingVertical: 4 },
  challengeDayRest: { backgroundColor: "rgba(255,255,255,0.025)", opacity: 0.62 },
  challengeDayDone: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  challengeDayToday: { borderColor: colors.amber, borderWidth: 2 },
  challengeDayText: { color: colors.textMuted, fontSize: 9.5, fontWeight: "900" },
  challengeDayTarget: { color: colors.textMain, fontSize: 10.5, fontWeight: "900", marginTop: 1 },
  challengeDayTextDone: { color: "#102108" },
  challengeActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dailyChallengeButton: { flex: 1, minWidth: 120, paddingHorizontal: 10 },
  restartBtn: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(182,255,63,0.28)", backgroundColor: "rgba(182,255,63,0.08)" },
  restartText: { color: colors.primaryLight, fontSize: 11.5, fontWeight: "900" },
  totalXpCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderColor: colors.borderBright },
  totalXpText: { color: colors.textMain, fontSize: 13, fontWeight: "900", flex: 1 },
  totalXpValue: { color: colors.primaryLight, fontSize: 14, fontWeight: "900" },
});
