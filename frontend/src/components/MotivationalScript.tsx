import { Platform, StyleProp, StyleSheet, Text, TextStyle } from "react-native";

export function MotivationalScript({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.text, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: "#B6FF3F",
    fontFamily: Platform.select({ ios: "Snell Roundhand", android: "cursive", web: "cursive" }),
    fontSize: 27,
    fontStyle: "italic",
    lineHeight: 32,
    letterSpacing: 0,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
