import { ReactNode } from "react";
import { ImageBackground, StyleSheet } from "react-native";
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
 *   1. Fixed ImageBackground (sport photo from Unsplash CDN)
 *   2. LinearGradient dark-green overlay for readability
 *   3. SafeAreaView container for content
 *
 * The photo stays fixed; ScrollView content scrolls over it.
 * If the photo fails to load, the gradient alone still looks great.
 */
export function ScreenBackground({ bg, children, edges = ["top"] }: Props) {
  const url = SCREEN_BACKGROUNDS[bg];
  const overlay = SCREEN_OVERLAYS[bg] ?? SCREEN_OVERLAYS.dashboard;

  return (
    <ImageBackground
      source={{ uri: url }}
      style={styles.root}
      resizeMode="cover"
    >
      <LinearGradient
        colors={overlay}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={edges}>
        {children}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#060F09" },
  safe: { flex: 1 },
});
