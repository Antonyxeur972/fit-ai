import { useCallback, useState } from "react";
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
};

export default function Meals() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Meal | null>(null);
  const [showResult, setShowResult] = useState(false);

  const load = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const list = await api<Meal[]>(`/meals?date=${today}`);
      setMeals(list);
    } catch (e: any) {
      console.warn("load meals", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickImage = async (fromCamera: boolean) => {
    setError(null);
    let permission;
    if (fromCamera) {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (!permission.granted) {
      setError("Permission refusée. Autorise l'accès dans les réglages.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        });
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
      setMeals((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  const total = meals.reduce((s, m) => s + m.calories, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="meals-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Repas du jour</Text>
        <Text style={styles.headerTitle}>{total.toLocaleString("fr-FR")} <Text style={styles.headerUnit}>kcal</Text></Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.actions}>
          <Button
            title={analyzing ? "Analyse..." : "Photo"}
            onPress={() => pickImage(true)}
            loading={analyzing}
            icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
            testID="meals-camera-button"
            style={{ flex: 1 }}
          />
          <Button
            title="Galerie"
            onPress={() => pickImage(false)}
            variant="secondary"
            icon={<Ionicons name="images-outline" size={18} color={colors.primary} />}
            testID="meals-library-button"
            style={{ flex: 1 }}
          />
        </View>

        {error && (
          <View style={styles.errorBox} testID="meals-error">
            <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
            <Text style={[typography.small, { color: colors.alert, flex: 1 }]}>{error}</Text>
          </View>
        )}

        <SectionTitle title="Aujourd'hui" />
        {meals.length === 0 ? (
          <Card testID="meals-empty">
            <View style={{ alignItems: "center", padding: spacing.lg }}>
              <View style={styles.emptyIcon}>
                <Ionicons name="restaurant-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.body, { color: colors.textMain, marginTop: spacing.md, fontWeight: "600" }]}>
                Aucun repas analysé
              </Text>
              <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>
                Prends une photo de ton assiette pour démarrer.
              </Text>
            </View>
          </Card>
        ) : (
          meals.map((m) => <MealCard key={m.id} meal={m} onDelete={() => remove(m.id)} />)
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <Modal visible={showResult} transparent animationType="slide" onRequestClose={() => setShowResult(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard} testID="meals-result-modal">
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lastResult?.name || "Repas analysé"}</Text>
            <Text style={[typography.small, { marginBottom: spacing.md }]}>{lastResult?.notes}</Text>
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
    <Card style={{ marginBottom: spacing.sm }} testID={`meal-card-${meal.id}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={styles.mealIcon}>
          <Ionicons name="leaf" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { fontWeight: "600" }]}>{meal.name}</Text>
          <Text style={[typography.small, { marginTop: 2 }]}>
            P {meal.protein_g}g · G {meal.carbs_g}g · L {meal.fat_g}g
          </Text>
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

function ModalStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.modalStat}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.h3, { marginTop: 2 }]}>{value}<Text style={typography.small}> {unit}</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { fontSize: 32, fontWeight: "800", color: colors.textMain, letterSpacing: -1, marginTop: 4 },
  headerUnit: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  actions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", padding: spacing.md, borderRadius: radius.md,
  },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  mealIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 4, alignSelf: "center" },
  modalTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  modalStats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  modalStat: { flexBasis: "47%", backgroundColor: colors.primaryPale, padding: spacing.md, borderRadius: radius.md },
  analyzingOverlay: {
    position: "absolute", inset: 0,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)",
  },
  analyzingCard: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, alignItems: "center", borderWidth: 1, borderColor: colors.border },
});
