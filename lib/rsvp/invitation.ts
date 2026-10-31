import "server-only";
import { getSupabase } from "../supabase/server";
import { LIMITS, formatEventTime, normalizeCode, type Invitation, type InvitedEvent } from "./types";

export type LoadResult =
  | { status: "found"; invitation: Invitation }
  | { status: "not_found" }
  | { status: "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseEvent(value: unknown): InvitedEvent | null {
  if (!isRecord(value)) return null;
  const { id, name, date, venue, details, attendingCount } = value;
  // Older database functions omit these fields until DATABASE.sql is re-run.
  const time = value.time === undefined ? null : value.time;
  const mapUrl = value.mapUrl === undefined ? null : value.mapUrl;
  if (!Number.isInteger(id) || typeof name !== "string") return null;
  if (!isOptionalString(date) || !isOptionalString(venue) || !isOptionalString(details)) return null;
  if (!isOptionalString(time) || (time !== null && !formatEventTime(time))) return null;
  if (!isOptionalString(mapUrl)) return null;
  if (mapUrl !== null && (!URL.canParse(mapUrl) || new URL(mapUrl).protocol !== "https:")) return null;
  if (attendingCount !== null && !Number.isInteger(attendingCount)) return null;
  return {
    id: id as number,
    name,
    date,
    time,
    venue,
    mapUrl,
    details,
    attendingCount: attendingCount as number | null,
  };
}

function parseInvitation(value: unknown): Invitation | null {
  if (!isRecord(value)) return null;
  const { familyName, maxGuests, message, submittedAt, events } = value;
  if (typeof familyName !== "string" || !Array.isArray(events)) return null;
  if (!Number.isInteger(maxGuests) || (maxGuests as number) < 1 || (maxGuests as number) > LIMITS.maxGuests) {
    return null;
  }
  if (!isOptionalString(message) || !isOptionalString(submittedAt)) return null;
  const parsed = events.map(parseEvent);
  if (parsed.some((event) => event === null)) return null;
  return {
    familyName,
    maxGuests: maxGuests as number,
    message,
    submittedAt,
    events: parsed as InvitedEvent[],
  };
}

export async function loadInvitation(rawCode: unknown): Promise<LoadResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { status: "not_found" };

  const supabase = getSupabase();
  if (!supabase) return { status: "unavailable" };

  const { data, error } = await supabase.rpc("get_invitation", { p_code: code });
  if (error) {
    console.error("Invitation lookup failed.", { code: error.code });
    return { status: "unavailable" };
  }
  if (isRecord(data) && data.status === "not_found") return { status: "not_found" };

  const invitation = isRecord(data) && data.status === "found" ? parseInvitation(data.invitation) : null;
  if (!invitation) {
    console.error("Invitation lookup returned an unexpected response.");
    return { status: "unavailable" };
  }
  return { status: "found", invitation };
}
