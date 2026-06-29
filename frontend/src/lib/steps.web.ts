export type StepSyncResult = {
  ok: boolean;
  status: "synced" | "already_synced" | "unavailable";
  phoneSteps?: number;
  addedSteps?: number;
  message: string;
};

export async function syncPhoneStepsToday(_currentSteps = 0): Promise<StepSyncResult> {
  return {
    ok: false,
    status: "unavailable",
    message: "La synchronisation automatique se fait depuis le podomètre du téléphone.",
  };
}
