export const LIMITS = { messageMax: 2000, maxGuests: 50 } as const;

export const CODE_PATTERN = /^[A-Z0-9]{6,20}$/;

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export type InvitedEvent = {
  id: number;
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  mapUrl: string | null;
  details: string | null;
  attendingCount: number | null;
};

export type Invitation = {
  familyName: string;
  maxGuests: number;
  message: string | null;
  submittedAt: string | null;
  events: InvitedEvent[];
};

export type EventResponse = { eventId: number; attendingCount: number };

export type SubmitResult = { status: "saved" } | { status: "error"; message: string };

export function formatEventDate(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatEventTime(time: string | null): string | null {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(time)) return null;
  const [hour, minute] = time.split(":");
  const hours = Number(hour);
  return `${hours % 12 || 12}:${minute} ${hours < 12 ? "AM" : "PM"}`;
}
