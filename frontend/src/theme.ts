// Design system tokens for Performance Fitness App
export const colors = {
  background: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F4F0",
  primary: "#2D7C3E",
  primaryLight: "#4ADE80",
  primaryPale: "#E8F5E9",
  textMain: "#1A1A1A",
  textSecondary: "#666666",
  textMuted: "#9A9A9A",
  border: "#E5E5E5",
  alert: "#EF4444",
  warning: "#F59E0B",
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
  md: 16,
  lg: 24,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
};

export const typography = {
  // Use system fonts (no expo-google-fonts allowed) – mapped to Inter/Poppins-ish system
  h1: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.6, color: colors.textMain },
  h2: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.4, color: colors.textMain },
  h3: { fontSize: 20, fontWeight: "600" as const, color: colors.textMain },
  body: { fontSize: 15, color: colors.textMain },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 11, color: colors.textSecondary, letterSpacing: 1.5, textTransform: "uppercase" as const },
};
