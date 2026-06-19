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
  // Images matching the mockup: woman atop mountain (Dashboard) / man running forest light (Entraînement) /
  // silhouette running hill sunset (Programme) / woman hiking with backpack (Progression) /
  // golden mountain landscape (Défis) / woman running nature path (Profil)
  dashboard:  "https://images.unsplash.com/photo-1645817849968-35ad0b3f36b9?w=800&q=85&fit=crop",
  training:   "https://images.unsplash.com/photo-1733667917418-f4b7ea5a80c4?w=800&q=85&fit=crop",
  meals:      "https://images.unsplash.com/photo-1726521812762-32386ad8842a?w=800&q=85&fit=crop",
  progress:   "https://images.unsplash.com/photo-1723764881665-5b40cea01c9b?w=800&q=85&fit=crop",
  challenges: "https://images.unsplash.com/photo-1743309411498-a0f4f4b96b65?w=800&q=85&fit=crop",
  profile:    "https://images.unsplash.com/photo-1631899477678-9d3c5aeded2d?w=800&q=85&fit=crop",
};

// Overlays: dark top/bottom for readability, light middle so the photo is clearly visible
export const SCREEN_OVERLAYS: Record<string, readonly [string, string, string, string]> = {
  dashboard:  ["rgba(4,14,8,0.62)",  "rgba(12,50,24,0.22)", "rgba(12,50,24,0.18)", "rgba(4,12,8,0.78)"],
  training:   ["rgba(4,12,8,0.65)",  "rgba(10,40,20,0.24)", "rgba(10,40,20,0.20)", "rgba(4,10,7,0.80)"],
  meals:      ["rgba(4,14,8,0.60)",  "rgba(14,55,26,0.20)", "rgba(14,55,26,0.16)", "rgba(4,12,8,0.78)"],
  progress:   ["rgba(4,12,8,0.62)",  "rgba(12,50,24,0.22)", "rgba(12,50,24,0.18)", "rgba(4,12,8,0.80)"],
  challenges: ["rgba(4,14,8,0.62)",  "rgba(12,50,24,0.22)", "rgba(12,50,24,0.18)", "rgba(4,12,8,0.78)"],
  profile:    ["rgba(4,12,8,0.60)",  "rgba(10,42,22,0.20)", "rgba(10,42,22,0.16)", "rgba(4,10,7,0.78)"],
};
