import type { Metadata } from "next";
import { loadInvitation } from "../../../lib/rsvp/invitation";
import RsvpForm from "./rsvp-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RSVP | Rainam & Dhyani",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RsvpPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await loadInvitation(code);

  return (
    <main>
      <p className="eyebrow">You are invited for</p>
      <h1 className="names"><span>Dhyani</span> <span className="amp">&amp;</span> <span>Rainam</span></h1>
      <p className="subtitle">Wedding</p>
      {result.status === "found" ? (
        <RsvpForm code={code.trim().toUpperCase()} invitation={result.invitation} />
      ) : (
        <section>
          <p role="status" className="pending">
            {result.status === "not_found"
              ? "We couldn't find this invitation. Please check that you opened the full link we sent you, or contact Rainam or Dhyani."
              : "RSVPs aren't available right now. Please try again in a few minutes."}
          </p>
        </section>
      )}
    </main>
  );
}
