import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAdminConfig, isAdmin } from "../../lib/admin/auth";
import { loadDashboard } from "../../lib/admin/dashboard";
import { logout } from "./actions";
import Dashboard from "./dashboard";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Rainam & Dhyani RSVP",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function getSiteUrl(): Promise<string> {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured && URL.canParse(configured)) return configured;

  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function AdminPage() {
  if (!getAdminConfig()) {
    return (
      <main>
        <h1>Admin</h1>
        <section>
          <p role="status" className="pending">
            Admin access is not set up. Add <code>ADMIN_PASSWORD</code> (at least 12 characters) and{" "}
            <code>SUPABASE_SECRET_KEY</code> to the server environment, then restart. See README.md.
          </p>
        </section>
      </main>
    );
  }

  if (!(await isAdmin())) {
    return (
      <main>
        <p className="eyebrow">Rainam &amp; Dhyani</p>
        <h1>RSVP admin</h1>
        <LoginForm />
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof loadDashboard>> = null;
  let loadError = false;
  try {
    data = await loadDashboard();
  } catch (error) {
    console.error("Admin dashboard failed to load.", error instanceof Error ? error.message : "");
    loadError = true;
  }

  return (
    <main className="wide">
      <div className="admin-header">
        <h1>RSVP admin</h1>
        <form action={logout}>
          <button type="submit" className="secondary">
            Sign out
          </button>
        </form>
      </div>
      {data ? (
        <Dashboard data={data} siteUrl={await getSiteUrl()} />
      ) : (
        <section>
          <p role="alert" className="error">
            {loadError
              ? "Couldn't load RSVPs. Check that DATABASE.sql has been run and SUPABASE_SECRET_KEY is correct (see server logs)."
              : "SUPABASE_URL or SUPABASE_SECRET_KEY is missing or invalid."}
          </p>
        </section>
      )}
    </main>
  );
}
