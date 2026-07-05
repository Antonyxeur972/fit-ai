import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { syncPhoneSleepToday } from "@/src/lib/sleep";
import { colors, radius, spacing } from "@/src/theme";

const sleepListeners = new Set<(hours: number) => void>();

export function getSleepStorageKey(date = new Date()) {
  return `fitai:sleep:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function readSleepHoursForDate(date = new Date()) {
  try {
    const saved = await AsyncStorage.getItem(getSleepStorageKey(date));
    return Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
}

export function useDailySleep(goalHours = 8) {
  const storageKey = useMemo(() => getSleepStorageKey(), []);
  const [hours, setHours] = useState(0);

  useEffect(() => {
    const sync = (nextHours: number) => setHours(nextHours);
    sleepListeners.add(sync);
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved) setHours(Math.max(0, Number(saved) || 0));
    }).catch(() => undefined);
    return () => { sleepListeners.delete(sync); };
  }, [storageKey]);

  const setSleep = (nextHours: number) => {
    const rounded = Math.max(0, Math.min(14, Math.round(nextHours * 2) / 2));
    void AsyncStorage.setItem(storageKey, String(rounded));
    void api("/sleep", { method: "POST", body: { hours: rounded } }).catch(() => undefined);
    sleepListeners.forEach((listener) => listener(rounded));
  };

  return { hours, setSleep, progress: Math.min(1, hours / goalHours), goalHours };
}

export function SleepCard({ goalHours = 8, compact = false }: { goalHours?: number; compact?: boolean }) {
  const { hours, setSleep, progress } = useDailySleep(goalHours);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lowSleep = hours > 0 && hours < 6;

  const syncSleep = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncPhoneSleepToday(hours);
      if (result.ok && typeof result.phoneHours === "number") setSleep(result.phoneHours);
      setMessage(result.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]} testID="sleep-card">
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
        <Ionicons name="moon" size={compact ? 18 : 23} color={colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Sommeil</Text>
        <Text style={[styles.value, compact && styles.valueCompact]}>{hours.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        {lowSleep ? (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={13} color={colors.amber} />
            <Text style={styles.warningText}>Attention, sommeil faible aujourd&apos;hui.</Text>
          </View>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => setSleep(hours - 0.5)} style={[styles.roundBtn, compact && styles.roundBtnCompact]} disabled={hours <= 0} testID="sleep-minus">
          <Ionicons name="remove" size={16} color={colors.textMain} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSleep(hours + 0.5)} style={[styles.roundBtn, styles.addBtn, compact && styles.roundBtnCompact]} testID="sleep-plus">
          <Ionicons name="add" size={17} color="#102108" />
        </TouchableOpacity>
        <TouchableOpacity onPress={syncSleep} style={[styles.syncBtn, compact && styles.roundBtnCompact]} disabled={syncing} testID="sleep-sync-phone">
          <Ionicons name={syncing ? "hourglass-outline" : "phone-portrait-outline"} size={15} color={colors.primaryLight} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.20)",
    backgroundColor: "rgba(5,20,20,0.66)",
  },
  cardCompact: { minHeight: 142, padding: spacing.sm },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.11)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
  },
  iconWrapCompact: { width: 38, height: 38, borderRadius: 19 },
  title: { color: colors.textSecondary, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  value: { color: colors.textMain, fontSize: 23, fontWeight: "900", marginTop: 2 },
  valueCompact: { fontSize: 20 },
  track: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.13)", marginTop: 8 },
  fill: { height: "100%", borderRadius: 3, backgroundColor: colors.primaryLight },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  warningText: { color: colors.amber, fontSize: 10.5, fontWeight: "900" },
  message: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 7, lineHeight: 14 },
  actions: { alignItems: "center", gap: 7 },
  roundBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.06)" },
  roundBtnCompact: { width: 30, height: 30, borderRadius: 15 },
  addBtn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  syncBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(182,255,63,0.22)", backgroundColor: "rgba(182,255,63,0.10)" },
});
