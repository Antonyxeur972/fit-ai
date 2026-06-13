import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse } from "react-native-svg";

/**
 * Stylized body silhouettes — 5 progression levels × 2 sexes.
 * Level 1 = very lean / underweight
 * Level 2 = lean / athletic-thin
 * Level 3 = athletic / fit average
 * Level 4 = muscular / clearly built
 * Level 5 = very muscular / bodybuilder physique
 */
export type SilhouetteSex = "male" | "female";

export const SILHOUETTE_LABELS: Record<number, string> = {
  1: "Très mince",
  2: "Mince athlétique",
  3: "Athlétique",
  4: "Musclé",
  5: "Très musclé",
};

const MALE_PATHS: Record<number, string> = {
  // Head, neck, then shoulders, torso, arms, waist, legs
  1: "M50 8 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16 Z M46 25 L54 25 L57 34 L62 34 L66 50 L64 56 L62 70 L60 90 L58 110 L57 140 L54 156 L50 156 L48 140 L48 110 L48 90 L42 110 L42 140 L40 156 L36 156 L37 140 L39 110 L40 90 L38 70 L36 56 L34 50 L38 34 L43 34 Z",
  2: "M50 8 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16 Z M45 25 L55 25 L60 33 L66 35 L70 52 L66 58 L63 70 L60 90 L58 110 L57 142 L54 158 L50 158 L48 142 L48 110 L48 90 L42 110 L42 142 L40 158 L36 158 L37 142 L39 110 L40 90 L37 70 L34 58 L30 52 L34 35 L40 33 Z",
  3: "M50 8 a9 9 0 1 1 0 18 a9 9 0 1 1 0 -18 Z M44 27 L56 27 L62 34 L70 36 L75 55 L70 60 L65 72 L62 92 L59 112 L58 142 L54 158 L50 158 L48 142 L48 110 L48 90 L42 110 L42 142 L40 158 L36 158 L36 142 L37 112 L35 92 L30 72 L30 60 L25 55 L30 36 L38 34 Z",
  4: "M50 6 a9 9 0 1 1 0 18 a9 9 0 1 1 0 -18 Z M40 25 L60 25 L70 34 L80 38 L82 58 L75 64 L70 76 L65 95 L62 115 L58 144 L54 160 L50 160 L48 144 L48 113 L48 92 L42 113 L42 144 L40 160 L36 160 L36 144 L34 115 L30 95 L25 76 L20 64 L17 58 L20 38 L30 34 Z",
  5: "M50 6 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 Z M38 25 L62 25 L74 34 L86 40 L88 60 L80 68 L72 80 L68 100 L64 118 L60 146 L55 160 L50 160 L47 144 L48 116 L48 95 L42 116 L42 144 L39 160 L34 160 L32 146 L28 118 L24 100 L20 80 L14 68 L12 60 L14 40 L26 34 Z",
};

const FEMALE_PATHS: Record<number, string> = {
  1: "M50 8 a7 7 0 1 1 0 14 a7 7 0 1 1 0 -14 Z M46 23 L54 23 L57 32 L62 34 L65 50 L62 56 L58 70 L54 88 L51 100 L46 100 L42 88 L38 70 L34 56 L32 50 L35 34 L43 32 Z M48 100 L52 100 L54 130 L56 156 L52 158 L50 130 L48 158 L44 156 L46 130 Z",
  2: "M50 8 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16 Z M45 24 L55 24 L60 33 L66 36 L68 52 L64 58 L60 72 L55 90 L51 100 L46 100 L41 90 L36 72 L32 58 L28 52 L30 36 L40 33 Z M48 100 L52 100 L56 130 L58 156 L52 158 L50 130 L48 158 L42 156 L44 130 Z",
  3: "M50 8 a8 8 0 1 1 0 16 a8 8 0 1 1 0 -16 Z M44 24 L56 24 L62 34 L70 38 L72 54 L66 60 L62 74 L57 92 L51 100 L45 100 L39 92 L34 74 L30 60 L24 54 L26 38 L38 34 Z M48 100 L52 100 L58 132 L60 158 L52 158 L50 130 L48 158 L40 158 L42 132 Z",
  4: "M50 8 a9 9 0 1 1 0 18 a9 9 0 1 1 0 -18 Z M42 25 L58 25 L66 34 L74 40 L76 58 L70 64 L64 78 L58 96 L52 104 L46 104 L40 96 L34 78 L28 64 L22 58 L24 40 L34 34 Z M46 104 L54 104 L60 134 L62 160 L52 160 L50 132 L48 160 L38 160 L40 134 Z",
  5: "M50 8 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 Z M40 25 L60 25 L70 35 L82 42 L84 62 L76 68 L68 82 L60 100 L52 108 L46 108 L40 100 L32 82 L24 68 L16 62 L18 42 L30 35 Z M46 108 L54 108 L62 138 L64 160 L52 160 L50 134 L48 160 L36 160 L38 138 Z",
};

export function Silhouette({
  sex,
  level,
  size = 110,
  active = false,
}: {
  sex: SilhouetteSex;
  level: number; // 1..5
  size?: number;
  active?: boolean;
}) {
  const clamped = Math.max(1, Math.min(5, level));
  const d = sex === "female" ? FEMALE_PATHS[clamped] : MALE_PATHS[clamped];
  const w = size;
  const h = size * 1.65;
  const fillId = `silhouetteGrad-${sex}-${clamped}-${active ? "on" : "off"}`;
  const stroke = active ? "#2D7C3E" : "#7A7A75";
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 100 170">
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={active ? "#A3DCB1" : "#D8D8D2"} stopOpacity="0.95" />
            <Stop offset="1" stopColor={active ? "#2D7C3E" : "#9A9A95"} stopOpacity="0.95" />
          </LinearGradient>
        </Defs>
        <Path
          d={d}
          fill={`url(#${fillId})`}
          stroke={stroke}
          strokeWidth={active ? 1.4 : 0.9}
          strokeLinejoin="round"
          fillRule="evenodd"
        />
        {/* Soft ground shadow */}
        <Ellipse cx="50" cy="166" rx="18" ry="2.2" fill={active ? "#2D7C3E" : "#9A9A95"} opacity="0.15" />
      </Svg>
    </View>
  );
}

export default Silhouette;
