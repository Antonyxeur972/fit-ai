// Design system — FIT AI vivid nature theme
export const colors = {
  // Core backgrounds
  background: "#040D06",
  surface: "rgba(5,22,12,0.48)",         // glass card — much more transparent
  surfaceAlt: "rgba(3,14,8,0.36)",       // secondary glass
  surfaceSheet: "rgba(4,14,10,0.96)",    // modal sheet (near-opaque)

  // Brand greens — vivid lime like reference image
  primary: "#22c55e",                    // button fill, interactive (was dark #2D7C3E)
  primaryLight: "#86efac",              // accent labels, active icons (was #4ADE80)
  primaryPale: "rgba(34,197,94,0.15)",  // subtle fills, chip bg

  // Text — all on dark backgrounds
  textMain: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.75)",
  textMuted: "rgba(255,255,255,0.45)",

  // Borders
  border: "rgba(100,255,120,0.25)",
  borderBright: "rgba(100,255,120,0.48)",

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
// Bright outdoor / nature fitness photos — vivid and alive like the reference
export const SCREEN_BACKGROUNDS: Record<string, string> = {
  dashboard:  "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=85&fit=crop",
  training:   "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=85&fit=crop",
  meals:      "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=85&fit=crop",
  progress:   "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=85&fit=crop",
  challenges: "https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800&q=85&fit=crop",
  profile:    "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=85&fit=crop",
};

// Light green-nature overlays — photo clearly visible like reference image
// sandwich: slight top darkening → very light mid (photo vivid) → readable bottom
export const SCREEN_OVERLAYS: Record<string, readonly [string, string, string, string]> = {
  dashboard:  ["rgba(0,15,5,0.40)",  "rgba(0,25,10,0.16)", "rgba(0,20,8,0.20)",  "rgba(0,10,4,0.70)"],
  training:   ["rgba(0,12,5,0.42)",  "rgba(0,20,8,0.18)",  "rgba(0,18,6,0.22)",  "rgba(0,8,3,0.72)"],
  meals:      ["rgba(0,15,5,0.38)",  "rgba(0,28,12,0.16)", "rgba(0,22,10,0.18)", "rgba(0,10,4,0.70)"],
  progress:   ["rgba(0,15,5,0.40)",  "rgba(0,25,10,0.16)", "rgba(0,20,8,0.20)",  "rgba(0,10,4,0.72)"],
  challenges: ["rgba(0,15,5,0.42)",  "rgba(0,25,10,0.18)", "rgba(0,20,8,0.22)",  "rgba(0,10,4,0.72)"],
  profile:    ["rgba(0,12,5,0.38)",  "rgba(0,22,10,0.16)", "rgba(0,18,8,0.18)",  "rgba(0,8,3,0.70)"],
};
