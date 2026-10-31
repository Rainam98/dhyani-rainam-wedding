import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const clients = new Map<string, SupabaseClient>();

function readUrl(): string | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  if (
    !url ||
    url.includes("your-project-ref") ||
    !URL.canParse(url) ||
    !["https:", "http:"].includes(new URL(url).protocol)
  ) {
    return null;
  }
  return url;
}

function readKey(envName: string, prefix: string): string | null {
  const key = process.env[envName]?.trim();
  if (!key || key.includes("replace_with_your") || !key.startsWith(prefix)) return null;
  return key;
}

function getClient(key: string | null): SupabaseClient | null {
  const url = readUrl();
  if (!url || !key) return null;

  const cacheKey = `${url}|${key}`;
  const cached = clients.get(cacheKey);
  if (cached) return cached;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }),
    },
  });
  clients.set(cacheKey, client);
  return client;
}

/** Low-privilege client for guests: can only call the RSVP functions. */
export function getSupabase(): SupabaseClient | null {
  return getClient(readKey("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_"));
}

/** Full-access client (bypasses RLS). Only use after verifying the admin session. */
export function getSupabaseAdmin(): SupabaseClient | null {
  return getClient(readKey("SUPABASE_SECRET_KEY", "sb_secret_"));
}
