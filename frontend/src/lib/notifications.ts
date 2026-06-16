import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { quoteForToday, MotivationContext } from "./motivation";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type ReminderKind = "workout" | "protein" | "meal" | "custom";

export type Reminder = {
  id: string;
  kind: ReminderKind;
  hour: number;
  minute: number;
  enabled: boolean;
  days_of_week?: number[];
  label?: string | null;
};

export async function ensureNotifPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

export async function cancelAll(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

function bodyFor(r: Reminder): { title: string; body: string } {
  if (r.kind === "protein") {
    return { title: "Check protéines", body: quoteForToday("protein_low" as MotivationContext) };
  }
  if (r.kind === "meal") {
    return { title: r.label || "Heure de manger", body: "N'oublie pas ton repas pour rester en forme." };
  }
  if (r.kind === "custom") {
    return { title: r.label || "Rappel FIT AI", body: "" };
  }
  return { title: "Ta séance t'attend", body: quoteForToday("pre_workout" as MotivationContext) };
}

export async function scheduleReminders(reminders: Reminder[]): Promise<number> {
  if (Platform.OS === "web") return 0;
  await cancelAll();
  const ok = await ensureNotifPermission();
  if (!ok) return 0;
  let count = 0;
  for (const r of reminders) {
    if (!r.enabled) continue;
    const days = r.days_of_week && r.days_of_week.length > 0 ? r.days_of_week : [0, 1, 2, 3, 4, 5, 6];
    const { title, body } = bodyFor(r);
    for (const dow of days) {
      const weekday = ((dow + 1) % 7) + 1;
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title, body, data: { reminderId: r.id, kind: r.kind } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: r.hour,
            minute: r.minute,
          } as Notifications.WeeklyTriggerInput,
        });
        count += 1;
      } catch (e) {
        console.warn("schedule reminder fail", e);
      }
    }
  }
  return count;
}
