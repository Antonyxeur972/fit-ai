import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import Purchases, { CustomerInfo, PurchasesOffering } from "react-native-purchases";
import { useAuth } from "@/src/auth";

// Entitlement identifier configured in the RevenueCat dashboard.
export const ENTITLEMENT_ID = "pro";

// Identifier of the dedicated RevenueCat Offering used for the 5-minute
// "hesitation" discount (annual at 29,99€ instead of 59,99€). Create this
// offering + a linked product in RevenueCat/Play Console before launch.
export const WINBACK_OFFERING_ID = "winback";

const REVENUECAT_API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

type SubscriptionCtx = {
  isPro: boolean;
  loading: boolean;
  ready: boolean; // false if no RevenueCat API key configured yet
  offering: PurchasesOffering | null;
  winbackOffering: PurchasesOffering | null;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionCtx | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [winbackOffering, setWinbackOffering] = useState<PurchasesOffering | null>(null);

  useEffect(() => {
    if (!REVENUECAT_API_KEY) {
      // No RevenueCat project configured yet — skip gating instead of hanging.
      setLoading(false);
      return;
    }
    if (configured) return;
    Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: user?.user_id });
    setConfigured(true);
  }, [user?.user_id, configured]);

  const applyCustomerInfo = useCallback((info: CustomerInfo) => {
    setIsPro(!!info.entitlements.active[ENTITLEMENT_ID]);
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const info = await Purchases.getCustomerInfo();
      applyCustomerInfo(info);
      const offerings = await Purchases.getOfferings();
      setOffering(offerings.current ?? null);
      setWinbackOffering(offerings.all[WINBACK_OFFERING_ID] ?? null);
    } catch (e) {
      console.warn("RevenueCat refresh failed", e);
    } finally {
      setLoading(false);
    }
  }, [configured, applyCustomerInfo]);

  useEffect(() => {
    if (!configured) return;
    refresh();
    const listener = (info: CustomerInfo) => applyCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [configured, refresh, applyCustomerInfo]);

  return (
    <SubscriptionContext.Provider
      value={{ isPro, loading, ready: !!REVENUECAT_API_KEY, offering, winbackOffering, refresh }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be inside SubscriptionProvider");
  return ctx;
}
