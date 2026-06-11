import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Card, Button, SectionTitle, WeekBars } from "@/src/components/UI";
import { colors, spacing, typography, radius } from "@/src/theme";

type Transfo = {
  id: string;
  date: string;
  image_base64: string;
  ai_feedback?: string;
  weight_kg?: number;
  created_at: string;
};

type Week = {
  days: { date: string; consumed: number; target: number; steps: number; cardio_minutes: number }[];
  avg_consumed: number;
  target: number;
};

export default function Progress() {
  const [transfos, setTransfos] = useState<Transfo[]>([]);
  const [week, setWeek] = useState<Week | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, w] = await Promise.all([
        api<Transfo[]>("/transformations"),
        api<Week>("/dashboard/week"),
      ]);
      setTransfos(list);
      setWeek(w);
    } catch (e) {
      console.warn("progress load", e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upload = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploading(true);
    try {
      await api("/transformations", {
        method: "POST",
        body: { image_base64: result.assets[0].base64, mime: "image/jpeg" },
      });
      await load();
    } catch (e) {
      console.warn(e);
    } finally {
      setUploading(false);
    }
  };

  const totalWeekSteps = week?.days.reduce((s, d) => s + d.steps, 0) || 0;
  const totalCardioMin = week?.days.reduce((s, d) => s + d.cardio_minutes, 0) || 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="progress-screen">
      <View style={styles.header}>
        <Text style={typography.caption}>Progression</Text>
        <Text style={styles.title}>Ton évolution</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Week chart */}
        <Card testID="week-card">
          <SectionTitle title="Calories cette semaine" />
          {week && <WeekBars days={week.days} target={week.target} testID="week-bars" />}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View>
              <Text style={typography.caption}>Moyenne</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{(week?.avg_consumed || 0).toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
            </View>
            <View>
              <Text style={typography.caption}>Objectif</Text>
              <Text style={[typography.h3, { marginTop: 4, color: colors.primary }]}>{(week?.target || 0).toLocaleString("fr-FR")} <Text style={typography.small}>kcal</Text></Text>
            </View>
          </View>
        </Card>

        {/* Week activity totals */}
        <Card testID="activity-totals-card">
          <SectionTitle title="Activité de la semaine" />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
            <View>
              <Text style={typography.caption}>Pas totaux</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{totalWeekSteps.toLocaleString("fr-FR")}</Text>
            </View>
            <View>
              <Text style={typography.caption}>Cardio</Text>
              <Text style={[typography.h3, { marginTop: 4 }]}>{totalCardioMin} <Text style={typography.small}>min</Text></Text>
            </View>
          </View>
        </Card>

        {/* Transformations */}
        <SectionTitle title="Photos de transformation" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            title="Caméra"
            onPress={() => upload(true)}
            loading={uploading}
            icon={<Ionicons name="camera-outline" size={18} color="#fff" />}
            testID="transformation-camera"
            style={{ flex: 1 }}
          />
          <Button
            title="Galerie"
            onPress={() => upload(false)}
            variant="secondary"
            icon={<Ionicons name="images-outline" size={18} color={colors.primary} />}
            testID="transformation-library"
            style={{ flex: 1 }}
          />
        </View>

        {uploading && (
          <View style={[styles.uploadingRow]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={typography.small}>Analyse IA en cours...</Text>
          </View>
        )}

        {transfos.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", padding: spacing.lg }}>
              <View style={styles.emptyIcon}>
                <Ionicons name="image-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.md }]}>
                Documente ta progression
              </Text>
              <Text style={[typography.small, { textAlign: "center", marginTop: 6 }]}>
                {"Toutes les 2-4 semaines, upload une photo. L'IA suit ton évolution."}
              </Text>
            </View>
          </Card>
        ) : (
          transfos.map((t, idx) => (
            <Card key={t.id} testID={`transfo-${t.id}`}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Image source={{ uri: `data:image/jpeg;base64,${t.image_base64}` }} style={styles.transfoImg} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.caption}>
                    {new Date(t.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                  <Text style={[typography.body, { fontWeight: "600", marginTop: 2 }]}>
                    {idx === 0 ? "Dernière photo" : `Photo #${transfos.length - idx}`}
                  </Text>
                  {t.weight_kg ? <Text style={typography.small}>{t.weight_kg} kg</Text> : null}
                  {t.ai_feedback ? (
                    <Text style={[typography.small, { marginTop: spacing.sm, color: colors.textMain, lineHeight: 18 }]}>
                      {t.ai_feedback}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          ))
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, letterSpacing: -0.6, marginTop: 4 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  transfoImg: { width: 96, height: 128, borderRadius: radius.md, backgroundColor: colors.border },
  uploadingRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm },
});
