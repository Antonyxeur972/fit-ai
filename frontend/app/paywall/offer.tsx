import { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Purchases, { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { Button } from "@/src/components/UI";
import { useSubscription } from "@/src/subscription";
import { colors, spacing, typography, radius } from "@/src/theme";

// If the person is still on this screen 5 minutes after arriving (i.e. they
// haven't subscribed yet — the literal definition of "hesitating"), surface
// a discounted annual offer to win them back.
const HESITATION_DELAY_MS = 5 * 60 * 1000;
const DISCOUNT_WINDOW_SECONDS = 5 * 60;

const FALLBACK_PRICES = {
  monthly: "9,99 €",
  annual: "59,99 €",
  annualDiscount: "29,99 €",
};

function findPackage(offering: PurchasesOffering | null, type: "MONTHLY" | "ANNUAL"): PurchasesPackage | null {
  if (!offering) return null;
  return offering.availablePackages.find((p) => p.packageType === type) ?? null;
}

export default function Offer() {
  const router = useRouter();
  const { offering, winbackOffering, isPro, refresh } = useSubscription();
  const [selected, setSelected] = useState<"monthly" | "annual">("annual");
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountDismissed, setDiscountDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DISCOUNT_WINDOW_SECONDS);

  const monthlyPkg = findPackage(offering, "MONTHLY");
  const annualPkg = findPackage(offering, "ANNUAL");
  const discountPkg = winbackOffering?.availablePackages[0] ?? null;

  useEffect(() => {
    if (isPro) router.replace("/(tabs)/dashboard");
  }, [isPro, router]);

  useEffect(() => {
    const t = setTimeout(() => setShowDiscount(true), HESITATION_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showDiscount || discountDismissed || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [showDiscount, discountDismissed, secondsLeft]);

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [secondsLeft]);

  const purchase = async (pkg: PurchasesPackage | null, key: string) => {
    if (!pkg) {
      setError("Offre indisponible pour le moment. Réessaie plus tard.");
      return;
    }
    setPurchasing(key);
    setError(null);
    try {
      await Purchases.purchasePackage(pkg);
      await refresh();
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      if (!e?.userCancelled) {
        setError(e?.message || "Achat impossible. Réessaie.");
      }
    } finally {
      setPurchasing(null);
    }
  };

  const restore = async () => {
    setPurchasing("restore");
    setError(null);
    try {
      await Purchases.restorePurchases();
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Restauration impossible.");
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="offer-screen">
      <View style={styles.content}>
        <Text style={styles.title}>Ton engagement commence maintenant.</Text>
        <Text style={styles.subtitle}>Coaching IA, suivi nutrition et programme adapté — sans limite.</Text>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <PlanCard
            testID="offer-plan-annual"
            label="Annuel"
            price={annualPkg?.product.priceString || FALLBACK_PRICES.annual}
            badge="Meilleure offre"
            sub="Soit ~5 €/mois"
            active={selected === "annual"}
            onPress={() => setSelected("annual")}
          />
          <PlanCard
            testID="offer-plan-monthly"
            label="Mensuel"
            price={monthlyPkg?.product.priceString || FALLBACK_PRICES.monthly}
            sub="Sans engagement"
            active={selected === "monthly"}
            onPress={() => setSelected("monthly")}
          />
        </View>

        {error ? <Text style={[typography.small, { color: colors.alert, marginTop: spacing.md }]}>{error}</Text> : null}

        <View style={{ flex: 1 }} />

        <Button
          title="Démarrer mon abonnement"
          onPress={() => purchase(selected === "annual" ? annualPkg : monthlyPkg, selected)}
          loading={purchasing === selected}
          disabled={!!purchasing}
          testID="offer-subscribe"
        />
        <TouchableOpacity onPress={restore} disabled={!!purchasing} style={styles.restoreBtn} testID="offer-restore">
          <Text style={[typography.small, { color: colors.textSecondary }]}>Restaurer mes achats</Text>
        </TouchableOpacity>
        <Text style={styles.legal}>
          {"Abonnement à renouvellement automatique. Annulable à tout moment depuis les réglages de ton compte Google Play, jusqu'à 24h avant le renouvellement."}
        </Text>
      </View>

      <Modal visible={showDiscount && !discountDismissed && secondsLeft > 0} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <Ionicons name="flash" size={14} color="#fff" />
              <Text style={styles.modalBadgeText}>Offre limitée — {mmss}</Text>
            </View>
            <Text style={styles.modalTitle}>Dernière chance</Text>
            <Text style={styles.modalSubtitle}>
              {"L'annuel à "}
              {discountPkg?.product.priceString || FALLBACK_PRICES.annualDiscount}
              {" au lieu de "}
              {annualPkg?.product.priceString || FALLBACK_PRICES.annual}
              {"."}
            </Text>
            <Button
              title={`Profiter de l'offre — ${discountPkg?.product.priceString || FALLBACK_PRICES.annualDiscount}`}
              onPress={() => purchase(discountPkg, "discount")}
              loading={purchasing === "discount"}
              disabled={!!purchasing}
              testID="offer-discount-subscribe"
            />
            <TouchableOpacity
              onPress={() => setDiscountDismissed(true)}
              style={{ marginTop: spacing.sm }}
              testID="offer-discount-dismiss"
            >
              <Text style={[typography.small, { color: colors.textMuted, textAlign: "center" }]}>Non merci</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PlanCard({
  label,
  price,
  sub,
  badge,
  active,
  onPress,
  testID,
}: {
  label: string;
  price: string;
  sub?: string;
  badge?: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity testID={testID} activeOpacity={0.85} onPress={onPress} style={[styles.planCard, active && styles.planCardActive]}>
      {badge ? (
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.planRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>{label}</Text>
          {sub ? <Text style={styles.planSub}>{sub}</Text> : null}
        </View>
        <Text style={styles.planPrice}>{price}</Text>
        <Ionicons
          name={active ? "radio-button-on" : "radio-button-off"}
          size={20}
          color={active ? colors.primary : colors.textMuted}
          style={{ marginLeft: spacing.sm }}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6, marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  planRow: { flexDirection: "row", alignItems: "center" },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  planBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  planLabel: { fontSize: 17, fontWeight: "700", color: colors.textMain },
  planSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  planPrice: { fontSize: 18, fontWeight: "700", color: colors.textMain },
  restoreBtn: { alignItems: "center", paddingVertical: spacing.md },
  legal: { ...typography.small, color: colors.textMuted, textAlign: "center", lineHeight: 18, paddingBottom: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surfaceSheet,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderBright,
  },
  modalBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.alert,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  modalBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  modalSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 22 },
});
