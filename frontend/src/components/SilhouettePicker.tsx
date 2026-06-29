import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Silhouette, SilhouetteSex, SILHOUETTE_LABELS } from "./Silhouette";
import { colors, spacing, typography, radius } from "../theme";

export function SilhouettePicker({
  sex,
  level,
  onChange,
  showSexToggle = true,
}: {
  sex: SilhouetteSex;
  level: number;
  onChange: (sex: SilhouetteSex, level: number) => void;
  showSexToggle?: boolean;
}) {
  const [localSex, setLocalSex] = useState<SilhouetteSex>(sex);
  const setSex = (s: SilhouetteSex) => {
    setLocalSex(s);
    onChange(s, level);
  };

  return (
    <View style={{ gap: spacing.md }}>
      {showSexToggle && (
        <View style={styles.sexRow}>
          {(["male", "female"] as SilhouetteSex[]).map((s) => {
            const isOn = localSex === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setSex(s)}
                style={[styles.sexChip, isOn && styles.sexChipOn]}
                testID={`silhouette-sex-${s}`}
              >
                <Ionicons
                  name={s === "male" ? "male" : "female"}
                  size={16}
                  color={isOn ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.sexLabel,
                    isOn && { color: colors.primary, fontWeight: "700" },
                  ]}
                >
                  {s === "male" ? "Homme" : "Femme"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {[1, 2, 3, 4, 5].map((lv) => {
          const isOn = level === lv;
          return (
            <TouchableOpacity
              key={lv}
              onPress={() => onChange(localSex, lv)}
              activeOpacity={0.7}
              style={[styles.card, isOn && styles.cardOn]}
              testID={`silhouette-level-${lv}`}
            >
              <Silhouette sex={localSex} level={lv} size={70} active={isOn} />
              <Text
                style={[
                  styles.cardLabel,
                  isOn && { color: colors.primary, fontWeight: "800" },
                ]}
                numberOfLines={1}
              >
                {SILHOUETTE_LABELS[lv]}
              </Text>
              <View style={[styles.lvBadge, isOn && styles.lvBadgeOn]}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "800",
                    color: isOn ? "#fff" : colors.textSecondary,
                  }}
                >
                  N{lv}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sexRow: { flexDirection: "row", gap: spacing.sm },
  sexChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "rgba(5,22,16,0.78)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  sexChipOn: { backgroundColor: "rgba(53,214,232,0.13)", borderColor: colors.aqua },
  sexLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  row: { gap: spacing.sm, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    width: 100,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(5,22,16,0.78)",
    alignItems: "center",
    gap: 4,
  },
  cardOn: {
    borderColor: colors.aqua,
    backgroundColor: "rgba(53,214,232,0.12)",
    shadowColor: colors.aqua,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cardLabel: {
    ...typography.small,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  lvBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: "rgba(3,18,14,0.92)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  lvBadgeOn: { backgroundColor: colors.aqua, borderColor: colors.aqua },
});

export default SilhouettePicker;
