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

type SilParams = {
  sH: number; // shoulder half-width
  cH: number; // chest/armpit half-width
  wH: number; // waist half-width
  hH: number; // hip half-width
  aO: number; // arm outer reach at elbow
  aW: number; // wrist half-width
  lA: number; // ankle half-width
  gap: number; // half-gap between legs
  hr: number; // head radius
};

// Build a clean, symmetric humanoid silhouette path from a small set of body parameters.
function buildSilhouette(p: SilParams): string {
  const { sH, cH, wH, hH, aO, aW, lA, gap, hr } = p;
  const body = [
    [50 + 4, 24], // neck R
    [50 + sH, 28], // shoulder R
    [50 + aO, 52], // elbow R
    [50 + aW + 2, 94], // wrist R outer
    [50 + aW - 2, 94], // wrist R inner
    [50 + cH - 1, 56], // armpit R
    [50 + wH, 78], // waist R
    [50 + hH, 88], // hip R
    [50 + hH - 1, 132], // thigh R
    [50 + lA + gap, 160], // ankle R outer
    [50 + gap, 160], // ankle R inner
    [50 + gap, 100], // crotch up R
    [50, 92], // crotch center
    [50 - gap, 100], // crotch up L
    [50 - gap, 160], // ankle L inner
    [50 - lA - gap, 160], // ankle L outer
    [50 - (hH - 1), 132], // thigh L
    [50 - hH, 88], // hip L
    [50 - wH, 78], // waist L
    [50 - (cH - 1), 56], // armpit L
    [50 - (aW - 2), 94], // wrist L inner
    [50 - (aW + 2), 94], // wrist L outer
    [50 - aO, 52], // elbow L
    [50 - sH, 28], // shoulder L
    [50 - 4, 24], // neck L
  ];
  const torso = `M${body.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
  const head = `M${50 + hr} 14 a${hr} ${hr} 0 1 0 ${-2 * hr} 0 a${hr} ${hr} 0 1 0 ${2 * hr} 0 Z`;
  return `${head} ${torso}`;
}

const MALE_LEVELS: SilParams[] = [
  { sH: 14, cH: 12, wH: 9, hH: 11, aO: 17, aW: 6, lA: 5, gap: 2, hr: 8 },
  { sH: 15, cH: 13, wH: 9.5, hH: 11.5, aO: 18, aW: 6.5, lA: 5.5, gap: 2, hr: 8 },
  { sH: 16, cH: 14, wH: 10, hH: 12, aO: 19, aW: 7, lA: 6, gap: 2, hr: 8 },
  { sH: 18, cH: 15, wH: 11, hH: 13, aO: 21, aW: 8, lA: 7, gap: 2.5, hr: 8 },
  { sH: 20, cH: 17, wH: 12, hH: 14, aO: 23, aW: 9, lA: 8, gap: 2.5, hr: 8 },
];

const FEMALE_LEVELS: SilParams[] = [
  { sH: 11, cH: 10, wH: 7, hH: 12, aO: 13, aW: 5, lA: 5, gap: 2, hr: 7.5 },
  { sH: 12, cH: 10.5, wH: 7.5, hH: 13, aO: 14, aW: 5.5, lA: 5, gap: 2, hr: 7.5 },
  { sH: 12.5, cH: 11, wH: 7.5, hH: 14, aO: 14.5, aW: 6, lA: 5.5, gap: 2, hr: 7.5 },
  { sH: 13, cH: 11.5, wH: 8, hH: 15, aO: 15, aW: 6.5, lA: 6, gap: 2, hr: 7.5 },
  { sH: 14, cH: 12, wH: 8.5, hH: 16, aO: 16, aW: 7, lA: 6.5, gap: 2, hr: 7.5 },
];

const MALE_PATHS: Record<number, string> = {
  1: buildSilhouette(MALE_LEVELS[0]),
  2: buildSilhouette(MALE_LEVELS[1]),
  3: buildSilhouette(MALE_LEVELS[2]),
  4: buildSilhouette(MALE_LEVELS[3]),
  5: buildSilhouette(MALE_LEVELS[4]),
};

const FEMALE_PATHS: Record<number, string> = {
  1: buildSilhouette(FEMALE_LEVELS[0]),
  2: buildSilhouette(FEMALE_LEVELS[1]),
  3: buildSilhouette(FEMALE_LEVELS[2]),
  4: buildSilhouette(FEMALE_LEVELS[3]),
  5: buildSilhouette(FEMALE_LEVELS[4]),
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
        />
        {/* Soft ground shadow */}
        <Ellipse cx="50" cy="166" rx="18" ry="2.2" fill={active ? "#2D7C3E" : "#9A9A95"} opacity="0.15" />
      </Svg>
    </View>
  );
}

export default Silhouette;
