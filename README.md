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
  - **Card:** name, emails, platform, service, date, query details, old notes from the sheet, and call history.
    - **Phone numbers:** each number gets its own **Copy** and **Call** button, so a lead with two or three numbers is dialled one number at a time in Zoom Phone.
    - **Edit:** fixes any detail, or adds numbers. The change is written on the lead's history.
  - **Message ideas:** texts for Zoom Phone, emails (with **Open in email**) and a call opener, written from what the client wrote.
    - **The query comes first.** NUUKE reads the part the client typed (on Bark, the text under *Message*) and picks out the details they gave: their brand or business name, their website, a book, podcast or event and when it comes out, what they already have ("I have the content") and what they need help with.
      - Those details are written into every message. A card for someone launching *Healing Heart Co.* and a book called *Dear Healing Heart* opens with: "It was for Healing Heart Co., your brand, and also your book, Dear Healing Heart. Did the book come out on May 5 like you planned?"
      - A **What they told us** strip shows the details it found, so the rep can check it read the query right.
    - Only when there's no query are the messages written from the service they picked.
    - They follow current cold-outreach practice: give the reason for calling, acknowledge the flood of calls marketplace leads get, ask one easy question about *their* thing, and end with a no-pressure break-up message.
    - Plain punctuation only: no long dashes, which read as machine-written.
    - The messages that suit the current follow-up are highlighted.
    - Everything can be edited before copying. Do not call leads get no messages.
  - **My quick messages:** each rep writes and saves their own messages (only they can see them) and copies them onto any lead. `{first name}`, `{my name}`, `{company}` and `{service}` are filled in for the lead on screen.
  - **Logging:** a status dropdown, one-tap shortcuts, notes, then **Done** or **Skip**. Every action is logged.
  - **Coming back:** after every call the client comes back to the same dialer **2 days later** (days off are skipped), however many calls it takes. No answer, voicemail, not interested, wrong person and number not valid all come back.
    - Only **Do not call**, a **meeting set** (and anything after it), or a **won** deal take a client off the cards.
    - A call-back at a time the dialer picks comes back at that time.
  - **One client, one card:** the queue shows due call-backs first, then new numbers and 2-day repeats shuffled together (a new shuffle each day). The same client is never shown twice in a session.
    - Do not call with any dialer takes that client off every dialer's cards.
    - When one dialer sets a meeting, the other dialers holding the same client stop calling them.
  - **Booking a meeting:** the client's time zone is guessed from their area code. The rep types the time the client agreed to, and NUUKE shows Pakistan time next to it. The rep can also:
    - pick a technical manager
    - add the meeting link
    - paste the call transcript
    - add the client's website, socials and notes for the technical manager
  - **Progress:** a 250-a-day progress bar, a session timer, and a celebration at target.
- **My leads:** search and filter every assigned lead; tap one to open its card iOS-style and log a call.
- **Pipeline:** drag-and-drop Kanban (Prospect → Meeting → Proposal → Negotiation → Won/Lost) with values, likelihood, next steps and expected close dates.
- **Meetings:** a week strip, upcoming meetings, one tap to mark held, no-show or cancelled, and **Edit** to reschedule or change anything. The technical manager is told.
- **Call log:** everything they've done, by day.
- **Analytics:** dials, pick-up rate, prospects, meetings, closed amounts, funnel, outcome mix, forecast, and a projection to pay day.
- **Leaderboard:** live podium by appointments, closed $, prospects, dials or connects. Totals only.

**Everyone on the team: Mini Games**
- Tic-Tac-Toe, Checkers, Chess and Ludo (2 to 4 players), in simple 2D.
- **Break time only.** The games unlock when you start a break and lock again when it ends.
  - Admins, and anyone whose attendance isn't tracked, have no breaks, so they can play any time.
- **Invite anyone.** People free to play right now are listed first. Everyone else gets a notification and can join on their break.
- Games wait between breaks: a move only counts while you're on a break, so a chess game can run over several days.
- The database checks every move: whose turn it is, that you're on a break, and that nobody moved in between. It also rolls the Ludo dice, so nobody picks their own number.
- Invites nobody answers lapse after 3 hours; a game nobody touches for a week ends.

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
  - Each client is imported once: a client who appears twice in the sheet becomes one card, and a dialer is never given a client they already have. Clients marked Do not call, or with a meeting set, are never handed out again. Blank rows are dropped.
  - Leads can go to one rep, be split evenly (every client to one rep), or follow the sheet's *Assigned to* column. Giving someone the whole sheet a second time only adds what they're missing.
  - A client is matched by phone number (last ten digits), else personal email, else work email, else an identical row.
  - 10,000 rows take about 2 seconds.
  - Then filter, bulk-assign, recycle or delete.
  - **Remove repeats:** one click leaves each dialer one card per client, and each client with one dialer, except the dialers you mark as having the whole sheet. Call history, meetings and deals move onto the card that stays. Preview first; nothing changes until you press Remove.
- **Meetings calendar:** every meeting the team booked, in Week, Month or List view.
  - Each meeting is coloured by the client's time zone, with the client's own time shown next to it.
  - Times can be shown in Pakistan, Eastern, Central, Mountain, Pacific or UK time.
  - Filter by rep, technical manager or time zone. See which upcoming meetings have no technical manager yet.
- **Projects:** create a project, choose its team and project lead, and add the client's login (or create one on the spot). Edit, mark delivered or archive it later. A **client messages** inbox shows the latest from every client.
- **Team & access:** create logins, set role, salary in PKR, shift time and length, working days, dial and dollar targets; reset passwords; switch logins off; mark people as **technical managers**.

**Technical managers** (any staff member the admin marks)
- **Client meetings:** the meetings they've been put on, as a calendar and an "Up next" list.
- **Prep sheet:** each meeting shows the lead's numbers, emails and query, plus everything the rep added: website, socials, notes and the call transcript.
- **Alerts:** they're notified when a meeting is booked, moved or cancelled, and 15 minutes before it starts. Production staff also see these meetings on their calendar.
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
| Follow-ups | the next working day, up to 4 calls, then the lead rests |
| Recycling | every closed lead except *Do not call* (and *Won*) returns to the same rep after 2 days for a new round |

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

`node scripts/check-rules.mjs` signs in as different people and checks 117 permission and business rules.
For example:
- a rep cannot see a colleague's leads or pay
- a client never sees internal tasks, files, or another client's project
- only the client can approve a deliverable
- a rep can only edit their own leads
- a technical manager sees only their own meetings and those leads
- Do not call never comes back

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
For example:
- `20261001001000_projects.sql` adds projects, the client portal and file storage.
- `20261005000100_dialer_meetings.sql` adds lead editing, meeting time zones, technical managers and recycling.
- `20261005000200_quick_messages_games.sql` adds quick messages and Mini Games.
- `20261005000300_games_untracked_anytime.sql` lets people whose attendance isn't tracked play any time.
- `20261006000100_one_client_one_dialer.sql` brings every client back every 2 days until Do not call or a meeting, one card per client, Remove repeats, and imports without repeats.

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
  …20261005_dialer…    lead editing, meeting time zones & prep, technical managers, recycling
  …20261005_quick_…    reps' quick messages; mini games (break-time rules, turns, dice)
  …20261006_one_client one client one card: 2-day repeats, Do not call/meeting for everyone, Remove repeats
netlify/functions/     admin-users: create logins, reset passwords, switch access
scripts/               seed.mjs + seed-projects.mjs (demo data), check-rules.mjs (permission tests)
src/agent/             the agent artwork and wardrobe catalogue
src/ui/                glass UI kit, charts, toasts
src/shell/             sidebar, tab bar, shift clock, notifications
src/sales/             the lead card, outcome form, message ideas (outreach.ts reads the query), quick messages, meeting calendar & prep sheet
src/games/             Tic-Tac-Toe, Checkers, Chess and Ludo rules, and their boards
src/lib/               phones.ts (splitting numbers), timezones.ts (client time zones)
src/projects/          the project page: board, sprints, calendars, files & review viewer, messages
src/pages/             sales/, admin/, work/ (production), portal/ (clients), me/ and shared pages
```
