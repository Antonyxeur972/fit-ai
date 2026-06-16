import { View } from "react-native";
import Svg, { Path, Ellipse, Circle, G, Polygon } from "react-native-svg";

export type MascotAnimal = "lion" | "tigre" | "loup" | "ours" | "aigle";

export const MASCOT_LABELS: Record<MascotAnimal, string> = {
  lion: "Lion",
  tigre: "Tigre",
  loup: "Loup",
  ours: "Ours",
  aigle: "Aigle",
};

/**
 * Realistic green animal illustrations — full green palette only.
 * No white fills. Shading via dark/mid/light green tones.
 * 100×100 viewBox, stroke details for realism.
 */

type Props = {
  animal: MascotAnimal;
  evolution?: 1 | 2 | 3;
  size?: number;
  color?: string;
  strokeWidth?: number;
  background?: string;
};

// Green palette — all shades of green
const G0 = "#05150A"; // near-black green (pupils, deep shadows)
const G1 = "#082D12"; // darkest green (outlines, shadows)
const G3 = "#56AF6A"; // light green (iris, highlights)
const G4 = "#8EE49E"; // bright green (eye reflection)

type AP = { c: string; ev: number };

// ─── LION ─────────────────────────────────────────────────────────────────────

function Lion({ c, ev }: AP) {
  return (
    <G>
      {/* Mane — large organic dark blob */}
      <Path
        d="M50,4 C66,3 83,13 91,29 C98,45 96,65 84,78 C72,91 60,97 50,97 C40,97 28,91 16,78 C4,65 2,45 9,29 C17,13 34,3 50,4Z"
        fill={G1}
      />
      {/* Face — main color */}
      <Ellipse cx={50} cy={53} rx={27} ry={30} fill={c} />
      {/* Forehead depth shadow */}
      <Ellipse cx={50} cy={35} rx={22} ry={9} fill={G1} opacity={0.35} />
      {/* Ears peaking above mane */}
      <Polygon points="23,27 14,9 37,19" fill={G1} />
      <Polygon points="77,27 86,9 63,19" fill={G1} />
      <Polygon points="25,26 18,13 35,20" fill={c} />
      <Polygon points="75,26 82,13 65,20" fill={c} />
      {/* Eye sockets */}
      <Ellipse cx={36} cy={47} rx={10} ry={9} fill={G1} />
      <Ellipse cx={64} cy={47} rx={10} ry={9} fill={G1} />
      {/* Iris */}
      <Ellipse cx={36} cy={47} rx={7.5} ry={6.5} fill={G3} />
      <Ellipse cx={64} cy={47} rx={7.5} ry={6.5} fill={G3} />
      {/* Pupil — vertical slit */}
      <Ellipse cx={36} cy={48} rx={2.5} ry={4.5} fill={G0} />
      <Ellipse cx={64} cy={48} rx={2.5} ry={4.5} fill={G0} />
      {/* Eye reflection */}
      <Circle cx={38} cy={44} r={1.5} fill={G4} />
      <Circle cx={66} cy={44} r={1.5} fill={G4} />
      {/* Nose bridge shadow */}
      <Path d="M44,54 Q50,52 56,54 L55,59 Q50,57 45,59Z" fill={G1} opacity={0.4} />
      {/* Nose */}
      <Ellipse cx={50} cy={63} rx={10} ry={6} fill={G1} />
      {/* Nostril cavities */}
      <Ellipse cx={45} cy={64} rx={3} ry={2.5} fill={G0} />
      <Ellipse cx={55} cy={64} rx={3} ry={2.5} fill={G0} />
      {/* Muzzle shadow area */}
      <Ellipse cx={50} cy={73} rx={13} ry={9} fill={G1} opacity={0.2} />
      {/* Philtrum */}
      <Path d="M50,69 L50,75" stroke={G1} strokeWidth={1.3} fill="none" />
      {/* Mouth */}
      <Path d="M42,75 Q50,83 58,75" stroke={G1} strokeWidth={1.6} fill="none" />
      {/* Mane light edge (evolution 2+) */}
      {ev >= 2 && (
        <G>
          <Path d="M10,30 C15,24 19,24 17,30" stroke={G3} strokeWidth={1.2} fill="none" />
          <Path d="M6,50 C11,44 15,46 13,52" stroke={G3} strokeWidth={1.2} fill="none" />
          <Path d="M10,70 C15,64 20,66 17,72" stroke={G3} strokeWidth={1.2} fill="none" />
          <Path d="M90,30 C85,24 81,24 83,30" stroke={G3} strokeWidth={1.2} fill="none" />
          <Path d="M94,50 C89,44 85,46 87,52" stroke={G3} strokeWidth={1.2} fill="none" />
          <Path d="M90,70 C85,64 80,66 83,72" stroke={G3} strokeWidth={1.2} fill="none" />
        </G>
      )}
      {/* Whisker dots (evolution 3) */}
      {ev >= 3 && (
        <G>
          <Circle cx={34} cy={73} r={1.3} fill={G1} />
          <Circle cx={28} cy={71} r={1.3} fill={G1} />
          <Circle cx={23} cy={72} r={1.3} fill={G1} />
          <Circle cx={66} cy={73} r={1.3} fill={G1} />
          <Circle cx={72} cy={71} r={1.3} fill={G1} />
          <Circle cx={77} cy={72} r={1.3} fill={G1} />
        </G>
      )}
    </G>
  );
}

// ─── TIGRE ────────────────────────────────────────────────────────────────────

function Tigre({ c, ev }: AP) {
  return (
    <G>
      {/* Outer head shape — wide, powerful */}
      <Ellipse cx={50} cy={52} rx={44} ry={43} fill={G1} />
      {/* Inner head */}
      <Ellipse cx={50} cy={52} rx={40} ry={39} fill={c} />
      {/* Wide cheek ruffs */}
      <Ellipse cx={12} cy={57} rx={13} ry={18} fill={G1} />
      <Ellipse cx={88} cy={57} rx={13} ry={18} fill={G1} />
      <Ellipse cx={12} cy={58} rx={9} ry={14} fill={c} />
      <Ellipse cx={88} cy={58} rx={9} ry={14} fill={c} />
      {/* Ears — rounded tips */}
      <Path d="M22,16 C18,4 36,4 38,16 C32,10 28,10 22,16Z" fill={G1} />
      <Path d="M78,16 C82,4 64,4 62,16 C68,10 72,10 78,16Z" fill={G1} />
      <Path d="M24,17 C20,8 35,7 36,17 C31,11 28,11 24,17Z" fill={c} />
      <Path d="M76,17 C80,8 65,7 64,17 C69,11 72,11 76,17Z" fill={c} />
      {/* Forehead stripe pattern */}
      <Path d="M50,13 C49,20 48,28 49,34" stroke={G1} strokeWidth={3.5} fill="none" />
      <Path d="M43,15 C42,22 41,30 42,36" stroke={G1} strokeWidth={2.5} fill="none" />
      <Path d="M57,15 C58,22 59,30 58,36" stroke={G1} strokeWidth={2.5} fill="none" />
      {/* Face center lighter */}
      <Ellipse cx={50} cy={62} rx={24} ry={23} fill={G3} opacity={0.3} />
      {/* Eye sockets */}
      <Ellipse cx={34} cy={44} rx={11} ry={10} fill={G1} />
      <Ellipse cx={66} cy={44} rx={11} ry={10} fill={G1} />
      {/* Iris — round tiger eyes */}
      <Circle cx={34} cy={44} r={8} fill={G3} />
      <Circle cx={66} cy={44} r={8} fill={G3} />
      {/* Pupil — round */}
      <Circle cx={34} cy={45} r={4.5} fill={G0} />
      <Circle cx={66} cy={45} r={4.5} fill={G0} />
      {/* Eye reflection */}
      <Circle cx={36} cy={42} r={2} fill={G4} />
      <Circle cx={68} cy={42} r={2} fill={G4} />
      {/* Wide nose */}
      <Ellipse cx={50} cy={63} rx={11} ry={6.5} fill={G1} />
      <Ellipse cx={44} cy={64} rx={3.5} ry={3} fill={G0} />
      <Ellipse cx={56} cy={64} rx={3.5} ry={3} fill={G0} />
      {/* Muzzle area */}
      <Ellipse cx={50} cy={74} rx={17} ry={11} fill={G3} opacity={0.35} />
      {/* Mouth */}
      <Path d="M50,69 L50,76" stroke={G1} strokeWidth={1.4} fill="none" />
      <Path d="M40,76 Q50,85 60,76" stroke={G1} strokeWidth={1.8} fill="none" />
      {/* Cheek stripes */}
      {ev >= 2 && (
        <G>
          <Path d="M13,50 C18,52 23,53 27,52" stroke={G1} strokeWidth={3} fill="none" />
          <Path d="M13,62 C18,62 23,61 27,61" stroke={G1} strokeWidth={2.5} fill="none" />
          <Path d="M87,50 C82,52 77,53 73,52" stroke={G1} strokeWidth={3} fill="none" />
          <Path d="M87,62 C82,62 77,61 73,61" stroke={G1} strokeWidth={2.5} fill="none" />
        </G>
      )}
      {ev >= 3 && (
        <G>
          <Path d="M13,72 C18,71 23,70 27,70" stroke={G1} strokeWidth={2} fill="none" />
          <Path d="M87,72 C82,71 77,70 73,70" stroke={G1} strokeWidth={2} fill="none" />
        </G>
      )}
    </G>
  );
}

// ─── LOUP ─────────────────────────────────────────────────────────────────────

function Loup({ c, ev }: AP) {
  return (
    <G>
      {/* Head — outer dark */}
      <Path
        d="M50,6 C64,5 78,14 85,27 C92,40 92,58 84,72 C76,84 62,92 50,92 C38,92 24,84 16,72 C8,58 8,40 15,27 C22,14 36,5 50,6Z"
        fill={G1}
      />
      {/* Inner head */}
      <Path
        d="M50,10 C63,9 76,17 82,29 C88,42 88,59 81,72 C74,83 61,90 50,90 C39,90 26,83 19,72 C12,59 12,42 18,29 C24,17 37,9 50,10Z"
        fill={c}
      />
      {/* Tall pointed ears */}
      <Polygon points="25,22 14,1 40,15" fill={G1} />
      <Polygon points="75,22 86,1 60,15" fill={G1} />
      <Polygon points="27,22 18,6 38,16" fill={c} />
      <Polygon points="73,22 82,6 62,16" fill={c} />
      {/* Ear inner dark */}
      <Polygon points="27,20 20,7 36,16" fill={G1} opacity={0.5} />
      <Polygon points="73,20 80,7 64,16" fill={G1} opacity={0.5} />
      {/* Snout (elongated lower face) */}
      <Ellipse cx={50} cy={70} rx={20} ry={16} fill={G1} />
      <Ellipse cx={50} cy={71} rx={16} ry={12} fill={G3} opacity={0.65} />
      {/* Almond eyes — slightly tilted */}
      <Path d="M26,40 Q36,34 45,40 Q36,48 26,40Z" fill={G1} />
      <Path d="M55,40 Q64,34 74,40 Q64,48 55,40Z" fill={G1} />
      {/* Iris */}
      <Ellipse cx={36} cy={41} rx={6} ry={5} fill={G3} />
      <Ellipse cx={64} cy={41} rx={6} ry={5} fill={G3} />
      {/* Pupil — almond/vertical */}
      <Ellipse cx={36} cy={42} rx={2.5} ry={3.5} fill={G0} />
      <Ellipse cx={64} cy={42} rx={2.5} ry={3.5} fill={G0} />
      <Circle cx={38} cy={39} r={1.5} fill={G4} />
      <Circle cx={66} cy={39} r={1.5} fill={G4} />
      {/* Nose at top of snout */}
      <Ellipse cx={50} cy={62} rx={8} ry={5.5} fill={G1} />
      <Ellipse cx={45} cy={63} rx={2.5} ry={2} fill={G0} />
      <Ellipse cx={55} cy={63} rx={2.5} ry={2} fill={G0} />
      {/* Mouth */}
      <Path d="M50,67 L50,73" stroke={G1} strokeWidth={1.4} fill="none" />
      <Path d="M41,73 Q50,81 59,73" stroke={G1} strokeWidth={1.6} fill="none" />
      {/* Cheek fur detail */}
      {ev >= 2 && (
        <G>
          <Path d="M10,44 C14,48 13,54 10,56" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M10,58 C14,61 13,67 10,69" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M90,44 C86,48 87,54 90,56" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M90,58 C86,61 87,67 90,69" stroke={G1} strokeWidth={1.5} fill="none" />
        </G>
      )}
      {/* Battle scar / alpha mark (evolution 3) */}
      {ev >= 3 && (
        <G>
          <Path d="M30,34 L26,28 L29,28 L33,34" fill={G1} opacity={0.6} />
        </G>
      )}
    </G>
  );
}

// ─── OURS ─────────────────────────────────────────────────────────────────────

function Ours({ c, ev }: AP) {
  return (
    <G>
      {/* Head — very round */}
      <Circle cx={50} cy={54} r={43} fill={G1} />
      <Circle cx={50} cy={54} r={39} fill={c} />
      {/* Round ears */}
      <Circle cx={19} cy={16} r={16} fill={G1} />
      <Circle cx={81} cy={16} r={16} fill={G1} />
      <Circle cx={19} cy={16} r={12} fill={c} />
      <Circle cx={81} cy={16} r={12} fill={c} />
      {/* Ear inner shadow */}
      <Circle cx={19} cy={16} r={7} fill={G1} opacity={0.4} />
      <Circle cx={81} cy={16} r={7} fill={G1} opacity={0.4} />
      {/* Brow ridge — gives fierce bear look */}
      <Path d="M24,40 C28,32 40,30 46,38 C38,34 28,34 24,40Z" fill={G1} />
      <Path d="M76,40 C72,32 60,30 54,38 C62,34 72,34 76,40Z" fill={G1} />
      {/* Muzzle protrusion */}
      <Ellipse cx={50} cy={68} rx={23} ry={18} fill={G1} />
      <Ellipse cx={50} cy={69} rx={19} ry={14} fill={G3} opacity={0.7} />
      {/* Eyes — small, close together */}
      <Circle cx={33} cy={44} r={10} fill={G1} />
      <Circle cx={67} cy={44} r={10} fill={G1} />
      <Circle cx={33} cy={44} r={7.5} fill={G3} />
      <Circle cx={67} cy={44} r={7.5} fill={G3} />
      <Circle cx={33} cy={45} r={4.5} fill={G0} />
      <Circle cx={67} cy={45} r={4.5} fill={G0} />
      <Circle cx={35} cy={42} r={1.8} fill={G4} />
      <Circle cx={69} cy={42} r={1.8} fill={G4} />
      {/* Nose — big and prominent */}
      <Ellipse cx={50} cy={62} rx={11} ry={7.5} fill={G1} />
      <Ellipse cx={50} cy={61} rx={9} ry={5.5} fill={G0} />
      {/* Nose highlight */}
      <Ellipse cx={47} cy={59} rx={3} ry={2} fill={G3} opacity={0.5} />
      {/* Mouth */}
      <Path d="M50,69 L50,76" stroke={G1} strokeWidth={1.6} fill="none" />
      <Path d="M39,76 Q50,86 61,76" stroke={G1} strokeWidth={2} fill="none" />
      {/* Cheek fur (evolution 2+) */}
      {ev >= 2 && (
        <G>
          <Path d="M9,52 C12,48 14,52 11,56" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M9,62 C12,58 14,62 11,66" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M91,52 C88,48 86,52 89,56" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M91,62 C88,58 86,62 89,66" stroke={G1} strokeWidth={1.5} fill="none" />
        </G>
      )}
      {/* Claw scratch marks (evolution 3) */}
      {ev >= 3 && (
        <G>
          <Path d="M16,56 L12,46 L14,46 L18,56" fill={G1} opacity={0.5} />
          <Path d="M12,58 L8,48 L10,48 L14,58" fill={G1} opacity={0.5} />
        </G>
      )}
    </G>
  );
}

// ─── AIGLE ────────────────────────────────────────────────────────────────────

function Aigle({ c, ev }: AP) {
  return (
    <G>
      {/* Head — oval, slightly elongated */}
      <Path
        d="M50,6 C66,5 82,15 88,30 C94,45 92,64 82,76 C72,87 60,92 50,92 C40,92 28,87 18,76 C8,64 6,45 12,30 C18,15 34,5 50,6Z"
        fill={G1}
      />
      <Path
        d="M50,10 C65,9 80,18 85,32 C91,47 89,64 80,75 C71,86 59,90 50,90 C41,90 29,86 20,75 C11,64 9,47 15,32 C20,18 35,9 50,10Z"
        fill={c}
      />
      {/* Crest feathers radiating up-back */}
      <Path d="M62,11 C68,5 72,1 69,7 C73,3 76,0 73,8 C77,3 79,2 75,10" stroke={G1} strokeWidth={2.5} fill="none" />
      {ev >= 2 && (
        <Path d="M58,10 C63,4 66,1 63,7" stroke={G1} strokeWidth={2} fill="none" />
      )}
      {/* Brow ridge — fierce look */}
      <Path d="M26,34 C30,26 44,24 50,32 C42,28 30,28 26,34Z" fill={G1} />
      {/* Large dominant eye */}
      <Circle cx={38} cy={44} r={15} fill={G1} />
      <Circle cx={38} cy={44} r={12} fill={G3} />
      <Circle cx={38} cy={44} r={7} fill={G0} />
      <Circle cx={41} cy={41} r={2.5} fill={G4} />
      {/* Eye ring detail */}
      <Circle cx={38} cy={44} r={12} fill="none" stroke={G1} strokeWidth={1.5} />
      {/* Hooked beak — the most distinctive feature */}
      <Path
        d="M58,50 C66,48 76,50 80,58 C83,64 80,72 72,76 C66,79 58,77 55,72 L53,64Z"
        fill={G1}
      />
      <Path
        d="M60,53 C66,51 74,53 77,60 C80,65 77,72 70,74 C65,76 59,74 57,70 L55,64Z"
        fill={G3}
        opacity={0.85}
      />
      {/* Beak nostril/cere */}
      <Ellipse cx={62} cy={56} rx={3.5} ry={2.5} fill={G1} opacity={0.7} />
      {/* Head feather texture */}
      {ev >= 2 && (
        <G>
          <Path d="M60,20 C63,15 65,18 63,23" stroke={G1} strokeWidth={1.5} fill="none" />
          <Path d="M68,23 C72,18 74,21 71,27" stroke={G1} strokeWidth={1.5} fill="none" />
        </G>
      )}
      {/* Neck feather lines */}
      <Path d="M20,64 C24,60 28,62 25,68" stroke={G1} strokeWidth={1.3} fill="none" />
      <Path d="M18,74 C22,70 26,72 23,78" stroke={G1} strokeWidth={1.3} fill="none" />
      {ev >= 3 && (
        <Path d="M22,84 C26,80 30,82 27,88" stroke={G1} strokeWidth={1.3} fill="none" />
      )}
    </G>
  );
}

// ─── Main Mascot component ─────────────────────────────────────────────────────

export function Mascot({ animal, evolution = 1, size = 48, color = "#2D7C3E", background = "transparent", strokeWidth: _sw }: Props) {
  const ev = evolution as number;
  return (
    <View style={{ width: size, height: size }}>
      <Svg viewBox="0 0 100 100" width={size} height={size}>
        {background !== "transparent" && (
          <Circle cx={50} cy={50} r={50} fill={background} />
        )}
        {animal === "lion"   && <Lion   c={color} ev={ev} />}
        {animal === "tigre"  && <Tigre  c={color} ev={ev} />}
        {animal === "loup"   && <Loup   c={color} ev={ev} />}
        {animal === "ours"   && <Ours   c={color} ev={ev} />}
        {animal === "aigle"  && <Aigle  c={color} ev={ev} />}
      </Svg>
    </View>
  );
}

export default Mascot;
