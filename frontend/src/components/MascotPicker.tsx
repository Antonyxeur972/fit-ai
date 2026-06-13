import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
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
              color={isOn ? colors.primary : "#5C6B5E"}
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
    width: 108,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 4,
  },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  label: { ...typography.small, color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});

export default MascotPicker;
