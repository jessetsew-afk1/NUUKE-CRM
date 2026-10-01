# NUUKE

The studio's CRM: a one-card-at-a-time dialer for sales, a project workspace for production,
a portal for clients, attendance and payroll for everyone, an admin control room, and a little
agent for every person who signs in.

- React + TypeScript + Vite, Tailwind, Framer Motion, glass "aurora" design with light and dark themes
- Supabase: Postgres, sign-in, live notifications and scheduled jobs. Every permission is enforced
  in the database with row level security, not just hidden in the app.
- Netlify: hosts the app plus one small function that creates logins

---

## What each person gets

**Sales reps**
- **Dialer.** Filter by service, platform and enquiry date, press **Start**, and work one card at a time.
  - **Card:** name, emails, phone with **Copy** and **Call in Zoom**, platform, service, date, query details, old notes from the sheet, and call history.
  - **Logging:** a status dropdown, one-tap shortcuts, notes, then **Done** or **Skip**. Every action is logged.
  - **Follow-ups:** a lead nobody picks up comes back on the next shift as follow-up 2 of 4, and so on. *Do not call*, *Number not valid* and the other closing statuses take it out of the queue.
  - **Progress:** a 250-a-day progress bar, a session timer, and a celebration at target.
- **My leads:** search and filter every assigned lead; tap one to open its card iOS-style and log a call.
- **Pipeline:** drag-and-drop Kanban (Prospect → Meeting → Proposal → Negotiation → Won/Lost) with values, likelihood, next steps and expected close dates.
- **Meetings:** a week strip, upcoming meetings, and one tap to mark held, no-show or cancelled.
- **Call log:** everything they've done, by day.
- **Analytics:** dials, pick-up rate, prospects, meetings, closed amounts, funnel, outcome mix, forecast, and a projection to pay day.
- **Leaderboard:** live podium by appointments, closed $, prospects, dials or connects. Totals only.

**Production (developers, designers, marketing)**
- **My workspace:** today's tasks (overdue, today, this week) with tick-to-finish, team progress for the week, what's coming up, and every project they're on. Nobody sees a project they haven't been added to.
- **Each project has:**
  - **Board:** a drag-and-drop Kanban (Backlog → To do → In progress → In review → Done), or a Monday-style **table** with colour status cells. Filter by sprint, person or search; quick-add right in a column.
  - **Tasks:** owner, priority, due date, labels, sprint, comments, and an **internal** switch to hide a task from the client.
  - **Sprints:** plan, start and finish sprints, with a live burndown. Unfinished work rolls into the next sprint or the backlog.
  - **Calendar:** meetings, milestones, deadlines and launches, plus task due dates and sprint starts and ends.
  - **Content calendar:** social posts for every platform, moved from idea → drafting → ready → scheduled → posted, with the creative attached.
  - **Files:** upload wireframes, designs, documents and videos (up to 50 MB), or add Figma, Google Docs, YouTube or Loom links that play inside NUUKE. Upload new versions; send any file to the client for review.
  - **Team** and **Messages** with the client.
- **My tasks** and **Calendar** pages across all their projects.

**Clients**
- They sign in and see only their own project. If they have more than one, they switch from the top.
- **The big red dot:** when the team shares something for review, the client gets a red **Review now** alert in the app, in their notifications and on the project.
  - **Pinned comments:** they click anywhere on a design to pin a comment.
  - **Decision:** they **Approve** or **Ask for changes**, and the team is told instantly. Reminders go out if it waits more than two days.
- They see the team, progress, sprints, the board, both calendars and a live activity feed, but only what the team has marked as visible to them.
- **Messages** go straight to the team, and admins are alerted.

**Everyone on staff**
- **Shift clock:** signing in starts the shift timer; **Sign out** ends it. A break button counts down the one-hour allowance.
- **Pay & attendance:** an estimated payslip with every deduction explained, plus an attendance calendar for the 20th–20th period.
- **My agent:** dress up your agent. Items: 12 skin tones, 11 hairstyles including hijab, 11 headwear options, 9 outfits including kurta, glasses, sidekick pets and backdrops. Rare items unlock by hitting milestones.

**Admin**
- **Overview:** who's online, on break, late or missing; today's floor numbers; alerts; top closers; lead health; payroll estimate.
- **Leads & import:** upload the Google Sheet as CSV or Excel.
  - Columns are matched automatically and dates are read correctly.
  - Every row is kept, repeats included; only blank rows (no name, phone or email) are dropped. Skipping numbers already in NUUKE is an optional tick box.
  - Leads can go to one rep, be split evenly, or follow the sheet's *Assigned to* column.
  - 10,000 rows take about 2 seconds.
  - Then filter, bulk-assign, recycle or delete.
- **Projects:** create a project, choose its team and project lead, and add the client's login (or create one on the spot). Edit, mark delivered or archive it later. A **client messages** inbox shows the latest from every client.
- **Team & access:** create logins, set role, salary in PKR, shift time and length, working days, dial and dollar targets; reset passwords; switch logins off.
- **Attendance:** a live board for any day, with each person's calendar, and day corrections (leave, holiday, forgiven late) with a note.
- **Payroll:** each period's salaries, deductions, tiers and commission; full payslips; CSV export; **Release** to freeze a period and notify everyone.
- **Activity log:** every change and every sign-in or sign-out.
- **Rules & settings:** every threshold below is editable, plus holidays.

### The rules (all editable)

| | |
|---|---|
| Late by under 15 min | on time |
| 15–45 min | **short day**: first one in a period is a warning, each after deducts a day |
| 45–90 min | **half day**: first one deducts half a day, each after deducts a day |
| Over 90 min, or not in | absent: one day deducted |
| Break | 1 hour within the 9-hour shift; alerts if exceeded |
| Forgot to sign out | reminder at shift end, automatic sign-out an hour later, admin told |
| No-show | admin and person told 30 min after shift start |
| Pay period | 20th to the 19th; a day's pay = salary ÷ scheduled working days |
| Sales ≤ 30% of target | 30% of salary |
| 30%–100% | full salary |
| ≥ 100% | full salary + 25% commission on the period's closings (USD → PKR at the set rate) |
| Follow-ups | the next working day, up to 4 calls, then the lead is *exhausted* (admin can recycle) |

---

## Running it on your computer

You need Node 20+, Docker Desktop and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start          # local Postgres + Auth + API in Docker
npm run seed            # demo studio: 9 staff, 2 clients, 15,000 leads, 4 projects, six weeks of history
npm run dev             # http://localhost:5173
```

Copy `.env.example` to `.env.local` and fill it from the output of `supabase start`
(API URL, publishable key, secret key), plus
`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` for the seed.

Demo logins (password `NuukeDemo!2026`):

| | |
|---|---|
| Admin | `admin@nuuke.test` |
| Sales | `zoya@nuuke.test`, `hamza@nuuke.test`, `sana@nuuke.test`, `bilal@nuuke.test`, `mehak@nuuke.test` |
| Production | `faisal@nuuke.test`, `ayesha@nuuke.test`, `umar@nuuke.test` |
| Clients | `sarah@halcyon.test` (two projects), `leo@brightbrew.test` |

`node scripts/check-rules.mjs` signs in as different people and checks 63 permission and business rules.
For example:
- a rep cannot see a colleague's leads or pay
- a client never sees internal tasks, files, or another client's project
- only the client can approve a deliverable

---

## Putting it online (Supabase + Netlify)

Supabase is needed: it is the database, the logins and the scheduled jobs. The free plan works
to start. Free projects pause after a week with no visits, so move to Pro ($25/month) once the team relies on it.

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com). Pick the Mumbai or Singapore region (closest to Pakistan).
2. **Database → Extensions:** turn on **pg_cron** (it runs the attendance and meeting jobs every five minutes).
3. Load the database. Either:
   - with the CLI: `supabase link --project-ref <your-ref>` then `supabase db push`, **or**
   - in **SQL Editor → New query**, paste all of `supabase/setup-all.sql` (every migration in one file) and press **Run**.
4. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up".
   Only the admin creates logins. You can also turn off "Confirm email".
5. **Authentication → URL Configuration:** set **Site URL** to your Netlify address.
6. Create yourself: **Authentication → Users → Add user** (your email and a password), then in **SQL Editor**:
   ```sql
   select public.bootstrap_admin('you@yourcompany.com', 'Your Name');
   ```
7. **Project Settings → API Keys:** keep the **Project URL**, the **publishable** key and the **secret** key for the next step.

### 2. Netlify
1. **Add new site → Import from Git →** this repository. Build settings come from `netlify.toml`.
2. **Site configuration → Environment variables:**

   | Variable | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SECRET_KEY` | secret key. **Never** prefix this one with `VITE_` |

3. Deploy. Sign in with the admin you created and add your team from **Team & access**.
4. Custom domain: **Domain management → Add a domain**, then update the Supabase Site URL to match.

**File storage.** Wireframes, designs and documents live in Supabase Storage, in a private
`project-files` bucket that the database setup creates. It's part of the same project, so
there's nothing extra to sign up for. The free plan includes 1 GB, and Pro includes 100 GB.

### Already live? Adding new parts
When an update adds a new file to `supabase/migrations/`, run **only that file** in
**SQL Editor → New query**: open it on GitHub, use **Copy raw file**, paste it in, then press **Run**.
For example, `20261001001000_projects.sql` adds projects, the client portal and file storage.

---

## Code map

```
supabase/migrations/   the whole backend: tables, permissions, rules, jobs
  …100_core            people, roles, settings, notifications, audit log
  …200_attendance      shifts, breaks, lateness, automatic sign-out sweep
  …300_sales           leads, the dialer queue, outcomes, pipeline, meetings, stats, import
  …400_payroll         20th–20th periods, deductions, sales tiers, release
  …500_agents          earnable wardrobe items
  …600_admin           admin helpers
  …700_tracking_start  attendance counts from the go-live date
  …800_import_keep_…   lead import keeps repeats, drops blank rows
  …900_schedule        pg_cron + live notifications
  …1000_projects       projects, sprints, tasks, files & reviews, calendars, messages, storage
netlify/functions/     admin-users: create logins, reset passwords, switch access
scripts/               seed.mjs + seed-projects.mjs (demo data), check-rules.mjs (permission tests)
src/agent/             the agent artwork and wardrobe catalogue
src/ui/                glass UI kit, charts, toasts
src/shell/             sidebar, tab bar, shift clock, notifications
src/projects/          the project page: board, sprints, calendars, files & review viewer, messages
src/pages/             sales/, admin/, work/ (production), portal/ (clients), me/ and shared pages
```
