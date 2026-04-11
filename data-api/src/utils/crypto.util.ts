import { createDecipheriv, createCipheriv, scryptSync, randomBytes } from "crypto";

const KEY_SOURCE = process.env.ENCRYPTION_KEY ?? "default-key-change-in-production!";
const KEY = scryptSync(KEY_SOURCE, "salt", 32);

export function encrypt(text: string | null | undefined): string {
  if (!text) return "";
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string | null | undefined): string {
  if (!text) return "";
  try {
    const [ivHex, encryptedHex] = text.split(":");
    if (!ivHex || !encryptedHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
