import { ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREEN_BACKGROUNDS, SCREEN_OVERLAYS } from "../theme";

type BgKey = keyof typeof SCREEN_BACKGROUNDS;

type Props = {
  bg: BgKey;
  children: ReactNode;
  /** SafeAreaView edges (default: top only) */
  edges?: ("top" | "bottom" | "left" | "right")[];
};

/**
 * Wraps a full-screen view with:
 *   1. Fixed ImageBackground (local illustrated artwork)
 *   2. LinearGradient dark-green overlay for readability
 *   3. SafeAreaView container for content
 */
export function ScreenBackground({ bg, children, edges = ["top"] }: Props) {
  const source = SCREEN_BACKGROUNDS[bg];
  const overlay = SCREEN_OVERLAYS[bg] ?? SCREEN_OVERLAYS.dashboard;

  return (
    <ImageBackground
      source={source}
      style={styles.root}
      resizeMode="cover"
    >
      <LinearGradient
        colors={overlay}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(3,12,8,0.55)"]}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow} />
      <SafeAreaView style={styles.safe} edges={edges}>
        {children}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060F09" },
  safe: { flex: 1 },
  glow: {
    position: "absolute",
    left: -80,
    right: -80,
    bottom: -140,
    height: 260,
    backgroundColor: "rgba(142,234,47,0.10)",
    borderTopLeftRadius: 180,
    borderTopRightRadius: 180,
  },
});
