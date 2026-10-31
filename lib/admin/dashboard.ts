import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase/server";

export type DashboardEvent = { id: number; name: string; date: string | null };

export type DashboardInvitation = {
  id: string;
  code: string;
  familyName: string;
  maxGuests: number;
  message: string | null;
  submittedAt: string | null;
  /** Keyed by event id. Missing = not invited; null = invited, no reply yet. */
  responses: Record<number, number | null>;
};

export type DashboardData = { events: DashboardEvent[]; invitations: DashboardInvitation[] };

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select(columns);
    for (const column of orderBy) query = query.order(column, { ascending: true, nullsFirst: false });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Loading ${table} failed (${error.code ?? "unknown"}).`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function loadDashboard(): Promise<DashboardData | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const [events, invitations, links] = await Promise.all([
    fetchAll<{ id: number; name: string; event_date: string | null }>(
      client, "events", "id, name, event_date", ["event_date", "id"],
    ),
    fetchAll<{
      id: string;
      code: string;
      family_name: string;
      max_guests: number;
      message: string | null;
      submitted_at: string | null;
    }>(client, "invitations", "id, code, family_name, max_guests, message, submitted_at", ["family_name", "id"]),
    fetchAll<{ invitation_id: string; event_id: number; attending_count: number | null }>(
      client, "invitation_events", "invitation_id, event_id, attending_count", ["invitation_id", "event_id"],
    ),
  ]);

  const responses = new Map<string, Record<number, number | null>>();
  for (const link of links) {
    const entry = responses.get(link.invitation_id) ?? {};
    entry[link.event_id] = link.attending_count;
    responses.set(link.invitation_id, entry);
  }

  return {
    events: events.map((event) => ({ id: event.id, name: event.name, date: event.event_date })),
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      code: invitation.code,
      familyName: invitation.family_name,
      maxGuests: invitation.max_guests,
      message: invitation.message,
      submittedAt: invitation.submitted_at,
      responses: responses.get(invitation.id) ?? {},
    })),
  };
}
