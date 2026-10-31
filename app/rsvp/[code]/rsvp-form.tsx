"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { submitRsvp } from "./actions";
import { LIMITS, formatEventDate, type Invitation } from "../../../lib/rsvp/types";

type Props = { code: string; invitation: Invitation };

export default function RsvpForm({ code, invitation }: Props) {
  const baseId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [counts, setCounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      invitation.events.map((event) => [event.id, event.attendingCount == null ? "" : String(event.attendingCount)]),
    ),
  );
  const [message, setMessage] = useState(invitation.message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const guestLabel = (n: number) => `${n} ${n === 1 ? "guest" : "guests"}`;

  function showError(text: string) {
    setError(text);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const unanswered = invitation.events.filter((item) => counts[item.id] === "");
    if (unanswered.length > 0) {
      return showError(`Please choose how many guests are attending ${unanswered.map((e) => e.name).join(", ")}.`);
    }

    const responses = invitation.events.map((item) => ({
      eventId: item.id,
      attendingCount: Number(counts[item.id]),
    }));

    startTransition(async () => {
      try {
        const result = await submitRsvp(code, responses, message);
        if (result.status === "error") return showError(result.message);
        setSaved(true);
      } catch {
        showError("Something went wrong. Please check your connection and try again.");
      }
    });
  }

  if (invitation.events.length === 0) {
    return (
      <section>
        <p role="status" className="pending">
          This invitation isn&apos;t set up yet. Please contact Rainam or Dhyani.
        </p>
      </section>
    );
  }

  if (saved) {
    const attending = invitation.events.filter((item) => Number(counts[item.id]) > 0);
    return (
      <section aria-labelledby={`${baseId}-done`} className="stack">
        <h2 id={`${baseId}-done`}>Thank you, {invitation.familyName}!</h2>
        {attending.length > 0 ? (
          <>
            <p role="status">We can&apos;t wait to celebrate with you. Here&apos;s what we saved:</p>
            <ul className="summary">
              {invitation.events.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}:</strong>{" "}
                  {Number(counts[item.id]) > 0 ? guestLabel(Number(counts[item.id])) : "Not attending"}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">We&apos;ll miss you! Your response has been saved.</p>
        )}
        <p className="note">You can open this same link any time to change your RSVP.</p>
        <button type="button" className="secondary" onClick={() => setSaved(false)}>
          Edit my RSVP
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`}>{invitation.familyName}</h2>
      <p>
        We have reserved {invitation.maxGuests === 1 ? "1 seat" : `up to ${invitation.maxGuests} seats`} for you.
      </p>
      {invitation.submittedAt ? (
        <p className="note">We already have your response. You can update it below.</p>
      ) : null}

      <form onSubmit={handleSubmit} className="stack" noValidate>
        {invitation.events.map((item) => {
          const date = formatEventDate(item.date);
          const selectId = `${baseId}-event-${item.id}`;
          return (
            <div key={item.id} className="event">
              <h3>{item.name}</h3>
              {date ? <p className="event-meta">{date}</p> : null}
              {item.venue ? <p className="event-meta">{item.venue}</p> : null}
              {item.details ? <p className="note">{item.details}</p> : null}
              <label htmlFor={selectId}>How many guests will attend?</label>
              <select
                id={selectId}
                value={counts[item.id]}
                onChange={(e) => setCounts((current) => ({ ...current, [item.id]: e.target.value }))}
              >
                <option value="" disabled>
                  Please choose
                </option>
                <option value="0">Not attending</option>
                {Array.from({ length: invitation.maxGuests }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {guestLabel(n)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        <label htmlFor={`${baseId}-message`}>Message for the couple (optional)</label>
        <textarea
          id={`${baseId}-message`}
          rows={4}
          maxLength={LIMITS.messageMax}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        {error ? (
          <p ref={errorRef} tabIndex={-1} role="alert" className="error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : invitation.submittedAt ? "Update RSVP" : "Send RSVP"}
        </button>
      </form>
    </section>
  );
}
