import { storage } from "@/src/utils/storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_URL = `${BACKEND_URL}/api`;

const TOKEN_KEY = "fit_session_token";

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet(TOKEN_KEY, "")) || null;
}

export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

type ApiOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  retries?: number;
};

async function fetchWithRetry(url: string, init: RequestInit, retries: number): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOpts = {}
): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error("Serveur inaccessible — configuration manquante. Contacte le support.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const retries = opts.retries ?? 1;
  let res: Response;
  try {
    res = await fetchWithRetry(`${API_URL}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }, retries);
  } catch (e: any) {
    throw new Error("Serveur inaccessible. Vérifie ta connexion et réessaie.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
