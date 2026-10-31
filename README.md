# Rainam & Dhyani Wedding RSVP

Each family gets a **private RSVP link**, for example
`https://rainam-dhyani.vercel.app/rsvp/K7M2QXP9RT`. Opening it shows:

- only the events (of the 3 days) that family is invited to, with date and venue
- how many seats are reserved for them
- for each event, a choice of "Not attending" or 1 up to their seat limit
- an optional message for the couple

They can reopen the same link any time to change their answer. You add
families in Supabase and track everything on the **admin dashboard** at
`/admin` (see step 8).

The website is a single site; a "unique link" is just the site address plus a
random code stored in the database, so it works on free hosting.

---

## 1. Set up the database (once)

1. In Supabase, open **SQL Editor > New query**.
2. Paste the **entire** contents of [`DATABASE.sql`](DATABASE.sql). Make sure no
   text is highlighted, then click **Run**. Expect "Success. No rows returned".

This creates three tables (`events`, `invitations`, `invitation_events`) and the
functions the website uses. It is safe to re-run and does not delete data.
Your older `guests` and `parties` tables are left untouched and are no longer
used; see [Cleaning up old tables](#cleaning-up-old-tables).

## 2. Name your 3 events

Open **Table Editor > events** and edit the three rows (`Day 1`, `Day 2`,
`Day 3`): set `name` (e.g. Mehndi, Wedding, Reception), and optionally
`event_date`, `venue` and `details`. Or in the SQL Editor:

```sql
update public.events set name = 'Mehndi',    event_date = '2027-02-10', venue = 'Shah Residence, Ahmedabad' where id = 1;
update public.events set name = 'Wedding',   event_date = '2027-02-11', venue = 'Venue name, City'          where id = 2;
update public.events set name = 'Reception', event_date = '2027-02-12', venue = 'Venue name, City'          where id = 3;
```

Events are shown in date order. Keep the `id` values 1, 2, 3.

### Configurable location, date, time and map

For an existing database, re-run the entire `DATABASE.sql` once, then deploy
the updated code. This adds optional `event_time` and `map_url` columns and
updates the guest lookup function without deleting invitations or responses.

Set the initial location for all three events in the SQL Editor:

```sql
update public.events set venue = 'Baltimore' where id in (1, 2, 3);
```

After that, edit **Table Editor > events** whenever details change:

| Column | Value |
| --- | --- |
| `name` | Event name |
| `event_date` | Actual date in `YYYY-MM-DD` format |
| `event_time` | Start time in 24-hour format, e.g. `18:30` for 6:30 PM |
| `venue` | `Baltimore` now; venue name/address when confirmed |
| `map_url` | Optional full `https://` map link, including Google Maps share links |
| `details` | Optional additional instructions |

Dates and times are displayed as entered, in the venue's local time (Eastern
Time for Baltimore), not converted to the guest's timezone. Leave unknown
dates, times or map links `NULL`; those details will not be displayed.

These event details are shared across all personalized links. Only which
events a family is invited to, their seat limit and their RSVP are personalized.
Database edits require **no further deployment** and appear when guests open
or refresh their link. An already-open page does not update automatically.

## 3. Add families

In the SQL Editor, one line per family:
`add_invitation('name shown on the page', seats, array[event ids])`.

```sql
select public.add_invitation('The Patel Family', 4, array[1,2,3]::smallint[]);
select public.add_invitation('Raj & Priya Shah',  2, array[2,3]::smallint[]);
select public.add_invitation('Neha Mehta',        1, array[3]::smallint[]);
```

- **seats** is the most people from that family who can come to each event
  (1 to 50).
- **event ids** are the days they are invited to: 1, 2 and/or 3.
- Each line creates a random 10-character code automatically.

To change a family later, use **Table Editor**: `invitations` (name, seats)
and `invitation_events` (add or delete a row to invite or uninvite them from a
day). Deleting an invitation removes its responses too.

### Prepare a guest list for bulk setup

Open [`guest-template.csv`](guest-template.csv) in Excel, Numbers or Google
Sheets. Replace the example rows with one row per family or invitation:

- `family_name`: the display name guests should see (1 to 200 characters).
- `max_guests`: the reserved seat limit (a whole number from 1 to 50), shared
  across all events that family is invited to.
- `event_1`, `event_2`, `event_3`: `yes` or `no` for the corresponding event IDs
  in **Table Editor > events**. At least one must be `yes`.

Export the completed sheet as CSV. To prepare a bulk SQL script, supply that
CSV, your deployed site's base URL, and the exact invitation code of each test
family to remove (from **Table Editor > invitations**). Codes identify the
test rows without risking deletion of a real family with the same name.
Treat these codes as private links; do not post them publicly.
No guest phone numbers, email addresses, database keys or passwords are needed.
The script should delete only the specified test invitations, create the new
invitations using `public.add_invitation`, and return their RSVP links.

## 4. Get the links to send

The easiest way is the admin dashboard (step 8): every family is listed with a
**Copy link** button. Or replace the address below with your site address
(from step 7) and run:

```sql
select family_name,
       'https://rainam-dhyani.vercel.app/rsvp/' || code as rsvp_link
from public.invitations
order by family_name;
```

Click **Download CSV** to get a spreadsheet, then send each family their link
by WhatsApp, text or email. Treat links like a password: anyone with a link can
view and change that family's RSVP.

## 5. See responses

```sql
-- Per family
select i.family_name, e.name as event, i.max_guests as seats,
       coalesce(ie.attending_count::text, 'No reply') as attending,
       i.message, i.submitted_at
from public.invitations i
join public.invitation_events ie on ie.invitation_id = i.id
join public.events e on e.id = ie.event_id
order by i.family_name, e.event_date nulls last, e.id;

-- Headcount per event
select e.name as event,
       coalesce(sum(ie.attending_count), 0) as guests_attending,
       count(*) filter (where ie.attending_count is null) as families_not_replied,
       sum(i.max_guests) as seats_reserved
from public.events e
left join public.invitation_events ie on ie.event_id = e.id
left join public.invitations i on i.id = ie.invitation_id
group by e.id, e.name, e.event_date
order by e.event_date nulls last, e.id;
```

## 6. Run it on your computer

Requires **Node.js 22 or newer** (`nvm install && nvm use` if you use nvm).

```bash
npm install
cp .env.example .env.local   # then fill in the two values below
npm run dev
```

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Both values are in Supabase under **Connect** / **Project Settings > API Keys**.
Use the **publishable** key, never a secret or `service_role` key.
`.env.local` is gitignored.

Test with `http://localhost:3000/rsvp/CODE` using a code from step 4.

## 7. Put it online for free (Vercel)

1. Push this repository to GitHub (`.env.local` is not uploaded).
2. Sign in at [vercel.com](https://vercel.com) with GitHub (Hobby plan is free)
   and click **Add New > Project**, then import this repository.
3. Under **Environment Variables**, add `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` with
   the same values as `.env.local`.
4. Click **Deploy**. Your site address will look like
   `https://your-project.vercel.app`. You can rename it under
   **Settings > Domains**.
5. Use that address in the step 4 query to build the links.

Netlify and Render also host Next.js for free; the setup is the same
(import repo, add the environment variables).

## 8. Admin dashboard

Open `/admin` on your site (e.g. `http://localhost:3000/admin` or
`https://your-project.vercel.app/admin`) and sign in with your admin password.
It shows:

- families invited / replied / still waiting
- headcount per event: guests attending, seats reserved, families not replied
- every family with their status on each event (attending count, Not
  attending, No reply, Not invited), their message, and their RSVP link with a
  **Copy link** button
- filters (All / Replied / Waiting), search, and **Download CSV**

Setup (once): add these to `.env.local` (and to Vercel), then restart:

```dotenv
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_PASSWORD=choose-a-long-password
```

1. **Secret key**: Supabase **Project Settings > API Keys** > *Secret keys*.
   Click **Add new secret key** (name it e.g. `rsvp-admin`) or reveal the
   existing `default` one, and copy the value starting with `sb_secret_`.
2. **Admin password**: make one up, at least 12 characters. It's not stored
   in Supabase.

The secret key gives full database access, so keep it only in `.env.local`
and your hosting provider's environment variables. Never send it in chat,
commit it, or put it in browser code. If it leaks, delete it in Supabase and
create a new one. Changing `ADMIN_PASSWORD` signs out every admin session.
Sessions last 7 days.

## 9. Look and images

The site uses the marigold mandap design. Its images are in `public/` (`marigold-top.jpg` and `marigold-bottom.jpg`) and deploy with the site. Replace a file with the same name to change it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "We couldn't find this invitation" | The code in the link doesn't exist. Re-copy the link from step 4. |
| "RSVPs aren't available right now" | Check the server log (Vercel: **Logs**). `PGRST202` means `DATABASE.sql` hasn't been run in this project; also check the env variables and that the Supabase project isn't paused. |
| "This invitation isn't set up yet" | The family has no rows in `invitation_events`. Add at least one event for them. |
| "Admin access is not set up" | Add `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` (12+ characters) and restart the server / redeploy. |
| "Couldn't load RSVPs" on `/admin` | The secret key is wrong or from another project, or `DATABASE.sql` hasn't been run. |
| Free Supabase project paused | Free projects pause after about a week without activity. Restore it from the dashboard. |

## Security notes

- The browser never talks to Supabase. The site's server calls two database
  functions, `get_invitation` and `submit_invitation_rsvp`, which validate
  every request: only invited events, counts between 0 and the seat limit.
- The tables can't be read or changed through the public API, so no one can
  list your guests. `add_invitation` only works from the SQL Editor.
- The admin dashboard reads the tables on the server with the secret key, only
  after checking a signed, HTTP-only session cookie set by the admin password.
- Codes are random (about 50 bits), so they cannot practically be guessed.

## Cleaning up old tables

`guests` and `parties` from earlier versions are not used anymore. If they
contain nothing you need, you can delete them in the SQL Editor (this
permanently deletes their data):

```sql
drop table if exists public.guests, public.parties;
```

## Development

```bash
npm run lint
npm run typecheck
npm run build
```
