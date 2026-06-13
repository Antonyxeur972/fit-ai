import { forwardRef } from "react";
import { View, Text, StyleSheet, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, Pattern, Rect, Circle } from "react-native-svg";
import { Mascot, MascotAnimal } from "./Mascot";
import { StrengthSymbol } from "./StrengthSymbol";

export type ShareCardData = {
  date?: string;
  focus?: string;
  duration_min?: number;
  points_today?: number;
  show_points?: boolean;
  mascot?: { animal: MascotAnimal; evolution?: 1 | 2 | 3 } | null;
  background_image_base64?: string | null;
  background_video_thumb_base64?: string | null;
  strength_evolution?: 1 | 2 | 3;
  strength_value?: number; // 0..1
};

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * Phase 5 redesign:
 *  - Vertical 9:16 story
 *  - White + green identity, no dark veil
 *  - "Training du jour" + FIT AI brand
 *  - NO user name shown
 *  - Mascot (line-art) + Strength symbol + duration + 💪 emoji
 *  - Points (optional)
 *  - Photo / video thumbnail as soft background WITHOUT any grey veil
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
    const bg = data.background_image_base64 || data.background_video_thumb_base64;
    const evolution = data.mascot?.evolution || data.strength_evolution || 1;

    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
        {/* Background image: NO dark veil. Use a soft white-to-green tint instead so text stays readable. */}
        {bg ? (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${bg}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            {/* Subtle white-green wash so text readable but image clearly visible */}
            <LinearGradient
              colors={["rgba(255,255,255,0.45)", "rgba(255,255,255,0.0)", "rgba(74,222,128,0.18)"]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <LinearGradient
            colors={["#FFFFFF", "#EAF7EF", "#D6EFDC"]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Decorative pattern lines */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
              <Circle cx="2" cy="2" r="1" fill="#2D7C3E" opacity="0.08" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#dots)" />
        </Svg>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brand}>FIT AI</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.date}>{dateStr.toUpperCase()}</Text>
          </View>
        </View>

        {/* Big "Training du jour" title */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleSmall}>TRAINING DU JOUR</Text>
          {!!data.focus && (
            <Text style={styles.focus} numberOfLines={2}>
              {data.focus}
            </Text>
          )}
          <View style={styles.titleBar} />
        </View>

        {/* Mascot + Strength symbol — central artwork */}
        <View style={styles.mascotRow}>
          <View style={styles.mascotCircle}>
            {data.mascot?.animal ? (
              <Mascot
                animal={data.mascot.animal}
                evolution={evolution}
                size={140}
                color="#0F3F1B"
                strokeWidth={2.4}
              />
            ) : (
              <Mascot animal="lion" evolution={1} size={140} color="#0F3F1B" strokeWidth={2.4} />
            )}
          </View>
          <View style={styles.strengthSlot}>
            <StrengthSymbol
              size={64}
              evolution={evolution}
              strength={data.strength_value ?? 0.5}
              color="#2D7C3E"
            />
          </View>
        </View>

        {/* Duration + points row */}
        <View style={styles.statsRow}>
          {typeof data.duration_min === "number" && data.duration_min > 0 && (
            <View style={styles.statChip}>
              <Text style={styles.statEmoji}>⏱️</Text>
              <View>
                <Text style={styles.statValue}>{data.duration_min} min</Text>
                <Text style={styles.statLabel}>Durée séance</Text>
              </View>
            </View>
          )}
          <View style={styles.statChip}>
            <Text style={styles.statEmoji}>💪</Text>
            <View>
              <Text style={styles.statValue}>Séance OK</Text>
              <Text style={styles.statLabel}>Terminée</Text>
            </View>
          </View>
          {data.show_points && typeof data.points_today === "number" && data.points_today > 0 && (
            <View style={[styles.statChip, styles.pointsChip]}>
              <Text style={styles.statEmoji}>✨</Text>
              <View>
                <Text style={[styles.statValue, { color: "#fff" }]}>+{data.points_today} pts</Text>
                <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.85)" }]}>Aujourd&apos;hui</Text>
              </View>
            </View>
          )}
        </View>

        {/* Watermark / footer */}
        <View style={styles.footer}>
          <View style={styles.watermarkRow}>
            <View style={styles.brandDotSmall} />
            <Text style={styles.watermark}>FIT AI</Text>
          </View>
          <Text style={styles.footerTagline}>Performance. Pas de fluff.</Text>
        </View>
      </View>
    );
  }
);
ShareCard.displayName = "ShareCard";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    padding: 22,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(45,124,62,0.18)",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 5,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2D7C3E" },
  brandDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2D7C3E" },
  brand: { color: "#0F3F1B", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  dateBox: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(45,124,62,0.18)",
  },
  date: { color: "#2D7C3E", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.5 },
  titleBlock: { gap: 6, zIndex: 5 },
  titleSmall: { color: "#2D7C3E", fontSize: 11, fontWeight: "900", letterSpacing: 3 },
  focus: {
    color: "#0F3F1B",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 34,
  },
  titleBar: { width: 36, height: 4, backgroundColor: "#4ADE80", borderRadius: 2, marginTop: 4 },
  mascotRow: { alignItems: "center", zIndex: 4, gap: 8 },
  mascotCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 2,
    borderColor: "rgba(45,124,62,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  strengthSlot: { marginTop: -16 },
  statsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", zIndex: 5 },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45,124,62,0.22)",
    flexGrow: 1,
    minWidth: 110,
  },
  pointsChip: { backgroundColor: "#2D7C3E", borderColor: "#2D7C3E" },
  statEmoji: { fontSize: 22 },
  statValue: { fontSize: 15, fontWeight: "900", color: "#0F3F1B" },
  statLabel: { fontSize: 9.5, fontWeight: "700", color: "#5A6B5E", letterSpacing: 0.5, textTransform: "uppercase" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 5,
  },
  watermarkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  watermark: { color: "#0F3F1B", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  footerTagline: { color: "#2D7C3E", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});

export default ShareCard;
