import { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Button, SectionTitle } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Meal = {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string;
  created_at: string;
  meal_type?: string;
  archived?: boolean;
};

type ComplianceSnap = { date: string; target: number; consumed: number; compliance_pct: number; meals_count: number };
type HistoryDay = { date: string; compliance: ComplianceSnap; meals: Meal[]; purged?: boolean };

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  snack: "Collation",
  dinner: "Dîner",
};

const MEAL_TYPE_ORDER = ["breakfast", "lunch", "snack", "dinner"];

type Tab = "today" | "history";

export default function Meals() {
  const [tab, setTab] = useState<Tab>("today");
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Meal | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [list, hist] = await Promise.all([
        api<Meal[]>(`/meals?date=${today}`),
        api<{ days: HistoryDay[] }>(`/meals?history=true&include_archived=true`),
      ]);
      setTodayMeals(list);
      setHistory(hist.days.filter((d) => d.date !== today));
    } catch (e) {
      console.warn("load meals", e);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickImage = async (fromCamera: boolean) => {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Permission refusée. Autorise l'accès dans les réglages.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    await analyzeMeal(result.assets[0].base64);
  };

  const analyzeMeal = async (base64: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const meal = await api<Meal>("/meals/analyze", {
        method: "POST",
        body: { image_base64: base64, mime: "image/jpeg" },
      });
      setLastResult(meal);
      setShowResult(true);
      await load();
    } catch (e: any) {
      setError(e?.message || "Analyse échouée");
    } finally {
      setAnalyzing(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/meals/${id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  const purgeOld = async () => {
    setCleanupBusy(true);
    try {
      await api(`/meals/older-than/7`, { method: "DELETE" });
      await load();
    } finally {
      setCleanupBusy(false);
    }
  };

  const total = todayMeals.reduce((s, m) => s + m.calories, 0);

  // Group today by meal_type
  const todayGrouped = useMemo(() => {
    const out: Record<string, Meal[]> = {};
    todayMeals.forEach((m) => {
      const k = m.meal_type || "snack";
      out[k] = out[k] || [];
      out[k].push(m);
    });
    return out;
  }, [todayMeals]);

  // History sub-sections
  const historyBuckets = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const buckets: { label: string; days: HistoryDay[] }[] = [
      { label: "Hier", days: [] },
      { label: "Cette semaine", days: [] },
      { label: "Plus ancien (archivé)", days: [] },
    ];
    history.forEach((d) => {
      if (d.date === yStr) buckets[0].days.push(d);
      else if (d.date >= weekStr) buckets[1].days.push(d);
      else buckets[2].days.push(d);
    });
    return buckets.filter((b) => b.days.length > 0);
  }, [history]);

  const hasArchivable = historyBuckets.find((b) => b.label.startsWith("Plus ancien"))?.days.length || 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="meals-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Repas</Text>
        <Text style={styles.headerTitle}>{total.toLocaleString("fr-FR")} <Text style={styles.headerUnit}>{"kcal aujourd'hui"}</Text></Text>
      </View>

      {/* Sticky tab chips */}
      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("today")} style={[styles.tabChip, tab === "today" && styles.tabChipActive]} testID="meals-tab-today">
          <Text style={[styles.tabText, tab === "today" && styles.tabTextActive]}>{"Aujourd'hui"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("history")} style={[styles.tabChip, tab === "history" && styles.tabChipActive]} testID="meals-tab-history">
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Historique</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        showsVerticalScrollIndicator={false}
      >
        {tab === "today" ? (
          <>
            <View style={styles.actions}>
              <Button title={analyzing ? "Analyse..." : "Photo"} onPress={() => pickImage(true)} loading={analyzing} icon={<Ionicons name="camera-outline" size={18} color="#fff" />} testID="meals-camera-button" style={{ flex: 1 }} />
              <Button title="Galerie" onPress={() => pickImage(false)} variant="secondary" icon={<Ionicons name="images-outline" size={18} color={colors.primary} />} testID="meals-library-button" style={{ flex: 1 }} />
            </View>

            {error && (
              <View style={styles.errorBox} testID="meals-error">
                <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
                <Text style={[typography.small, { color: colors.alert, flex: 1 }]}>{error}</Text>
              </View>
            )}

            {todayMeals.length === 0 ? (
              <Card testID="meals-empty">
                <View style={{ alignItems: "center", padding: spacing.lg }}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="restaurant-outline" size={28} color={colors.primary} />
                  </View>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.md }]}>Aucun repas analysé</Text>
                  <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>Prends une photo de ton assiette pour démarrer.</Text>
                </View>
              </Card>
            ) : (
              MEAL_TYPE_ORDER.filter((t) => todayGrouped[t]?.length).map((t) => (
                <View key={t} style={{ gap: 8 }}>
                  <View style={styles.subHeader}>
                    <Text style={typography.caption}>{MEAL_TYPE_LABEL[t]}</Text>
                    <Text style={[typography.caption, { color: colors.primary, fontWeight: "700" }]}>
                      {todayGrouped[t].reduce((s, m) => s + m.calories, 0)} kcal
                    </Text>
                  </View>
                  {todayGrouped[t].map((m) => <MealCard key={m.id} meal={m} onDelete={() => remove(m.id)} />)}
                </View>
              ))
            )}
          </>
        ) : (
          <>
            {hasArchivable > 0 && (
              <View style={styles.archiveBanner} testID="archive-banner">
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[typography.body, { fontWeight: "700", color: colors.textMain }]}>
                    {hasArchivable} jour{hasArchivable > 1 ? "s" : ""} à archiver
                  </Text>
                  <Text style={[typography.small]}>
                    Repas + de 7 jours : tu peux les supprimer maintenant. Le % de respect est conservé.
                  </Text>
                </View>
                <TouchableOpacity onPress={purgeOld} disabled={cleanupBusy} style={styles.archiveBtn} testID="archive-purge">
                  {cleanupBusy ? <ActivityIndicator color={colors.primary} /> : (
                    <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Supprimer</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {historyBuckets.length === 0 ? (
              <Card>
                <Text style={[typography.body, { textAlign: "center" }]}>{"Aucun historique pour l'instant."}</Text>
              </Card>
            ) : (
              historyBuckets.map((bucket) => (
                <View key={bucket.label} style={{ gap: spacing.sm }} testID={`history-bucket-${bucket.label}`}>
                  <SectionTitle title={bucket.label} />
                  {bucket.days.map((d) => (
                    <HistoryDayCard key={d.date} day={d} onDeleteMeal={remove} />
                  ))}
                </View>
              ))
            )}

            <Text style={[typography.small, { textAlign: "center", marginTop: spacing.lg, color: colors.textMuted }]}>
              Politique : archivage auto à 7 jours, suppression auto à 14 jours.{"\n"}
              Le % de respect est conservé même après suppression.
            </Text>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <Modal visible={showResult} transparent animationType="slide" onRequestClose={() => setShowResult(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard} testID="meals-result-modal">
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lastResult?.name || "Repas analysé"}</Text>
            <Text style={[typography.small, { marginBottom: spacing.md }]}>
              {lastResult?.meal_type ? `${MEAL_TYPE_LABEL[lastResult.meal_type]} · ` : ""}{lastResult?.notes}
            </Text>
            <View style={styles.modalStats}>
              <ModalStat label="Calories" value={`${lastResult?.calories}`} unit="kcal" />
              <ModalStat label="Protéines" value={`${lastResult?.protein_g}`} unit="g" />
              <ModalStat label="Glucides" value={`${lastResult?.carbs_g}`} unit="g" />
              <ModalStat label="Lipides" value={`${lastResult?.fat_g}`} unit="g" />
            </View>
            <Button title="Ok, ajouté" onPress={() => setShowResult(false)} testID="meals-result-close" />
          </View>
        </View>
      </Modal>

      {analyzing && (
        <View style={styles.analyzingOverlay} pointerEvents="none">
          <View style={styles.analyzingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[typography.body, { marginTop: 8 }]}>{"L'IA analyse ton assiette..."}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function MealCard({ meal, onDelete }: { meal: Meal; onDelete: () => void }) {
  return (
    <Card style={{ marginBottom: 0 }} testID={`meal-card-${meal.id}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={localStyles.mealIcon}>
          <Ionicons name="leaf" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: "600" }]}>{meal.name}</Text>
          <Text style={[typography.small, { marginTop: 2 }]}>P {meal.protein_g}g · G {meal.carbs_g}g · L {meal.fat_g}g</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[typography.body, { fontWeight: "700" }]}>{meal.calories} <Text style={typography.small}>kcal</Text></Text>
          <TouchableOpacity onPress={onDelete} testID={`meal-delete-${meal.id}`} style={{ marginTop: 6 }}>
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}

function HistoryDayCard({ day, onDeleteMeal }: { day: HistoryDay; onDeleteMeal: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pct = day.compliance.compliance_pct || 0;
  const pctColor = pct >= 80 ? colors.primary : pct >= 50 ? "#F59E0B" : colors.alert;
  const labelDate = new Date(day.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return (
    <Card testID={`history-day-${day.date}`}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: "700", textTransform: "capitalize" }]}>{labelDate}</Text>
          <Text style={typography.small}>
            {day.compliance.consumed.toLocaleString("fr-FR")} / {day.compliance.target.toLocaleString("fr-FR")} kcal · {day.compliance.meals_count} repas
            {day.purged ? "  · supprimé" : ""}
          </Text>
        </View>
        <View style={[localStyles.pctBadge, { backgroundColor: pctColor + "20" }]}>
          <Text style={[typography.small, { color: pctColor, fontWeight: "800" }]}>{pct}%</Text>
        </View>
        {!day.purged && (
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} style={{ marginLeft: 8 }} />
        )}
      </TouchableOpacity>
      {expanded && !day.purged && day.meals.length > 0 && (
        <View style={{ marginTop: spacing.md, gap: 6 }}>
          {day.meals.map((m) => (
            <View key={m.id} style={localStyles.histMealRow} testID={`history-meal-${m.id}`}>
              <Text style={[typography.small, { color: colors.textSecondary, width: 70 }]}>
                {m.meal_type ? MEAL_TYPE_LABEL[m.meal_type] : ""}
              </Text>
              <Text style={[typography.body, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
              <Text style={[typography.small, { fontWeight: "700" }]}>{m.calories} kcal</Text>
              <TouchableOpacity onPress={() => onDeleteMeal(m.id)} style={{ marginLeft: 8 }} testID={`history-delete-${m.id}`}>
                <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function ModalStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.modalStat}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.h3, { marginTop: 2 }]}>{value}<Text style={typography.small}> {unit}</Text></Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  mealIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  histMealRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { fontSize: 32, fontWeight: "800", color: colors.textMain, letterSpacing: -1, marginTop: 4 },
  headerUnit: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  tabChipActive: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  tabTextActive: { color: colors.primary, fontWeight: "700" },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", padding: spacing.md, borderRadius: radius.md },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  subHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  archiveBanner: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.md, backgroundColor: "#FEF3C7", borderRadius: radius.md, borderWidth: 1, borderColor: "#FDE68A" },
  archiveBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 4, alignSelf: "center" },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  modalStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  modalStat: { flexBasis: "47%", backgroundColor: colors.primaryPale, padding: spacing.md, borderRadius: radius.md },
  analyzingOverlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)" },
  analyzingCard: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, alignItems: "center", borderWidth: 1, borderColor: colors.border },
});
