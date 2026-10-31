import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "rsvp_admin";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;

type AdminConfig = { password: string; signingKey: string };

export function getAdminConfig(): AdminConfig | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const signingKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.includes("replace_with_") ||
    !signingKey.startsWith("sb_secret_") ||
    signingKey.includes("replace_with_")
  ) {
    return null;
  }
  return { password, signingKey };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function sign(config: AdminConfig, expiresAt: number): string {
  // Including the password hash means changing ADMIN_PASSWORD signs everyone out.
  return createHmac("sha256", config.signingKey)
    .update(`${expiresAt}:${sha256(config.password).toString("hex")}`)
    .digest("hex");
}

export function passwordMatches(config: AdminConfig, attempt: string): boolean {
  return timingSafeEqual(sha256(attempt), sha256(config.password));
}

export function createSessionToken(config: AdminConfig): string {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  return `${expiresAt}.${sign(config, expiresAt)}`;
}

function verifySessionToken(config: AdminConfig, token: string | undefined): boolean {
  if (!token) return false;
  const match = /^(\d{13})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt < Date.now()) return false;
  const expected = Buffer.from(sign(config, expiresAt), "hex");
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}

export async function isAdmin(): Promise<boolean> {
  const config = getAdminConfig();
  if (!config) return false;
  const store = await cookies();
  return verifySessionToken(config, store.get(ADMIN_COOKIE)?.value);
}
