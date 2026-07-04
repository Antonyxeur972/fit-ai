import { Image, StyleSheet, View } from "react-native";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import type { MascotAnimal } from "./Mascot";
import { colors } from "../theme";

export const MASCOT_IMAGES: Record<MascotAnimal, ImageSourcePropType> = {
  lion: require("../../assets/images/fitai-mascot-lion.png"),
  tigre: require("../../assets/images/fitai-mascot-tigre.png"),
  loup: require("../../assets/images/fitai-mascot-loup.png"),
  ours: require("../../assets/images/fitai-mascot-ours.png"),
  aigle: require("../../assets/images/fitai-mascot-aigle.png"),
};

type Props = {
  animal: MascotAnimal;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MascotPortrait({ animal, size = 88, active = false, style }: Props) {
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.wrapActive,
        style,
      ]}
    >
      <Image source={MASCOT_IMAGES[animal]} style={styles.image} resizeMode="cover" />
      <View style={styles.vignette} />
      {active ? <View style={styles.glowRing} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  wrapActive: {
    borderColor: colors.primaryLight,
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.36,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,12,8,0.08)",
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "rgba(182,255,63,0.42)",
  },
});
