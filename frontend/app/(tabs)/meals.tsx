import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, RefreshControl, TextInput,
} from "react-native";
import { ScreenBackground } from "@/src/components/ScreenBackground";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
  source?: string;
};

type Food = {
  id: string;
  name: string;
  category: string;
  unit: string;
  default_qty: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type Favorite = {
  id: string;
  food_id: string;
  quantity: number;
  label?: string;
  food: Food;
  macros_preview: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };
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

function autoMealTypeFromHour(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 15 && h < 19) return "snack";
  return "dinner";
}

type Tab = "today" | "history" | "calendar";

type AiSuggestion = {
  id: string;
  name: string;
  category: string;
  unit: string;
  default_qty: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion_label?: string;
  source: "ai";
};

type RecentFood = {
  name: string;
  count: number;
  source: "manual" | "ai";
  food_id?: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ai_snapshot?: {
    name: string;
    category?: string;
    unit: string;
    kcal_per_unit: number;
    protein_g_per_unit: number;
    carbs_g_per_unit: number;
    fat_g_per_unit: number;
  };
};

type Recipe = {
  id: string;
  name: string;
  ingredients_used: string[];
  instructions_brief: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion_label: string;
  prep_min: number;
  category: string;
};

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

  // Manual food entry state
  const [foods, setFoods] = useState<Food[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [manualCategory, setManualCategory] = useState<string>("Tout");
  const [selectedFood, setSelectedFood] = useState<Food | AiSuggestion | null>(null);
  const [isSelectedAi, setIsSelectedAi] = useState(false);
  const [manualQty, setManualQty] = useState("");
  const [manualMealType, setManualMealType] = useState<string>("snack");
  const [savingManual, setSavingManual] = useState(false);
  const [manualDate, setManualDate] = useState<string>(""); // empty = today
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);

  // Recipes state
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [ingredientInput, setIngredientInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipeGoal, setRecipeGoal] = useState<"cutting" | "bulking" | "maintenance">("maintenance");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // Duplicate state
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicatePayload, setDuplicatePayload] = useState<{ kind: "meal" | "day"; mealId?: string; sourceDate?: string; label?: string } | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState<string>("");
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  // Calendar tab state
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [calDays, setCalDays] = useState<Record<string, number>>({}); // date -> meals count
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedDayMeals, setSelectedDayMeals] = useState<Meal[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

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

  const loadFoods = useCallback(async () => {
    try {
      const [resp, favs, recent] = await Promise.all([
        api<{ foods: Food[] }>("/foods/library"),
        api<Favorite[]>("/favorites").catch(() => [] as Favorite[]),
        api<{ items: RecentFood[] }>("/foods/recent").catch(() => ({ items: [] as RecentFood[] })),
      ]);
      setFoods(resp.foods || []);
      setFavorites(favs || []);
      setRecentFoods(recent.items || []);
    } catch (e) {
      console.warn("loadFoods", e);
    }
  }, []);

  const saveFavorite = async () => {
    if (!selectedFood) return;
    const qty = parseFloat(manualQty || "0");
    if (!qty || qty <= 0) return;
    try {
      await api("/favorites", {
        method: "POST",
        body: { food_id: selectedFood.id, quantity: qty },
      });
      const favs = await api<Favorite[]>("/favorites").catch(() => [] as Favorite[]);
      setFavorites(favs);
    } catch (e) {
      console.warn("saveFavorite", e);
    }
  };

  const removeFavorite = async (favId: string) => {
    try {
      await api(`/favorites/${favId}`, { method: "DELETE" });
      setFavorites((prev) => prev.filter((f) => f.id !== favId));
    } catch {}
  };

  const quickAddFavorite = async (fav: Favorite) => {
    setSavingManual(true);
    try {
      await api("/meals/manual", {
        method: "POST",
        body: {
          food_id: fav.food_id,
          quantity: fav.quantity,
          meal_type: autoMealTypeFromHour(),
          date: manualDate || undefined,
        },
      });
      setManualOpen(false);
      await load();
    } finally {
      setSavingManual(false);
    }
  };

  const dateChips = useMemo(() => {
    const out: { value: string; label: string }[] = [{ value: "", label: "Aujourd'hui" }];
    for (let i = 1; i <= 13; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = i === 1
        ? "Hier"
        : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      out.push({ value: iso, label });
    }
    return out;
  }, []);

  // Debounce search input (~300ms) — used for filtering food list AND AI search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(manualSearch), 300);
    return () => clearTimeout(t);
  }, [manualSearch]);

  // Debounced AI food search when query has no good local match
  useEffect(() => {
    if (!manualOpen || selectedFood) {
      setAiSuggestions([]);
      return;
    }
    const q = debouncedSearch.trim();
    if (q.length < 3) {
      setAiSuggestions([]);
      return;
    }
    let cancelled = false;
    setAiLoading(true);
    (async () => {
      try {
        const resp = await api<{ suggestions: AiSuggestion[] }>("/foods/ai-search", {
          method: "POST",
          body: { query: q },
        });
        if (!cancelled) setAiSuggestions(resp.suggestions || []);
      } catch {
        if (!cancelled) setAiSuggestions([]);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, manualOpen, selectedFood]);

  const addRecent = async (r: RecentFood) => {
    setSavingManual(true);
    try {
      if (r.source === "manual" && r.food_id) {
        await api("/meals/manual", {
          method: "POST",
          body: {
            food_id: r.food_id,
            quantity: r.quantity,
            meal_type: manualMealType || autoMealTypeFromHour(),
            date: manualDate || undefined,
          },
        });
      } else if (r.ai_snapshot) {
        await api("/meals/manual_ai", {
          method: "POST",
          body: {
            name: r.ai_snapshot.name,
            category: r.ai_snapshot.category,
            quantity: r.quantity,
            unit: r.ai_snapshot.unit,
            kcal_per_unit: r.ai_snapshot.kcal_per_unit,
            protein_g_per_unit: r.ai_snapshot.protein_g_per_unit,
            carbs_g_per_unit: r.ai_snapshot.carbs_g_per_unit,
            fat_g_per_unit: r.ai_snapshot.fat_g_per_unit,
            meal_type: manualMealType || autoMealTypeFromHour(),
            date: manualDate || undefined,
          },
        });
      }
      setManualOpen(false);
      await load();
    } finally {
      setSavingManual(false);
    }
  };

  // Calendar tab: load month days with meals
  const loadCalendarMonth = useCallback(async (anchor: Date) => {
    const month = anchor.getMonth();
    const year = anchor.getFullYear();
    const todayISO = new Date().toISOString().slice(0, 10);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const out: Record<string, number> = {};
    // Walk from start to min(end, today)
    const last = end.getTime() < new Date(todayISO).getTime() ? end : new Date(todayISO);
    const promises: Promise<void>[] = [];
    for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      // 14-day window: only fetch days within last 14 days
      const diffDays = Math.floor((new Date(todayISO).getTime() - new Date(iso).getTime()) / 86400000);
      if (diffDays > 14) continue;
      promises.push(
        api<Meal[]>(`/meals?date=${iso}&include_archived=true`)
          .then((list) => { out[iso] = list.length; })
          .catch(() => {})
      );
    }
    await Promise.all(promises);
    setCalDays(out);
  }, []);

  useEffect(() => {
    if (tab === "calendar") {
      loadCalendarMonth(calMonth);
    }
  }, [tab, calMonth, loadCalendarMonth]);

  const openDay = async (iso: string) => {
    setSelectedDay(iso);
    setLoadingDay(true);
    try {
      const list = await api<Meal[]>(`/meals?date=${iso}&include_archived=true`);
      setSelectedDayMeals(list);
    } finally {
      setLoadingDay(false);
    }
  };

  const removeFromDay = async (id: string) => {
    try {
      await api(`/meals/${id}`, { method: "DELETE" });
      if (selectedDay) await openDay(selectedDay);
      if (selectedDay) loadCalendarMonth(calMonth);
    } catch {}
  };

  // --- Duplicate helpers ---
  const openDuplicateMeal = (mealId: string, label: string) => {
    setDuplicatePayload({ kind: "meal", mealId, label });
    setDuplicateTargetDate("");
    setDuplicateOpen(true);
  };
  const openDuplicateDay = (sourceDate: string, label: string) => {
    setDuplicatePayload({ kind: "day", sourceDate, label });
    setDuplicateTargetDate("");
    setDuplicateOpen(true);
  };
  const confirmDuplicate = async () => {
    if (!duplicatePayload) return;
    setDuplicateBusy(true);
    try {
      if (duplicatePayload.kind === "meal" && duplicatePayload.mealId) {
        await api(`/meals/${duplicatePayload.mealId}/duplicate`, {
          method: "POST",
          body: { target_date: duplicateTargetDate || new Date().toISOString().slice(0, 10) },
        });
      } else if (duplicatePayload.kind === "day" && duplicatePayload.sourceDate) {
        await api(`/meals/duplicate-day`, {
          method: "POST",
          body: {
            source_date: duplicatePayload.sourceDate,
            target_date: duplicateTargetDate || new Date().toISOString().slice(0, 10),
          },
        });
      }
      setDuplicateOpen(false);
      setDuplicatePayload(null);
      await load();
      if (tab === "calendar") loadCalendarMonth(calMonth);
    } catch (e: any) {
      setError(e?.message || "Erreur lors de la duplication");
    } finally {
      setDuplicateBusy(false);
    }
  };

  // --- Recipes helpers ---
  const addIngredient = () => {
    const v = ingredientInput.trim();
    if (!v) return;
    if (ingredients.includes(v.toLowerCase())) {
      setIngredientInput("");
      return;
    }
    setIngredients((prev) => [...prev, v.toLowerCase()]);
    setIngredientInput("");
  };
  const removeIngredient = (i: string) => {
    setIngredients((prev) => prev.filter((x) => x !== i));
  };
  const loadRecipes = async () => {
    if (ingredients.length === 0) return;
    setRecipesLoading(true);
    setRecipes([]);
    try {
      const resp = await api<{ recipes: Recipe[] }>("/recipes/from-ingredients", {
        method: "POST",
        body: { ingredients, goal: recipeGoal },
      });
      setRecipes(resp.recipes || []);
    } catch {
      setRecipes([]);
    } finally {
      setRecipesLoading(false);
    }
  };
  const addRecipeToJournal = async (r: Recipe) => {
    try {
      await api("/meals/manual_ai", {
        method: "POST",
        body: {
          name: r.name,
          category: r.category || "Plats préparés",
          quantity: 1,
          unit: "unit",
          kcal_per_unit: r.kcal,
          protein_g_per_unit: r.protein_g,
          carbs_g_per_unit: r.carbs_g,
          fat_g_per_unit: r.fat_g,
          meal_type: autoMealTypeFromHour(),
        },
      });
      await load();
      setRecipesOpen(false);
    } catch (e: any) {
      setError(e?.message || "Erreur ajout recette");
    }
  };

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

  const openManual = async (forDate?: string) => {
    setSelectedFood(null);
    setIsSelectedAi(false);
    setManualQty("");
    setManualSearch("");
    setDebouncedSearch("");
    setManualCategory("Tout");
    setManualMealType(autoMealTypeFromHour());
    setManualDate(forDate || "");
    setAiSuggestions([]);
    setManualOpen(true);
    await loadFoods();
  };

  const saveManual = async () => {
    if (!selectedFood) return;
    const qty = parseFloat(manualQty || "0");
    if (!qty || qty <= 0) return;
    setSavingManual(true);
    try {
      if (isSelectedAi) {
        const ai = selectedFood as AiSuggestion;
        await api("/meals/manual_ai", {
          method: "POST",
          body: {
            name: ai.name,
            category: ai.category,
            quantity: qty,
            unit: ai.unit,
            kcal_per_unit: ai.kcal,
            protein_g_per_unit: ai.protein_g,
            carbs_g_per_unit: ai.carbs_g,
            fat_g_per_unit: ai.fat_g,
            meal_type: manualMealType,
            date: manualDate || undefined,
          },
        });
      } else {
        await api("/meals/manual", {
          method: "POST",
          body: {
            food_id: selectedFood.id,
            quantity: qty,
            meal_type: manualMealType,
            date: manualDate || undefined,
          },
        });
      }
      setManualOpen(false);
      await load();
    } finally {
      setSavingManual(false);
    }
  };

  const previewMacros = useMemo(() => {
    if (!selectedFood) return null;
    const qty = parseFloat(manualQty || "0");
    if (!qty || qty <= 0) return null;
    const ratio = selectedFood.unit === "g" || selectedFood.unit === "ml" ? qty / 100 : qty;
    return {
      kcal: Math.round(selectedFood.kcal * ratio),
      p: Math.round(selectedFood.protein_g * ratio * 10) / 10,
      c: Math.round(selectedFood.carbs_g * ratio * 10) / 10,
      f: Math.round(selectedFood.fat_g * ratio * 10) / 10,
    };
  }, [selectedFood, manualQty]);

  const foodCategories = useMemo(() => {
    const set = new Set(foods.map((f) => f.category));
    return ["Tout", ...Array.from(set)];
  }, [foods]);

  const filteredFoods = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return foods.filter((f) => {
      if (manualCategory !== "Tout" && f.category !== manualCategory) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [foods, debouncedSearch, manualCategory]);

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
    <ScreenBackground bg="meals">
      <View style={styles.header}>
        <Text style={typography.caption}>Repas</Text>
        <Text style={styles.headerTitle}>{total.toLocaleString("fr-FR")} <Text style={styles.headerUnit}>{"kcal aujourd'hui"}</Text></Text>
      </View>

      {/* Sticky tab chips */}
      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("today")} style={[styles.tabChip, tab === "today" && styles.tabChipActive]} testID="meals-tab-today">
          <Text style={[styles.tabText, tab === "today" && styles.tabTextActive]}>{"Aujourd'hui"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("calendar")} style={[styles.tabChip, tab === "calendar" && styles.tabChipActive]} testID="meals-tab-calendar">
          <Text style={[styles.tabText, tab === "calendar" && styles.tabTextActive]}>Calendrier</Text>
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
        {tab === "today" && (
          <>
            <View style={styles.actions}>
              <Button title={analyzing ? "Analyse..." : "Photo"} onPress={() => pickImage(true)} loading={analyzing} icon={<Ionicons name="camera-outline" size={18} color="#fff" />} testID="meals-camera-button" style={{ flex: 1 }} />
              <Button title="Galerie" onPress={() => pickImage(false)} variant="secondary" icon={<Ionicons name="images-outline" size={18} color={colors.primary} />} testID="meals-library-button" style={{ flex: 1 }} />
            </View>
            <Button
              title="Ajout manuel (aliment)"
              onPress={() => openManual()}
              variant="ghost"
              icon={<Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
              testID="meals-manual-button"
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Recettes IA"
                onPress={() => setRecipesOpen(true)}
                variant="ghost"
                icon={<Ionicons name="sparkles-outline" size={16} color={colors.primary} />}
                testID="meals-recipes-button"
                style={{ flex: 1 }}
              />
              <TouchableOpacity
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  openManual(y.toISOString().slice(0, 10));
                }}
                style={[styles.pastBtn, { flex: 1 }]}
                testID="meals-past-button"
              >
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={[typography.small, { color: colors.textSecondary, fontWeight: "600" }]}>
                  Jour passé
                </Text>
              </TouchableOpacity>
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
                  {todayGrouped[t].map((m) => <MealCard key={m.id} meal={m} onDelete={() => remove(m.id)} onDuplicate={() => openDuplicateMeal(m.id, m.name)} />)}
                </View>
              ))
            )}
          </>
        )}

        {tab === "history" && (
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
                    <HistoryDayCard
                      key={d.date}
                      day={d}
                      onDeleteMeal={remove}
                      onDuplicateDay={d.meals && d.meals.length > 0 ? () => openDuplicateDay(d.date, `${d.compliance.meals_count} repas du ${new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`) : undefined}
                    />
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

        {tab === "calendar" && (
          <>
            <CalendarMonthView
              monthDate={calMonth}
              calDays={calDays}
              onPrev={() => setCalMonth(addMonths(calMonth, -1))}
              onNext={() => {
                const next = addMonths(calMonth, 1);
                if (next <= new Date()) setCalMonth(next);
              }}
              onDayPress={(iso) => openDay(iso)}
              selectedDay={selectedDay}
            />
            <Text style={[typography.small, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }]}>
              Accès rétroactif sur 14 jours · tape un jour pour voir ses repas.
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, marginTop: spacing.sm }}>
              <LegendDot color={colors.primary} label="Repas loggés" />
              <LegendDot color={colors.border} label="Aucun" />
            </View>
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

      {/* Day detail modal (calendar tap) */}
      <Modal visible={selectedDay !== null} transparent animationType="slide" onRequestClose={() => setSelectedDay(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]} testID="day-detail-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedDay
                    ? new Date(selectedDay).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
                    : ""}
                </Text>
                <Text style={[typography.small, { textTransform: "capitalize" }]}>
                  {selectedDayMeals.length} repas · {selectedDayMeals.reduce((s, m) => s + (m.calories || 0), 0)} kcal
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDay(null)} testID="day-detail-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingDay ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : selectedDayMeals.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                <Ionicons name="restaurant-outline" size={32} color={colors.textMuted} />
                <Text style={[typography.small, { marginTop: 8, color: colors.textMuted }]}>Aucun repas pour ce jour.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {selectedDayMeals.map((m) => (
                  <View key={m.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.body, { fontWeight: "700" }]}>{m.name}</Text>
                      <Text style={typography.small}>
                        {m.meal_type ? `${MEAL_TYPE_LABEL[m.meal_type]} · ` : ""}{m.calories} kcal · P {m.protein_g}g · G {m.carbs_g}g · L {m.fat_g}g
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFromDay(m.id)} testID={`day-meal-delete-${m.id}`} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={18} color={colors.alert} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="Ajouter un aliment"
                variant="ghost"
                icon={<Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
                onPress={() => {
                  if (selectedDay) {
                    setSelectedDay(null);
                    openManual(selectedDay);
                  }
                }}
                testID="day-detail-add"
                style={{ flex: 1 }}
              />
              {selectedDayMeals.length > 0 && (
                <Button
                  title="Dupliquer ce jour"
                  variant="ghost"
                  icon={<Ionicons name="copy-outline" size={16} color={colors.primary} />}
                  onPress={() => {
                    if (selectedDay) {
                      const label = `${selectedDayMeals.length} repas du ${new Date(selectedDay).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
                      setSelectedDay(null);
                      openDuplicateDay(selectedDay, label);
                    }
                  }}
                  testID="day-detail-duplicate"
                  style={{ flex: 1 }}
                />
              )}
            </View>
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

      {/* Manual food entry modal */}
      {/* Recipes modal */}
      <Modal visible={recipesOpen} transparent animationType="slide" onRequestClose={() => setRecipesOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "92%" }]} testID="recipes-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Recettes du frigo</Text>
                <Text style={[typography.small, { color: colors.textMuted }]}>L&apos;IA propose des recettes selon tes ingrédients.</Text>
              </View>
              <TouchableOpacity onPress={() => setRecipesOpen(false)} testID="recipes-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Objectif</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {([
                { v: "cutting" as const, label: "Sèche" },
                { v: "maintenance" as const, label: "Maintien" },
                { v: "bulking" as const, label: "Prise muscle" },
              ]).map((g) => (
                <TouchableOpacity
                  key={g.v}
                  onPress={() => setRecipeGoal(g.v)}
                  style={[styles.mealTypeChip, recipeGoal === g.v && styles.mealTypeChipOn]}
                  testID={`recipe-goal-${g.v}`}
                >
                  <Text style={[typography.small, { fontWeight: "700", color: recipeGoal === g.v ? colors.primary : colors.textSecondary }]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[typography.caption, { marginTop: spacing.md }]}>Ingrédients disponibles</Text>
            <View style={[styles.searchBox, { marginTop: 4 }]}>
              <Ionicons name="add" size={16} color={colors.textSecondary} />
              <TextInput
                value={ingredientInput}
                onChangeText={setIngredientInput}
                onSubmitEditing={addIngredient}
                placeholder="ex: poulet, riz, brocoli..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                style={{ flex: 1, fontSize: 15, color: colors.textMain }}
                testID="ingredient-input"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {ingredientInput.length > 0 && (
                <TouchableOpacity onPress={addIngredient} testID="ingredient-add">
                  <Ionicons name="arrow-forward-circle" size={22} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {ingredients.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {ingredients.map((i) => (
                  <View key={i} style={localStyles.ingredientChip}>
                    <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>{i}</Text>
                    <TouchableOpacity onPress={() => removeIngredient(i)} testID={`ingredient-rm-${i}`}>
                      <Ionicons name="close" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Button
              title={recipesLoading ? "L'IA cuisine..." : "Proposer des recettes"}
              onPress={loadRecipes}
              loading={recipesLoading}
              disabled={ingredients.length === 0 || recipesLoading}
              icon={<Ionicons name="sparkles" size={16} color="#fff" />}
              style={{ marginTop: spacing.md }}
              testID="recipes-generate"
            />

            <ScrollView style={{ marginTop: spacing.md, maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {recipes.length === 0 ? (
                <Text style={[typography.small, { textAlign: "center", color: colors.textMuted, paddingVertical: spacing.md }]}>
                  {recipesLoading ? "Recherche en cours..." : "Ajoute des ingrédients puis lance la recherche."}
                </Text>
              ) : (
                recipes.map((r) => (
                  <View key={r.id} style={localStyles.recipeCard} testID={`recipe-${r.id}`}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.body, { fontWeight: "700" }]}>{r.name}</Text>
                        <Text style={[typography.small, { marginTop: 2, color: colors.textMuted }]}>
                          {r.prep_min}min · {r.portion_label}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[typography.h3, { color: colors.primary }]}>{r.kcal}<Text style={typography.small}> kcal</Text></Text>
                      </View>
                    </View>
                    <Text style={[typography.small, { marginTop: 4 }]}>
                      P {r.protein_g}g · G {r.carbs_g}g · L {r.fat_g}g
                    </Text>
                    <Text style={[typography.small, { marginTop: 6, color: colors.textSecondary, lineHeight: 18 }]}>
                      {r.instructions_brief}
                    </Text>
                    {r.ingredients_used.length > 0 && (
                      <Text style={[typography.small, { marginTop: 4, fontSize: 11, color: colors.textMuted }]}>
                        Ingrédients : {r.ingredients_used.join(", ")}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => addRecipeToJournal(r)}
                      style={localStyles.recipeAddBtn}
                      testID={`recipe-add-${r.id}`}
                    >
                      <Ionicons name="add-circle" size={16} color={colors.primary} />
                      <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>Ajouter au journal</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Duplicate modal */}
      <Modal visible={duplicateOpen} transparent animationType="fade" onRequestClose={() => setDuplicateOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "70%" }]} testID="duplicate-modal">
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {duplicatePayload?.kind === "day" ? "Dupliquer la journée" : "Dupliquer le repas"}
                </Text>
                <Text style={[typography.small, { color: colors.textMuted }]} numberOfLines={1}>
                  {duplicatePayload?.label || ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDuplicateOpen(false)} testID="duplicate-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[typography.caption, { marginTop: spacing.md, marginBottom: 6 }]}>Coller sur</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -spacing.lg }}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
              testID="duplicate-date-chips"
            >
              {dateChips.map((d) => {
                const value = d.value || new Date().toISOString().slice(0, 10);
                const isOn = duplicateTargetDate === value || (!duplicateTargetDate && d.value === "");
                const isToday = d.value === "";
                const parts = d.label.split(" ");
                const dayLabel = isToday ? "Auj." : (parts[0] || d.label);
                const numLabel = isToday ? new Date().getDate().toString() : (parts[1] || "");
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setDuplicateTargetDate(value)}
                    style={[styles.dateChip, isOn && styles.dateChipOn]}
                    testID={`duplicate-date-${value}`}
                  >
                    <Text style={[styles.dateChipDay, isOn && styles.dateChipDayOn]}>{dayLabel}</Text>
                    <Text style={[styles.dateChipNum, isOn && styles.dateChipNumOn]}>{numLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Button
              title="Coller"
              onPress={confirmDuplicate}
              loading={duplicateBusy}
              icon={<Ionicons name="copy" size={16} color="#fff" />}
              style={{ marginTop: spacing.lg }}
              testID="duplicate-confirm"
            />
          </View>
        </View>
      </Modal>

      <Modal visible={manualOpen} transparent animationType="slide" onRequestClose={() => setManualOpen(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "92%", paddingBottom: 0 }]}>
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.modalTitle}>
                {manualDate && manualDate !== today ? `Ajout pour ${new Date(manualDate).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}` : "Ajouter un aliment"}
              </Text>
              <TouchableOpacity onPress={() => setManualOpen(false)} testID="manual-close">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!selectedFood ? (
              <>
                {/* Date selector — 14 days (today + 13 past) */}
                <Text style={[typography.caption, { marginTop: spacing.sm, marginBottom: 6 }]}>
                  Date du repas
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -spacing.lg }}
                  contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
                  testID="manual-date-chips"
                >
                  {dateChips.map((d) => {
                    const isOn = (manualDate || "") === d.value;
                    const isToday = d.value === "";
                    const parts = d.label.split(" ");
                    const dayLabel = isToday ? "Auj." : (parts[0] || d.label);
                    const numLabel = isToday ? new Date().getDate().toString() : (parts[1] || "");
                    return (
                      <TouchableOpacity
                        key={d.value || "today"}
                        onPress={() => setManualDate(d.value)}
                        style={[styles.dateChip, isOn && styles.dateChipOn]}
                        testID={`manual-date-${d.value || "today"}`}
                      >
                        <Text style={[styles.dateChipDay, isOn && styles.dateChipDayOn]}>
                          {dayLabel}
                        </Text>
                        <Text style={[styles.dateChipNum, isOn && styles.dateChipNumOn]}>
                          {numLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Favorites row */}
                {favorites.length > 0 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={[typography.caption, { marginBottom: 6 }]}>Mes favoris</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -spacing.lg }}
                      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
                    >
                      {favorites.map((fav) => (
                        <View key={fav.id} style={styles.favChip} testID={`fav-${fav.id}`}>
                          <TouchableOpacity onPress={() => quickAddFavorite(fav)} style={{ paddingRight: 6 }}>
                            <Text style={[typography.small, { fontWeight: "700", color: colors.primary }]} numberOfLines={1}>
                              {fav.label || fav.food.name}
                            </Text>
                            <Text style={[typography.small, { color: colors.textMuted, fontSize: 10 }]}>
                              {fav.quantity} {fav.food.unit} · {fav.macros_preview.calories} kcal
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeFavorite(fav.id)}>
                            <Ionicons name="close" size={14} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Search */}
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={colors.textSecondary} />
                  <TextInput
                    value={manualSearch}
                    onChangeText={setManualSearch}
                    placeholder="Rechercher (whey, riz, banane...)"
                    placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, fontSize: 15, color: colors.textMain }}
                    testID="manual-search-input"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {aiLoading && manualSearch.trim().length >= 3 && (
                    <ActivityIndicator size="small" color={colors.primary} testID="search-ai-loader" />
                  )}
                  {manualSearch.length > 0 && !aiLoading && (
                    <TouchableOpacity onPress={() => setManualSearch("")} testID="search-clear">
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Categories chip row (horizontal) */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -spacing.lg, marginTop: spacing.sm }}
                  contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
                  testID="manual-cat-chips"
                >
                  {foodCategories.map((c) => {
                    const isOn = c === manualCategory;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setManualCategory(c)}
                        style={[styles.catChip, isOn && styles.catChipOn]}
                        testID={`manual-cat-${c}`}
                      >
                        <Text style={[styles.catChipText, isOn && { color: colors.primary, fontWeight: "700" }]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Recent foods row */}
                {recentFoods.length > 0 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={[typography.caption, { marginBottom: 6 }]}>Mes aliments récents</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -spacing.lg }}
                      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}
                      testID="recent-foods-row"
                    >
                      {recentFoods.map((r, idx) => (
                        <TouchableOpacity
                          key={`${r.name}-${idx}`}
                          onPress={() => addRecent(r)}
                          style={styles.recentChip}
                          testID={`recent-${idx}`}
                        >
                          <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                          <View style={{ maxWidth: 140 }}>
                            <Text style={[typography.small, { fontWeight: "700", color: colors.textMain }]} numberOfLines={1}>
                              {r.name}
                            </Text>
                            <Text style={[typography.small, { fontSize: 10, color: colors.textMuted }]}>
                              {r.quantity} {r.unit} · {r.calories} kcal
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Food list — reserved height to prevent layout shifts */}
                <ScrollView
                  style={{ marginTop: spacing.sm, minHeight: 320, maxHeight: 420 }}
                  contentContainerStyle={{ paddingBottom: spacing.xxl }}
                  keyboardShouldPersistTaps="handled"
                  testID="food-results-scroll"
                >
                  {filteredFoods.length === 0 ? (
                    <View style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: "center" }}>
                      <Text style={[typography.small, { textAlign: "center" }]}>Aucun résultat dans la base.</Text>
                      {manualSearch.trim().length >= 3 && (
                        <Text style={[typography.small, { textAlign: "center", color: colors.textMuted, marginTop: 4, fontSize: 11 }]}>
                          {aiLoading ? "L'IA cherche..." : "Tape entrée ou regarde les suggestions IA ci-dessous"}
                        </Text>
                      )}
                    </View>
                  ) : (
                    filteredFoods.map((f) => {
                      const isUnitWeight = f.unit === "g" || f.unit === "ml";
                      const ratio = isUnitWeight ? f.default_qty / 100 : f.default_qty;
                      const estKcal = Math.round(f.kcal * ratio);
                      return (
                        <TouchableOpacity
                          key={f.id}
                          onPress={() => { setSelectedFood(f); setIsSelectedAi(false); setManualQty(String(f.default_qty)); }}
                          style={styles.foodRow}
                          testID={`food-${f.id}`}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[typography.body, { fontWeight: "600" }]}>{f.name}</Text>
                            <Text style={[typography.small, { color: colors.primary, fontWeight: "700", marginTop: 2 }]}>
                              ≈ {estKcal} kcal{" "}
                              <Text style={{ color: colors.textMuted, fontWeight: "500" }}>
                                pour {f.default_qty} {f.unit}
                              </Text>
                            </Text>
                            <Text style={[typography.small, { marginTop: 2, color: colors.textMuted, fontSize: 11 }]}>
                              {isUnitWeight ? `${f.kcal} kcal/100${f.unit}` : `${f.kcal} kcal/${f.unit}`} · P {f.protein_g}g · G {f.carbs_g}g · L {f.fat_g}g
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })
                  )}

                  {/* AI Suggestions */}
                  {(aiLoading || aiSuggestions.length > 0) && manualSearch.trim().length >= 3 && (
                    <View style={styles.aiSection} testID="ai-suggestions-section">
                      <View style={styles.aiHeaderRow}>
                        <Ionicons name="sparkles" size={14} color={colors.primary} />
                        <Text style={[typography.caption, { color: colors.primary, fontWeight: "700" }]}>
                          Suggestions IA
                        </Text>
                        {aiLoading && <ActivityIndicator size="small" color={colors.primary} />}
                      </View>
                      {aiSuggestions.map((s) => {
                        const isUnitWeight = s.unit === "g" || s.unit === "ml";
                        const ratio = isUnitWeight ? s.default_qty / 100 : s.default_qty;
                        const estKcal = Math.round(s.kcal * ratio);
                        return (
                          <TouchableOpacity
                            key={s.id}
                            onPress={() => { setSelectedFood(s); setIsSelectedAi(true); setManualQty(String(s.default_qty)); }}
                            style={[styles.foodRow, styles.aiFoodRow]}
                            testID={`ai-food-${s.id}`}
                          >
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Text style={[typography.body, { fontWeight: "600" }]} numberOfLines={1}>{s.name}</Text>
                                <View style={styles.aiBadgeMini}>
                                  <Text style={[typography.small, { fontSize: 9, color: colors.primary, fontWeight: "800" }]}>IA</Text>
                                </View>
                              </View>
                              <Text style={[typography.small, { color: colors.primary, fontWeight: "700", marginTop: 2 }]}>
                                ≈ {estKcal} kcal{" "}
                                <Text style={{ color: colors.textMuted, fontWeight: "500" }}>
                                  {s.portion_label || `pour ${s.default_qty} ${s.unit}`}
                                </Text>
                              </Text>
                              <Text style={[typography.small, { marginTop: 2, color: colors.textMuted, fontSize: 11 }]}>
                                {s.category} · P {s.protein_g}g · G {s.carbs_g}g · L {s.fat_g}g
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        );
                      })}
                      {!aiLoading && aiSuggestions.length === 0 && manualSearch.trim().length >= 3 && (
                        <Text style={[typography.small, { color: colors.textMuted, textAlign: "center", paddingVertical: spacing.sm }]}>
                          L&apos;IA n&apos;a pas reconnu cet aliment.
                        </Text>
                      )}
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} bottomOffset={20} keyboardShouldPersistTaps="handled">
                <TouchableOpacity onPress={() => setSelectedFood(null)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm }} testID="manual-back">
                  <Ionicons name="chevron-back" size={18} color={colors.primary} />
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "600" }]}>Retour</Text>
                </TouchableOpacity>

                <Text style={[typography.h3, { marginTop: spacing.sm }]}>{selectedFood.name}</Text>
                <Text style={typography.small}>{selectedFood.category}</Text>

                <Text style={[typography.caption, { marginTop: spacing.lg }]}>Quantité</Text>
                <View style={styles.qtyRow}>
                  <TextInput
                    value={manualQty}
                    onChangeText={(t) => setManualQty(t.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={styles.qtyInput}
                    autoFocus
                    testID="manual-qty-input"
                  />
                  <Text style={styles.qtyUnit}>{selectedFood.unit}</Text>
                </View>

                {/* Quick qty chips */}
                <View style={styles.quickQtyRow}>
                  {quickQtyOptions(selectedFood).map((q) => (
                    <TouchableOpacity
                      key={q}
                      onPress={() => setManualQty(String(q))}
                      style={styles.quickQtyChip}
                      testID={`qty-quick-${q}`}
                    >
                      <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>{q} {selectedFood.unit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Multiplier */}
                <Text style={[typography.caption, { marginTop: spacing.md }]}>Multiplicateur</Text>
                <View style={styles.quickQtyRow}>
                  {[0.5, 1.5, 2, 3].map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        const base = parseFloat(manualQty || String(selectedFood.default_qty));
                        setManualQty(String(Math.round(base * m * 10) / 10));
                      }}
                      style={[styles.quickQtyChip, { backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }]}
                      testID={`mult-${m}`}
                    >
                      <Text style={[typography.small, { color: "#92400E", fontWeight: "700" }]}>×{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Meal type selector */}
                <Text style={[typography.caption, { marginTop: spacing.lg }]}>Catégorie de repas</Text>
                <View style={styles.mealTypeRow}>
                  {MEAL_TYPE_ORDER.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setManualMealType(t)}
                      style={[styles.mealTypeChip, manualMealType === t && styles.mealTypeChipOn]}
                      testID={`manual-meal-type-${t}`}
                    >
                      <Text style={[typography.small, { fontWeight: "600", color: manualMealType === t ? colors.primary : colors.textSecondary }]}>
                        {MEAL_TYPE_LABEL[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Macros preview */}
                {previewMacros && (
                  <View style={styles.previewBox} testID="manual-preview">
                    <View style={{ flex: 1 }}>
                      <Text style={typography.caption}>Pour {manualQty} {selectedFood.unit}</Text>
                      <Text style={[typography.h2, { lineHeight: 32 }]}>
                        {previewMacros.kcal} <Text style={[typography.small, { fontSize: 14 }]}>kcal</Text>
                      </Text>
                      <Text style={[typography.small, { marginTop: 2 }]}>
                        P {previewMacros.p}g · G {previewMacros.c}g · L {previewMacros.f}g
                      </Text>
                    </View>
                    <Ionicons name="leaf" size={26} color={colors.primary} />
                  </View>
                )}

                <Button
                  title="Ajouter à mes repas"
                  onPress={saveManual}
                  loading={savingManual}
                  disabled={!previewMacros}
                  style={{ marginTop: spacing.md }}
                  testID="manual-save"
                />
                <TouchableOpacity onPress={saveFavorite} disabled={!previewMacros || isSelectedAi} style={[styles.favSaveBtn, isSelectedAi && { opacity: 0.4 }]} testID="manual-save-favorite">
                  <Ionicons name="star-outline" size={16} color={colors.primary} />
                  <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>
                    {isSelectedAi ? "Favori non dispo pour IA" : "Sauvegarder en favori"}
                  </Text>
                </TouchableOpacity>
                <View style={{ height: spacing.lg }} />
              </KeyboardAwareScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

function quickQtyOptions(f: Food): number[] {
  const d = f.default_qty || 100;
  if (f.unit === "g" || f.unit === "ml") {
    return [Math.round(d / 2), d, d * 2, d * 3];
  }
  return [1, 2, 3, 5];
}

function MealCard({ meal, onDelete, onDuplicate }: { meal: Meal; onDelete: () => void; onDuplicate?: () => void }) {
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
          <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
            {onDuplicate && (
              <TouchableOpacity onPress={onDuplicate} testID={`meal-duplicate-${meal.id}`}>
                <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onDelete} testID={`meal-delete-${meal.id}`}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Card>
  );
}

function HistoryDayCard({ day, onDeleteMeal, onDuplicateDay }: { day: HistoryDay; onDeleteMeal: (id: string) => void; onDuplicateDay?: () => void }) {
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
          {onDuplicateDay && (
            <TouchableOpacity
              onPress={onDuplicateDay}
              style={localStyles.dupDayBtn}
              testID={`history-duplicate-day-${day.date}`}
            >
              <Ionicons name="copy-outline" size={14} color={colors.primary} />
              <Text style={[typography.small, { color: colors.primary, fontWeight: "700" }]}>
                Dupliquer cette journée
              </Text>
            </TouchableOpacity>
          )}
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
  dupDayBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  ingredientChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: colors.primary },
  recipeCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, backgroundColor: colors.surface },
  recipeAddBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryPale },
});

// ----- Calendar helpers / components -----

function addMonths(d: Date, n: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

const MONTH_LABELS = ["Janv", "Févr", "Mars", "Avril", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={[typography.small, { fontSize: 11, color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function CalendarMonthView({
  monthDate,
  calDays,
  onPrev,
  onNext,
  onDayPress,
  selectedDay,
}: {
  monthDate: Date;
  calDays: Record<string, number>;
  onPrev: () => void;
  onNext: () => void;
  onDayPress: (iso: string) => void;
  selectedDay: string | null;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  // ISO weekday: Mon=1...Sun=7. Convert to grid 0-6 (Mon=0).
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  const isFutureMonth = addMonths(monthDate, 1) > new Date();

  return (
    <View style={calStyles.wrap} testID="calendar-month-view">
      <View style={calStyles.header}>
        <TouchableOpacity onPress={onPrev} style={calStyles.navBtn} testID="cal-prev">
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[typography.body, { fontWeight: "700", textTransform: "capitalize" }]}>
          {MONTH_LABELS[month]} {year}
        </Text>
        <TouchableOpacity
          onPress={onNext}
          disabled={!isFutureMonth ? false : true}
          style={[calStyles.navBtn, isFutureMonth && { opacity: 0.3 }]}
          testID="cal-next"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={calStyles.weekRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text key={`${d}-${i}`} style={[typography.small, { fontSize: 11, textAlign: "center", flex: 1, color: colors.textMuted, fontWeight: "700" }]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={idx} style={calStyles.cellEmpty} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const cnt = calDays[iso] || 0;
          const isToday = iso === todayISO;
          const isSel = iso === selectedDay;
          const isFuture = new Date(iso) > new Date(todayISO);
          const diffDays = Math.floor((new Date(todayISO).getTime() - new Date(iso).getTime()) / 86400000);
          const isOutOfWindow = diffDays > 14;
          const disabled = isFuture || isOutOfWindow;
          const hasMeals = cnt > 0;
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => !disabled && onDayPress(iso)}
              disabled={disabled}
              style={[
                calStyles.cell,
                hasMeals && calStyles.cellHasMeals,
                isSel && calStyles.cellSelected,
                isToday && calStyles.cellToday,
                disabled && calStyles.cellDisabled,
              ]}
              testID={`cal-day-${iso}`}
            >
              <Text style={[
                calStyles.cellDay,
                hasMeals && { color: colors.primary, fontWeight: "800" },
                isSel && { color: colors.surface },
                disabled && { color: colors.textMuted, opacity: 0.5 },
              ]}>
                {day}
              </Text>
              {hasMeals && !isSel && (
                <View style={[calStyles.cellDot, { backgroundColor: colors.primary }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  navBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: colors.background },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  cellHasMeals: { },
  cellSelected: { backgroundColor: colors.primary, borderRadius: radius.md },
  cellToday: { borderWidth: 2, borderColor: colors.primary, borderRadius: radius.md },
  cellDisabled: {},
  cellDay: { fontSize: 14, fontWeight: "600", color: colors.textMain },
  cellDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});

const styles = StyleSheet.create({

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
  pastBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  catChipOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  catChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  foodRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  favChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: colors.primary, maxWidth: 200 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  qtyInput: { flex: 1, padding: spacing.md, fontSize: 22, fontWeight: "700", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.textMain, backgroundColor: colors.background },
  qtyUnit: { fontSize: 16, color: colors.textSecondary, fontWeight: "600", paddingHorizontal: 8 },
  quickQtyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  quickQtyChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.primaryPale, borderWidth: 1, borderColor: "#D5EAD8" },
  mealTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  mealTypeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  mealTypeChipOn: { backgroundColor: colors.primaryPale, borderColor: colors.primary },
  previewBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.primaryPale, borderRadius: radius.md, marginTop: spacing.lg, borderWidth: 1, borderColor: "#D5EAD8" },
  favSaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, paddingVertical: 10, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  dateChip: { minWidth: 56, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 2 },
  dateChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateChipDay: { fontSize: 11, color: colors.textSecondary, fontWeight: "600", textTransform: "capitalize" },
  dateChipDayOn: { color: colors.surface },
  dateChipNum: { fontSize: 17, color: colors.textMain, fontWeight: "800" },
  dateChipNumOn: { color: colors.surface },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  aiSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  aiHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  aiFoodRow: { backgroundColor: colors.primaryPale, borderRadius: radius.md, paddingHorizontal: spacing.sm, marginBottom: 6, borderBottomWidth: 0 },
  aiBadgeMini: { paddingHorizontal: 5, paddingVertical: 1, backgroundColor: colors.surface, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
});
