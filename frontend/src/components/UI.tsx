import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle, ImageBackground } from "react-native";
import { ReactNode } from "react";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Path, Polyline } from "react-native-svg";
import { colors, radius, spacing, shadow, typography } from "../theme";

// --- GlassCard (dark glassmorphism) ---
export function GlassCard({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <BlurView intensity={18} tint="dark" style={[glassCardStyle.card, style]} testID={testID}>
      {children}
    </BlurView>
  );
}
const glassCardStyle = StyleSheet.create({
  card: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(100,255,100,0.15)", padding: 16 },
});

// --- ScreenBg (nature background + gradient overlay) ---
export function ScreenBg({ children, uri, style }: { children: ReactNode; uri: string; style?: ViewStyle }) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <ImageBackground source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={["rgba(0,15,0,0.60)", "rgba(0,20,0,0.28)", "rgba(0,15,0,0.52)", "rgba(0,8,0,0.97)"]}
        locations={[0, 0.25, 0.6, 0.88]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

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
          <SvgLinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primaryLight} />
            <Stop offset="1" stopColor={colors.primary} />
          </SvgLinearGradient>
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

// --- Line chart 1RM progression ---
export function LineChart1RM({
  data,
  width = 320,
  height = 140,
  color = colors.primary,
  testID,
}: {
  data: { x: number; y: number }[]; // x = timestamp ms, y = 1rm kg
  width?: number;
  height?: number;
  color?: string;
  testID?: string;
}) {
  if (data.length === 0) return null;
  const pad = { top: 14, right: 12, bottom: 22, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  // Add 10% padding to y range for breathing room
  const yPad = (maxY - minY) * 0.12 || maxY * 0.1 || 1;
  const lowY = minY - yPad;
  const highY = maxY + yPad;
  const spanY = highY - lowY || 1;

  const scaleX = (x: number) => pad.left + ((x - minX) / spanX) * w;
  const scaleY = (y: number) => pad.top + h - ((y - lowY) / spanY) * h;

  const points = data
    .map((d) => `${scaleX(d.x).toFixed(1)},${scaleY(d.y).toFixed(1)}`)
    .join(" ");

  // Area under curve
  const areaPath = (() => {
    if (data.length < 2) return "";
    const top = data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.x).toFixed(1)} ${scaleY(d.y).toFixed(1)}`)
      .join(" ");
    const last = data[data.length - 1];
    const first = data[0];
    return `${top} L ${scaleX(last.x).toFixed(1)} ${(pad.top + h).toFixed(1)} L ${scaleX(first.x).toFixed(1)} ${(pad.top + h).toFixed(1)} Z`;
  })();

  // Y axis labels (low, mid, high)
  const yLabels = [highY, (highY + lowY) / 2, lowY];

  return (
    <View testID={testID} style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="rmgrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.25} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        {/* gridlines */}
        {yLabels.map((y, i) => {
          const py = scaleY(y);
          return (
            <Polyline
              key={i}
              points={`${pad.left},${py.toFixed(1)} ${(pad.left + w).toFixed(1)},${py.toFixed(1)}`}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="4 6"
            />
          );
        })}
        {data.length > 1 && <Path d={areaPath} fill="url(#rmgrad)" />}
        {data.length > 1 && (
          <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {data.map((d, i) => (
          <Circle
            key={i}
            cx={scaleX(d.x)}
            cy={scaleY(d.y)}
            r={i === data.length - 1 ? 5 : 3.5}
            fill={i === data.length - 1 ? color : "#fff"}
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </Svg>
      {/* Y axis labels (rendered with absolute text views) */}
      {yLabels.map((y, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: 0,
            top: scaleY(y) - 8,
            width: pad.left - 4,
          }}
        >
          <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: "right" }}>
            {Math.round(y)}
          </Text>
        </View>
      ))}
      {/* X axis: first & last date */}
      <View style={{ position: "absolute", left: pad.left, right: pad.right, bottom: 2, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          {new Date(minX).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textMuted }}>
          {new Date(maxX).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
        </Text>
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
