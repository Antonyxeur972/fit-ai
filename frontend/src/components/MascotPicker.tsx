import { Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Mascot, MascotAnimal, MASCOT_LABELS } from "./Mascot";
import { colors, spacing, radius, typography } from "../theme";

const ALL: MascotAnimal[] = ["lion", "tigre", "loup", "ours", "aigle"];

export function MascotPicker({
  selected,
  onChange,
  evolution = 1,
  size = 80,
}: {
  selected: MascotAnimal | null;
  onChange: (a: MascotAnimal) => void;
  evolution?: 1 | 2 | 3;
  size?: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {ALL.map((a) => {
        const isOn = selected === a;
        return (
          <TouchableOpacity
            key={a}
            onPress={() => onChange(a)}
            activeOpacity={0.8}
            style={[styles.card, isOn && styles.cardOn]}
            testID={`mascot-${a}`}
          >
            <Mascot
              animal={a}
              evolution={evolution}
              size={size}
              color={isOn ? colors.primary : "#6E8A72"}
              strokeWidth={isOn ? 2 : 1.4}
            />
            <Text style={[styles.label, isOn && { color: colors.primary, fontWeight: "800" }]}>
              {MASCOT_LABELS[a]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    width: 114,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(5,22,16,0.78)",
    alignItems: "center",
    gap: 5,
  },
  cardOn: {
    borderColor: colors.primaryLight,
    backgroundColor: "rgba(142,234,47,0.16)",
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  label: { ...typography.small, color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});

export default MascotPicker;
