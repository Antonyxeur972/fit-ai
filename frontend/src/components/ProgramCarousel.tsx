import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, ImageBackground, Dimensions, Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "@/src/theme";
import { Button } from "@/src/components/UI";

const { width: SW } = Dimensions.get("window");
const CARD_W = Math.min(SW * 0.72, 280);
const CARD_H = CARD_W * 1.35;

type Split = "ppl" | "fullbody" | "split";
type Freq = 3 | 4 | 5;

const PROGRAMS = [
  {
    id: "masse",
    goal_label: "Masse",
    title: "Prise de Masse",
    emoji: "💪",
    accent: "#1A52A0",
    cardGrad: ["#0F2D5E", "#1D4ED8"] as const,
    imageUrl: "https://images.unsplash.com/photo-1581009137042-c552e485697a?w=420&q=80&fit=crop",
    tagline: "Construire du muscle",
    description:
      "La prise de masse est un cycle axé sur la construction musculaire maximale. On augmente le volume d'entraînement avec des séries de 8–15 répétitions et une progression régulière des charges.",
    benefits: [
      "Volume élevé : 4–5 séances par semaine",
      "Séries de 8–15 reps pour stimuler la croissance",
      "Progression régulière des charges chaque semaine",
      "Alimentation en léger surplus calorique recommandée",
    ],
    defaultSplit: "ppl" as Split,
    defaultFreq: 5 as Freq,
  },
  {
    id: "seche",
    goal_label: "Perte de gras",
    title: "Sèche",
    emoji: "🔥",
    accent: "#C2410C",
    cardGrad: ["#7C2D12", "#EA580C"] as const,
    imageUrl: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=420&q=80&fit=crop",
    tagline: "Révéler ta forme",
    description:
      "La sèche combine entraînement intense et cardio ciblé pour fondre la masse grasse tout en préservant le muscle. Idéal pour sculpter une silhouette définie et révéler les abdominaux.",
    benefits: [
      "Séances courtes et intenses (45–55 min)",
      "Supersets et circuits pour brûler plus de calories",
      "Cardio intégré 2× par semaine",
      "Préservation maximale du muscle acquis",
    ],
    defaultSplit: "fullbody" as Split,
    defaultFreq: 4 as Freq,
  },
  {
    id: "hypertrophie",
    goal_label: "Hypertrophie",
    title: "Hypertrophie",
    emoji: "⚡",
    accent: "#047857",
    cardGrad: ["#064E3B", "#059669"] as const,
    imageUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=420&q=80&fit=crop",
    tagline: "Développer chaque muscle",
    description:
      "L'hypertrophie cible la croissance musculaire contrôlée, groupe par groupe. On alterne charges lourdes et répétitions modérées pour forcer l'adaptation et développer une physique équilibrée.",
    benefits: [
      "Travail précis muscle par muscle (split PPL)",
      "Alternance de charges lourdes et modérées",
      "Idéal pour sculpter une physique équilibrée",
      "Progressions structurées semaine après semaine",
    ],
    defaultSplit: "ppl" as Split,
    defaultFreq: 5 as Freq,
  },
];

const FREQ_OPTIONS: { v: Freq; label: string; sub: string }[] = [
  { v: 3, label: "3 jours", sub: "Débutant / Récupération" },
  { v: 4, label: "4 jours", sub: "Intermédiaire" },
  { v: 5, label: "5 jours", sub: "Optimal / Avancé" },
];

const SPLIT_OPTIONS: { v: Split; label: string; sub: string }[] = [
  { v: "fullbody", label: "Full Body", sub: "Tout le corps à chaque séance" },
  { v: "ppl", label: "PPL", sub: "Push / Pull / Jambes" },
  { v: "split", label: "Split musculaire", sub: "Pecs, Dos, Jambes séparés" },
];

type Props = {
  onSelectProgram: (goalLabel: string, freq: Freq, split: Split) => void;
  loading?: boolean;
};

export function ProgramCarousel({ onSelectProgram, loading }: Props) {
  const [selected, setSelected] = useState<(typeof PROGRAMS)[number] | null>(null);
  const [step, setStep] = useState(0); // 0=detail, 1=freq, 2=split, 3=confirm
  const [freq, setFreq] = useState<Freq>(5);
  const [split, setSplit] = useState<Split>("ppl");

  const openProgram = (p: (typeof PROGRAMS)[number]) => {
    setSelected(p);
    setFreq(p.defaultFreq);
    setSplit(p.defaultSplit);
    setStep(0);
  };

  const close = () => setSelected(null);

  const confirm = () => {
    if (!selected) return;
    onSelectProgram(selected.goal_label, freq, split);
    setSelected(null);
  };

  return (
    <>
      <Text style={styles.header}>Choisir mon programme</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        snapToInterval={CARD_W + 14}
        decelerationRate="fast"
      >
        {PROGRAMS.map((p) => (
          <TouchableOpacity key={p.id} activeOpacity={0.88} onPress={() => openProgram(p)} style={styles.cardWrap}>
            <ImageBackground
              source={{ uri: p.imageUrl }}
              style={[styles.card, { width: CARD_W, height: CARD_H }]}
              imageStyle={styles.cardImage}
              resizeMode="cover"
            >
              <LinearGradient
                colors={[p.cardGrad[0] + "55", "transparent", p.cardGrad[1] + "CC"]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardBadge}>
                <Text style={styles.cardEmoji}>{p.emoji}</Text>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.cardTagline}>{p.tagline}</Text>
                <View style={[styles.cardCta, { backgroundColor: p.accent }]}>
                  <Text style={styles.cardCtaText}>Voir le programme</Text>
                  <Ionicons name="arrow-forward" size={13} color="#fff" />
                </View>
              </View>
            </ImageBackground>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.modalBg} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />

            {/* Steps */}
            {step === 0 && selected && (
              <>
                {/* Header image strip */}
                <ImageBackground
                  source={{ uri: selected.imageUrl }}
                  style={[styles.sheetHero, { height: 160 }]}
                  imageStyle={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
                  resizeMode="cover"
                >
                  <LinearGradient
                    colors={[selected.cardGrad[0] + "CC", selected.cardGrad[1] + "AA"]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.sheetHeroContent}>
                    <Text style={styles.sheetEmoji}>{selected.emoji}</Text>
                    <Text style={styles.sheetTitle}>{selected.title}</Text>
                    <Text style={styles.sheetTagline}>{selected.tagline}</Text>
                  </View>
                </ImageBackground>

                <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                  <Text style={styles.descText}>{selected.description}</Text>
                  <Text style={styles.benefitsTitle}>Points clés</Text>
                  {selected.benefits.map((b, i) => (
                    <View key={i} style={styles.benefitRow}>
                      <View style={[styles.benefitDot, { backgroundColor: selected.accent }]} />
                      <Text style={styles.benefitText}>{b}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.sheetFooter, { backgroundColor: selected.accent }]}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => setStep(1)} activeOpacity={0.85}>
                    <Text style={styles.footerBtnText}>Je fais ce programme</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {step === 1 && (
              <View style={styles.stepWrap}>
                <Text style={styles.stepTitle}>Combien de séances par semaine ?</Text>
                <View style={styles.optionCol}>
                  {FREQ_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.v}
                      style={[styles.optionRow, freq === o.v && styles.optionRowOn]}
                      onPress={() => setFreq(o.v)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionLabel, freq === o.v && styles.optionLabelOn]}>{o.label}</Text>
                        <Text style={styles.optionSub}>{o.sub}</Text>
                      </View>
                      {freq === o.v && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.navRow}>
                  <TouchableOpacity onPress={() => setStep(0)} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
                    <Text style={styles.backBtnText}>Retour</Text>
                  </TouchableOpacity>
                  <Button title="Suivant" onPress={() => setStep(2)} style={{ flex: 1 }} />
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.stepWrap}>
                <Text style={styles.stepTitle}>Comment organiser tes séances ?</Text>
                <View style={styles.optionCol}>
                  {SPLIT_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.v}
                      style={[styles.optionRow, split === o.v && styles.optionRowOn]}
                      onPress={() => setSplit(o.v)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionLabel, split === o.v && styles.optionLabelOn]}>{o.label}</Text>
                        <Text style={styles.optionSub}>{o.sub}</Text>
                      </View>
                      {split === o.v && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.navRow}>
                  <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
                    <Text style={styles.backBtnText}>Retour</Text>
                  </TouchableOpacity>
                  <Button title="Confirmer" onPress={() => setStep(3)} style={{ flex: 1 }} />
                </View>
              </View>
            )}

            {step === 3 && selected && (
              <View style={styles.stepWrap}>
                <View style={styles.confirmIcon}>
                  <Text style={{ fontSize: 48 }}>{selected.emoji}</Text>
                </View>
                <Text style={styles.confirmTitle}>Parfait !</Text>
                <Text style={styles.confirmBody}>
                  Programme <Text style={{ fontWeight: "800" }}>{selected.title}</Text> · {freq} séances/sem. ·{" "}
                  <Text style={{ fontWeight: "800" }}>
                    {SPLIT_OPTIONS.find((o) => o.v === split)?.label}
                  </Text>
                </Text>
                <View style={styles.confirmNote}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.confirmNoteText}>
                    Tu pourras toujours modifier chaque séance manuellement dans le menu Entraînement.
                  </Text>
                </View>
                <Button
                  title={loading ? "Création..." : "Lancer mon programme"}
                  onPress={confirm}
                  loading={loading}
                  icon={<Ionicons name="rocket" size={16} color="#fff" />}
                  style={{ marginTop: spacing.lg }}
                />
                <TouchableOpacity onPress={() => setStep(2)} style={[styles.backBtn, { justifyContent: "center", marginTop: spacing.sm }]}>
                  <Ionicons name="arrow-back" size={14} color={colors.textSecondary} />
                  <Text style={styles.backBtnText}>Modifier</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    ...typography.h2,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  scroll: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
    gap: 14,
  },
  cardWrap: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  cardImage: {
    borderRadius: 20,
  },
  cardBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 22 },
  cardBottom: { padding: 16, gap: 4 },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.3 },
  cardTagline: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  cardCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  cardCtaText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    maxHeight: "88%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginTop: 10, marginBottom: 4,
  },
  sheetHero: {
    overflow: "hidden",
  },
  sheetHeroContent: {
    position: "absolute",
    bottom: 16, left: 20,
  },
  sheetEmoji: { fontSize: 30, marginBottom: 4 },
  sheetTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  sheetTagline: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600", marginTop: 2 },

  descText: {
    ...typography.body,
    lineHeight: 22,
    color: colors.textMain,
  },
  benefitsTitle: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  benefitRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  benefitDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  benefitText: { fontSize: 14, color: colors.textMain, flex: 1, lineHeight: 20 },

  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 32,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  footerBtnText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  // Questionnaire steps
  stepWrap: {
    padding: spacing.lg,
    paddingBottom: 36,
    gap: spacing.md,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textMain,
    letterSpacing: -0.3,
  },
  optionCol: { gap: 10 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionRowOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "12",
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textMain,
  },
  optionLabelOn: { color: colors.primary },
  optionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  backBtnText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },

  // Confirm step
  confirmIcon: { alignItems: "center", marginTop: spacing.sm },
  confirmTitle: { fontSize: 26, fontWeight: "900", color: colors.textMain, textAlign: "center" },
  confirmBody: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  confirmNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.primary + "10",
    borderRadius: 12,
    padding: 12,
  },
  confirmNoteText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
    lineHeight: 18,
  },
});
