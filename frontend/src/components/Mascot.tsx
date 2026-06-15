import { View } from "react-native";
import Svg, { Path, Circle, G } from "react-native-svg";

export type MascotAnimal = "lion" | "tigre" | "loup" | "ours" | "aigle";

export const MASCOT_LABELS: Record<MascotAnimal, string> = {
  lion: "Lion",
  tigre: "Tigre",
  loup: "Loup",
  ours: "Ours",
  aigle: "Aigle",
};

/**
 * Stylized line-art mascots. 5 animals × 3 evolution stages.
 * Stage 1 = "Jeune" (lean, small, simple)
 * Stage 2 = "Adulte" (full features, balanced)
 * Stage 3 = "Légendaire" (crest / additional accents / shaded backdrop)
 *
 * All SVGs use a 100×100 viewBox. We draw with stroke only (no fill) for the line-art look.
 */

type Variant = { paths: string[]; accents?: string[] };

const LION: Record<1 | 2 | 3, Variant> = {
  1: {
    paths: [
      // head circle + ears
      "M50 32 m -18 0 a 18 18 0 1 0 36 0 a 18 18 0 1 0 -36 0",
      "M35 20 q 1 -5 5 -6",
      "M65 20 q -1 -5 -5 -6",
      // eyes
      "M44 32 q 1 -1 2 0",
      "M54 32 q 1 -1 2 0",
      // muzzle + fangs
      "M50 36 q -3 4 0 6 q 3 -2 0 -6",
      "M46 41 l -1.5 4",
      "M54 41 l 1.5 4",
      // sharp brow
      "M42 29 l 4 1",
      "M58 29 l -4 1",
      // mane spikes
      "M33 24 l -5 -3",
      "M67 24 l 5 -3",
      "M32 34 l -5 1",
      "M68 34 l 5 1",
      // body
      "M40 50 q 10 8 20 0",
      "M40 50 q 0 16 6 22",
      "M60 50 q 0 16 -6 22",
      // claws
      "M44 72 l -2 4",
      "M56 72 l 2 4",
      // tail
      "M58 70 q 12 4 14 -8",
    ],
  },
  2: {
    paths: [
      // Mane (sun-rays around head)
      "M50 32 m -22 0 a 22 22 0 1 0 44 0 a 22 22 0 1 0 -44 0",
      "M28 32 l -6 -2",
      "M28 22 l -4 -6",
      "M50 10 l 0 -6",
      "M72 22 l 4 -6",
      "M72 32 l 6 -2",
      "M72 42 l 6 2",
      "M28 42 l -6 2",
      "M50 54 l 0 4",
      // Inner head
      "M50 32 m -14 0 a 14 14 0 1 0 28 0 a 14 14 0 1 0 -28 0",
      "M44 30 a 1.5 1.5 0 1 1 0.1 0",
      "M56 30 a 1.5 1.5 0 1 1 0.1 0",
      "M50 35 q -3 4 0 6 q 3 -2 0 -6",
      // body
      "M38 56 q 12 10 24 0",
      "M38 56 q -2 20 8 28",
      "M62 56 q 2 20 -8 28",
      // legs
      "M44 84 l 0 8",
      "M56 84 l 0 8",
      // tail tuft
      "M62 70 q 14 6 16 -6 q 4 0 4 6",
    ],
  },
  3: {
    paths: [
      // Crown above
      "M40 6 l 4 6 l 6 -6 l 6 6 l 4 -6 l 0 8 l -20 0 z",
      // bigger mane
      "M50 36 m -26 0 a 26 26 0 1 0 52 0 a 26 26 0 1 0 -52 0",
      "M24 24 l -6 -4",
      "M24 36 l -8 0",
      "M24 48 l -6 4",
      "M76 24 l 6 -4",
      "M76 36 l 8 0",
      "M76 48 l 6 4",
      "M40 14 l -3 -6",
      "M60 14 l 3 -6",
      // inner head
      "M50 36 m -14 0 a 14 14 0 1 0 28 0 a 14 14 0 1 0 -28 0",
      "M44 34 a 1.5 1.5 0 1 1 0.1 0",
      "M56 34 a 1.5 1.5 0 1 1 0.1 0",
      "M50 39 q -4 5 0 8 q 4 -3 0 -8",
      // body
      "M36 60 q 14 12 28 0",
      "M36 60 q -4 22 10 30",
      "M64 60 q 4 22 -10 30",
      "M40 88 l 0 8",
      "M60 88 l 0 8",
      // tail dramatic
      "M64 74 q 18 8 18 -10 q 6 0 6 10",
    ],
  },
};

const TIGRE: Record<1 | 2 | 3, Variant> = {
  1: {
    paths: [
      // head
      "M50 32 m -16 0 a 16 16 0 1 0 32 0 a 16 16 0 1 0 -32 0",
      "M36 18 l 4 6",
      "M64 18 l -4 6",
      "M44 32 a 1 1 0 1 1 0.1 0",
      "M56 32 a 1 1 0 1 1 0.1 0",
      "M50 37 q -3 4 0 6 q 3 -2 0 -6",
      // sabre fangs
      "M46.5 42 l -1.5 6",
      "M53.5 42 l 1.5 6",
      // angled brow
      "M40 28 l 5 1",
      "M60 28 l -5 1",
      // stripes head
      "M38 26 l 4 2",
      "M58 26 l 4 2",
      "M50 22 l 0 4",
      // body
      "M38 50 q 12 8 24 0",
      "M38 50 q -2 18 8 24",
      "M62 50 q 2 18 -8 24",
      "M44 76 l -2 5",
      "M56 76 l 2 5",
      // stripes body
      "M42 56 l 4 0",
      "M54 56 l 4 0",
      "M42 64 l 4 0",
      "M54 64 l 4 0",
    ],
  },
  2: {
    paths: [
      "M50 32 m -18 0 a 18 18 0 1 0 36 0 a 18 18 0 1 0 -36 0",
      "M34 16 l 4 8",
      "M66 16 l -4 8",
      "M43 30 a 1.5 1.5 0 1 1 0.1 0",
      "M57 30 a 1.5 1.5 0 1 1 0.1 0",
      "M50 36 q -4 5 0 8 q 4 -3 0 -8",
      "M36 22 l 6 2",
      "M64 22 l -6 2",
      "M38 38 l 4 -1",
      "M62 38 l -4 -1",
      "M50 18 l 0 6",
      "M50 44 l 0 4",
      "M36 50 q 14 10 28 0",
      "M36 50 q -4 20 12 28",
      "M64 50 q 4 20 -12 28",
      "M44 80 l 0 8",
      "M56 80 l 0 8",
      "M40 58 l 5 0",
      "M55 58 l 5 0",
      "M40 66 l 5 0",
      "M55 66 l 5 0",
      "M40 74 l 5 0",
      "M55 74 l 5 0",
      "M64 70 q 12 4 14 -6",
    ],
  },
  3: {
    paths: [
      // Sabre teeth at start
      "M50 32 m -20 0 a 20 20 0 1 0 40 0 a 20 20 0 1 0 -40 0",
      "M32 14 l 4 10",
      "M68 14 l -4 10",
      "M43 30 a 1.5 1.5 0 1 1 0.1 0",
      "M57 30 a 1.5 1.5 0 1 1 0.1 0",
      "M50 38 q -5 6 0 10 q 5 -4 0 -10",
      // sabre fangs
      "M46 44 l -1 8",
      "M54 44 l 1 8",
      // stripes
      "M34 20 l 8 4",
      "M66 20 l -8 4",
      "M32 36 l 8 -2",
      "M68 36 l -8 -2",
      "M50 16 l 0 6",
      "M34 50 q 16 10 32 0",
      "M34 50 q -6 22 14 30",
      "M66 50 q 6 22 -14 30",
      "M42 82 l 0 8",
      "M58 82 l 0 8",
      "M38 58 l 6 0",
      "M56 58 l 6 0",
      "M38 66 l 6 0",
      "M56 66 l 6 0",
      "M38 74 l 6 0",
      "M56 74 l 6 0",
      "M66 70 q 14 6 16 -8 q 6 0 6 8",
    ],
  },
};

const LOUP: Record<1 | 2 | 3, Variant> = {
  1: {
    paths: [
      "M50 30 l -14 16 l 4 6 l 6 -2 l 4 6 l 4 -6 l 6 2 l 4 -6 z",
      "M45 36 a 1 1 0 1 1 0.1 0",
      "M55 36 a 1 1 0 1 1 0.1 0",
      "M50 42 l -2 4 l 2 2 l 2 -2 z",
      // fangs
      "M47 47 l -1 4",
      "M53 47 l 1 4",
      // ear tufts
      "M38 24 l -3 -4",
      "M62 24 l 3 -4",
      "M40 54 q 10 8 20 0",
      "M40 54 q -2 16 8 22",
      "M60 54 q 2 16 -8 22",
      // claws
      "M44 76 l -1.5 8",
      "M56 76 l 1.5 8",
      "M62 64 q 10 4 12 -4",
    ],
  },
  2: {
    paths: [
      "M50 28 l -18 18 l 4 8 l 8 -2 l 6 6 l 6 -6 l 8 2 l 4 -8 z",
      "M44 36 a 1.5 1.5 0 1 1 0.1 0",
      "M56 36 a 1.5 1.5 0 1 1 0.1 0",
      "M50 44 l -3 5 l 3 3 l 3 -3 z",
      "M48 50 l -2 4",
      "M52 50 l 2 4",
      "M38 56 q 12 10 24 0",
      "M38 56 q -4 18 10 26",
      "M62 56 q 4 18 -10 26",
      "M44 82 l 0 8",
      "M56 82 l 0 8",
      "M62 66 q 14 6 14 -6 q 6 2 4 8",
    ],
  },
  3: {
    paths: [
      // Alpha wolf: bigger head, broader fur
      "M50 24 l -22 22 l 4 10 l 10 -2 l 8 6 l 8 -6 l 10 2 l 4 -10 z",
      // moonscape behind (small accent)
      "M75 12 a 6 6 0 1 0 0.1 0",
      "M44 36 a 2 2 0 1 1 0.1 0",
      "M56 36 a 2 2 0 1 1 0.1 0",
      "M50 46 l -3 5 l 3 4 l 3 -4 z",
      "M46 52 l -2 6",
      "M54 52 l 2 6",
      "M34 56 q 16 10 32 0",
      "M34 56 q -6 22 14 30",
      "M66 56 q 6 22 -14 30",
      "M42 86 l 0 8",
      "M58 86 l 0 8",
      "M66 68 q 18 8 16 -10 q 6 0 6 10",
      // fur tufts
      "M38 50 l -4 -4",
      "M62 50 l 4 -4",
    ],
  },
};

const OURS: Record<1 | 2 | 3, Variant> = {
  1: {
    paths: [
      "M50 32 m -18 0 a 18 18 0 1 0 36 0 a 18 18 0 1 0 -36 0",
      // ears
      "M32 18 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0",
      "M68 18 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0",
      "M44 31 l 2 2",
      "M56 31 l -2 2",
      "M50 40 a 2 2 0 1 1 0.1 0",
      // fangs
      "M47 44 l -1 4",
      "M53 44 l 1 4",
      "M40 52 q 10 8 20 0",
      "M40 52 q -2 18 8 24",
      "M60 52 q 2 18 -8 24",
      // claws
      "M44 78 l -1.5 6",
      "M56 78 l 1.5 6",
    ],
  },
  2: {
    paths: [
      "M50 32 m -20 0 a 20 20 0 1 0 40 0 a 20 20 0 1 0 -40 0",
      "M30 16 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0",
      "M70 16 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0",
      "M44 32 a 1.5 1.5 0 1 1 0.1 0",
      "M56 32 a 1.5 1.5 0 1 1 0.1 0",
      "M50 42 a 2.5 2.5 0 1 1 0.1 0",
      "M48 46 l -2 4",
      "M52 46 l 2 4",
      "M36 54 q 14 10 28 0",
      "M36 54 q -4 20 12 28",
      "M64 54 q 4 20 -12 28",
      "M44 82 l 0 8",
      "M56 82 l 0 8",
    ],
  },
  3: {
    paths: [
      // Grizzly with shoulder hump
      "M50 30 m -22 0 a 22 22 0 1 0 44 0 a 22 22 0 1 0 -44 0",
      "M28 14 m -6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0",
      "M72 14 m -6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0",
      "M44 30 a 2 2 0 1 1 0.1 0",
      "M56 30 a 2 2 0 1 1 0.1 0",
      "M50 42 a 3 3 0 1 1 0.1 0",
      "M48 48 l -2 5",
      "M52 48 l 2 5",
      "M34 54 q 16 12 32 0",
      "M34 54 q -2 6 -6 4",
      "M66 54 q 2 6 6 4",
      "M34 60 q -6 22 14 30",
      "M66 60 q 6 22 -14 30",
      "M42 86 l 0 8",
      "M58 86 l 0 8",
      // claws hint
      "M40 92 l 2 4",
      "M44 92 l 0 4",
      "M56 92 l 0 4",
      "M60 92 l -2 4",
    ],
  },
};

const AIGLE: Record<1 | 2 | 3, Variant> = {
  1: {
    paths: [
      // head
      "M50 26 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0",
      // hooked beak
      "M58 28 l 7 3 l -5 2 l 1 3 l -4 -1 z",
      "M44 25 l 2 2",
      // body
      "M50 36 q -14 10 -10 24",
      "M50 36 q 14 10 10 24",
      // wings (folded, sharper)
      "M38 50 q -8 6 -4 18 l 3 -3",
      "M62 50 q 8 6 4 18 l -3 -3",
      // talons
      "M46 64 l -2 6 l 3 0",
      "M54 64 l 2 6 l -3 0",
    ],
  },
  2: {
    paths: [
      "M50 24 m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0",
      "M60 26 l 10 4 l -10 4 z",
      "M48 24 a 1.5 1.5 0 1 1 0.1 0",
      // body
      "M50 36 q -16 12 -12 28",
      "M50 36 q 16 12 12 28",
      // wings spread small
      "M34 42 q -10 4 -10 14 q 4 -2 8 -4",
      "M66 42 q 10 4 10 14 q -4 -2 -8 -4",
      // feathers detail
      "M40 56 l -4 4",
      "M60 56 l 4 4",
      "M48 68 l 0 6",
      "M52 68 l 0 6",
    ],
  },
  3: {
    paths: [
      // Spread eagle, dominant
      "M50 22 m -12 0 a 12 12 0 1 0 24 0 a 12 12 0 1 0 -24 0",
      "M62 24 l 14 4 l -14 6 z",
      "M48 22 a 2 2 0 1 1 0.1 0",
      // head feathers crown
      "M40 14 l 4 4",
      "M50 10 l 0 4",
      "M60 14 l -4 4",
      // body
      "M50 36 q -18 14 -14 32",
      "M50 36 q 18 14 14 32",
      // big wings
      "M30 38 q -18 4 -20 18 q 8 -2 14 -4",
      "M70 38 q 18 4 20 18 q -8 -2 -14 -4",
      "M22 50 q -6 4 -10 12",
      "M78 50 q 6 4 10 12",
      // feather details
      "M40 60 l -6 4",
      "M60 60 l 6 4",
      "M44 72 l 0 6",
      "M56 72 l 0 6",
    ],
  },
};

const MASCOTS: Record<MascotAnimal, Record<1 | 2 | 3, Variant>> = {
  lion: LION,
  tigre: TIGRE,
  loup: LOUP,
  ours: OURS,
  aigle: AIGLE,
};

export function Mascot({
  animal,
  evolution = 1,
  size = 80,
  color = "#2D7C3E",
  strokeWidth = 1.6,
  background = "transparent",
}: {
  animal: MascotAnimal;
  evolution?: 1 | 2 | 3;
  size?: number;
  color?: string;
  strokeWidth?: number;
  background?: string;
}) {
  const stage = (Math.max(1, Math.min(3, evolution)) as 1 | 2 | 3);
  const variant = MASCOTS[animal]?.[stage] || MASCOTS.lion[1];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {background !== "transparent" && (
          <Circle cx="50" cy="50" r="48" fill={background} />
        )}
        {/* Filled silhouette (head/body shape) for a richer, illustrated look */}
        <Path d={variant.paths[0]} fill={color} fillOpacity={0.14} stroke="none" />
        <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
          {variant.paths.map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

export default Mascot;
