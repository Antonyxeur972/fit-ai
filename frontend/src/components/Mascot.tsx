import { View } from "react-native";
import Svg, { Path, Circle, Ellipse, G } from "react-native-svg";

export type MascotAnimal = "lion" | "tigre" | "loup" | "ours" | "aigle";

export const MASCOT_LABELS: Record<MascotAnimal, string> = {
  lion: "Lion",
  tigre: "Tigre",
  loup: "Loup",
  ours: "Ours",
  aigle: "Aigle",
};

/**
 * Silhouette-style animal portraits — flat filled shapes with white negative space.
 * Inspired by botanical stencil art. 100×100 viewBox, no border/frame.
 * Stage 1=simple, 2=detailed, 3=legendary.
 */

type S =
  | { t: "m"; d: string }                                          // main color fill
  | { t: "w"; d: string }                                          // white fill (negative space)
  | { t: "mc"; cx: number; cy: number; r: number }                // main color circle
  | { t: "wc"; cx: number; cy: number; r: number }                // white circle
  | { t: "me"; cx: number; cy: number; rx: number; ry: number }  // main color ellipse
  | { t: "we"; cx: number; cy: number; rx: number; ry: number }; // white ellipse

type V = S[];

// ─── LION ─────────────────────────────────────────────────────────────────────
// Front-facing. Large organic mane (green) with white face hole, green features on top.

const LION_1: V = [
  // Mane — large organic blob
  { t: "m", d: "M50 6 C64 4 80 10 88 26 C96 40 94 60 84 74 C74 86 62 92 50 92 C38 92 26 86 16 74 C6 60 4 40 12 26 C20 10 36 4 50 6Z" },
  // Face area (white oval — shows background)
  { t: "w", d: "M50 24 C64 24 76 34 76 50 C76 66 64 76 50 76 C36 76 24 66 24 50 C24 34 36 24 50 24Z" },
  // Left eye
  { t: "m", d: "M36 44 C38 38 46 36 48 42 C50 48 46 52 40 50 C36 48 36 46 36 44Z" },
  // Right eye
  { t: "m", d: "M52 44 C54 38 62 36 64 42 C66 48 62 52 56 50 C52 48 52 46 52 44Z" },
  // Nose
  { t: "m", d: "M45 58 C45 54 55 54 55 58 C55 62 52 65 50 65 C48 65 45 62 45 58Z" },
  // Mouth dimple
  { t: "m", d: "M48 66 C49 70 51 70 52 66 C51 68 50 68 48 66Z" },
];

const LION_2: V = [
  // Mane — larger, more irregular
  { t: "m", d: "M50 4 C66 2 84 10 92 28 C98 44 96 66 84 80 C72 92 60 96 50 96 C40 96 28 92 16 80 C4 66 2 44 8 28 C16 10 34 2 50 4Z" },
  // Mane texture flow (white curves suggesting fur)
  { t: "w", d: "M22 30 C26 24 32 22 36 28 C32 30 26 32 22 30Z" },
  { t: "w", d: "M14 52 C14 44 18 38 24 40 C20 44 18 50 14 52Z" },
  { t: "w", d: "M20 72 C18 64 22 58 28 62 C24 66 20 70 20 72Z" },
  { t: "w", d: "M78 30 C74 24 68 22 64 28 C68 30 74 32 78 30Z" },
  { t: "w", d: "M86 52 C86 44 82 38 76 40 C80 44 82 50 86 52Z" },
  { t: "w", d: "M80 72 C82 64 78 58 72 62 C76 66 80 70 80 72Z" },
  // Face oval
  { t: "w", d: "M50 22 C66 22 78 32 78 50 C78 68 66 78 50 78 C34 78 22 68 22 50 C22 32 34 22 50 22Z" },
  // Left eyebrow
  { t: "m", d: "M33 40 C36 36 42 36 44 40 C42 38 36 38 33 40Z" },
  // Right eyebrow
  { t: "m", d: "M56 40 C58 36 64 36 67 40 C65 38 59 38 56 40Z" },
  // Left eye
  { t: "m", d: "M35 46 C37 40 46 38 48 44 C50 50 46 54 40 52 C36 50 35 48 35 46Z" },
  // Left pupil (white slit)
  { t: "w", d: "M40 45 C41 42 43 42 44 45 C43 48 41 48 40 45Z" },
  // Right eye
  { t: "m", d: "M52 46 C54 40 63 38 65 44 C67 50 63 54 57 52 C53 50 52 48 52 46Z" },
  // Right pupil
  { t: "w", d: "M56 45 C57 42 59 42 60 45 C59 48 57 48 56 45Z" },
  // Nose
  { t: "m", d: "M44 58 C44 54 56 54 56 58 C56 64 52 66 50 66 C48 66 44 64 44 58Z" },
  // Philtrum
  { t: "m", d: "M49 66 C49 70 51 70 51 66 C51 68 50 69 49 66Z" },
  // Whisker dots left
  { t: "w", d: "M30 57 C30 55 34 55 34 57 C34 59 30 59 30 57Z" },
  { t: "w", d: "M28 61 C28 59 32 59 32 61 C32 63 28 63 28 61Z" },
  // Whisker dots right
  { t: "w", d: "M66 57 C66 55 70 55 70 57 C70 59 66 59 66 57Z" },
  { t: "w", d: "M68 61 C68 59 72 59 72 61 C72 63 68 63 68 61Z" },
];

const LION_3: V = [
  // Mane — dramatic, with crown-like top
  { t: "m", d: "M50 2 C68 0 88 10 96 30 C104 50 98 74 84 86 C70 98 58 100 50 100 C42 100 30 98 16 86 C2 74 -4 50 4 30 C12 10 32 0 50 2Z" },
  // Crown points at top
  { t: "w", d: "M42 6 C44 2 46 4 46 8 C45 6 43 6 42 6Z" },
  { t: "w", d: "M50 2 C52 -2 54 0 54 4 C53 2 51 2 50 2Z" },
  { t: "w", d: "M58 6 C60 2 62 4 60 8 C59 6 57 6 58 6Z" },
  // Mane texture (more flows)
  { t: "w", d: "M18 26 C22 18 30 16 34 24 C28 24 22 26 18 26Z" },
  { t: "w", d: "M10 48 C10 38 16 32 22 36 C18 40 14 46 10 48Z" },
  { t: "w", d: "M14 70 C12 60 18 52 26 58 C20 62 14 68 14 70Z" },
  { t: "w", d: "M36 88 C30 82 32 74 40 74 C36 80 34 86 36 88Z" },
  { t: "w", d: "M82 26 C78 18 70 16 66 24 C72 24 78 26 82 26Z" },
  { t: "w", d: "M90 48 C90 38 84 32 78 36 C82 40 86 46 90 48Z" },
  { t: "w", d: "M86 70 C88 60 82 52 74 58 C80 62 86 68 86 70Z" },
  { t: "w", d: "M64 88 C70 82 68 74 60 74 C64 80 66 86 64 88Z" },
  // Face
  { t: "w", d: "M50 20 C68 20 82 32 82 52 C82 72 68 82 50 82 C32 82 18 72 18 52 C18 32 32 20 50 20Z" },
  // Brows
  { t: "m", d: "M30 44 C34 38 42 38 44 44 C40 40 34 40 30 44Z" },
  { t: "m", d: "M56 44 C58 38 66 38 70 44 C66 40 60 40 56 44Z" },
  // Eyes
  { t: "m", d: "M32 50 C34 42 46 40 48 48 C50 54 46 58 40 56 C34 54 32 52 32 50Z" },
  { t: "w", d: "M38 48 C40 44 44 44 44 48 C44 52 40 52 38 48Z" },
  { t: "m", d: "M52 50 C54 42 66 40 68 48 C70 54 66 58 60 56 C54 54 52 52 52 50Z" },
  { t: "w", d: "M56 48 C58 44 62 44 62 48 C62 52 58 52 56 48Z" },
  // Nose
  { t: "m", d: "M44 62 C44 56 56 56 56 62 C56 68 52 72 50 72 C48 72 44 68 44 62Z" },
  { t: "m", d: "M48 72 C48 76 52 76 52 72 C51 74 50 74 48 72Z" },
  // Whisker lines
  { t: "w", d: "M26 60 L38 63 L38 65 L26 62Z" },
  { t: "w", d: "M24 66 L36 68 L36 70 L24 68Z" },
  { t: "w", d: "M64 63 L76 60 L76 62 L64 65Z" },
  { t: "w", d: "M64 68 L76 66 L76 68 L64 70Z" },
];

// ─── TIGRE ────────────────────────────────────────────────────────────────────
// Profile facing right. Stripes as white fills, almond eye, flowing neck.

const TIGRE_1: V = [
  // Main head silhouette
  { t: "m", d: "M56 84 C68 82 78 74 82 64 C86 56 86 46 82 38 C78 30 70 22 60 16 C54 12 46 8 40 6 C34 2 26 4 30 12 C34 18 40 22 44 26 C34 30 22 40 18 56 C16 68 20 80 30 88 C40 94 50 94 56 84Z" },
  // Ear inner
  { t: "w", d: "M36 10 C38 6 42 8 42 16 C40 18 34 16 36 10Z" },
  // Eye
  { t: "w", d: "M62 34 C66 28 76 30 76 38 C76 44 70 46 64 42 C60 40 60 36 62 34Z" },
  // Stripe 1 (forehead)
  { t: "w", d: "M64 22 L72 16 L74 22 L66 28Z" },
  // Stripe 2 (cheek)
  { t: "w", d: "M74 40 L82 34 L84 40 L76 46Z" },
  // Nostril dot
  { t: "w", d: "M78 50 C80 48 82 48 82 50 C82 52 80 52 78 50Z" },
];

const TIGRE_2: V = [
  { t: "m", d: "M54 86 C68 84 80 74 84 62 C88 54 88 44 84 36 C80 28 70 20 60 14 C52 10 44 6 38 4 C30 0 22 4 28 14 C32 20 40 24 44 28 C32 32 20 44 16 60 C14 72 18 84 30 90 C40 96 48 96 54 86Z" },
  // Ear inner
  { t: "w", d: "M34 8 C36 4 42 6 42 14 C40 18 32 16 34 8Z" },
  // Eye with iris detail
  { t: "w", d: "M60 32 C64 26 76 28 76 36 C76 44 68 46 62 42 C58 40 58 36 60 32Z" },
  { t: "mc", cx: 67, cy: 38, r: 3 },
  // Stripes (4 total)
  { t: "w", d: "M62 20 L70 14 L72 20 L64 26Z" },
  { t: "w", d: "M54 16 L60 10 L62 16 L56 22Z" },
  { t: "w", d: "M72 42 L80 36 L82 44 L74 50Z" },
  { t: "w", d: "M74 56 L82 52 L84 58 L76 62Z" },
  // Inner ear
  { t: "w", d: "M34 8 C36 4 42 6 42 14 C40 18 32 16 34 8Z" },
  // Nose + nostril
  { t: "w", d: "M76 46 C78 42 84 42 84 46 C84 52 78 54 76 52 C74 50 74 48 76 46Z" },
  { t: "wc", cx: 76, cy: 50, r: 1.5 },
  { t: "wc", cx: 82, cy: 50, r: 1.5 },
  // Neck fur detail
  { t: "w", d: "M22 70 C20 62 24 56 30 60 C26 64 22 68 22 70Z" },
  { t: "w", d: "M18 80 C16 72 20 66 28 70 C24 74 18 78 18 80Z" },
];

const TIGRE_3: V = [
  { t: "m", d: "M52 88 C68 86 82 76 88 62 C94 50 92 36 86 28 C80 20 70 14 60 10 C52 6 42 4 36 2 C26 -2 16 4 24 16 C28 22 38 26 44 30 C30 34 16 46 14 62 C12 76 18 88 32 94 C42 98 50 96 52 88Z" },
  { t: "w", d: "M32 6 C34 2 40 4 42 12 C40 16 30 14 32 6Z" },
  // Eye
  { t: "w", d: "M60 28 C66 22 78 24 78 34 C78 42 70 46 62 42 C58 38 58 32 60 28Z" },
  { t: "mc", cx: 68, cy: 36, r: 4 },
  { t: "wc", cx: 68, cy: 36, r: 1.5 },
  // 5 stripes
  { t: "w", d: "M60 16 L70 10 L72 16 L62 22Z" },
  { t: "w", d: "M50 12 L58 6 L60 12 L52 18Z" },
  { t: "w", d: "M40 10 L46 4 L48 10 L42 16Z" },
  { t: "w", d: "M72 44 L82 36 L84 44 L74 52Z" },
  { t: "w", d: "M76 58 L86 52 L88 60 L78 66Z" },
  // Muzzle
  { t: "w", d: "M78 44 C82 40 90 40 90 46 C90 54 82 56 78 54 C74 52 74 48 78 44Z" },
  { t: "wc", cx: 78, cy: 50, r: 2 },
  { t: "wc", cx: 86, cy: 50, r: 2 },
  // Neck fur
  { t: "w", d: "M18 66 C16 56 22 48 30 54 C24 58 18 64 18 66Z" },
  { t: "w", d: "M14 78 C12 68 18 60 28 66 C20 70 14 76 14 78Z" },
  { t: "w", d: "M20 88 C18 80 26 74 34 80 C26 82 20 86 20 88Z" },
  // Chin fur
  { t: "w", d: "M40 88 C38 82 44 78 52 82 C46 84 40 88 40 88Z" },
  { t: "w", d: "M54 90 C52 84 60 80 68 86 C62 88 54 90 54 90Z" },
];

// ─── LOUP ─────────────────────────────────────────────────────────────────────
// Profile facing right. More angular/elongated than tiger, very tall pointed ear.

const LOUP_1: V = [
  // Main silhouette — elongated angular head, long snout
  { t: "m", d: "M60 86 C72 84 82 76 88 64 C92 56 90 46 86 40 C82 32 74 24 66 18 C60 14 54 10 46 6 C36 0 26 2 28 12 C30 18 36 22 40 26 C38 28 30 36 24 46 C20 56 20 68 28 78 C36 86 48 90 60 86Z" },
  // Inner ear (white, tall)
  { t: "w", d: "M40 8 C42 2 48 4 48 14 C46 18 38 16 40 8Z" },
  // Eye — narrow, intense
  { t: "w", d: "M60 36 C64 30 72 32 72 38 C72 42 66 44 62 42 C58 40 58 38 60 36Z" },
  // Snout tip (white — the nose/nostril area)
  { t: "w", d: "M82 52 C84 48 90 48 90 52 C90 56 84 58 82 56 C80 54 80 52 82 52Z" },
  // Neck fur spikes
  { t: "w", d: "M24 64 C22 56 28 50 36 56 C30 60 24 64 24 64Z" },
  { t: "w", d: "M20 74 C18 66 26 60 34 66 C26 70 20 74 20 74Z" },
];

const LOUP_2: V = [
  { t: "m", d: "M58 88 C72 86 84 76 90 62 C96 52 94 40 88 32 C84 24 74 18 64 12 C56 8 48 4 40 2 C28 -2 16 4 22 16 C26 22 34 26 40 30 C34 34 24 44 18 56 C14 68 18 82 30 90 C42 96 52 96 58 88Z" },
  // Ear + inner ear
  { t: "w", d: "M36 4 C38 -2 46 2 46 14 C44 18 34 16 36 4Z" },
  // Eye with slit pupil
  { t: "w", d: "M58 34 C62 28 74 30 74 38 C74 44 66 46 60 42 C56 40 56 36 58 34Z" },
  { t: "mc", cx: 66, cy: 38, r: 2.5 },
  { t: "wc", cx: 66, cy: 38, r: 1 },
  // Forehead marking
  { t: "w", d: "M56 22 C58 16 64 16 64 22 C62 20 58 20 56 22Z" },
  // Nose/muzzle (white)
  { t: "w", d: "M82 50 C86 44 94 44 94 50 C94 58 86 60 82 58 C78 56 78 52 82 50Z" },
  { t: "wc", cx: 82, cy: 54, r: 2 },
  { t: "wc", cx: 90, cy: 54, r: 2 },
  // Neck fur spikes (more)
  { t: "w", d: "M22 58 C20 50 28 44 36 50 C28 54 22 58 22 58Z" },
  { t: "w", d: "M18 70 C16 62 24 56 34 62 C24 66 18 70 18 70Z" },
  { t: "w", d: "M18 82 C16 74 26 68 36 74 C26 78 18 82 18 82Z" },
  // Chest fur
  { t: "w", d: "M34 88 C32 80 42 76 52 82 C42 84 34 88 34 88Z" },
];

const LOUP_3: V = [
  { t: "m", d: "M56 90 C72 88 86 78 94 62 C100 50 98 36 90 28 C84 20 72 14 62 8 C54 4 44 0 36 -2 C22 -6 8 2 18 16 C22 22 32 28 38 32 C28 36 16 48 14 62 C10 76 16 90 30 96 C44 102 50 98 56 90Z" },
  // Ear + inner
  { t: "w", d: "M34 2 C36 -4 46 0 46 14 C42 18 32 14 34 2Z" },
  // Moon crescent (alpha symbol, decorative)
  { t: "w", d: "M14 22 C12 10 20 4 28 8 C20 8 14 16 14 22Z" },
  // Eye
  { t: "w", d: "M56 30 C62 24 76 28 76 38 C76 46 66 48 60 44 C56 42 54 36 56 30Z" },
  { t: "mc", cx: 66, cy: 38, r: 3 },
  { t: "wc", cx: 66, cy: 37, r: 1.2 },
  // Scar (battle mark)
  { t: "w", d: "M52 32 L54 28 L56 32 L54 34Z" },
  // Nose
  { t: "w", d: "M84 50 C88 44 98 44 98 52 C98 60 88 62 84 58 C80 56 80 52 84 50Z" },
  { t: "wc", cx: 84, cy: 56, r: 2.5 },
  { t: "wc", cx: 94, cy: 56, r: 2.5 },
  // Neck fur (dramatic)
  { t: "w", d: "M18 54 C14 44 24 38 34 46 C24 50 18 54 18 54Z" },
  { t: "w", d: "M12 68 C10 58 20 52 32 58 C20 62 12 68 12 68Z" },
  { t: "w", d: "M14 82 C12 72 24 66 36 74 C24 78 14 82 14 82Z" },
  { t: "w", d: "M24 92 C20 82 34 76 46 84 C34 88 24 92 24 92Z" },
  { t: "w", d: "M44 94 C42 86 58 82 70 90 C58 92 44 94 44 94Z" },
];

// ─── OURS ─────────────────────────────────────────────────────────────────────
// Front-facing. Very round, wide head. White muzzle oval, white eyes.

const OURS_1: V = [
  // Main head blob (very round)
  { t: "m", d: "M50 8 C70 8 88 24 88 46 C88 70 72 88 50 88 C28 88 12 70 12 46 C12 24 30 8 50 8Z" },
  // Left ear
  { t: "m", d: "M20 22 C18 10 28 8 34 16 C34 22 24 28 20 22Z" },
  // Right ear
  { t: "m", d: "M80 22 C82 10 72 8 66 16 C66 22 76 28 80 22Z" },
  // Ear inner left (white)
  { t: "w", d: "M22 20 C22 12 28 10 32 16 C30 20 24 22 22 20Z" },
  // Ear inner right (white)
  { t: "w", d: "M78 20 C78 12 72 10 68 16 C70 20 76 22 78 20Z" },
  // Muzzle area (white oval, lower face)
  { t: "w", d: "M34 56 C34 44 42 38 50 38 C58 38 66 44 66 56 C66 70 58 80 50 80 C42 80 34 70 34 56Z" },
  // Eyes (white)
  { t: "wc", cx: 36, cy: 40, r: 6 },
  { t: "wc", cx: 64, cy: 40, r: 6 },
  // Nose (main color, on white muzzle)
  { t: "mc", cx: 50, cy: 52, r: 7 },
  { t: "wc", cx: 47, cy: 52, r: 2 },
  { t: "wc", cx: 53, cy: 52, r: 2 },
  // Mouth line
  { t: "m", d: "M46 60 C46 64 54 64 54 60 C54 62 52 64 50 64 C48 64 46 62 46 60Z" },
];

const OURS_2: V = [
  { t: "m", d: "M50 6 C72 6 92 24 92 48 C92 74 74 92 50 92 C26 92 8 74 8 48 C8 24 28 6 50 6Z" },
  // Ears
  { t: "m", d: "M16 22 C14 8 26 6 32 16 C32 24 18 30 16 22Z" },
  { t: "m", d: "M84 22 C86 8 74 6 68 16 C68 24 82 30 84 22Z" },
  { t: "w", d: "M18 20 C18 10 26 8 30 16 C28 20 20 24 18 20Z" },
  { t: "w", d: "M82 20 C82 10 74 8 70 16 C72 20 80 24 82 20Z" },
  // Muzzle
  { t: "w", d: "M32 58 C32 44 40 36 50 36 C60 36 68 44 68 58 C68 72 60 84 50 84 C40 84 32 72 32 58Z" },
  // Brow ridges (green, giving fierce look)
  { t: "m", d: "M28 38 C30 32 38 30 42 36 C38 34 30 36 28 38Z" },
  { t: "m", d: "M58 36 C62 30 70 32 72 38 C70 36 62 34 58 36Z" },
  // Eyes
  { t: "we", cx: 36, cy: 44, rx: 7, ry: 6 },
  { t: "we", cx: 64, cy: 44, rx: 7, ry: 6 },
  // Pupils (green on white)
  { t: "mc", cx: 36, cy: 44, r: 3 },
  { t: "mc", cx: 64, cy: 44, r: 3 },
  // Nose
  { t: "mc", cx: 50, cy: 56, r: 8 },
  { t: "wc", cx: 46, cy: 56, r: 2.5 },
  { t: "wc", cx: 54, cy: 56, r: 2.5 },
  // Mouth
  { t: "m", d: "M42 66 C42 72 58 72 58 66 C58 70 54 74 50 74 C46 74 42 70 42 66Z" },
  // Fur texture on cheeks
  { t: "w", d: "M14 50 C12 44 16 38 22 42 C18 44 14 48 14 50Z" },
  { t: "w", d: "M14 62 C12 56 18 50 24 54 C18 58 14 62 14 62Z" },
  { t: "w", d: "M86 50 C88 44 84 38 78 42 C82 44 86 48 86 50Z" },
  { t: "w", d: "M86 62 C88 56 82 50 76 54 C82 58 86 62 86 62Z" },
];

const OURS_3: V = [
  { t: "m", d: "M50 4 C74 4 96 24 96 50 C96 78 76 96 50 96 C24 96 4 78 4 50 C4 24 26 4 50 4Z" },
  // Ears (bigger)
  { t: "m", d: "M12 22 C10 6 24 4 32 16 C32 26 14 32 12 22Z" },
  { t: "m", d: "M88 22 C90 6 76 4 68 16 C68 26 86 32 88 22Z" },
  { t: "w", d: "M14 20 C14 8 22 6 30 14 C28 20 16 24 14 20Z" },
  { t: "w", d: "M86 20 C86 8 78 6 70 14 C72 20 84 24 86 20Z" },
  // Muzzle
  { t: "w", d: "M30 60 C30 44 38 34 50 34 C62 34 70 44 70 60 C70 76 62 88 50 88 C38 88 30 76 30 60Z" },
  // Heavy brow ridge
  { t: "m", d: "M24 40 C28 32 38 30 44 38 C36 34 26 36 24 40Z" },
  { t: "m", d: "M56 38 C62 30 72 32 76 40 C74 36 64 34 56 38Z" },
  // Eyes
  { t: "we", cx: 36, cy: 48, rx: 8, ry: 7 },
  { t: "we", cx: 64, cy: 48, rx: 8, ry: 7 },
  { t: "mc", cx: 36, cy: 48, r: 4 },
  { t: "wc", cx: 36, cy: 47, r: 1.5 },
  { t: "mc", cx: 64, cy: 48, r: 4 },
  { t: "wc", cx: 64, cy: 47, r: 1.5 },
  // Nose
  { t: "mc", cx: 50, cy: 60, r: 9 },
  { t: "wc", cx: 45, cy: 60, r: 3 },
  { t: "wc", cx: 55, cy: 60, r: 3 },
  // Mouth
  { t: "m", d: "M40 72 C40 80 60 80 60 72 C60 78 56 82 50 82 C44 82 40 78 40 72Z" },
  // Claw marks (battle scars)
  { t: "w", d: "M22 56 L18 48 L20 48 L24 56Z" },
  { t: "w", d: "M18 60 L14 52 L16 52 L20 60Z" },
  // Shoulder fur
  { t: "w", d: "M10 54 C8 46 14 40 22 46 C14 50 10 54 10 54Z" },
  { t: "w", d: "M8 66 C6 58 14 52 24 58 C14 62 8 66 8 66Z" },
  { t: "w", d: "M90 54 C92 46 86 40 78 46 C86 50 90 54 90 54Z" },
  { t: "w", d: "M92 66 C94 58 86 52 76 58 C86 62 92 66 92 66Z" },
];

// ─── AIGLE ────────────────────────────────────────────────────────────────────
// Profile facing right. Distinctive hooked beak, large round eye, crest feathers.

const AIGLE_1: V = [
  // Main silhouette — head + hooked beak
  { t: "m", d: "M44 80 C56 80 68 72 76 62 C80 58 84 54 86 50 C88 46 88 42 84 40 C80 38 76 42 74 46 C72 50 72 54 70 56 C68 52 66 44 64 36 C60 26 54 18 48 12 C44 8 38 6 34 6 C28 4 22 8 26 18 C28 24 34 28 36 32 C30 36 22 44 18 54 C16 62 18 72 26 78 C34 84 40 82 44 80Z" },
  // Eye (large, round, white)
  { t: "wc", cx: 52, cy: 36, r: 10 },
  { t: "mc", cx: 52, cy: 36, r: 5 },
  { t: "wc", cx: 50, cy: 34, r: 2 },
  // Crest feather hints (white)
  { t: "w", d: "M34 8 C36 2 40 4 38 12 C36 10 34 8 34 8Z" },
  { t: "w", d: "M40 6 C44 0 48 4 44 12 C42 10 40 8 40 6Z" },
  // Neck feathers
  { t: "w", d: "M20 60 C18 52 24 46 32 52 C24 56 20 60 20 60Z" },
  { t: "w", d: "M18 72 C16 64 24 58 34 64 C24 68 18 72 18 72Z" },
];

const AIGLE_2: V = [
  { t: "m", d: "M42 84 C56 84 70 74 78 62 C84 56 88 50 90 46 C92 42 90 36 86 34 C82 32 78 36 76 42 C74 48 74 54 70 58 C68 52 66 44 62 34 C58 24 52 16 46 10 C40 4 32 2 28 4 C20 4 14 12 20 24 C24 30 32 34 36 40 C28 44 18 54 16 66 C14 76 18 86 28 90 C38 94 40 88 42 84Z" },
  // Eye
  { t: "wc", cx: 52, cy: 34, r: 12 },
  { t: "mc", cx: 52, cy: 34, r: 7 },
  { t: "wc", cx: 52, cy: 34, r: 3 },
  { t: "wc", cx: 49, cy: 32, r: 1.5 },
  // Fierce brow ridge
  { t: "m", d: "M38 22 C40 16 50 16 52 24 C48 20 40 20 38 22Z" },
  // Crest feathers (multiple)
  { t: "w", d: "M30 6 C32 -2 38 2 36 12 C34 10 30 8 30 6Z" },
  { t: "w", d: "M38 4 C40 -4 46 0 44 10 C42 8 38 6 38 4Z" },
  { t: "w", d: "M46 2 C50 -4 56 2 52 10 C50 8 46 4 46 2Z" },
  // White stripe on head (eagle's white head)
  { t: "w", d: "M28 18 C30 12 40 12 44 20 C38 16 30 16 28 18Z" },
  // Neck feathers
  { t: "w", d: "M18 58 C16 48 24 42 34 50 C24 54 18 58 18 58Z" },
  { t: "w", d: "M16 70 C14 60 24 54 36 62 C24 66 16 70 16 70Z" },
  { t: "w", d: "M18 82 C16 72 28 66 40 74 C28 78 18 82 18 82Z" },
  // Chest feathers
  { t: "w", d: "M30 88 C28 80 40 76 52 84 C40 86 30 88 30 88Z" },
];

const AIGLE_3: V = [
  { t: "m", d: "M40 88 C56 88 72 78 82 64 C90 56 96 48 96 42 C96 36 92 30 86 28 C80 26 76 32 74 40 C72 48 72 56 68 60 C66 52 64 44 60 32 C56 22 48 14 42 8 C34 2 24 -2 18 4 C10 8 8 20 16 32 C20 38 30 44 36 50 C26 56 14 68 12 80 C10 90 16 100 30 100 C42 100 40 92 40 88Z" },
  // Eye (largest, most detailed)
  { t: "wc", cx: 54, cy: 34, r: 14 },
  { t: "mc", cx: 54, cy: 34, r: 9 },
  { t: "wc", cx: 54, cy: 34, r: 4 },
  { t: "wc", cx: 51, cy: 31, r: 2 },
  // Intense brow
  { t: "m", d: "M36 18 C38 10 52 12 56 22 C50 16 40 16 36 18Z" },
  // 5 dramatic crest feathers
  { t: "w", d: "M24 6 C28 -4 36 2 32 14 C30 10 24 8 24 6Z" },
  { t: "w", d: "M32 2 C38 -8 46 0 40 14 C38 10 32 6 32 2Z" },
  { t: "w", d: "M42 0 C48 -8 56 2 48 14 C46 10 42 4 42 0Z" },
  { t: "w", d: "M52 2 C60 -4 66 6 58 16 C56 12 52 6 52 2Z" },
  { t: "w", d: "M62 8 C70 4 72 14 66 20 C64 16 62 10 62 8Z" },
  // White head (bald eagle look)
  { t: "w", d: "M24 20 C28 12 42 10 48 20 C42 14 28 14 24 20Z" },
  { t: "w", d: "M18 32 C20 24 32 22 40 30 C30 26 20 28 18 32Z" },
  // Neck + chest feathers
  { t: "w", d: "M14 56 C12 46 22 40 34 48 C22 52 14 56 14 56Z" },
  { t: "w", d: "M10 70 C8 60 20 54 34 62 C20 66 10 70 10 70Z" },
  { t: "w", d: "M12 84 C10 74 24 68 40 78 C24 82 12 84 12 84Z" },
  { t: "w", d: "M22 94 C20 84 36 80 54 88 C36 92 22 94 22 94Z" },
  { t: "w", d: "M44 96 C44 88 62 86 78 94 C62 96 44 96 44 96Z" },
  // Wing edge hint
  { t: "w", d: "M10 80 C4 72 6 62 14 66 C10 70 10 76 10 80Z" },
];

// ─── REGISTRY ────────────────────────────────────────────────────────────────
const MASCOTS: Record<MascotAnimal, Record<1 | 2 | 3, V>> = {
  lion:  { 1: LION_1,  2: LION_2,  3: LION_3  },
  tigre: { 1: TIGRE_1, 2: TIGRE_2, 3: TIGRE_3 },
  loup:  { 1: LOUP_1,  2: LOUP_2,  3: LOUP_3  },
  ours:  { 1: OURS_1,  2: OURS_2,  3: OURS_3  },
  aigle: { 1: AIGLE_1, 2: AIGLE_2, 3: AIGLE_3 },
};

export function Mascot({
  animal,
  evolution = 1,
  size = 80,
  color = "#2D7C3E",
  background = "transparent",
}: {
  animal: MascotAnimal;
  evolution?: 1 | 2 | 3;
  size?: number;
  color?: string;
  strokeWidth?: number; // kept for API compat, unused
  background?: string;
}) {
  const stage = Math.max(1, Math.min(3, evolution)) as 1 | 2 | 3;
  const shapes = MASCOTS[animal]?.[stage] ?? MASCOTS.lion[1];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {background !== "transparent" && (
          <Circle cx="50" cy="50" r="50" fill={background} />
        )}
        <G>
          {shapes.map((s, i) => {
            if (s.t === "m") return <Path key={i} d={s.d} fill={color} />;
            if (s.t === "w") return <Path key={i} d={s.d} fill="white" />;
            if (s.t === "mc") return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={color} />;
            if (s.t === "wc") return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white" />;
            if (s.t === "me") return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color} />;
            if (s.t === "we") return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill="white" />;
            return null;
          })}
        </G>
      </Svg>
    </View>
  );
}

export default Mascot;
