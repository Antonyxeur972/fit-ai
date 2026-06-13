import { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { ShareCard, ShareCardData } from "./ShareCard";
import { colors, spacing, radius, typography } from "../theme";

export function ShareCardModal({
  visible,
  onClose,
  data,
}: {
  visible: boolean;
  onClose: () => void;
  data: ShareCardData;
}) {
  const cardRef = useRef<View>(null);
  const [bgPhoto, setBgPhoto] = useState<string | null | undefined>(
    data.background_image_base64
  );
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

  const pickBackground = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Galerie", "Autorise l'accès à la galerie pour personnaliser le fond.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: true,
        aspect: [9, 16],
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      setBgPhoto(result.assets[0].base64);
    } catch (e) {
      console.warn("pickBackground", e);
    }
  };

  const removeBackground = () => setBgPhoto(null);

  const captureCard = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      const uri = await captureRef(cardRef, {
        format: "jpg",
        quality: 0.95,
        result: "tmpfile",
      });
      return uri;
    } catch (e) {
      console.warn("captureRef failed", e);
      return null;
    }
  };

  const saveToGallery = async () => {
    setBusy("save");
    try {
      const uri = await captureCard();
      if (!uri) {
        Alert.alert("Erreur", "Impossible de générer l'image.");
        return;
      }
      if (Platform.OS === "web") {
        // Open in new tab — web fallback
        if (typeof window !== "undefined") {
          window.open(uri, "_blank");
        }
        Alert.alert("Image générée", "L'aperçu est ouvert dans un nouvel onglet.");
        return;
      }
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photos",
          "Autorise l'accès à tes photos pour enregistrer la story."
        );
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Enregistré", "Story sauvegardée dans ta galerie.");
    } catch (e) {
      console.warn("saveToGallery", e);
      Alert.alert("Erreur", "Sauvegarde impossible.");
    } finally {
      setBusy(null);
    }
  };

  const shareNow = async () => {
    setBusy("share");
    try {
      const uri = await captureCard();
      if (!uri) {
        Alert.alert("Erreur", "Impossible de générer l'image.");
        return;
      }
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        Alert.alert("Partage indisponible", "Le partage natif n'est pas disponible sur ce device.");
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: "Partager ma performance",
        mimeType: "image/jpeg",
        UTI: "public.jpeg",
      });
    } catch (e) {
      console.warn("shareNow", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Partager ma performance</Text>
            <TouchableOpacity onPress={onClose} testID="share-card-close">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.cardWrap}>
              <ShareCard
                ref={cardRef}
                data={{ ...data, background_image_base64: bgPhoto || null }}
              />
            </View>

            <View style={styles.bgRow}>
              <TouchableOpacity
                onPress={pickBackground}
                style={styles.bgBtn}
                testID="share-bg-pick"
              >
                <Ionicons
                  name={bgPhoto ? "refresh" : "image-outline"}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.bgBtnText}>
                  {bgPhoto ? "Changer la photo" : "Ajouter une photo de fond"}
                </Text>
              </TouchableOpacity>
              {bgPhoto ? (
                <TouchableOpacity onPress={removeBackground} testID="share-bg-remove">
                  <Ionicons name="trash-outline" size={18} color={colors.alert} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={saveToGallery}
                style={[styles.actionBtn, styles.actionSecondary]}
                disabled={busy !== null}
                testID="share-save"
              >
                {busy === "save" ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="download-outline" size={18} color={colors.primary} />
                )}
                <Text style={styles.actionTxtSecondary}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={shareNow}
                style={[styles.actionBtn, styles.actionPrimary]}
                disabled={busy !== null}
                testID="share-now"
              >
                {busy === "share" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                )}
                <Text style={styles.actionTxtPrimary}>Partager</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.disclaimer}>
              Format vertical 9:16, optimisé pour Stories Instagram, WhatsApp, etc.
            </Text>
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: "94%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, fontWeight: "700" },
  scroll: { paddingBottom: spacing.lg },
  cardWrap: { alignItems: "center", marginBottom: spacing.lg },
  bgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.md,
  },
  bgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bgBtnText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionTxtSecondary: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  actionTxtPrimary: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: {
    ...typography.small,
    textAlign: "center",
    marginTop: spacing.md,
    color: colors.textMuted,
  },
});

export default ShareCardModal;
