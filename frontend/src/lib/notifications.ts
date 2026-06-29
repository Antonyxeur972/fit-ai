import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { quoteForToday, MotivationContext } from "./motivation";
import { storage } from "@/src/utils/storage";

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

const PRE_SUB_NOTIFICATION_IDS_KEY = "fitai_pre_subscription_notification_ids";

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

async function readPreSubNotificationIds(): Promise<string[]> {
  const raw = await storage.getItem(PRE_SUB_NOTIFICATION_IDS_KEY, "");
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function writePreSubNotificationIds(ids: string[]): Promise<void> {
  await storage.setItem(PRE_SUB_NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

export async function cancelPreSubscriptionNudges(): Promise<void> {
  if (Platform.OS === "web") return;
  const ids = await readPreSubNotificationIds();
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await storage.removeItem(PRE_SUB_NOTIFICATION_IDS_KEY);
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

export async function schedulePreSubscriptionNudges(offerExpiresAt?: string, offerRevealedAt?: string): Promise<number> {
  if (Platform.OS === "web") return 0;
  const ok = await ensureNotifPermission();
  if (!ok) return 0;

  await cancelPreSubscriptionNudges();

  const ids: string[] = [];
  const daily = [
    {
      hour: 8,
      minute: 10,
      title: "Ta séance est prête",
      body: quoteForToday("pre_workout" as MotivationContext),
      kind: "pre_sub_workout",
    },
    {
      hour: 18,
      minute: 30,
      title: "Petit rappel FIT AI",
      body: "Même avant l'abonnement, garde ton rythme. Ton futur programme t'attend.",
      kind: "pre_sub_motivation",
    },
  ];

  for (const item of daily) {
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
      const weekday = ((dow + 1) % 7) + 1;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: item.title, body: item.body, data: { kind: item.kind } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: item.hour,
            minute: item.minute,
          } as Notifications.WeeklyTriggerInput,
        });
        ids.push(id);
      } catch (e) {
        console.warn("schedule pre-sub daily fail", e);
      }
    }
  }

  if (offerExpiresAt) {
    const expiresAt = new Date(offerExpiresAt).getTime();
    const revealedAt = offerRevealedAt ? new Date(offerRevealedAt).getTime() : Date.now() + 3 * 60 * 1000;
    const promoAt = new Date(Math.max(Date.now() + 5000, revealedAt));
    if (promoAt.getTime() < expiresAt) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Offre FIT AI débloquée",
            body: "Ton abonnement annuel passe à 39,99 € pendant 24h, soit 3,33 € / mois.",
            data: { kind: "pre_sub_promo" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: promoAt,
          } as Notifications.DateTriggerInput,
        });
        ids.push(id);
      } catch (e) {
        console.warn("schedule pre-sub promo fail", e);
      }
    }
  }

  await writePreSubNotificationIds(ids);
  return ids.length;
}
