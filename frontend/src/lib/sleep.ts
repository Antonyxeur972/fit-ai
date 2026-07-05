export type SleepSyncResult = {
  ok: boolean;
  status: "synced" | "already_synced" | "unavailable";
  phoneHours?: number;
  message: string;
};

export async function syncPhoneSleepToday(_currentHours = 0): Promise<SleepSyncResult> {
  return {
    ok: false,
    status: "unavailable",
    message: "La synchronisation sommeil sera disponible avec la source santé du téléphone. Tu peux l'ajouter manuellement ici.",
  };
}
