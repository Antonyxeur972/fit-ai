import { Image, View } from "react-native";

export type SilhouetteSex = "male" | "female";

export const SILHOUETTE_LABELS: Record<number, string> = {
  1: "Très mince",
  2: "Mince athlétique",
  3: "Athlétique",
  4: "Musclé",
  5: "Très musclé",
};

const SILHOUETTE_IMAGES = {
  male: {
    1: require("../../assets/images/fitai-silhouette-male-1.png"),
    2: require("../../assets/images/fitai-silhouette-male-2.png"),
    3: require("../../assets/images/fitai-silhouette-male-3.png"),
    4: require("../../assets/images/fitai-silhouette-male-4.png"),
    5: require("../../assets/images/fitai-silhouette-male-5.png"),
  },
  female: {
    1: require("../../assets/images/fitai-silhouette-female-1.png"),
    2: require("../../assets/images/fitai-silhouette-female-2.png"),
    3: require("../../assets/images/fitai-silhouette-female-3.png"),
    4: require("../../assets/images/fitai-silhouette-female-4.png"),
    5: require("../../assets/images/fitai-silhouette-female-5.png"),
  },
} as const;

export function Silhouette({
  sex,
  level,
  size = 110,
  active = false,
}: {
  sex: SilhouetteSex;
  level: number;
  size?: number;
  active?: boolean;
}) {
  const clamped = Math.max(1, Math.min(5, level)) as 1 | 2 | 3 | 4 | 5;
  const w = size;
  const h = Math.round(size * 1.86);
  return (
    <View
      style={{
        width: w,
        height: h,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={SILHOUETTE_IMAGES[sex][clamped]}
        resizeMode="contain"
        style={{
          width: w,
          height: h,
          opacity: active ? 1 : 0.82,
          transform: [{ scale: active ? 1.04 : 1 }],
        }}
      />
    </View>
  );
}

export default Silhouette;
