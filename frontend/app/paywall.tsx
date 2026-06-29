import { useEffect, useMemo, useState } from "react";
import { ImageBackground, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { Button } from "@/src/components/UI";
import {
  applyPromoCode,
  getOrStartPaywallOffer,
  getSubscriptionState,
  PLAN_DETAILS,
  purchaseSubscription,
  restoreSubscription,
  STORE_PRODUCT_IDS,
  SubscriptionPlan,
} from "@/src/lib/subscription";
import { hasSignedCommitment } from "@/src/lib/commitment";
import { cancelPreSubscriptionNudges, schedulePreSubscriptionNudges } from "@/src/lib/notifications";
import { colors, radius, spacing, typography } from "@/src/theme";

const BENEFITS = [
  { icon: "barbell-outline", label: "Cycle d'entraînement piloté par tes données" },
  { icon: "restaurant-outline", label: "Calories, macros et repas ajustés à ton objectif" },
  { icon: "walk-outline", label: "Pas synchronisés depuis le podomètre du téléphone" },
  { icon: "notifications-outline", label: "Rappels d'action, motivation et offres privées" },
] as const;

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

export default function Paywall() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("annual");
  const [offerMs, setOfferMs] = useState(0);
  const [offerRevealed, setOfferRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const store = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
  const productId = store ? STORE_PRODUCT_IDS[store][selectedPlan] : "ios / google-play";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.onboarded) {
      router.replace("/onboarding");
    }
  }, [loading, router, user]);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const state = await getSubscriptionState();
      if (state.active) {
        router.replace("/(tabs)/dashboard");
        return;
      }

      const signed = await hasSignedCommitment();
      if (!signed) {
        router.replace("/commitment");
        return;
      }

      const offer = await getOrStartPaywallOffer();
      if (!mounted) return;
      setOfferMs(offer.remainingMs);
      setOfferRevealed(offer.revealed);
      schedulePreSubscriptionNudges(offer.expiresAt, offer.revealedAt).catch(() => undefined);

      interval = setInterval(async () => {
        const nextOffer = await getOrStartPaywallOffer();
        if (!mounted) return;
        setOfferMs(nextOffer.remainingMs);
        setOfferRevealed(nextOffer.revealed);
      }, 1000);
    })();

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [router]);

  const planPrice = useMemo(() => PLAN_DETAILS[selectedPlan], [selectedPlan]);

  const subscribe = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await purchaseSubscription(selectedPlan);
      setMessage(result.message);
      if (result.ok) {
        await cancelPreSubscriptionNudges();
        router.replace("/(tabs)/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await restoreSubscription();
      setMessage(result.message);
      if (result.ok) {
        await cancelPreSubscriptionNudges();
        router.replace("/(tabs)/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  const validatePromoCode = async () => {
    if (promoBusy || !promoCode.trim()) return;
    setPromoBusy(true);
    setMessage(null);
    try {
      const result = await applyPromoCode(promoCode);
      setMessage(result.message);
      if (result.ok) {
        await cancelPreSubscriptionNudges();
        router.replace("/(tabs)/dashboard");
      }
    } finally {
      setPromoBusy(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/fitai-hero-program-hd.png")}
      style={styles.background}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
    >
      <LinearGradient
        colors={["rgba(8,16,12,0.34)", "rgba(7,22,13,0.24)", "rgba(3,8,5,0.92)"]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="paywall-screen">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Ionicons name="leaf" size={24} color={colors.primaryLight} />
            </View>
            <View>
              <Text style={styles.brand}>FIT AI Premium</Text>
              <Text style={styles.storeLine}>
                Abonnement {store === "ios" ? "iOS" : store === "android" ? "Google Play" : "iOS & Google Play"}
              </Text>
            </View>
          </View>

          <View style={styles.heroBlock}>
            <Text style={styles.script}>protocole prêt</Text>
            <Text style={styles.title}>{"Ton plan est construit. Premium l'exécute avec toi."}</Text>
            <Text style={styles.subtitle}>
              {"FIT AI n'est pas une app à essayer vaguement : le programme, les repas, les rappels et les ajustements se débloquent avec l'abonnement."}
            </Text>
          </View>

          {offerRevealed ? (
            <View style={styles.offerBand} testID="paywall-discount-notification">
              <View style={styles.offerIcon}>
                <Ionicons name="notifications-outline" size={18} color="#071207" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>Offre privée débloquée : -50%</Text>
                <Text style={styles.offerText}>Le cycle annuel passe à 39,99 € pendant 24h. Encore {formatRemaining(offerMs)}.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.waitBand}>
              <View style={styles.waitIcon}>
                <Ionicons name="hourglass-outline" size={18} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.waitTitle}>Ton protocole reste réservé</Text>
                <Text style={styles.waitText}>
                  {"Le tarif standard est affiché maintenant. Si tu ne démarres pas tout de suite, FIT AI continuera à te relancer avec entraînement, motivation et offres privées."}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.planGrid}>
            {(["annual", "monthly"] as SubscriptionPlan[]).map((plan) => {
              const details = PLAN_DETAILS[plan];
              const active = selectedPlan === plan;
              const annualDiscountUnlocked = plan === "annual" && offerRevealed && !!details.discountPriceLabel;
              const priceLabel = annualDiscountUnlocked ? details.discountPriceLabel : details.priceLabel;
              const monthlyLabel = annualDiscountUnlocked ? details.discountMonthlyLabel : details.monthlyLabel;
              return (
                <TouchableOpacity
                  key={plan}
                  activeOpacity={0.86}
                  onPress={() => setSelectedPlan(plan)}
                  style={[styles.planCard, active && styles.planCardActive, plan === "annual" && styles.planAnnual]}
                  testID={`paywall-plan-${plan}`}
                >
                  <View style={styles.planTop}>
                    <Text style={styles.planLabel}>{details.label}</Text>
                    {details.badge ? (
                      <View style={styles.planBadge}>
                        <Text style={styles.planBadgeText}>{details.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.priceRow}>
                    {annualDiscountUnlocked ? <Text style={styles.oldPrice}>{details.priceLabel}</Text> : null}
                    <Text style={styles.price}>{priceLabel}</Text>
                    <Text style={styles.period}>{details.period}</Text>
                  </View>
                  {monthlyLabel ? <Text style={styles.monthlyEquivalent}>{monthlyLabel}</Text> : null}
                  {annualDiscountUnlocked && details.discountLabel ? (
                    <Text style={styles.discount}>{details.discountLabel}</Text>
                  ) : (
                    <Text style={styles.discountMuted}>{plan === "annual" ? "Tarif annuel standard" : "Cycle renouvelé automatiquement"}</Text>
                  )}
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Ionicons name="checkmark" size={14} color="#071207" /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.benefits}>
            {BENEFITS.map((b) => (
              <View key={b.label} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon} size={16} color={colors.aqua} />
                </View>
                <Text style={styles.benefitText}>{b.label}</Text>
              </View>
            ))}
          </View>

          <Button
            title={`Débloquer Premium ${planPrice.label.toLowerCase()}`}
            onPress={subscribe}
            loading={busy}
            testID="paywall-subscribe"
            icon={<Ionicons name="lock-open-outline" size={18} color="#071207" />}
          />

          <View style={styles.promoBox}>
            <View style={styles.promoHeader}>
              <View style={styles.promoIcon}>
                <Ionicons name="pricetag-outline" size={17} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promoTitle}>Code promotionnel</Text>
                <Text style={styles.promoSubtitle}>Entre ton code pour débloquer un accès spécial.</Text>
              </View>
            </View>
            <View style={styles.promoRow}>
              <TextInput
                value={promoCode}
                onChangeText={setPromoCode}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="fit.ai.972"
                placeholderTextColor="rgba(255,255,255,0.36)"
                style={styles.promoInput}
                testID="paywall-promo-input"
              />
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={validatePromoCode}
                disabled={promoBusy || !promoCode.trim()}
                style={[styles.promoButton, (promoBusy || !promoCode.trim()) && styles.promoButtonDisabled]}
                testID="paywall-promo-apply"
              >
                <Text style={styles.promoButtonText}>{promoBusy ? "..." : "OK"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={restore} disabled={busy} style={styles.restore} testID="paywall-restore">
            <Text style={styles.restoreText}>Restaurer mon abonnement</Text>
          </TouchableOpacity>

          <Text style={styles.productId}>Produit store : {productId}</Text>

          {message ? (
            <View style={styles.messageBox} testID="paywall-message">
              <Ionicons name="information-circle-outline" size={16} color={colors.aqua} />
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}

          <Text style={styles.finePrint}>
            {"Sans abonnement actif, FIT AI conserve uniquement le protocole préparé et peut envoyer des rappels quotidiens d'entraînement, de motivation et des promotions. L'accès complet reste réservé aux abonnés."}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#06100B" },
  backgroundImage: { transform: [{ scale: 1.02 }] },
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  brand: { fontSize: 20, fontWeight: "600", color: colors.textMain, letterSpacing: 0.4 },
  storeLine: { ...typography.small, color: "rgba(255,255,255,0.72)", marginTop: 2 },
  heroBlock: { paddingTop: spacing.xl, gap: spacing.md },
  script: {
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(182,255,63,0.90)",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "600", color: colors.textMain, letterSpacing: 0 },
  subtitle: { ...typography.body, color: "rgba(255,255,255,0.80)", lineHeight: 23 },
  waitBand: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(3,19,14,0.68)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
  },
  waitIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(142,234,47,0.13)",
  },
  waitTitle: { color: colors.textMain, fontWeight: "900", fontSize: 15 },
  waitText: { color: "rgba(255,255,255,0.70)", marginTop: 2, fontSize: 13, lineHeight: 18 },
  offerBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,179,63,0.17)",
    borderWidth: 1,
    borderColor: "rgba(255,179,63,0.5)",
  },
  offerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
  },
  offerTitle: { color: colors.textMain, fontWeight: "900", fontSize: 15 },
  offerText: { color: "rgba(255,255,255,0.72)", marginTop: 2, fontSize: 13 },
  planGrid: { gap: spacing.sm },
  planCard: {
    minHeight: 126,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(7,28,18,0.74)",
    overflow: "hidden",
  },
  planCardActive: { borderColor: colors.primaryLight, backgroundColor: "rgba(39,89,39,0.54)" },
  planAnnual: { borderColor: "rgba(255,179,63,0.58)" },
  planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  planLabel: { color: colors.textMain, fontSize: 17, fontWeight: "900" },
  planBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.amber },
  planBadgeText: { color: "#071207", fontSize: 11, fontWeight: "900" },
  priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.sm, flexWrap: "wrap" },
  oldPrice: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 15,
    fontWeight: "800",
    marginRight: spacing.sm,
    marginBottom: 6,
    textDecorationLine: "line-through",
  },
  price: { color: colors.textMain, fontSize: 30, fontWeight: "900", letterSpacing: 0 },
  period: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", marginBottom: 5, marginLeft: 4 },
  monthlyEquivalent: { color: colors.textSecondary, fontSize: 13, fontWeight: "800", marginTop: 2 },
  discount: { color: colors.amber, fontSize: 13, fontWeight: "900", marginTop: 4 },
  discountMuted: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  radio: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  benefits: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  benefitIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(53,214,232,0.14)",
  },
  benefitText: { color: colors.textMain, fontWeight: "700", flex: 1 },
  promoBox: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "rgba(7,28,18,0.74)",
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.22)",
  },
  promoHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  promoIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.12)",
  },
  promoTitle: { color: colors.textMain, fontSize: 15, fontWeight: "900" },
  promoSubtitle: { color: "rgba(255,255,255,0.62)", fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  promoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  promoInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.textMain,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: "800",
  },
  promoButton: {
    minHeight: 52,
    minWidth: 62,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
  },
  promoButtonDisabled: { opacity: 0.45 },
  promoButtonText: { color: "#071207", fontWeight: "900", fontSize: 14 },
  restore: { alignItems: "center", paddingVertical: spacing.sm },
  restoreText: { color: colors.primaryLight, fontWeight: "800" },
  productId: { ...typography.caption, color: "rgba(255,255,255,0.48)", textAlign: "center" },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(53,214,232,0.12)",
    borderWidth: 1,
    borderColor: "rgba(53,214,232,0.34)",
  },
  messageText: { ...typography.small, color: colors.textMain, flex: 1, lineHeight: 18 },
  finePrint: { ...typography.small, color: "rgba(255,255,255,0.50)", textAlign: "center", lineHeight: 18 },
});
