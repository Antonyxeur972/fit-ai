import { View } from "react-native";
import Svg, { Path, Circle, Ellipse, G, Polygon } from "react-native-svg";

export type MascotAnimal = "lion" | "tigre" | "loup" | "ours" | "aigle";

export const MASCOT_LABELS: Record<MascotAnimal, string> = {
  lion: "Lion",
  tigre: "Tigre",
  loup: "Loup",
  ours: "Ours",
  aigle: "Aigle",
};

/**
 * Stylized animal face portraits — stage 1/2/3 evolution.
 * All in a 100×100 viewBox, stroke-only, face centered ~(50,50).
 */

type SvgShape =
  | { t: "p"; d: string }
  | { t: "c"; cx: number; cy: number; r: number }
  | { t: "e"; cx: number; cy: number; rx: number; ry: number }
  | { t: "pg"; pts: string };

type Variant = SvgShape[];

// ─── LION ────────────────────────────────────────────────────────────────────
// Classic portrait: round face + sunray mane, cat ears, almond eyes, whiskers

const LION_1: Variant = [
  { t: "c", cx: 50, cy: 50, r: 30 },
  { t: "c", cx: 50, cy: 50, r: 20 },
  { t: "pg", pts: "30,35 24,16 42,28" },
  { t: "pg", pts: "70,35 76,16 58,28" },
  { t: "p", d: "M37 47 Q42 42 47 47 Q42 52 37 47 Z" },
  { t: "p", d: "M53 47 Q58 42 63 47 Q58 52 53 47 Z" },
  { t: "p", d: "M47 56 L50 60 L53 56 Z" },
  { t: "p", d: "M50 60 L50 63" },
  { t: "p", d: "M44 64 Q50 70 56 64" },
];

const LION_2: Variant = [
  { t: "c", cx: 50, cy: 50, r: 34 },
  { t: "c", cx: 50, cy: 50, r: 27 },
  { t: "pg", pts: "48,16 50,8 52,16" },
  { t: "pg", pts: "66,22 74,18 68,29" },
  { t: "pg", pts: "82,48 90,50 82,52" },
  { t: "pg", pts: "68,74 74,82 66,76" },
  { t: "pg", pts: "48,84 50,92 52,84" },
  { t: "pg", pts: "28,76 26,84 34,74" },
  { t: "pg", pts: "10,52 8,50 18,48" },
  { t: "pg", pts: "28,28 18,22 32,22" },
  { t: "c", cx: 50, cy: 50, r: 22 },
  { t: "pg", pts: "28,36 22,14 40,26" },
  { t: "pg", pts: "72,36 78,14 60,26" },
  { t: "p", d: "M36 46 Q41 41 46 46 Q41 51 36 46 Z" },
  { t: "c", cx: 41, cy: 46, r: 2 },
  { t: "p", d: "M54 46 Q59 41 64 46 Q59 51 54 46 Z" },
  { t: "c", cx: 59, cy: 46, r: 2 },
  { t: "p", d: "M46 55 L50 60 L54 55 Z" },
  { t: "p", d: "M50 60 L50 63" },
  { t: "p", d: "M43 64 Q50 71 57 64" },
  { t: "p", d: "M14 50 L32 53" },
  { t: "p", d: "M14 56 L32 56" },
  { t: "p", d: "M14 62 L32 59" },
  { t: "p", d: "M86 50 L68 53" },
  { t: "p", d: "M86 56 L68 56" },
  { t: "p", d: "M86 62 L68 59" },
];

const LION_3: Variant = [
  { t: "p", d: "M38 12 L38 3 L44 9 L50 1 L56 9 L62 3 L62 12 Z" },
  { t: "c", cx: 50, cy: 52, r: 38 },
  { t: "c", cx: 50, cy: 52, r: 30 },
  { t: "pg", pts: "48,22 50,14 52,22" },
  { t: "pg", pts: "62,24 70,18 64,30" },
  { t: "pg", pts: "74,36 84,32 74,44" },
  { t: "pg", pts: "88,52 96,52 86,58" },
  { t: "pg", pts: "78,68 86,74 74,72" },
  { t: "pg", pts: "62,80 66,88 58,82" },
  { t: "pg", pts: "48,82 50,90 52,82" },
  { t: "pg", pts: "34,80 30,88 38,82" },
  { t: "pg", pts: "18,68 14,74 22,72" },
  { t: "pg", pts: "10,52 4,52 12,58" },
  { t: "pg", pts: "18,36 8,32 22,44" },
  { t: "pg", pts: "34,24 26,18 36,30" },
  { t: "c", cx: 50, cy: 50, r: 24 },
  { t: "pg", pts: "27,36 20,12 42,26" },
  { t: "pg", pts: "73,36 80,12 58,26" },
  { t: "p", d: "M35 42 Q41 39 46 42" },
  { t: "p", d: "M54 42 Q59 39 65 42" },
  { t: "p", d: "M35 48 Q41 43 46 48 Q41 53 35 48 Z" },
  { t: "c", cx: 41, cy: 48, r: 2.5 },
  { t: "p", d: "M54 48 Q59 43 65 48 Q59 53 54 48 Z" },
  { t: "c", cx: 59, cy: 48, r: 2.5 },
  { t: "p", d: "M46 56 L50 61 L54 56 Z" },
  { t: "p", d: "M50 61 L50 64" },
  { t: "p", d: "M43 65 Q50 73 57 65" },
  { t: "p", d: "M10 51 L32 55" },
  { t: "p", d: "M10 57 L32 57" },
  { t: "p", d: "M10 63 L32 60" },
  { t: "p", d: "M90 51 L68 55" },
  { t: "p", d: "M90 57 L68 57" },
  { t: "p", d: "M90 63 L68 60" },
];

// ─── TIGRE ───────────────────────────────────────────────────────────────────
// Wide head, rounded ears with inner ear, forehead V-stripes, cheek stripes

const TIGRE_1: Variant = [
  { t: "e", cx: 50, cy: 50, rx: 26, ry: 24 },
  { t: "pg", pts: "30,34 26,18 44,28" },
  { t: "pg", pts: "70,34 74,18 56,28" },
  { t: "p", d: "M44 36 L50 44 L56 36" },
  { t: "p", d: "M33 46 Q40 41 47 46 Q40 51 33 46 Z" },
  { t: "p", d: "M53 46 Q60 41 67 46 Q60 51 53 46 Z" },
  { t: "p", d: "M46 55 L50 60 L54 55 Z" },
  { t: "p", d: "M44 63 Q50 69 56 63" },
  { t: "p", d: "M18 50 L30 53" },
  { t: "p", d: "M20 57 L32 57" },
  { t: "p", d: "M82 50 L70 53" },
  { t: "p", d: "M80 57 L68 57" },
];

const TIGRE_2: Variant = [
  { t: "e", cx: 50, cy: 50, rx: 28, ry: 26 },
  { t: "pg", pts: "28,34 24,16 44,28" },
  { t: "pg", pts: "30,32 27,20 41,27" },
  { t: "pg", pts: "72,34 76,16 56,28" },
  { t: "pg", pts: "70,32 73,20 59,27" },
  { t: "p", d: "M43 34 L50 43 L57 34" },
  { t: "p", d: "M40 27 L50 36 L60 27" },
  { t: "p", d: "M31 46 Q39 40 47 46 Q39 52 31 46 Z" },
  { t: "c", cx: 39, cy: 46, r: 2.5 },
  { t: "p", d: "M53 46 Q61 40 69 46 Q61 52 53 46 Z" },
  { t: "c", cx: 61, cy: 46, r: 2.5 },
  { t: "e", cx: 50, cy: 59, rx: 10, ry: 7 },
  { t: "p", d: "M46 55 L50 60 L54 55 Z" },
  { t: "p", d: "M50 60 L50 64" },
  { t: "p", d: "M43 65 Q50 72 57 65" },
  { t: "p", d: "M14 48 L30 52" },
  { t: "p", d: "M16 55 L32 55" },
  { t: "p", d: "M18 62 L32 59" },
  { t: "p", d: "M86 48 L70 52" },
  { t: "p", d: "M84 55 L68 55" },
  { t: "p", d: "M82 62 L68 59" },
];

const TIGRE_3: Variant = [
  { t: "e", cx: 50, cy: 50, rx: 30, ry: 28 },
  { t: "pg", pts: "26,34 20,12 44,26" },
  { t: "pg", pts: "28,31 24,18 41,26" },
  { t: "pg", pts: "74,34 80,12 56,26" },
  { t: "pg", pts: "72,31 76,18 59,26" },
  { t: "p", d: "M42 34 L50 44 L58 34" },
  { t: "p", d: "M39 27 L50 37 L61 27" },
  { t: "p", d: "M37 20 L50 30 L63 20" },
  { t: "p", d: "M30 42 Q39 38 46 42" },
  { t: "p", d: "M54 42 Q61 38 70 42" },
  { t: "p", d: "M29 47 Q38 41 47 47 Q38 53 29 47 Z" },
  { t: "c", cx: 38, cy: 47, r: 3 },
  { t: "p", d: "M53 47 Q62 41 71 47 Q62 53 53 47 Z" },
  { t: "c", cx: 62, cy: 47, r: 3 },
  { t: "e", cx: 50, cy: 59, rx: 12, ry: 8 },
  { t: "p", d: "M46 55 L50 60 L54 55 Z" },
  { t: "p", d: "M50 60 L50 64" },
  { t: "p", d: "M42 66 Q50 74 58 66" },
  { t: "p", d: "M46 66 L45 74" },
  { t: "p", d: "M54 66 L55 74" },
  { t: "p", d: "M10 47 L30 52" },
  { t: "p", d: "M12 54 L30 55" },
  { t: "p", d: "M14 61 L30 59" },
  { t: "p", d: "M90 47 L70 52" },
  { t: "p", d: "M88 54 L70 55" },
  { t: "p", d: "M86 61 L70 59" },
];

// ─── LOUP ────────────────────────────────────────────────────────────────────
// Angular/elongated face, very tall pointed ears, narrow snout, intense eyes

const LOUP_1: Variant = [
  { t: "e", cx: 50, cy: 50, rx: 22, ry: 26 },
  { t: "pg", pts: "32,34 25,8 44,28" },
  { t: "pg", pts: "68,34 75,8 56,28" },
  { t: "p", d: "M35 46 Q42 42 48 46 Q42 50 35 46 Z" },
  { t: "p", d: "M52 46 Q58 42 65 46 Q58 50 52 46 Z" },
  { t: "e", cx: 50, cy: 62, rx: 10, ry: 7 },
  { t: "p", d: "M47 58 L50 63 L53 58 Z" },
  { t: "p", d: "M44 66 Q50 71 56 66" },
  { t: "p", d: "M30 74 Q50 82 70 74" },
];

const LOUP_2: Variant = [
  { t: "e", cx: 50, cy: 50, rx: 23, ry: 27 },
  { t: "pg", pts: "30,34 22,6 44,26" },
  { t: "pg", pts: "32,33 26,11 42,26" },
  { t: "pg", pts: "70,34 78,6 56,26" },
  { t: "pg", pts: "68,33 74,11 58,26" },
  { t: "p", d: "M47 38 L50 34 L53 38 L50 42 Z" },
  { t: "p", d: "M34 46 Q41 41 47 46 Q41 51 34 46 Z" },
  { t: "c", cx: 41, cy: 46, r: 2 },
  { t: "p", d: "M53 46 Q59 41 66 46 Q59 51 53 46 Z" },
  { t: "c", cx: 59, cy: 46, r: 2 },
  { t: "e", cx: 50, cy: 62, rx: 11, ry: 8 },
  { t: "p", d: "M47 58 L50 63 L53 58 Z" },
  { t: "p", d: "M50 63 L50 67" },
  { t: "p", d: "M44 68 Q50 74 56 68" },
  { t: "p", d: "M26 56 L32 59" },
  { t: "p", d: "M26 62 L32 62" },
  { t: "p", d: "M74 56 L68 59" },
  { t: "p", d: "M74 62 L68 62" },
  { t: "p", d: "M28,74 L24,82 M36,77 L34,86 M50,79 L50,88 M64,77 L66,86 M72,74 L76,82" },
];

const LOUP_3: Variant = [
  { t: "p", d: "M12 20 Q14 10 24 12 Q14 6 12 20 Z" },
  { t: "e", cx: 50, cy: 50, rx: 25, ry: 29 },
  { t: "pg", pts: "28,34 18,2 44,24" },
  { t: "pg", pts: "30,32 22,8 42,24" },
  { t: "pg", pts: "72,34 82,2 56,24" },
  { t: "pg", pts: "70,32 78,8 58,24" },
  { t: "p", d: "M46 37 L50 32 L54 37 L50 42 Z" },
  { t: "p", d: "M32 43 L40 40" },
  { t: "p", d: "M60 40 L68 43" },
  { t: "p", d: "M32 47 Q40 42 47 47 Q40 52 32 47 Z" },
  { t: "c", cx: 40, cy: 47, r: 2.5 },
  { t: "p", d: "M53 47 Q60 42 68 47 Q60 52 53 47 Z" },
  { t: "c", cx: 60, cy: 47, r: 2.5 },
  { t: "e", cx: 50, cy: 63, rx: 12, ry: 9 },
  { t: "p", d: "M46 59 L50 65 L54 59 Z" },
  { t: "p", d: "M50 65 L50 69" },
  { t: "p", d: "M42 70 Q50 77 58 70" },
  { t: "p", d: "M42 44 L44 48" },
  { t: "p", d: "M24 56 L32 59" },
  { t: "p", d: "M24 62 L32 62" },
  { t: "p", d: "M76 56 L68 59" },
  { t: "p", d: "M76 62 L68 62" },
  { t: "p", d: "M24,76 L18,86 M32,80 L30,90 M42,82 L40,92 M50,84 L50,94 M58,82 L60,92 M68,80 L70,90 M76,76 L82,86" },
];

// ─── OURS ─────────────────────────────────────────────────────────────────────
// Very round face, tiny semi-circular ears high on head, big oval muzzle, wide nose

const OURS_1: Variant = [
  { t: "c", cx: 50, cy: 52, r: 28 },
  { t: "p", d: "M22 32 a8 8 0 0 0 16 0" },
  { t: "p", d: "M62 32 a8 8 0 0 0 16 0" },
  { t: "c", cx: 39, cy: 46, r: 4 },
  { t: "c", cx: 61, cy: 46, r: 4 },
  { t: "e", cx: 50, cy: 62, rx: 14, ry: 10 },
  { t: "e", cx: 50, cy: 58, rx: 5, ry: 3.5 },
  { t: "p", d: "M50 62 L50 66" },
  { t: "p", d: "M44 66 Q50 72 56 66" },
];

const OURS_2: Variant = [
  { t: "c", cx: 50, cy: 52, r: 30 },
  { t: "p", d: "M20 32 a9 9 0 0 0 18 0" },
  { t: "p", d: "M22 32 a6 6 0 0 0 12 0" },
  { t: "p", d: "M62 32 a9 9 0 0 0 18 0" },
  { t: "p", d: "M64 32 a6 6 0 0 0 12 0" },
  { t: "c", cx: 38, cy: 46, r: 4.5 },
  { t: "c", cx: 38, cy: 45, r: 1.5 },
  { t: "c", cx: 62, cy: 46, r: 4.5 },
  { t: "c", cx: 62, cy: 45, r: 1.5 },
  { t: "c", cx: 36, cy: 44, r: 1 },
  { t: "c", cx: 60, cy: 44, r: 1 },
  { t: "e", cx: 50, cy: 63, rx: 15, ry: 11 },
  { t: "e", cx: 50, cy: 58, rx: 6, ry: 4 },
  { t: "p", d: "M50 62 L50 67" },
  { t: "p", d: "M43 68 Q50 74 57 68" },
  { t: "p", d: "M20 50 Q18 46 22 44" },
  { t: "p", d: "M20 58 Q18 62 22 64" },
  { t: "p", d: "M80 50 Q82 46 78 44" },
  { t: "p", d: "M80 58 Q82 62 78 64" },
];

const OURS_3: Variant = [
  { t: "c", cx: 50, cy: 52, r: 34 },
  { t: "p", d: "M16 34 a10 10 0 0 0 20 0" },
  { t: "p", d: "M18 34 a7 7 0 0 0 14 0" },
  { t: "p", d: "M64 34 a10 10 0 0 0 20 0" },
  { t: "p", d: "M66 34 a7 7 0 0 0 14 0" },
  { t: "p", d: "M30 42 L38 40" },
  { t: "p", d: "M62 40 L70 42" },
  { t: "c", cx: 37, cy: 48, r: 5 },
  { t: "c", cx: 37, cy: 47, r: 2 },
  { t: "c", cx: 63, cy: 48, r: 5 },
  { t: "c", cx: 63, cy: 47, r: 2 },
  { t: "c", cx: 35, cy: 46, r: 1 },
  { t: "c", cx: 61, cy: 46, r: 1 },
  { t: "e", cx: 50, cy: 64, rx: 17, ry: 13 },
  { t: "e", cx: 50, cy: 59, rx: 7, ry: 5 },
  { t: "p", d: "M50 64 L50 69" },
  { t: "p", d: "M42 70 Q50 77 58 70" },
  { t: "p", d: "M16 52 Q14 46 18 44" },
  { t: "p", d: "M16 60 Q14 64 18 66" },
  { t: "p", d: "M84 52 Q86 46 82 44" },
  { t: "p", d: "M84 60 Q86 64 82 66" },
  { t: "p", d: "M28 82 L30 92 M34 84 L35 94 M40 86 L40 96" },
  { t: "p", d: "M60 86 L60 96 M66 84 L67 94 M72 82 L74 92" },
];

// ─── AIGLE ────────────────────────────────────────────────────────────────────
// Frontal eagle: round head, dramatic crest, large round eyes, hooked beak

const AIGLE_1: Variant = [
  { t: "e", cx: 50, cy: 52, rx: 22, ry: 24 },
  { t: "p", d: "M46 28 L48 16 L50 26 L52 16 L54 28" },
  { t: "c", cx: 38, cy: 46, r: 7 },
  { t: "c", cx: 38, cy: 46, r: 4 },
  { t: "c", cx: 62, cy: 46, r: 7 },
  { t: "c", cx: 62, cy: 46, r: 4 },
  { t: "p", d: "M44 56 Q50 54 56 56 Q58 62 50 68 Q42 62 44 56 Z" },
  { t: "p", d: "M44 62 Q50 60 56 62" },
  { t: "p", d: "M28 72 L22 80 M36 76 L34 85 M50 78 L50 87 M64 76 L66 85 M72 72 L78 80" },
];

const AIGLE_2: Variant = [
  { t: "e", cx: 50, cy: 52, rx: 24, ry: 26 },
  { t: "p", d: "M42 28 L44 14 L47 26" },
  { t: "p", d: "M47 26 L50 10 L53 26" },
  { t: "p", d: "M53 26 L56 14 L58 28" },
  { t: "c", cx: 37, cy: 46, r: 8 },
  { t: "c", cx: 37, cy: 46, r: 5 },
  { t: "c", cx: 37, cy: 46, r: 2.5 },
  { t: "c", cx: 34, cy: 44, r: 1 },
  { t: "c", cx: 63, cy: 46, r: 8 },
  { t: "c", cx: 63, cy: 46, r: 5 },
  { t: "c", cx: 63, cy: 46, r: 2.5 },
  { t: "c", cx: 60, cy: 44, r: 1 },
  { t: "p", d: "M43 56 Q50 53 57 56 Q60 63 50 70 Q40 63 43 56 Z" },
  { t: "p", d: "M43 62 Q50 59 57 62" },
  { t: "p", d: "M44 60 Q50 64 56 60" },
  { t: "p", d: "M26 40 Q37 36 43 40" },
  { t: "p", d: "M57 40 Q63 36 74 40" },
  { t: "p", d: "M26 74 L20 84 M34 78 L32 88 M42 81 L42 91 M50 82 L50 92 M58 81 L58 91 M66 78 L68 88 M74 74 L80 84" },
  { t: "p", d: "M38 34 Q50 30 62 34" },
];

const AIGLE_3: Variant = [
  { t: "e", cx: 50, cy: 52, rx: 26, ry: 28 },
  { t: "p", d: "M38 28 L40 14 L44 26" },
  { t: "p", d: "M44 26 L46 10 L50 24" },
  { t: "p", d: "M50 24 L50 6 L54 24" },
  { t: "p", d: "M54 24 L58 10 L60 26" },
  { t: "p", d: "M60 26 L64 14 L66 28" },
  { t: "c", cx: 36, cy: 46, r: 9 },
  { t: "c", cx: 36, cy: 46, r: 6 },
  { t: "c", cx: 36, cy: 46, r: 3 },
  { t: "c", cx: 33, cy: 44, r: 1 },
  { t: "c", cx: 64, cy: 46, r: 9 },
  { t: "c", cx: 64, cy: 46, r: 6 },
  { t: "c", cx: 64, cy: 46, r: 3 },
  { t: "c", cx: 61, cy: 44, r: 1 },
  { t: "p", d: "M22 39 Q36 34 43 39" },
  { t: "p", d: "M57 39 Q64 34 78 39" },
  { t: "p", d: "M42 56 Q50 52 58 56 Q62 64 50 73 Q38 64 42 56 Z" },
  { t: "p", d: "M42 63 Q50 59 58 63" },
  { t: "p", d: "M43 60 Q50 65 57 60" },
  { t: "p", d: "M24 58 Q10 60 4 70 Q10 56 22 52" },
  { t: "p", d: "M76 58 Q90 60 96 70 Q90 56 78 52" },
  { t: "p", d: "M24 76 L16 88 M32 80 L28 92 M40 83 L38 95 M50 84 L50 96 M60 83 L62 95 M68 80 L72 92 M76 76 L84 88" },
  { t: "p", d: "M36 33 Q50 28 64 33" },
];

// ─── REGISTRY ────────────────────────────────────────────────────────────────
const MASCOTS: Record<MascotAnimal, Record<1 | 2 | 3, Variant>> = {
  lion: { 1: LION_1, 2: LION_2, 3: LION_3 },
  tigre: { 1: TIGRE_1, 2: TIGRE_2, 3: TIGRE_3 },
  loup: { 1: LOUP_1, 2: LOUP_2, 3: LOUP_3 },
  ours: { 1: OURS_1, 2: OURS_2, 3: OURS_3 },
  aigle: { 1: AIGLE_1, 2: AIGLE_2, 3: AIGLE_3 },
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
  const stage = Math.max(1, Math.min(3, evolution)) as 1 | 2 | 3;
  const shapes = MASCOTS[animal]?.[stage] ?? MASCOTS.lion[1];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {background !== "transparent" && (
          <Circle cx="50" cy="50" r="48" fill={background} />
        )}
        <G
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {shapes.map((s, i) => {
            if (s.t === "p") return <Path key={i} d={s.d} />;
            if (s.t === "c") return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} />;
            if (s.t === "e") return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
            if (s.t === "pg") return <Polygon key={i} points={s.pts} />;
            return null;
          })}
        </G>
      </Svg>
    </View>
  );
}

export default Mascot;
