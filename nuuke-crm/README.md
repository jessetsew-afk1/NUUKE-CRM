# Nuuke Mission Control

Client and delivery operations for an app development studio — sales pipeline, projects,
sprints, squads, QA, releases, support, and a client-facing portal.

React + Vite on the front, Express + PostgreSQL on the back, Zod validating every write on
both sides, React Hook Form driving the forms, React Router handling the routes.

---

## The four parties

Access is decided on the server. The React app hides what a role cannot use, but hiding is
only cosmetic — every request is checked again in `server/src/domain/resources.js` and, for
clients, in the SQL itself.

| | **ADMIN** | **MANAGER** | **MEMBER** | **CLIENT** |
|---|---|---|---|---|
| Who | Owner (Aris) | Delivery & sales leads | Engineers, designers, QA | The client's own people |
| Delivery boards | full | full | read all, write own rows | — |
| Pipeline, proposals, invoices | full | read + write (invoices read-only) | **no access at all** | — |
| Team, capacity, leave | full | full | read; own leave and time | — |
| Logins & roles | full | — | — | — |
| Delete | anything | most boards | own time logs only | — |
| Portal | preview any account | preview any account | — | **their own account only** |

Three things are worth being precise about:

**The commercial wall.** A member does not get a filtered view of the pipeline — `GET /api/deals`
returns `403` for them. Leads, deals, proposals and invoices are absent from the response, not
hidden in the interface.

**Own-row writes.** A member may move their own ticket to *In review*; the same request against
a colleague's ticket returns `403`. The rule lives in `assertMemberMayWrite()` in
`server/src/lib/crud.js` and reads the row from the database before deciding.

**Client isolation.** A client login cannot reach a single board route. `/api/portal` is the
only surface it can touch, and every statement in `server/src/routes/portal.js` filters on the
account id taken from the session — never from the request. There is no filter parameter to
tamper with. Costs, budgets, staff names, defects and backlog tickets are not filtered out of
the portal response; they are never selected.

---

## Running it locally

You need Node 18+ and PostgreSQL 14+.

```bash
# 1. install
npm install                 # root (concurrently, for the dev script)
npm run install:all         # server + client

# 2. database
createdb nuuke_crm
cp server/.env.example server/.env
#    edit DATABASE_URL and set a real JWT_SECRET:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run db:setup            # creates the schema (drops existing tables — it asks first)
npm run db:seed             # loads a full studio: 21 people, 9 accounts, 79 tickets…

# 3. run
npm run dev                 # API on :4000, app on :5173
```

Open <http://localhost:5173>. The seed prints the logins; the password is whatever you set as
`SEED_PASSWORD`.

| Role | Email |
|---|---|
| ADMIN | `aris@nuuke.studio` |
| MANAGER | `maryam@nuuke.studio` |
| MEMBER | `zoya@nuuke.studio` |
| CLIENT | `portal@halcyonhealth.co.uk` |

Every seeded person has a login at `<firstname>@nuuke.studio`, and every active account has a
portal login. **Change all of them before this touches real data.**

---

## Project layout

```
nuuke-crm/
├── server/
│   ├── db/
│   │   ├── schema.sql          # the whole schema, readable and psql-able
│   │   ├── setup.js            # applies it, and refuses if options.js has drifted from it
│   │   └── seed.js             # the sample studio, dated relative to the day you run it
│   └── src/
│       ├── env.js              # Zod-validated configuration; refuses to boot if wrong
│       ├── db.js               # pg pool, date/numeric parsers, transaction helper
│       ├── app.js              # middleware order and route mounting
│       ├── domain/
│       │   ├── options.js      # every enumerated value — the single source of truth
│       │   └── resources.js    # the permission table above, in code
│       ├── schemas/            # Zod schemas for every write
│       ├── middleware/         # auth, validation, error translation
│       ├── lib/crud.js         # the generic board router
│       └── routes/             # auth, users, meta, nested (comments/checklists),
│                               # insights (dashboard/capacity/burndown), portal
└── client/
    └── src/
        ├── api/client.js       # fetch wrapper; unwraps { data }, carries field errors
        ├── context/            # auth, meta (options + permissions), data cache, toasts
        ├── boards/             # boardConfig.js + table / kanban / timeline / chart views
        ├── components/         # shell, drawer, menus, charts, pills, avatars
        ├── pages/              # login, my work, dashboard, board, squads, capacity,
        │                       # roadmap, portal, users, account
        └── styles/global.css   # the design tokens and every component style
```

### Two ideas hold the codebase together

**One board engine.** `client/src/boards/boardConfig.js` describes all eighteen boards as data —
columns, types, widths, which views to offer, what to group by. `BoardPage` reads that and
renders table, kanban, timeline or charts from it. Adding a board is a config entry plus a Zod
schema plus a table; no new components.

**One list of options.** `server/src/domain/options.js` holds every status, priority, severity
and squad, with its colour. The API validates against it, `db/setup.js` checks the SQL `CHECK`
constraints match it, and the client fetches it from `GET /api/meta`. A new status is one edit
and a migration, and the interface can never offer a value the database would reject.

---

## API

All routes are under `/api`, authenticated with an httpOnly session cookie.

```
POST   /auth/login            { email, password }
POST   /auth/logout
GET    /auth/me
POST   /auth/change-password  { currentPassword, newPassword }

GET    /meta                  option lists + this role's permissions

GET    /:board                list        ← leads deals clients contacts proposals invoices
POST   /:board                create         projects sprints tasks milestones people
GET    /:board/:id            read one       time_logs leave_requests bugs test_runs
PATCH  /:board/:id            update         releases tickets approvals
DELETE /:board/:id            delete

GET    /:board/:id/updates    comment thread
POST   /:board/:id/updates    { body }
GET    /:board/:id/subtasks   checklist (tasks)
POST   /:board/:id/subtasks   { text }
PATCH  /:board/:id/subtasks/:subtaskId

GET    /insights/activity     the shared feed
GET    /insights/dashboard    company figures (commercial keys omitted for MEMBER)
GET    /insights/capacity     allocation per person per week   (ADMIN, MANAGER)
GET    /insights/burndown/:sprintId

GET    /users                 logins                            (ADMIN)
POST   /users
PATCH  /users/:id
DELETE /users/:id

GET    /portal/accounts       accounts to preview               (ADMIN, MANAGER)
GET    /portal/overview       everything the portal shows
POST   /portal/approvals/:id/respond  { decision }
POST   /portal/tickets        { subject, priority }
```

Errors come back as `{ error, fields? }`. `fields` maps a field name to a message, which the
forms show next to the input that caused it.

---

## Deploying

The app and API are independent; the simplest arrangement is to serve both from one domain so
the session cookie stays same-origin.

**API** — anywhere that runs Node and reaches Postgres (Render, Railway, Fly, a VPS):

```bash
cd server
npm ci --omit=dev
NODE_ENV=production PORT=4000 node src/index.js
```

Set `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, and `PGSSLMODE=require` if your provider
needs TLS (Neon, Supabase, RDS all do). Run `npm run db:setup` once against the production
database; run the seed only if you want the sample data.

**App** — a static bundle:

```bash
cd client
npm ci && npm run build      # → client/dist
```

Serve `dist` from Nginx, Netlify, Vercel or the same box, with `/api` proxied to the server.
An Nginx sketch:

```nginx
location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; }
location /     { root /var/www/nuuke/dist; try_files $uri /index.html; }
```

If you must put them on separate domains, set `VITE_API_URL` at build time and `CLIENT_ORIGIN`
on the server — CORS is already configured with credentials.

### Before it goes live

- Replace `JWT_SECRET` with 48 random bytes and keep it out of version control.
- Change every seeded password, or delete the seeded logins and create your own.
- Put the API behind HTTPS. Cookies are set `secure` and `sameSite=strict` when
  `NODE_ENV=production`, which means they will not be sent over plain HTTP.
- Take backups. `pg_dump` on a schedule is enough to start with.
- The login route is rate limited to 20 attempts per IP per 15 minutes; the rest of the API to
  600 requests a minute. Raise or lower these in `server/src/app.js`.

---

## Extending it

**A new board.** Add the table to `schema.sql`, a Zod schema to `server/src/schemas/index.js`,
an entry to `server/src/domain/resources.js` (who may read, write, delete), and a config block
in `client/src/boards/boardConfig.js`. Then add it to `SECTIONS` in `AppShell.jsx` so it
appears in the navigation.

**A new status.** Add it to `server/src/domain/options.js` with a colour, add it to the
matching `CHECK` constraint in `schema.sql`, migrate. `db/setup.js` fails loudly if you forget
the second step.

**A new role.** Add it to the `users.role` CHECK constraint, to `ROLES` in `options.js`, and to
the read/write/delete arrays in `resources.js`. The client picks it up from `/api/meta`.

**Email, file uploads, Slack.** None are wired in. The natural hooks are `logActivity()` in
`server/src/lib/activity.js` for notifications, and the `updates` table for anything that
should hang off a thread.
