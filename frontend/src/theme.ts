import type { ImageSourcePropType } from "react-native";

// Design system — FIT AI dark/illustrated theme
export const colors = {
  // Core backgrounds
  background: "#04120B",
  surface: "rgba(7,28,18,0.62)",        // glass card
  surfaceAlt: "rgba(5,22,14,0.48)",     // secondary glass
  surfaceSheet: "rgba(5,18,12,0.97)",   // modal sheet (near-opaque)

  // Brand greens
  primary: "#8EEA2F",                   // button fill, interactive
  primaryDark: "#47A91E",
  primaryLight: "#B6FF3F",             // accent labels, active icons
  primaryPale: "rgba(182,255,63,0.14)", // subtle fills, chip bg
  aqua: "#35D6E8",
  amber: "#FFB33F",

  // Text — all on dark backgrounds
  textMain: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.40)",

  // Borders
  border: "rgba(182,255,63,0.16)",
  borderBright: "rgba(182,255,63,0.44)",

  // Semantic
  alert: "#F87171",
  warning: "#FCD34D",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

export const typography = {
  h1: { fontSize: 34, fontWeight: "800" as const, letterSpacing: 0, color: colors.textMain },
  h2: { fontSize: 25, fontWeight: "800" as const, letterSpacing: 0, color: colors.textMain },
  h3: { fontSize: 20, fontWeight: "600" as const, color: colors.textMain },
  body: { fontSize: 15, color: colors.textMain },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textSecondary, letterSpacing: 0 },
};

// ─── Screen backgrounds ────────────────────────────────────────────────────────
// Local illustrated backgrounds extracted from the ChatGPT-generated reference.
export const SCREEN_BACKGROUNDS: Record<string, ImageSourcePropType> = {
  dashboard: require("../assets/images/fitai-hero-dashboard-hd.png"),
  training: require("../assets/images/fitai-hero-program-hd.png"),
  meals: require("../assets/images/fitai-hero-meals-hd.png"),
  progress: require("../assets/images/fitai-hero-progress-hd.png"),
  challenges: require("../assets/images/fitai-hero-activities-hd.png"),
  profile: require("../assets/images/fitai-hero-progress-hd.png"),
};

// Overlays: dark top/bottom for readability, light middle so the photo is clearly visible
export const SCREEN_OVERLAYS: Record<string, readonly [string, string, string, string]> = {
  dashboard:  ["rgba(3,16,12,0.18)", "rgba(3,18,12,0.05)", "rgba(4,20,13,0.30)", "rgba(2,12,8,0.96)"],
  training:   ["rgba(2,14,12,0.22)", "rgba(2,16,12,0.05)", "rgba(4,18,12,0.28)", "rgba(2,11,8,0.96)"],
  meals:      ["rgba(3,16,12,0.22)", "rgba(3,18,12,0.08)", "rgba(4,20,13,0.32)", "rgba(2,12,8,0.96)"],
  progress:   ["rgba(2,14,12,0.18)", "rgba(2,16,12,0.06)", "rgba(4,18,12,0.32)", "rgba(2,11,8,0.96)"],
  challenges: ["rgba(2,14,12,0.14)", "rgba(2,16,12,0.04)", "rgba(4,18,12,0.28)", "rgba(2,11,8,0.96)"],
  profile:    ["rgba(2,14,12,0.20)", "rgba(2,16,12,0.06)", "rgba(4,18,12,0.32)", "rgba(2,11,8,0.96)"],
};
