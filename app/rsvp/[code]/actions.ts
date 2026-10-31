"use server";

import { getSupabase } from "../../../lib/supabase/server";
import { LIMITS, normalizeCode, type EventResponse, type SubmitResult } from "../../../lib/rsvp/types";

const UNAVAILABLE = "We couldn't save your RSVP right now. Please try again in a few minutes.";
const CHANGED = "Your invitation has changed. Please reload the page and submit again.";

export async function submitRsvp(rawCode: unknown, rawResponses: unknown, rawMessage: unknown): Promise<SubmitResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { status: "error", message: "This RSVP link is not valid." };

  if (!Array.isArray(rawResponses) || rawResponses.length === 0 || rawResponses.length > 20) {
    return { status: "error", message: "Please answer for every event." };
  }
  const responses: EventResponse[] = [];
  for (const item of rawResponses) {
    if (typeof item !== "object" || item === null) return { status: "error", message: CHANGED };
    const { eventId, attendingCount } = item as Record<string, unknown>;
    if (
      !Number.isInteger(eventId) ||
      !Number.isInteger(attendingCount) ||
      (attendingCount as number) < 0 ||
      (attendingCount as number) > LIMITS.maxGuests
    ) {
      return { status: "error", message: "Please answer for every event." };
    }
    responses.push({ eventId: eventId as number, attendingCount: attendingCount as number });
  }

  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (message.length > LIMITS.messageMax) {
    return { status: "error", message: `Please keep your message under ${LIMITS.messageMax} characters.` };
  }

  const supabase = getSupabase();
  if (!supabase) return { status: "error", message: UNAVAILABLE };

  const { data, error } = await supabase.rpc("submit_invitation_rsvp", {
    p_code: code,
    p_responses: responses,
    p_message: message || null,
  });
  if (error) {
    console.error("RSVP submission failed.", { code: error.code });
    return { status: "error", message: UNAVAILABLE };
  }

  const status = typeof data === "object" && data !== null ? (data as Record<string, unknown>).status : undefined;
  if (status === "saved") return { status: "saved" };
  if (status === "invalid" || status === "not_found") return { status: "error", message: CHANGED };
  console.error("RSVP submission returned an unexpected response.");
  return { status: "error", message: UNAVAILABLE };
}
