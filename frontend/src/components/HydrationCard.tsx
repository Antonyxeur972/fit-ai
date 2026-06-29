import { useEffect, useMemo, useState } from "react";
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../theme";

const STEP_ML = 250;
const hydrationListeners = new Set<(amountMl: number) => void>();

export function HydrationCard({ goalMl = 2500 }: { goalMl?: number }) {
  const storageKey = useMemo(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return `fitai:hydration:${date}`;
  }, []);
  const [amountMl, setAmountMl] = useState(0);

  useEffect(() => {
    const sync = (nextAmount: number) => setAmountMl(nextAmount);
    hydrationListeners.add(sync);
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved) setAmountMl(Math.max(0, Number(saved) || 0));
    }).catch(() => undefined);
    return () => { hydrationListeners.delete(sync); };
  }, [storageKey]);

  const changeAmount = (delta: number) => {
    const next = Math.max(0, Math.min(goalMl + 1000, amountMl + delta));
    void AsyncStorage.setItem(storageKey, String(next));
    hydrationListeners.forEach((listener) => listener(next));
  };

  const progress = Math.min(1, amountMl / goalMl);
  const liters = (amountMl / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const goalLiters = (goalMl / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  return (
    <ImageBackground
      source={require("../../assets/images/fitai-hydration-card-hd.png")}
      style={styles.card}
      imageStyle={styles.image}
      resizeMode="cover"
      testID="hydration-card"
    >
      <LinearGradient
        colors={["rgba(1,31,35,0.94)", "rgba(1,38,40,0.66)", "rgba(1,20,22,0.08)"]}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.content}>
        <Text style={styles.title}>Hydratation</Text>
        <Text style={styles.today}>Aujourd&apos;hui</Text>
        <View style={styles.amountRow}>
          <Ionicons name="water" size={25} color="#52D8F6" />
          <Text style={styles.amount}>{liters} L</Text>
        </View>
        <Text style={styles.goal}>/ {goalLiters} L</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityLabel="Retirer 250 millilitres"
            onPress={() => changeAmount(-STEP_ML)}
            style={styles.iconButton}
            disabled={amountMl === 0}
            testID="hydration-minus"
          >
            <Ionicons name="remove" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Ajouter 250 millilitres"
            onPress={() => changeAmount(STEP_ML)}
            style={[styles.iconButton, styles.addButton]}
            testID="hydration-plus"
          >
            <Ionicons name="add" size={22} color="#102108" />
            <Text style={styles.addLabel}>250 ml</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 205,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(82,216,246,0.26)",
    backgroundColor: "#053D42",
  },
  image: { borderRadius: radius.md },
  content: { width: "59%", padding: spacing.md, minHeight: 205, justifyContent: "center" },
  title: { ...typography.body, fontWeight: "900", color: "#FFFFFF" },
  today: { ...typography.small, color: "rgba(255,255,255,0.72)", marginTop: 2 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm },
  amount: { fontSize: 28, lineHeight: 32, fontWeight: "900", color: "#FFFFFF" },
  goal: { fontSize: 11, color: "rgba(255,255,255,0.62)", marginLeft: 32 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: spacing.sm, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#52D8F6" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  iconButton: { height: 38, minWidth: 42, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  addButton: { flexDirection: "row", gap: 3, paddingHorizontal: 10, backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  addLabel: { fontSize: 11, fontWeight: "900", color: "#102108" },
});
