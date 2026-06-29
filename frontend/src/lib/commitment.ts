import { storage } from "@/src/utils/storage";

const COMMITMENT_KEY = "fitai_commitment_signed_at";

export async function hasSignedCommitment(): Promise<boolean> {
  const signedAt = await storage.getItem(COMMITMENT_KEY, "");
  return !!signedAt;
}

export async function markCommitmentSigned(): Promise<void> {
  await storage.setItem(COMMITMENT_KEY, new Date().toISOString());
}

export async function clearCommitmentSignature(): Promise<void> {
  await storage.removeItem(COMMITMENT_KEY);
}
