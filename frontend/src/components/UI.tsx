import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { ReactNode } from "react";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, radius, spacing, shadow, typography } from "../theme";

// --- Card ---
export function Card({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

// --- Primary Button ---
type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  icon?: ReactNode;
};

export function Button({ title, onPress, loading, variant = "primary", disabled, testID, style, icon }: ButtonProps) {
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? colors.primary : variant === "secondary" ? colors.primaryPale : "transparent";
  const fg = variant === "primary" ? "#fff" : colors.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.55 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// --- Section Title ---
export function SectionTitle({ title, action, testID }: { title: string; action?: ReactNode; testID?: string }) {
  return (
    <View style={styles.sectionRow} testID={testID}>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{title}</Text>
      {action}
    </View>
  );
}

// --- Stat ---
export function Stat({
  label,
  value,
  unit,
  align = "left",
  style,
  valueStyle,
  testID,
}: {
  label: string;
  value: string | number;
  unit?: string;
  align?: "left" | "center";
  style?: ViewStyle;
  valueStyle?: TextStyle;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[{ alignItems: align === "center" ? "center" : "flex-start" }, style]}>
      <Text style={[typography.caption, { marginBottom: 4 }]}>{label}</Text>
      <Text style={[styles.statValue, valueStyle]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

// --- Progress Ring ---
export function ProgressRing({
  size = 180,
  stroke = 14,
  progress, // 0-1
  color = colors.primary,
  trackColor = colors.primaryPale,
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primaryLight} />
            <Stop offset="1" stopColor={colors.primary} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color === colors.primary ? "url(#grad)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

// --- Macro Bar ---
export function MacroBar({
  label,
  current,
  target,
  color,
  testID,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  testID?: string;
}) {
  const pct = target > 0 ? Math.min(1, current / target) : 0;
  return (
    <View testID={testID} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={[typography.small, { color: colors.textMain, fontWeight: "600" }]}>{label}</Text>
        <Text style={typography.small}>
          {current}g{" "}
          <Text style={{ color: colors.textMuted }}>/ {target}g</Text>
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// --- Bar chart (week consumed vs target) ---
export function WeekBars({
  days,
  target,
  testID,
}: {
  days: { date: string; consumed: number }[];
  target: number;
  testID?: string;
}) {
  const max = Math.max(target, ...days.map((d) => d.consumed), 1);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-end", height: 140, gap: 8 }}>
      {days.map((d) => {
        const h = (d.consumed / max) * 110;
        const ratio = target > 0 ? d.consumed / target : 0;
        const over = ratio > 1.05;
        const bg = d.consumed === 0 ? colors.border : over ? colors.alert : colors.primary;
        const day = new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short" });
        return (
          <View key={d.date} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View
                style={{
                  width: 18,
                  height: Math.max(4, h),
                  backgroundColor: bg,
                  borderTopLeftRadius: 9,
                  borderTopRightRadius: 9,
                  borderBottomLeftRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </View>
            <Text style={[typography.caption, { marginTop: 6 }]}>{day.slice(0, 3)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  btn: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  btnText: { fontSize: 15, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  statValue: { fontSize: 26, fontWeight: "700", color: colors.textMain, letterSpacing: -0.4 },
  statUnit: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  macroTrack: {
    height: 8,
    backgroundColor: colors.primaryPale,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  macroFill: { height: "100%", borderRadius: radius.full },
});
