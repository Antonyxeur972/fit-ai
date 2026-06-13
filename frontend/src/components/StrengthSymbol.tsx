import { View } from "react-native";
import Svg, { Path, Circle, G } from "react-native-svg";

/**
 * Strength symbol — abstract reinforced ring/shield.
 * Layers grow with `evolution` (1..3). Stroke thickens with `level` (0..1 normalized).
 * No numeric badge ever — the visual itself encodes progress.
 */
export function StrengthSymbol({
  size = 56,
  evolution = 1,
  strength = 0.2, // 0..1
  color = "#2D7C3E",
  background = "transparent",
}: {
  size?: number;
  evolution?: 1 | 2 | 3;
  strength?: number;
  color?: string;
  background?: string;
}) {
  const ev = Math.max(1, Math.min(3, evolution));
  const s = Math.max(0, Math.min(1, strength));
  const baseStroke = 1.6 + s * 1.4;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {background !== "transparent" && <Circle cx="50" cy="50" r="48" fill={background} />}
        <G fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
          {/* Always: outer reinforced ring (stroke increases with strength) */}
          <Circle cx="50" cy="50" r="40" strokeWidth={baseStroke + 1.4} />
          {/* Always: inner shield */}
          <Path
            d="M50 22 L70 32 L70 56 Q 50 76 30 56 L 30 32 Z"
            strokeWidth={baseStroke + 0.6}
          />
          {/* Stage 2+: cross-bars on shield */}
          {ev >= 2 && (
            <>
              <Path d="M40 42 L60 42" strokeWidth={baseStroke + 0.4} />
              <Path d="M40 52 L60 52" strokeWidth={baseStroke + 0.4} />
            </>
          )}
          {/* Stage 3: external laurels (no level number, just denser symbol) */}
          {ev >= 3 && (
            <>
              <Path d="M16 50 Q 24 38 22 24" strokeWidth={baseStroke} />
              <Path d="M16 50 Q 24 62 22 76" strokeWidth={baseStroke} />
              <Path d="M84 50 Q 76 38 78 24" strokeWidth={baseStroke} />
              <Path d="M84 50 Q 76 62 78 76" strokeWidth={baseStroke} />
              {/* center rivet */}
              <Circle cx="50" cy="60" r="3" fill={color} stroke="none" />
            </>
          )}
        </G>
      </Svg>
    </View>
  );
}

export default StrengthSymbol;
