import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { MascotAnimal, MASCOT_LABELS } from "./Mascot";
import { MascotPortrait } from "./MascotPortrait";
import { colors, spacing, radius, typography } from "../theme";

const ALL: MascotAnimal[] = ["lion", "tigre", "loup", "ours", "aigle"];

export function MascotPicker({
  selected,
  onChange,
  size = 80,
}: {
  selected: MascotAnimal | null;
  onChange: (a: MascotAnimal) => void;
  evolution?: 1 | 2 | 3;
  size?: number;
}) {
  const portraitSize = Math.max(104, size + 24);

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
            <MascotPortrait animal={a} size={portraitSize} active={isOn} />
            <Text style={[styles.label, isOn && { color: colors.primary, fontWeight: "800" }]}>
              {MASCOT_LABELS[a]}
            </Text>
            {isOn ? (
              <View style={styles.check}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    width: 154,
    minHeight: 166,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(5,22,16,0.72)",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    overflow: "hidden",
  },
  cardOn: {
    borderColor: colors.primaryLight,
    backgroundColor: "rgba(142,234,47,0.15)",
    shadowColor: colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  label: { ...typography.small, color: colors.textSecondary, fontSize: 17, marginTop: 2, fontWeight: "800" },
  check: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
  },
  checkText: { color: "#102108", fontSize: 16, fontWeight: "900" },
});

export default MascotPicker;
