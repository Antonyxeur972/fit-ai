import { Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import { api } from "@/src/api";

export type StepSyncResult = {
  ok: boolean;
  status: "synced" | "already_synced" | "unavailable";
  phoneSteps?: number;
  addedSteps?: number;
  message: string;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function syncPhoneStepsToday(currentSteps: number): Promise<StepSyncResult> {
  if (Platform.OS === "web") {
    return {
      ok: false,
      status: "unavailable",
      message: "La synchronisation automatique se fait depuis le podomètre du téléphone.",
    };
  }

  try {
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return {
        ok: false,
        status: "unavailable",
        message: "Le podomètre n'est pas disponible sur cet appareil.",
      };
    }

    const result = await Pedometer.getStepCountAsync(startOfToday(), new Date());
    const phoneSteps = Math.max(0, Math.round(result.steps || 0));
    const addedSteps = Math.max(0, phoneSteps - Math.max(0, currentSteps || 0));

    if (addedSteps <= 0) {
      return {
        ok: true,
        status: "already_synced",
        phoneSteps,
        addedSteps: 0,
        message: "Tes pas téléphone sont déjà synchronisés.",
      };
    }

    await api("/activity/steps", { method: "POST", body: { steps: addedSteps } });
    return {
      ok: true,
      status: "synced",
      phoneSteps,
      addedSteps,
      message: `${addedSteps.toLocaleString("fr-FR")} pas ajoutés depuis ton téléphone.`,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: "unavailable",
      message: e?.message || "Impossible de lire le podomètre pour le moment.",
    };
  }
}
