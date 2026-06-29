import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export type SubscriptionPlan = "monthly" | "annual";

export type SubscriptionState = {
  active: boolean;
  plan?: SubscriptionPlan | null;
  source?: "ios" | "android" | "web" | "preview" | "promo" | null;
  expiresAt?: string | null;
};

export type PaywallOffer = {
  startedAt: string;
  expiresAt: string;
  active: boolean;
  remainingMs: number;
  revealedAt: string;
  revealed: boolean;
  revealRemainingMs: number;
};

export type PurchaseResult = {
  ok: boolean;
  message: string;
  productId?: string;
};

const SUBSCRIPTION_KEY = "fitai_subscription_state";
const OFFER_KEY = "fitai_paywall_offer_started_at";
const FREE_PROMO_CODE = "fit.ai.972";
const DAY_MS = 24 * 60 * 60 * 1000;
export const PAYWALL_OFFER_REVEAL_DELAY_MS = 3 * 60 * 1000;

export const STORE_PRODUCT_IDS: Record<"ios" | "android", Record<SubscriptionPlan, string>> = {
  ios: {
    monthly: "fitai_premium_monthly",
    annual: "fitai_premium_annual",
  },
  android: {
    monthly: "fitai_premium_monthly",
    annual: "fitai_premium_annual",
  },
};

export const PLAN_DETAILS: Record<SubscriptionPlan, {
  label: string;
  priceLabel: string;
  period: string;
  monthlyLabel?: string;
  badge?: string;
  discountPriceLabel?: string;
  discountMonthlyLabel?: string;
  discountLabel?: string;
}> = {
  monthly: {
    label: "Mensuel",
    priceLabel: "9,99 €",
    period: "/ mois",
  },
  annual: {
    label: "Annuel",
    priceLabel: "79,99 €",
    period: "/ an",
    monthlyLabel: "soit 6,67 € / mois",
    badge: "Meilleur choix",
    discountPriceLabel: "39,99 €",
    discountMonthlyLabel: "soit 3,33 € / mois",
    discountLabel: "Offre -50% pendant 24h",
  },
};

export async function getSubscriptionState(): Promise<SubscriptionState> {
  const raw = await storage.secureGet(SUBSCRIPTION_KEY, "");
  if (!raw) return { active: false };
  try {
    const parsed = JSON.parse(raw) as SubscriptionState;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      return { active: false, plan: parsed.plan || null, source: parsed.source || null };
    }
    return { active: !!parsed.active, plan: parsed.plan || null, source: parsed.source || null, expiresAt: parsed.expiresAt || null };
  } catch {
    return { active: false };
  }
}

async function saveSubscriptionState(state: SubscriptionState): Promise<void> {
  await storage.secureSet(SUBSCRIPTION_KEY, JSON.stringify(state));
}

export function normalizePromoCode(code: string): string {
  return code.trim().toLowerCase();
}

export async function applyPromoCode(code: string): Promise<PurchaseResult> {
  if (normalizePromoCode(code) !== FREE_PROMO_CODE) {
    return { ok: false, message: "Code promotionnel invalide." };
  }

  await saveSubscriptionState({
    active: true,
    plan: "annual",
    source: "promo",
    expiresAt: null,
  });

  return { ok: true, message: "Code validé. Accès FIT AI débloqué gratuitement." };
}

export async function getOrStartPaywallOffer(): Promise<PaywallOffer> {
  const now = Date.now();
  const savedStartedAt = await storage.secureGet(OFFER_KEY, "" as string);
  let startedAt = savedStartedAt || "";
  if (!startedAt) {
    startedAt = new Date(now).toISOString();
    await storage.secureSet(OFFER_KEY, startedAt);
  }
  const startMs = new Date(startedAt).getTime();
  const revealedMs = startMs + PAYWALL_OFFER_REVEAL_DELAY_MS;
  const expiresMs = startMs + DAY_MS;
  const remainingMs = Math.max(0, expiresMs - now);
  const revealRemainingMs = Math.max(0, revealedMs - now);
  return {
    startedAt,
    expiresAt: new Date(expiresMs).toISOString(),
    revealedAt: new Date(revealedMs).toISOString(),
    revealed: revealRemainingMs <= 0,
    active: remainingMs > 0,
    remainingMs,
    revealRemainingMs,
  };
}

function platformStore(): "ios" | "android" | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

async function loadPurchasesModule(): Promise<any | null> {
  if (!platformStore()) return null;
  try {
    return await import("react-native-purchases");
  } catch (e) {
    console.warn("RevenueCat unavailable", e);
    return null;
  }
}

function revenueCatApiKey(): string | undefined {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return undefined;
}

function hasActiveEntitlement(customerInfo: any): boolean {
  const entitlements = customerInfo?.entitlements?.active || {};
  return !!(entitlements.premium || entitlements.pro || Object.keys(entitlements).length > 0);
}

export async function purchaseSubscription(plan: SubscriptionPlan): Promise<PurchaseResult> {
  const store = platformStore();
  const productId = store ? STORE_PRODUCT_IDS[store][plan] : undefined;

  if (!store || !productId) {
    return {
      ok: false,
      message: "Les achats s'activent dans l'app iOS ou Android publiée sur les stores.",
      productId,
    };
  }

  const apiKey = revenueCatApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: `Pont store prêt. Ajoute la clé RevenueCat ${store.toUpperCase()} et le produit ${productId}.`,
      productId,
    };
  }

  const PurchasesModule = await loadPurchasesModule();
  const Purchases = PurchasesModule?.default || PurchasesModule;
  if (!Purchases?.configure) {
    return {
      ok: false,
      message: "Le module d'achat natif n'est pas disponible dans ce build.",
      productId,
    };
  }

  try {
    Purchases.configure({ apiKey });
    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages || [];
    const selectedPackage = packages.find((p: any) => p?.product?.identifier === productId)
      || packages.find((p: any) => String(p?.packageType || "").toLowerCase().includes(plan === "annual" ? "annual" : "monthly"));

    if (!selectedPackage) {
      return { ok: false, message: `Produit ${productId} introuvable dans l'offre store active.`, productId };
    }

    const purchase = await Purchases.purchasePackage(selectedPackage);
    if (hasActiveEntitlement(purchase?.customerInfo)) {
      await saveSubscriptionState({
        active: true,
        plan,
        source: store,
        expiresAt: purchase?.customerInfo?.latestExpirationDate || null,
      });
      return { ok: true, message: "Abonnement activé.", productId };
    }

    return { ok: false, message: "Aucun droit premium actif après l'achat.", productId };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, message: "Achat annulé.", productId };
    return { ok: false, message: e?.message || "Achat impossible pour le moment.", productId };
  }
}

export async function restoreSubscription(): Promise<PurchaseResult> {
  const store = platformStore();
  if (!store) {
    return { ok: false, message: "La restauration est disponible dans l'app iOS ou Android." };
  }

  const apiKey = revenueCatApiKey();
  if (!apiKey) {
    return { ok: false, message: `Ajoute la clé RevenueCat ${store.toUpperCase()} pour restaurer les achats.` };
  }

  const PurchasesModule = await loadPurchasesModule();
  const Purchases = PurchasesModule?.default || PurchasesModule;
  if (!Purchases?.configure) {
    return { ok: false, message: "Le module d'achat natif n'est pas disponible dans ce build." };
  }

  try {
    Purchases.configure({ apiKey });
    const customerInfo = await Purchases.restorePurchases();
    if (hasActiveEntitlement(customerInfo)) {
      await saveSubscriptionState({
        active: true,
        source: store,
        expiresAt: customerInfo?.latestExpirationDate || null,
      });
      return { ok: true, message: "Abonnement restauré." };
    }
    return { ok: false, message: "Aucun abonnement actif trouvé." };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Restauration impossible pour le moment." };
  }
}
