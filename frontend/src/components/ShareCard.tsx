import { forwardRef } from "react";
import { View, Text, StyleSheet, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export type ShareCardData = {
  user_name?: string;
  date?: string; // e.g. "13 juin 2026"
  focus?: string; // e.g. "Push · Force"
  duration_min?: number;
  total_volume_kg?: number; // sum of weight × reps × sets
  exercises_count?: number;
  prs?: { exercise: string; est_1rm: number; delta_kg?: number }[];
  best_set?: { exercise: string; weight_kg: number; reps: number };
  background_image_base64?: string | null; // optional photo background
};

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * Vertical 9:16 story-format card for sharing a workout summary.
 * Cream / dark premium design — pure data, zero motivational fluff.
 * The wrapper view is `collapsable={false}` so react-native-view-shot can capture it.
 */
export const ShareCard = forwardRef<View, { data: ShareCardData; width?: number }>(
  ({ data, width = Math.min(360, SCREEN_W - 32) }, ref) => {
    const aspect = 16 / 9;
    const height = Math.round(width * aspect);
    const dateStr = data.date || new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
        {/* Background: photo + dark overlay, or pure dark */}
        {data.background_image_base64 ? (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${data.background_image_base64}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(15,18,16,0.55)", "rgba(15,18,16,0.85)", "rgba(15,18,16,0.97)"]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <LinearGradient
            colors={["#16201A", "#0B0F0C"]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Subtle green accent line */}
        <View style={styles.accentBar} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brand}>FIT AI</Text>
          </View>
          <Text style={styles.date}>{dateStr.toUpperCase()}</Text>
        </View>

        {/* Title block */}
        <View style={styles.titleBlock}>
          {data.user_name ? (
            <Text style={styles.helloLabel}>{data.user_name.split(" ")[0].toUpperCase()}</Text>
          ) : null}
          <Text style={styles.focus}>{data.focus || "Séance terminée"}</Text>
          <View style={styles.divider} />
        </View>

        {/* Hero stats */}
        <View style={styles.heroRow}>
          {typeof data.total_volume_kg === "number" && data.total_volume_kg > 0 && (
            <View style={styles.heroItem}>
              <Text style={styles.heroValue}>
                {data.total_volume_kg >= 1000
                  ? `${(data.total_volume_kg / 1000).toFixed(1)}t`
                  : `${Math.round(data.total_volume_kg)}`}
              </Text>
              <Text style={styles.heroLabel}>
                {data.total_volume_kg >= 1000 ? "Tonnes levées" : "Kg levés"}
              </Text>
            </View>
          )}
          {typeof data.duration_min === "number" && data.duration_min > 0 && (
            <View style={styles.heroItem}>
              <Text style={styles.heroValue}>{data.duration_min}</Text>
              <Text style={styles.heroLabel}>Minutes</Text>
            </View>
          )}
          {typeof data.exercises_count === "number" && data.exercises_count > 0 && (
            <View style={styles.heroItem}>
              <Text style={styles.heroValue}>{data.exercises_count}</Text>
              <Text style={styles.heroLabel}>Exercices</Text>
            </View>
          )}
        </View>

        {/* PRs */}
        {data.prs && data.prs.length > 0 && (
          <View style={styles.prsBlock}>
            <View style={styles.prHeader}>
              <Ionicons name="flash" size={14} color="#4ADE80" />
              <Text style={styles.prHeaderText}>RECORDS DU JOUR</Text>
            </View>
            {data.prs.slice(0, 3).map((p, idx) => (
              <View key={`${p.exercise}-${idx}`} style={styles.prRow}>
                <Text style={styles.prName} numberOfLines={1}>
                  {p.exercise}
                </Text>
                <Text style={styles.prValue}>
                  {p.est_1rm.toFixed(0)}
                  <Text style={styles.prUnit}> kg</Text>
                </Text>
                {typeof p.delta_kg === "number" && p.delta_kg > 0 ? (
                  <View style={styles.deltaPill}>
                    <Text style={styles.deltaText}>+{p.delta_kg.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Best set fallback */}
        {(!data.prs || data.prs.length === 0) && data.best_set && (
          <View style={styles.prsBlock}>
            <View style={styles.prHeader}>
              <Ionicons name="barbell" size={14} color="#4ADE80" />
              <Text style={styles.prHeaderText}>MEILLEURE SÉRIE</Text>
            </View>
            <Text style={styles.bestSetName} numberOfLines={1}>{data.best_set.exercise}</Text>
            <Text style={styles.bestSetVal}>
              {data.best_set.weight_kg} kg <Text style={styles.heroLabel}>×</Text> {data.best_set.reps}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerTagline}>Performance · pas de fluff.</Text>
        </View>
      </View>
    );
  }
);
ShareCard.displayName = "ShareCard";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0B0F0C",
    borderRadius: 24,
    overflow: "hidden",
    padding: 24,
    justifyContent: "space-between",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#4ADE80",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  brand: {
    color: "#FAFAF8",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  date: {
    color: "#A6B0A8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  titleBlock: { marginTop: 8 },
  helloLabel: {
    color: "#A6B0A8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  focus: {
    color: "#FAFAF8",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  divider: {
    width: 36,
    height: 3,
    backgroundColor: "#4ADE80",
    marginTop: 12,
    borderRadius: 2,
  },
  heroRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  heroItem: { flex: 1 },
  heroValue: {
    color: "#FAFAF8",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 34,
  },
  heroLabel: {
    color: "#7A8A7E",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  prsBlock: {
    backgroundColor: "rgba(74, 222, 128, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.25)",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  prHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  prHeaderText: {
    color: "#4ADE80",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  prName: { color: "#D9E0DA", fontSize: 14, fontWeight: "600", flex: 1 },
  prValue: { color: "#FAFAF8", fontSize: 20, fontWeight: "800" },
  prUnit: { fontSize: 11, color: "#7A8A7E", fontWeight: "700" },
  deltaPill: {
    backgroundColor: "#4ADE80",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  deltaText: { color: "#0B0F0C", fontSize: 10, fontWeight: "800" },
  bestSetName: { color: "#D9E0DA", fontSize: 14, fontWeight: "600" },
  bestSetVal: { color: "#FAFAF8", fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  footer: {
    alignItems: "center",
  },
  footerTagline: {
    color: "#A6B0A8",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});

export default ShareCard;
