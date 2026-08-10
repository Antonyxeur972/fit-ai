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

export type ReminderKind = "workout" | "protein" | "meal" | "hydration" | "morning" | "weekly" | "level" | "custom";

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
const MANUAL_NOTIFICATION_IDS_KEY = "fitai_manual_notification_ids";
const AUTO_NOTIFICATION_IDS_KEY = "fitai_auto_notification_ids";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export async function ensureNotifPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

async function hasNotifPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  return !!current.granted;
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

async function readNotificationIds(key: string): Promise<string[]> {
  const raw = await storage.getItem(key, "");
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function writeNotificationIds(key: string, ids: string[]): Promise<void> {
  await storage.setItem(key, JSON.stringify(ids));
}

async function cancelStoredNotifications(key: string): Promise<void> {
  if (Platform.OS === "web") return;
  const ids = await readNotificationIds(key);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await storage.removeItem(key);
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
  if (r.kind === "hydration") {
    return { title: r.label || "Hydratation", body: "Petit point eau : quelques gorgées maintenant, et tu repars mieux." };
  }
  if (r.kind === "morning") {
    return { title: r.label || "Bonjour FIT AI", body: quoteForToday("general" as MotivationContext) };
  }
  if (r.kind === "custom") {
    return { title: r.label || "Rappel FIT AI", body: "" };
  }
  return { title: "Ta séance t'attend", body: quoteForToday("pre_workout" as MotivationContext) };
}

async function scheduleWeeklyNotification({
  title,
  body,
  data,
  days = ALL_DAYS,
  hour,
  minute,
}: {
  title: string;
  body: string;
  data: Record<string, unknown>;
  days?: number[];
  hour: number;
  minute: number;
}): Promise<string[]> {
  const ids: string[] = [];
  for (const dow of days) {
    const weekday = ((dow + 1) % 7) + 1;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, data },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        } as Notifications.WeeklyTriggerInput,
      });
      ids.push(id);
    } catch (e) {
      console.warn("schedule weekly fail", e);
    }
  }
  return ids;
}

export async function scheduleReminders(reminders: Reminder[]): Promise<number> {
  if (Platform.OS === "web") return 0;
  await cancelStoredNotifications(MANUAL_NOTIFICATION_IDS_KEY);
  const ok = await ensureNotifPermission();
  if (!ok) return 0;
  const ids: string[] = [];
  for (const r of reminders) {
    if (!r.enabled) continue;
    const days = r.days_of_week && r.days_of_week.length > 0 ? r.days_of_week : ALL_DAYS;
    const { title, body } = bodyFor(r);
    ids.push(...await scheduleWeeklyNotification({
      title,
      body,
      data: { reminderId: r.id, kind: r.kind },
      days,
      hour: r.hour,
      minute: r.minute,
    }));
  }
  await writeNotificationIds(MANUAL_NOTIFICATION_IDS_KEY, ids);
  return ids.length;
}

export type AutoReminderOptions = {
  trainingDays?: number[];
  weeklyDone?: number;
  weeklyPlanned?: number;
  nextLevelPoints?: number;
  hydrationLow?: boolean;
  pointsToday?: number;
};

export async function scheduleAutomaticFitAiReminders(options: AutoReminderOptions = {}): Promise<number> {
  if (Platform.OS === "web") return 0;
  const ok = await hasNotifPermission();
  if (!ok) return 0;
  await cancelStoredNotifications(AUTO_NOTIFICATION_IDS_KEY);

  const ids: string[] = [];
  const trainingDays = options.trainingDays?.length ? options.trainingDays : [0, 2, 4];
  const weeklyDone = Math.max(0, options.weeklyDone ?? 0);
  const weeklyPlanned = Math.max(1, options.weeklyPlanned ?? trainingDays.length);
  const nextLevelPoints = Math.max(0, options.nextLevelPoints ?? 0);
  const pointsToday = Math.max(0, options.pointsToday ?? 0);

  ids.push(...await scheduleWeeklyNotification({
    title: "Bonjour FIT AI",
    body: quoteForToday("general" as MotivationContext),
    data: { kind: "auto_morning" },
    days: ALL_DAYS,
    hour: 8,
    minute: 5,
  }));

  ids.push(...await scheduleWeeklyNotification({
    title: "Ta séance t'attend",
    body: quoteForToday("pre_workout" as MotivationContext),
    data: { kind: "auto_workout" },
    days: trainingDays,
    hour: 18,
    minute: 30,
  }));

  ids.push(...await scheduleWeeklyNotification({
    title: "Check protéines",
    body: quoteForToday("protein_low" as MotivationContext),
    data: { kind: "auto_protein" },
    days: ALL_DAYS,
    hour: 20,
    minute: 45,
  }));

  ids.push(...await scheduleWeeklyNotification({
    title: "Hydratation",
    body: options.hydrationLow
      ? "Tu es bas en eau aujourd'hui : remplis la gourde maintenant."
      : "Petit rappel eau : quelques gorgées régulières valent mieux qu'un grand oubli.",
    data: { kind: "auto_hydration" },
    days: ALL_DAYS,
    hour: 17,
    minute: 25,
  }));

  ids.push(...await scheduleWeeklyNotification({
    title: weeklyDone > 0 ? `${weeklyDone}/${weeklyPlanned} séances cette semaine` : `0/${weeklyPlanned} séances cette semaine`,
    body: weeklyDone > 0 ? "Bravo, tu tiens le rythme. Termine fort." : "Courage, tu peux aller t'entraîner aujourd'hui.",
    data: { kind: "auto_weekly_workouts" },
    days: [6],
    hour: 18,
    minute: 15,
  }));

  if (nextLevelPoints > 0) {
    ids.push(...await scheduleWeeklyNotification({
      title: `Prochain niveau dans ${nextLevelPoints} points`,
      body: "Une séance, un défi ou une bonne journée peuvent te rapprocher du niveau suivant.",
      data: { kind: "auto_next_level" },
      days: [0, 2, 4, 6],
      hour: 12,
      minute: 15,
    }));
  }

  ids.push(...await scheduleWeeklyNotification({
    title: "Bilan points",
    body: "Séance, repas, protéines, eau et sommeil : si ça décroche, quelques points peuvent partir.",
    data: { kind: "auto_points_warning" },
    days: ALL_DAYS,
    hour: 21,
    minute: 30,
  }));

  if (pointsToday > 0) {
    ids.push(...await scheduleWeeklyNotification({
      title: `+${pointsToday} points aujourd'hui`,
      body: "Bien joué. Garde ce rythme demain avec une séance, une bonne hydratation ou tes protéines.",
      data: { kind: "auto_points_today" },
      days: ALL_DAYS,
      hour: 21,
      minute: 35,
    }));
  }

  await writeNotificationIds(AUTO_NOTIFICATION_IDS_KEY, ids);
  return ids.length;
}

export async function schedulePreSubscriptionNudges(offerExpiresAt?: string, offerRevealedAt?: string): Promise<number> {
  if (Platform.OS === "web") return 0;
  const ok = await hasNotifPermission();
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
