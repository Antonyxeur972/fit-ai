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
    message: "Le navigateur ne peut pas lire le sommeil du téléphone. Sur mobile, la carte est prête pour la synchro santé.",
  };
}
