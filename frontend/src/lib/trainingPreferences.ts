import { storage } from "@/src/utils/storage";

const DEFAULT_TRAINING_TIME_KEY = "fitai_default_training_time";

export function normalizeTrainingTimePreference(value?: string | null) {
  const match = String(value || "").trim().match(/^(\d{1,2})[:hH]?(\d{2})?$/);
  if (!match) return "18:30";
  const hour = Math.max(5, Math.min(23, parseInt(match[1] || "18", 10)));
  const minute = Math.max(0, Math.min(59, parseInt(match[2] || "00", 10)));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export async function readDefaultTrainingTime() {
  const stored = await storage.getItem(DEFAULT_TRAINING_TIME_KEY, "18:30");
  return normalizeTrainingTimePreference(stored);
}

export async function saveDefaultTrainingTime(value: string) {
  return storage.setItem(DEFAULT_TRAINING_TIME_KEY, normalizeTrainingTimePreference(value));
}
