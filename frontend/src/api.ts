import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://fit-ai-4ujg.onrender.com";
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  retries?: number;
};

function messageFromValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["msg", "message", "error"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function apiErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = record.detail ?? record.message ?? record.error;
    if (Array.isArray(detail)) {
      const messages = detail.map(messageFromValue).filter(Boolean);
      if (messages.length) return messages.join(" ");
    }
    const message = messageFromValue(detail);
    if (message) return message;
  }
  return `Une erreur est survenue (HTTP ${status}).`;
}

export function readableError(error: unknown, fallback: string): string {
  const message = messageFromValue(error);
  return message && message !== "[object Object]" ? message : fallback;
}

async function fetchWithRetry(url: string, init: RequestInit, retries: number): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
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
    const rawBody = await res.text();
    let payload: unknown = rawBody;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {}
    const err = new Error(apiErrorMessage(payload, res.status)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
