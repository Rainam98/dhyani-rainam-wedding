"use client";

import { useMemo, useState } from "react";
import type { DashboardData, DashboardInvitation } from "../../lib/admin/dashboard";

type Filter = "all" | "replied" | "waiting";

function csvCell(value: string | number): string {
  const text = String(value);
  // Prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function Dashboard({ data, siteUrl }: { data: DashboardData; siteUrl: string }) {
  const { events, invitations } = data;
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const linkFor = (invitation: DashboardInvitation) => `${siteUrl}/rsvp/${invitation.code}`;
  const repliedCount = invitations.filter((invitation) => invitation.submittedAt).length;

  const totals = events.map((event) => {
    let invitedFamilies = 0;
    let seats = 0;
    let attending = 0;
    let waiting = 0;
    let declined = 0;
    for (const invitation of invitations) {
      if (!(event.id in invitation.responses)) continue;
      invitedFamilies += 1;
      seats += invitation.maxGuests;
      const count = invitation.responses[event.id];
      if (count == null) waiting += 1;
      else if (count === 0) declined += 1;
      else attending += count;
    }
    return { event, invitedFamilies, seats, attending, waiting, declined };
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invitations.filter((invitation) => {
      if (filter === "replied" && !invitation.submittedAt) return false;
      if (filter === "waiting" && invitation.submittedAt) return false;
      return !term || invitation.familyName.toLowerCase().includes(term) || invitation.code.toLowerCase().includes(term);
    });
  }, [invitations, filter, search]);

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  function downloadCsv() {
    const header = ["Family", "Seats", "RSVP link", "Status", ...events.map((event) => event.name), "Message", "Replied at"];
    const rows = visible.map((invitation) => [
      invitation.familyName,
      invitation.maxGuests,
      linkFor(invitation),
      invitation.submittedAt ? "Replied" : "Waiting",
      ...events.map((event) => {
        if (!(event.id in invitation.responses)) return "Not invited";
        const count = invitation.responses[event.id];
        return count == null ? "No reply" : count;
      }),
      invitation.message ?? "",
      invitation.submittedAt ? new Date(invitation.submittedAt).toLocaleString() : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rsvps.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dashboard">
      <section className="stats" aria-label="Summary">
        <div className="stat">
          <span className="stat-number">{invitations.length}</span>
          <span>Families invited</span>
        </div>
        <div className="stat">
          <span className="stat-number">{repliedCount}</span>
          <span>Replied</span>
        </div>
        <div className="stat">
          <span className="stat-number">{invitations.length - repliedCount}</span>
          <span>Waiting</span>
        </div>
      </section>

      <section className="stats" aria-label="Headcount by event">
        {totals.map(({ event, invitedFamilies, seats, attending, waiting, declined }) => (
          <div className="stat" key={event.id}>
            <span className="stat-label">{event.name}</span>
            <span className="stat-number">{attending}</span>
            <span>attending of {seats} seats</span>
            <span className="note">
              {invitedFamilies} {invitedFamilies === 1 ? "family" : "families"} · {waiting} no reply · {declined} declined
            </span>
          </div>
        ))}
      </section>

      <section aria-label="Invitations">
        <div className="toolbar">
          <div className="tabs" role="group" aria-label="Filter">
            {(
              [
                ["all", `All (${invitations.length})`],
                ["replied", `Replied (${repliedCount})`],
                ["waiting", `Waiting (${invitations.length - repliedCount})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "" : "secondary"}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search families"
            placeholder="Search family or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" className="secondary" onClick={downloadCsv} disabled={visible.length === 0}>
            Download CSV
          </button>
        </div>

        {invitations.length === 0 ? (
          <p className="note">No invitations yet. Add families in Supabase with add_invitation (README step 3).</p>
        ) : visible.length === 0 ? (
          <p className="note">No families match.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Family</th>
                  <th scope="col">Status</th>
                  {events.map((event) => (
                    <th scope="col" key={event.id}>
                      {event.name}
                    </th>
                  ))}
                  <th scope="col">RSVP link</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((invitation) => (
                  <tr key={invitation.id}>
                    <th scope="row">
                      {invitation.familyName}
                      <span className="note block">
                        {invitation.maxGuests} {invitation.maxGuests === 1 ? "seat" : "seats"}
                      </span>
                    </th>
                    <td>
                      {invitation.submittedAt ? (
                        <span className="badge yes" title={new Date(invitation.submittedAt).toLocaleString()}>
                          Replied
                        </span>
                      ) : (
                        <span className="badge wait">Waiting</span>
                      )}
                    </td>
                    {events.map((event) => {
                      if (!(event.id in invitation.responses)) {
                        return (
                          <td key={event.id} className="muted">
                            Not invited
                          </td>
                        );
                      }
                      const count = invitation.responses[event.id];
                      return (
                        <td key={event.id}>
                          {count == null ? (
                            <span className="badge wait">No reply</span>
                          ) : count === 0 ? (
                            <span className="badge no">Not attending</span>
                          ) : (
                            <span className="badge yes">{count} attending</span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <div className="link-cell">
                        <a href={linkFor(invitation)} target="_blank" rel="noreferrer">
                          {invitation.code}
                        </a>
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => copy(linkFor(invitation), invitation.id)}
                          aria-label={
                            copied === invitation.id
                              ? `Link copied for ${invitation.familyName}`
                              : `Copy RSVP link for ${invitation.familyName}`
                          }
                        >
                          {copied === invitation.id ? "Copied!" : "Copy link"}
                        </button>
                      </div>
                    </td>
                    <td className="message">{invitation.message ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
