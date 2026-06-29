import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse, G } from "react-native-svg";

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
  const torso = [
    `M${50 + 4} 24`,
    `C${50 + 9} 24 ${50 + sH - 3} 26 ${50 + sH} 29`,
    `C${50 + aO - 1} 36 ${50 + aO + 2} 47 ${50 + aO} 54`,
    `C${50 + aW + 5} 67 ${50 + aW + 5} 84 ${50 + aW + 2} 94`,
    `C${50 + aW} 97 ${50 + aW - 3} 97 ${50 + aW - 2} 93`,
    `C${50 + cH + 1} 69 ${50 + cH} 60 ${50 + cH - 1} 56`,
    `C${50 + cH - 2} 66 ${50 + wH + 1} 73 ${50 + wH} 78`,
    `C${50 + wH + 1} 84 ${50 + hH - 1} 87 ${50 + hH} 90`,
    `C${50 + hH + 3} 105 ${50 + hH + 1} 123 ${50 + hH - 1} 132`,
    `C${50 + hH - 3} 143 ${50 + lA + gap + 2} 153 ${50 + lA + gap} 160`,
    `L${50 + gap} 160`,
    `C${50 + gap + 2} 139 ${50 + gap + 3} 116 ${50 + gap} 101`,
    `C${50 + 2} 96 ${50 + 1} 94 50 92`,
    `C${50 - 1} 94 ${50 - 2} 96 ${50 - gap} 101`,
    `C${50 - gap - 3} 116 ${50 - gap - 2} 139 ${50 - gap} 160`,
    `L${50 - lA - gap} 160`,
    `C${50 - lA - gap - 2} 153 ${50 - hH + 3} 143 ${50 - (hH - 1)} 132`,
    `C${50 - hH - 1} 123 ${50 - hH - 3} 105 ${50 - hH} 90`,
    `C${50 - hH + 1} 87 ${50 - wH - 1} 84 ${50 - wH} 78`,
    `C${50 - wH - 1} 73 ${50 - cH + 2} 66 ${50 - (cH - 1)} 56`,
    `C${50 - cH} 60 ${50 - cH - 1} 69 ${50 - (aW - 2)} 93`,
    `C${50 - aW + 3} 97 ${50 - aW} 97 ${50 - (aW + 2)} 94`,
    `C${50 - aW - 5} 84 ${50 - aW - 5} 67 ${50 - aO} 54`,
    `C${50 - aO - 2} 47 ${50 - aO + 1} 36 ${50 - sH} 29`,
    `C${50 - sH + 3} 26 ${50 - 9} 24 ${50 - 4} 24`,
    "Z",
  ].join(" ");
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
  const glowId = `silhouetteGlow-${sex}-${clamped}-${active ? "on" : "off"}`;
  const stroke = active ? "#35D6E8" : "#7A7A75";
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 100 170">
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={active ? "#D7FFE4" : "#ECECE7"} stopOpacity="0.98" />
            <Stop offset="0.48" stopColor={active ? "#7FE3A1" : "#C4C4BD"} stopOpacity="0.96" />
            <Stop offset="1" stopColor={active ? "#1F7E50" : "#8B8B85"} stopOpacity="0.98" />
          </LinearGradient>
          <LinearGradient id={glowId} x1="12" y1="22" x2="88" y2="160">
            <Stop offset="0" stopColor="#35D6E8" stopOpacity={active ? "0.78" : "0.18"} />
            <Stop offset="0.6" stopColor="#8EEA2F" stopOpacity={active ? "0.54" : "0.12"} />
            <Stop offset="1" stopColor="#FFB33F" stopOpacity={active ? "0.48" : "0.08"} />
          </LinearGradient>
        </Defs>
        <Path d={d} fill={`url(#${glowId})`} opacity={active ? 0.18 : 0.08} transform="translate(0 2)" />
        <Path
          d={d}
          fill={`url(#${fillId})`}
          stroke={stroke}
          strokeWidth={active ? 1.7 : 0.9}
          strokeLinejoin="round"
        />
        <G opacity={active ? 0.42 : 0.16}>
          <Path d="M50 30 C45 46 44 62 47 78" stroke="#FFFFFF" strokeWidth={1.1} strokeLinecap="round" fill="none" />
          <Path d="M50 30 C55 46 56 62 53 78" stroke="#06120B" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.36} />
          <Path d="M35 88 C42 94 58 94 65 88" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" fill="none" />
        </G>
        {/* Soft ground shadow */}
        <Ellipse cx="50" cy="166" rx="20" ry="2.4" fill={active ? "#35D6E8" : "#9A9A95"} opacity="0.18" />
      </Svg>
    </View>
  );
}

export default Silhouette;
