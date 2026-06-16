// Design system — FIT AI dark/photo theme
export const colors = {
  // Core backgrounds
  background: "#060F09",
  surface: "rgba(10,28,16,0.72)",       // glass card
  surfaceAlt: "rgba(6,18,10,0.55)",     // secondary glass
  surfaceSheet: "rgba(6,16,10,0.97)",   // modal sheet (near-opaque)

  // Brand greens
  primary: "#2D7C3E",                   // button fill, interactive
  primaryLight: "#4ADE80",             // accent labels, active icons
  primaryPale: "rgba(74,222,128,0.12)", // subtle fills, chip bg

  // Text — all on dark backgrounds
  textMain: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.40)",

  // Borders
  border: "rgba(74,222,128,0.18)",
  borderBright: "rgba(74,222,128,0.40)",

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
  md: 16,
  lg: 24,
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
  h1: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.6, color: colors.textMain },
  h2: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.4, color: colors.textMain },
  h3: { fontSize: 20, fontWeight: "600" as const, color: colors.textMain },
  body: { fontSize: 15, color: colors.textMain },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 11, color: colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" as const },
};

// ─── Screen backgrounds ────────────────────────────────────────────────────────
// One URL per screen — each resolves to a high-quality 800px fitness photo.
// ImageBackground + LinearGradient overlay defined in ScreenBackground component.
export const SCREEN_BACKGROUNDS: Record<string, string> = {
  dashboard:  "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=70&fit=crop",
  training:   "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=70&fit=crop",
  meals:      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=70&fit=crop",
  progress:   "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=70&fit=crop",
  challenges: "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800&q=70&fit=crop",
  profile:    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=70&fit=crop",
};

// Green-nature overlay gradients: dark top → semi-transparent mid → dark bottom
export const SCREEN_OVERLAYS: Record<string, readonly [string, string, string, string]> = {
  dashboard:  ["rgba(4,14,8,0.90)",  "rgba(12,50,24,0.52)", "rgba(12,50,24,0.38)", "rgba(4,12,8,0.94)"],
  training:   ["rgba(4,12,8,0.92)",  "rgba(10,40,20,0.55)", "rgba(10,40,20,0.40)", "rgba(4,10,7,0.96)"],
  meals:      ["rgba(4,14,8,0.88)",  "rgba(14,55,26,0.50)", "rgba(14,55,26,0.35)", "rgba(4,12,8,0.94)"],
  progress:   ["rgba(4,12,8,0.90)",  "rgba(12,50,24,0.52)", "rgba(12,50,24,0.38)", "rgba(4,12,8,0.96)"],
  challenges: ["rgba(4,14,8,0.90)",  "rgba(12,50,24,0.52)", "rgba(12,50,24,0.38)", "rgba(4,12,8,0.94)"],
  profile:    ["rgba(4,12,8,0.88)",  "rgba(10,42,22,0.50)", "rgba(10,42,22,0.35)", "rgba(4,10,7,0.94)"],
};
