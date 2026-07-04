import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { MascotAnimal } from "@/src/components/Mascot";
import { MascotPortrait } from "@/src/components/MascotPortrait";
import { SilhouettePicker } from "@/src/components/SilhouettePicker";
import { getOrStartPaywallOffer } from "@/src/lib/subscription";
import { ensureNotifPermission, schedulePreSubscriptionNudges } from "@/src/lib/notifications";
import { setSimpleMode as saveSimpleMode } from "@/src/lib/simpleMode";
import { colors, radius, spacing } from "@/src/theme";

type Step = 0 | 1 | 2 | 3 | 4 | 5;
type Gender = "male" | "female";
type Goal = "lose" | "maintain" | "gain";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

const STEPS_COUNT = 6;

const STEP_TITLES = ["Départ intelligent", "Tes mesures", "Objectif principal", "Version de l'app", "Ta silhouette", "Ta mascotte"] as const;

const GOAL_OPTIONS: { value: Goal; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "lose", label: "Perdre du gras", desc: "Déficit calorique modéré", icon: "trending-down" },
  { value: "maintain", label: "Maintenir", desc: "Équilibre, recomposition", icon: "remove" },
  { value: "gain", label: "Gagner du muscle", desc: "Surplus contrôlé", icon: "trending-up" },
];

const MASCOTS: { value: MascotAnimal; label: string }[] = [
  { value: "lion", label: "Lion" },
  { value: "tigre", label: "Tigre" },
  { value: "loup", label: "Loup" },
  { value: "ours", label: "Ours" },
  { value: "aigle", label: "Aigle" },
];

export default function Onboarding() {
  const router = useRouter();
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [thinking, setThinking] = useState(false);
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("28");
  const [weight, setWeight] = useState("75");
  const [height, setHeight] = useState("178");
  const [goal, setGoal] = useState<Goal>("lose");
  const [simpleMode, setSimpleMode] = useState(true);
  const [activity] = useState<ActivityLevel>("moderate");
  const [silhouetteLevel, setSilhouetteLevel] = useState(3);
  const [silhouetteSex, setSilhouetteSex] = useState<Gender>("male");
  const [mascot, setMascot] = useState<MascotAnimal>((user?.mascot?.animal as MascotAnimal | undefined) || "lion");
  const [submitting, setSubmitting] = useState(false);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLastStep = step === STEPS_COUNT - 1;

  useEffect(() => {
    return () => {
      if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    };
  }, []);

  const selectGender = (nextGender: Gender) => {
    setGender(nextGender);
    setSilhouetteSex(nextGender);
  };

  const next = () => {
    const target = Math.min(STEPS_COUNT - 1, step + 1) as Step;
    if (target === step) return;
    setThinking(true);
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    thinkingTimer.current = setTimeout(() => {
      setStep(target);
      setThinking(false);
    }, 1700);
  };
  const prev = () => setStep((current) => Math.max(0, current - 1) as Step);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          weight_kg: parseFloat(weight),
          height_cm: parseFloat(height),
          age: parseInt(age, 10),
          gender,
          goal,
          activity_level: activity,
        },
      });

      try {
        await api("/users/me/silhouette", {
          method: "PUT",
          body: { sex: silhouetteSex, level: silhouetteLevel },
        });
      } catch {}

      try {
        await api("/users/me/mascot", {
          method: "PUT",
          body: { animal: mascot },
        });
      } catch {}

      try {
        await saveSimpleMode(simpleMode);
      } catch {}

      try {
        await api("/workouts/generate", { method: "POST" });
      } catch {}

      await refreshUser();

      try {
        await ensureNotifPermission();
        const offer = await getOrStartPaywallOffer();
        await schedulePreSubscriptionNudges(offer.expiresAt, offer.revealedAt);
      } catch {}

      router.replace("/commitment");
    } catch (error) {
      console.warn("profile submit", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.background}>
      <Image source={require("../assets/images/fitai-hero-progress-hd.png")} style={styles.backgroundImage} resizeMode="cover" />
      <LinearGradient
        colors={["rgba(3,12,9,0.10)", "rgba(3,13,8,0.16)", "rgba(3,9,6,0.88)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="onboarding-screen">
        <View style={styles.header}>
          <Text style={styles.brand}>FIT AI</Text>
          <Text style={styles.headerSubtitle}>{STEP_TITLES[step]}</Text>
        </View>

        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={110}
        >
          {step === 0 && (
            <>
              <GlassPanel style={styles.heroPanel}>
                <Kicker icon="leaf" label="INSCRIPTION INTELLIGENTE" />
                <Text style={styles.heroTitle}>Un départ ultra simple, motivant et personnalisé.</Text>
                <Text style={styles.heroCopy}>
                  On transforme tes réponses en plan, objectifs mesurables, rythme réaliste et premiers bonus de progression.
                </Text>
                <View style={styles.featureGrid}>
                  <IntroFeature icon="person-outline" title="Personnalisé" body="Un plan adapté à toi" />
                  <IntroFeature icon="bulb-outline" title="Intelligent" body="L'IA ajuste ton plan" />
                  <IntroFeature icon="trophy-outline" title="Motivant" body="XP, badges, défis" />
                </View>
              </GlassPanel>

              <GlassPanel style={styles.promisePanel}>
                <Text style={styles.promiseTitle}>
                  Transforme ton corps,{"\n"}
                  <Text style={styles.accentText}>libère ton potentiel.</Text>
                </Text>
                <Text style={styles.promiseCopy}>
                  On construit un programme sérieux, motivant et mesurable autour de ton niveau réel.
                </Text>
                <View style={styles.promiseRows}>
                  <PromiseRow icon="clipboard-outline" label="Programme adapté à toi" />
                  <PromiseRow icon="analytics-outline" label="Suivi intelligent" />
                  <PromiseRow icon="leaf-outline" label="Résultats mesurables" />
                </View>
              </GlassPanel>

              <View style={styles.formBlock}>
                <Text style={styles.fieldLabel}>Genre</Text>
                <GenderSwitch value={gender} onChange={selectGender} />
              </View>
            </>
          )}

          {step === 1 && (
            <View style={styles.stepBody}>
              <Text style={styles.screenTitle}>
                Tes <Text style={styles.accentText}>mesures</Text>
              </Text>
              <Text style={styles.screenSubtitle}>Sois précis. Les calculs en dépendent.</Text>
              <View style={styles.measureStack}>
                <NumericCard
                  icon="calendar-outline"
                  label="Âge"
                  value={age}
                  onChange={setAge}
                  unit="ans"
                  testID="onboarding-age"
                />
                <NumericCard
                  icon="scale-outline"
                  label="Poids"
                  value={weight}
                  onChange={setWeight}
                  unit="kg"
                  testID="onboarding-weight"
                />
                <NumericCard
                  icon="resize-outline"
                  label="Taille"
                  value={height}
                  onChange={setHeight}
                  unit="cm"
                  testID="onboarding-height"
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBody}>
              <Text style={styles.screenTitle}>Ton objectif</Text>
              <Text style={styles.screenSubtitle}>Choisis ce qui correspond à ce que tu veux RÉELLEMENT.</Text>
              <View style={styles.goalStack}>
                {GOAL_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    testID={`onboarding-goal-${option.value}`}
                    activeOpacity={0.82}
                    style={[styles.goalCard, goal === option.value && styles.goalCardActive]}
                    onPress={() => setGoal(option.value)}
                  >
                    <View style={[styles.goalIcon, goal === option.value && styles.goalIconActive]}>
                      <Ionicons name={option.icon} size={24} color={goal === option.value ? "#172506" : colors.primaryLight} />
                    </View>
                    <View style={styles.goalText}>
                      <Text style={[styles.goalTitle, goal !== option.value && styles.goalTitleMuted]}>{option.label}</Text>
                      <Text style={styles.goalDesc}>{option.desc}</Text>
                    </View>
                    <View style={[styles.radio, goal === option.value && styles.radioActive]}>
                      {goal === option.value ? <Ionicons name="checkmark" size={20} color="#24370A" /> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepBody}>
              <Text style={styles.screenTitle}>
                Version <Text style={styles.accentText}>simple</Text> ou complète ?
              </Text>
              <Text style={styles.screenSubtitle}>{"Tu peux changer ce choix plus tard depuis l'accueil."}</Text>
              <View style={styles.appModeStack}>
                <AppModeCard
                  icon="phone-portrait-outline"
                  title="Version simplifiée"
                  body="Calories à viser, séance du jour, repas, points, mascotte et partage."
                  active={simpleMode}
                  onPress={() => setSimpleMode(true)}
                />
                <AppModeCard
                  icon="grid-outline"
                  title="Version complète"
                  body="Toutes les stats, quêtes, macros, suivi détaillé, défis et réglages avancés."
                  active={!simpleMode}
                  onPress={() => setSimpleMode(false)}
                />
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepBody}>
              <Text style={styles.screenTitle}>
                Ta <Text style={styles.accentText}>silhouette</Text>
                {"\n"}actuelle
              </Text>
              <Text style={styles.screenSubtitle}>
                {"Choisis le visuel qui ressemble le plus à ton corps aujourd'hui. Ce sera le point de départ."}
              </Text>
              <GenderSwitch value={silhouetteSex} onChange={setSilhouetteSex} compact />
              <GlassPanel style={styles.pickerPanel}>
                <SilhouettePicker
                  sex={silhouetteSex}
                  level={silhouetteLevel}
                  showSexToggle={false}
                  onChange={(nextSex, nextLevel) => {
                    setSilhouetteSex(nextSex);
                    setSilhouetteLevel(nextLevel);
                  }}
                />
              </GlassPanel>
            </View>
          )}

          {step === 5 && (
            <View style={styles.stepBody}>
              <GlassPanel style={styles.mascotPanel}>
                <Text style={styles.screenTitle}>
                  Ta <Text style={styles.accentText}>mascotte</Text>
                </Text>
                <Text style={styles.screenSubtitle}>
                  Choisis ton compagnon de progression. Il évoluera avec toi à chaque palier.
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mascotRow}
                >
                  {MASCOTS.map((item) => {
                    const selected = mascot === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        activeOpacity={0.84}
                        style={[styles.mascotCard, selected && styles.mascotCardActive]}
                        onPress={() => setMascot(item.value)}
                        testID={`onboarding-mascot-${item.value}`}
                      >
                        <MascotPortrait animal={item.value} active={selected} size={92} />
                        {selected ? (
                          <View style={styles.mascotCheck}>
                            <Ionicons name="checkmark" size={18} color="#172506" />
                          </View>
                        ) : null}
                        <Text style={[styles.mascotName, selected && styles.mascotNameActive]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </GlassPanel>
            </View>
          )}
        </KeyboardAwareScrollView>

        {(thinking || submitting) ? (
          <ThinkingOverlay text={submitting ? "Nous préparons ton protocole FIT AI." : "FIT AI analyse ta réponse."} />
        ) : null}

        <View style={styles.footer}>
          {step > 0 ? (
            <TouchableOpacity activeOpacity={0.84} onPress={prev} style={styles.backButton} testID="onboarding-back">
              <Ionicons name="arrow-back" size={22} color={colors.primaryLight} />
              <Text style={styles.backButtonText}>Retour</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={isLastStep ? submit : next}
            disabled={submitting || thinking}
            style={[styles.nextButton, step === 0 && styles.nextButtonFull, (submitting || thinking) && styles.buttonDisabled]}
            testID="onboarding-next"
          >
            <Text style={styles.nextButtonText}>{step === 0 ? "Commencer" : isLastStep ? "Terminer" : "Continuer"}</Text>
            <Ionicons name="arrow-forward" size={24} color="#142407" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function GlassPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.glassPanel, style]}>{children}</View>;
}

function Kicker({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.kicker}>
      <RotatingLeaf size={34} icon={icon} />
      <Text style={styles.kickerText}>{label}</Text>
    </View>
  );
}

function RotatingLeaf({ size, icon = "leaf" }: { size: number; icon?: keyof typeof Ionicons.glyphMap }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View
      style={[
        styles.kickerIcon,
        { width: size, height: size, transform: [{ rotate }] },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.44)} color="#172506" />
    </Animated.View>
  );
}

function ThinkingOverlay({ text }: { text: string }) {
  return (
    <View style={styles.thinkingOverlay} pointerEvents="auto">
      <View style={styles.thinkingBox}>
        <RotatingLeaf size={62} />
        <Text style={styles.thinkingTitle}>Réflexion en cours</Text>
        <Text style={styles.thinkingText}>{text}</Text>
      </View>
    </View>
  );
}

function IntroFeature({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={colors.textMain} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureBody}>{body}</Text>
    </View>
  );
}

function PromiseRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.promiseRow}>
      <Ionicons name={icon} size={20} color={colors.primaryLight} />
      <Text style={styles.promiseRowText}>{label}</Text>
    </View>
  );
}

function AppModeCard({
  icon,
  title,
  body,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} style={[styles.appModeCard, active && styles.appModeCardActive]}>
      <View style={[styles.appModeIcon, active && styles.appModeIconActive]}>
        <Ionicons name={icon} size={26} color={active ? "#172506" : colors.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.appModeTitle, active && styles.appModeTitleActive]}>{title}</Text>
        <Text style={[styles.appModeBody, active && styles.appModeBodyActive]}>{body}</Text>
      </View>
      <View style={[styles.appModeRadio, active && styles.appModeRadioActive]}>
        {active ? <Ionicons name="checkmark" size={20} color="#172506" /> : null}
      </View>
    </TouchableOpacity>
  );
}

function GenderSwitch({
  value,
  onChange,
  compact = false,
}: {
  value: Gender;
  onChange: (gender: Gender) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.genderSwitch, compact && styles.genderSwitchCompact]}>
      {(["male", "female"] as Gender[]).map((item) => {
        const selected = value === item;
        return (
          <TouchableOpacity
            key={item}
            activeOpacity={0.84}
            onPress={() => onChange(item)}
            style={[styles.genderOption, selected && styles.genderOptionActive]}
            testID={`onboarding-gender-${item}`}
          >
            <Ionicons name={item === "male" ? "male" : "female"} size={22} color={selected ? "#1D2D08" : colors.textSecondary} />
            <Text style={[styles.genderText, selected && styles.genderTextActive]}>{item === "male" ? "Homme" : "Femme"}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function NumericCard({
  icon,
  label,
  value,
  onChange,
  unit,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  testID?: string;
}) {
  return (
    <GlassPanel style={styles.numericCard}>
      <View style={styles.numericHeader}>
        <View style={styles.numericIcon}>
          <Ionicons name={icon} size={22} color="#152507" />
        </View>
        <Text style={styles.numericLabel}>{label}</Text>
      </View>
      <View style={styles.numericInputWrap}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="rgba(255,255,255,0.38)"
          style={styles.numericInput}
        />
        <Text style={styles.numericUnit}>{unit}</Text>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#06110B",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: 2,
  },
  brand: {
    color: colors.textMain,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 18,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 136,
    gap: spacing.lg,
  },
  glassPanel: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  heroPanel: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  kicker: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.35)",
    backgroundColor: "rgba(218,255,164,0.36)",
  },
  kickerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.68)",
  },
  kickerText: {
    color: "#172506",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  thinkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: "rgba(2,8,5,0.58)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  thinkingBox: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.28)",
    backgroundColor: "rgba(6,18,12,0.88)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
  },
  thinkingTitle: {
    color: colors.textMain,
    fontSize: 21,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  thinkingText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  heroTitle: {
    color: colors.textMain,
    fontSize: 38,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: 0,
  },
  heroCopy: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 19,
    lineHeight: 30,
    fontWeight: "500",
  },
  featureGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  featureCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.10)",
    padding: spacing.md,
    justifyContent: "center",
    gap: spacing.xs,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(142,234,47,0.62)",
    marginBottom: spacing.sm,
  },
  featureTitle: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: "900",
  },
  featureBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  promisePanel: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  promiseTitle: {
    color: colors.textMain,
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "900",
  },
  accentText: {
    color: colors.primaryLight,
  },
  promiseCopy: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "500",
  },
  promiseRows: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  promiseRow: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  promiseRowText: {
    color: colors.textMain,
    fontSize: 17,
    fontWeight: "800",
  },
  formBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: "700",
  },
  genderSwitch: {
    flexDirection: "row",
    minHeight: 76,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(11,18,11,0.48)",
    overflow: "hidden",
  },
  genderSwitchCompact: {
    marginTop: spacing.lg,
    minHeight: 62,
  },
  genderOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  genderOptionActive: {
    backgroundColor: "rgba(182,255,63,0.86)",
  },
  genderText: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: "800",
  },
  genderTextActive: {
    color: "#1D2D08",
  },
  stepBody: {
    gap: spacing.lg,
  },
  screenTitle: {
    color: colors.textMain,
    fontSize: 52,
    lineHeight: 60,
    fontWeight: "900",
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "500",
    maxWidth: 520,
  },
  measureStack: {
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  numericCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  numericHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  numericIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.74)",
  },
  numericLabel: {
    color: colors.textMain,
    fontSize: 21,
    fontWeight: "900",
  },
  numericInputWrap: {
    minHeight: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    backgroundColor: "rgba(3,12,8,0.18)",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  numericInput: {
    flex: 1,
    color: colors.textMain,
    fontSize: 38,
    fontWeight: "900",
    paddingVertical: 8,
  },
  numericUnit: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: "600",
  },
  goalStack: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  appModeStack: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  appModeCard: {
    minHeight: 142,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.18)",
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  appModeCardActive: {
    borderColor: colors.primaryLight,
    backgroundColor: "rgba(182,255,63,0.82)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  appModeIcon: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(182,255,63,0.14)",
  },
  appModeIconActive: {
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  appModeTitle: {
    color: colors.textMain,
    fontSize: 23,
    fontWeight: "900",
  },
  appModeTitleActive: {
    color: "#172506",
  },
  appModeBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  appModeBodyActive: {
    color: "rgba(23,37,6,0.72)",
  },
  appModeRadio: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  appModeRadioActive: {
    borderColor: "rgba(23,37,6,0.42)",
  },
  goalCard: {
    minHeight: 118,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.18)",
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  goalCardActive: {
    backgroundColor: "rgba(182,255,63,0.82)",
    borderColor: "rgba(224,255,132,0.95)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  goalIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(142,234,47,0.22)",
  },
  goalIconActive: {
    backgroundColor: "rgba(182,255,63,0.86)",
  },
  goalText: {
    flex: 1,
    gap: spacing.xs,
  },
  goalTitle: {
    color: "#18230A",
    fontSize: 24,
    fontWeight: "900",
  },
  goalTitleMuted: {
    color: colors.textMain,
  },
  goalDesc: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    fontWeight: "600",
  },
  radio: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.70)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: "rgba(42,70,13,0.66)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  pickerPanel: {
    padding: spacing.md,
  },
  mascotPanel: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  mascotRow: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  mascotCard: {
    width: 150,
    minHeight: 204,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  mascotCardActive: {
    borderColor: colors.primaryLight,
    backgroundColor: "rgba(182,255,63,0.20)",
    shadowColor: colors.primaryLight,
    shadowOpacity: 0.36,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  mascotCheck: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
  },
  mascotName: {
    color: colors.textMain,
    fontSize: 21,
    fontWeight: "900",
  },
  mascotNameActive: {
    color: colors.primaryLight,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: "rgba(3,9,6,0.18)",
  },
  backButton: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(182,255,63,0.55)",
    backgroundColor: "rgba(5,18,12,0.58)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  backButtonText: {
    color: colors.primaryLight,
    fontSize: 20,
    fontWeight: "900",
  },
  nextButton: {
    flex: 1.25,
    minHeight: 68,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    color: "#142407",
    fontSize: 21,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.64,
  },
});
