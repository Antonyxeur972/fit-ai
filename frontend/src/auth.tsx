import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, getToken, setToken, clearToken } from "./api";

export type MascotAnimal = "lion" | "tigre" | "loup" | "ours" | "aigle";

export type AppUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  onboarded: boolean;
  pact_signed?: boolean;
  subscription_status?: "none" | "active" | "expired";
  silhouette?: { sex: "male" | "female"; level: number } | null;
  force_metrics?: {
    at?: string;
    squat?: number;
    bench?: number;
    deadlift?: number;
    ohp?: number;
  } | null;
  mascot?: { animal: MascotAnimal; chosen_at?: string } | null;
  notif_prefs?: {
    reminders: Array<{
      id: string;
      kind: "workout" | "protein";
      hour: number;
      minute: number;
      enabled: boolean;
      days_of_week?: number[];
      label?: string | null;
    }>;
  } | null;
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: AppUser | null) => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api<AppUser>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  // Pre-warm the backend before the user clicks "Sign in"
  useEffect(() => {
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/health`).catch(() => {});
  }, []);

  // Process session_id from redirect URL: api retries x2 with backoff + clear error on start.
  const processSessionId = useCallback(async (sessionId: string) => {
    try {
      setAuthError(null);
      const resp = await api<{ session_token: string; user: AppUser }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
        auth: false,
        retries: 2,
      });
      await setToken(resp.session_token);
      setUser(resp.user);
    } catch (e: any) {
      console.warn("processSessionId failed", e);
      setAuthError(e?.message || "Connexion échouée. Réessaie dans quelques secondes.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Web: parse URL fragment / query
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const hash = window.location.hash || "";
          const search = window.location.search || "";
          const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
          if (m) {
            await processSessionId(decodeURIComponent(m[1]));
            window.history.replaceState(null, "", window.location.pathname);
          } else {
            await refreshUser();
          }
        } else {
          // Mobile: check cold-start url
          const initial = await Linking.getInitialURL();
          if (initial) {
            const m = initial.match(/session_id=([^&]+)/);
            if (m) {
              await processSessionId(decodeURIComponent(m[1]));
            } else {
              await refreshUser();
            }
          } else {
            await refreshUser();
          }
        }
      } finally {
        setLoading(false);
      }
    })();

    const sub = Linking.addEventListener("url", async ({ url }) => {
      const m = url.match(/session_id=([^&]+)/);
      if (m) await processSessionId(decodeURIComponent(m[1]));
    });
    return () => sub.remove();
  }, [processSessionId, refreshUser]);

  const signInWithGoogle = useCallback(async () => {
    let redirectUrl: string;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      redirectUrl = window.location.origin + "/";
    } else {
      redirectUrl = Linking.createURL("auth");
    }
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const m = result.url.match(/session_id=([^&]+)/);
      if (m) await processSessionId(decodeURIComponent(m[1]));
    }
  }, [processSessionId]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, signInWithGoogle, signOut, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
