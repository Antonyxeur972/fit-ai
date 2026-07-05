import { storage } from "@/src/utils/storage";

const SIMPLE_MODE_KEY = "fitai.simpleMode";

export async function getSimpleMode(): Promise<boolean> {
  return Boolean(await storage.getItem(SIMPLE_MODE_KEY, false));
}

export async function setSimpleMode(value: boolean): Promise<void> {
  await storage.setItem(SIMPLE_MODE_KEY, value);
}
