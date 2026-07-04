import { forwardRef } from "react";
import { View, Text, StyleSheet, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Pattern, Rect, Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import type { MascotAnimal } from "./Mascot";
import { MascotPortrait } from "./MascotPortrait";

export type ShareCardData = {
  date?: string;
  focus?: string;
  duration_min?: number;
  points_today?: number;
  show_points?: boolean;
  mascot?: { animal: MascotAnimal; evolution?: 1 | 2 | 3 } | null;
  background_image_base64?: string | null;
  background_image_uri?: string | null;
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
 *  - Mascot portrait + Strength symbol + duration
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
    const bgUri = data.background_image_uri || null;
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
        {/* Background image: NO dark veil. Use a soft white-to-green tint instead so text stays readable. */}
        {bg || bgUri ? (
          <>
            <Image
              source={bg ? { uri: `data:image/jpeg;base64,${bg}` } : { uri: bgUri! }}
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
          <>
            <Image
              source={require("../../assets/images/fitai-hero-activities-hd.png")}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(255,255,255,0.38)", "rgba(255,255,255,0.06)", "rgba(74,222,128,0.18)"]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
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
        <View pointerEvents="none" style={styles.frameOuter}>
          <View style={styles.frameInner} />
        </View>

        {/* Header — FIT AI brand with leaf logo, prominent */}
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="leaf" size={24} color="#2D7C3E" />
            </View>
            <Text style={styles.brand}>FIT AI</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.date}>{dateStr.toUpperCase()}</Text>
          </View>
        </View>

        {/* Focus title */}
        {!!data.focus && (
          <View style={styles.titleBlock}>
            <Text style={styles.titleSmall}>TRAINING DU JOUR</Text>
            <Text style={styles.focus} numberOfLines={2}>
              {data.focus}
            </Text>
            <View style={styles.titleBar} />
          </View>
        )}

        {/* Duration — big hero number */}
        {typeof data.duration_min === "number" && data.duration_min > 0 && (
          <View style={styles.durationBlock}>
            <Text style={styles.durationValue}>{data.duration_min}min</Text>
            <Text style={styles.durationLabel}>de séance</Text>
          </View>
        )}

        {/* Mascot — small accent */}
        <View style={styles.mascotRow}>
          <View style={styles.mascotCircle}>
            {data.mascot?.animal ? (
              <MascotPortrait animal={data.mascot.animal} size={56} active />
            ) : (
              <MascotPortrait animal="lion" size={56} active />
            )}
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
          <View style={styles.shareTag}>
            <Ionicons name="share-social-outline" size={13} color="#0F3F1B" />
            <Text style={styles.shareTagText}>Partager</Text>
          </View>
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
  frameOuter: {
    position: "absolute",
    inset: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.62)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  frameInner: {
    flex: 1,
    margin: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 5,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBadge: {
    width: 32, height: 32,
    alignItems: "center", justifyContent: "center",
  },
  brandDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2D7C3E" },
  brand: { color: "#0F3F1B", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
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
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  titleBar: { width: 36, height: 4, backgroundColor: "#4ADE80", borderRadius: 2, marginTop: 4 },
  durationBlock: { alignItems: "center", zIndex: 5 },
  durationValue: {
    color: "#0F3F1B",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1,
  },
  durationLabel: {
    color: "#2D7C3E",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: -6,
  },
  mascotRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", zIndex: 4, gap: 10 },
  mascotCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 2,
    borderColor: "rgba(45,124,62,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  shareTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(45,124,62,0.18)",
  },
  shareTagText: { color: "#0F3F1B", fontSize: 11, fontWeight: "800" },
  footerTagline: { color: "#2D7C3E", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
});

export default ShareCard;
