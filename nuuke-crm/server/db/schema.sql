-- =====================================================================
--  Nuuke Mission Control — PostgreSQL schema
--
--  Every CHECK list below mirrors server/src/domain/options.js. If you add a
--  status there, add it here too and migrate; db/setup.js verifies the two
--  agree and refuses to start if they have drifted.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS activity, time_logs, leave_requests, approvals, tickets,
  releases, test_runs, bugs, milestones, updates, subtasks, tasks, sprints,
  project_members, projects, invoices, proposals, deals, leads, contacts,
  clients, users, people CASCADE;

-- ---------------------------------------------------------------- people
CREATE TABLE people (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  role_title      TEXT NOT NULL DEFAULT '',
  department      TEXT NOT NULL CHECK (department IN
                    ('Backend','iOS','Design','Android','Web','Product','DevOps','QA')),
  seniority       TEXT NOT NULL DEFAULT 'Mid' CHECK (seniority IN
                    ('Intern','Junior','Mid','Senior','Lead','Head')),
  status          TEXT NOT NULL DEFAULT 'Active' CHECK (status IN
                    ('Active','On leave','Contract','Notice')),
  capacity_hours  NUMERIC(5,1) NOT NULL DEFAULT 40 CHECK (capacity_hours >= 0 AND capacity_hours <= 80),
  location        TEXT NOT NULL DEFAULT '',
  email           TEXT UNIQUE,
  started_on      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX people_department_idx ON people (department);

-- ---------------------------------------------------------------- clients
CREATE TABLE clients (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  industry            TEXT CHECK (industry IN
                        ('Fintech','Health','Retail','Logistics','Media','Education','Real estate')),
  status              TEXT NOT NULL DEFAULT 'Onboarding' CHECK (status IN
                        ('Onboarding','Active','Paused','Churned')),
  health              TEXT NOT NULL DEFAULT 'Healthy' CHECK (health IN
                        ('Healthy','Watch','At risk','Critical')),
  account_manager_id  INTEGER REFERENCES people (id) ON DELETE SET NULL,
  arr                 NUMERIC(12,2) DEFAULT 0 CHECK (arr >= 0),
  since               DATE,
  region              TEXT NOT NULL DEFAULT '',
  nps                 SMALLINT CHECK (nps BETWEEN 0 AND 10),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_status_idx ON clients (status);

-- ---------------------------------------------------------------- users
-- A login. Staff logins point at a `people` row; client logins point at a
-- `clients` row and can never see anything outside it.
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','MEMBER','CLIENT')),
  person_id      INTEGER REFERENCES people (id) ON DELETE SET NULL,
  client_id      INTEGER REFERENCES clients (id) ON DELETE CASCADE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A CLIENT login must be tied to exactly one client and to no staff record.
  CONSTRAINT users_client_shape CHECK (
    (role = 'CLIENT' AND client_id IS NOT NULL AND person_id IS NULL)
    OR (role <> 'CLIENT' AND client_id IS NULL)
  )
);
-- Emails are compared case-insensitively without needing the citext extension.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_client_idx ON users (client_id);

-- ---------------------------------------------------------------- contacts
CREATE TABLE contacts (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  email               TEXT,
  phone               TEXT,
  is_decision_maker   BOOLEAN NOT NULL DEFAULT FALSE,
  last_touch          DATE,
  owner_id            INTEGER REFERENCES people (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contacts_client_idx ON contacts (client_id);

-- ---------------------------------------------------------------- leads
CREATE TABLE leads (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  company      TEXT NOT NULL DEFAULT '',
  stage        TEXT NOT NULL DEFAULT 'New' CHECK (stage IN
                 ('New','Contacted','Qualified','Nurture','Disqualified')),
  source       TEXT CHECK (source IN ('Referral','Inbound','Outbound','Clutch','Upwork','Event')),
  service      TEXT CHECK (service IN
                 ('iOS app','Android app','Web app','UI/UX','Backend','Maintenance','AI feature')),
  owner_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  value        NUMERIC(12,2) CHECK (value >= 0),
  received_on  DATE,
  next_step    TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_stage_idx ON leads (stage);

-- ---------------------------------------------------------------- deals
CREATE TABLE deals (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  client_id    INTEGER REFERENCES clients (id) ON DELETE SET NULL,
  stage        TEXT NOT NULL DEFAULT 'Discovery' CHECK (stage IN
                 ('Discovery','Scoping','Proposal sent','Negotiation','Won','Lost')),
  service      TEXT CHECK (service IN
                 ('iOS app','Android app','Web app','UI/UX','Backend','Maintenance','AI feature')),
  value        NUMERIC(12,2) CHECK (value >= 0),
  probability  SMALLINT CHECK (probability BETWEEN 0 AND 100),
  owner_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  close_date   DATE,
  source       TEXT CHECK (source IN ('Referral','Inbound','Outbound','Clutch','Upwork','Event')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deals_stage_idx ON deals (stage);

-- ---------------------------------------------------------------- proposals
CREATE TABLE proposals (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  client_id    INTEGER REFERENCES clients (id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN
                 ('Draft','Sent','In review','Signed','Declined')),
  amount       NUMERIC(12,2) CHECK (amount >= 0),
  owner_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  sent_on      DATE,
  valid_until  DATE,
  version      TEXT NOT NULL DEFAULT 'v1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- projects
CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  client_id   INTEGER REFERENCES clients (id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'Discovery' CHECK (status IN
                ('Discovery','Design','In development','QA','UAT','Launched','On hold')),
  health      TEXT NOT NULL DEFAULT 'Healthy' CHECK (health IN
                ('Healthy','Watch','At risk','Critical')),
  lead_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  start_on    DATE,
  end_on      DATE,
  platforms   TEXT[] NOT NULL DEFAULT '{}',
  budget      NUMERIC(12,2) CHECK (budget >= 0),
  burned      NUMERIC(12,2) CHECK (burned >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_dates CHECK (start_on IS NULL OR end_on IS NULL OR end_on >= start_on)
);
CREATE INDEX projects_client_idx ON projects (client_id);

CREATE TABLE project_members (
  project_id  INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, person_id)
);

-- ---------------------------------------------------------------- sprints
CREATE TABLE sprints (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  project_id           INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN
                         ('Planned','Active','In review','Completed')),
  goal                 TEXT NOT NULL DEFAULT '',
  start_on             DATE,
  end_on               DATE,
  committed_points     SMALLINT NOT NULL DEFAULT 0 CHECK (committed_points >= 0),
  completed_points     SMALLINT NOT NULL DEFAULT 0 CHECK (completed_points >= 0),
  scope_added_points   SMALLINT NOT NULL DEFAULT 0 CHECK (scope_added_points >= 0),
  scrum_master_id      INTEGER REFERENCES people (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sprints_dates CHECK (start_on IS NULL OR end_on IS NULL OR end_on >= start_on)
);
CREATE INDEX sprints_project_idx ON sprints (project_id);

-- ---------------------------------------------------------------- tasks
CREATE TABLE tasks (
  id              SERIAL PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  project_id      INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  sprint_id       INTEGER REFERENCES sprints (id) ON DELETE SET NULL,
  department      TEXT NOT NULL CHECK (department IN
                    ('Backend','iOS','Design','Android','Web','Product','DevOps','QA')),
  status          TEXT NOT NULL DEFAULT 'Backlog' CHECK (status IN
                    ('Backlog','To do','In progress','In review','Blocked','Done')),
  assignee_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  priority        TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Critical','High','Medium','Low')),
  type            TEXT NOT NULL DEFAULT 'Feature' CHECK (type IN
                    ('Feature','Bug','Chore','Spike','Design')),
  points          SMALLINT CHECK (points >= 0 AND points <= 100),
  start_on        DATE,
  due_on          DATE,
  estimate_hours  NUMERIC(6,1) CHECK (estimate_hours >= 0),
  logged_hours    NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (logged_hours >= 0),
  blocks          TEXT NOT NULL DEFAULT '',
  done_on         DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_idx  ON tasks (project_id);
CREATE INDEX tasks_sprint_idx   ON tasks (sprint_id);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);
CREATE INDEX tasks_status_idx   ON tasks (status);

CREATE TABLE subtasks (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subtasks_task_idx ON subtasks (task_id);

-- Comment threads. One table for every board, keyed by (entity_type, entity_id).
CREATE TABLE updates (
  id           SERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL CHECK (entity_type IN
                 ('tasks','bugs','tickets','projects','deals','clients','approvals','milestones','releases')),
  entity_id    INTEGER NOT NULL,
  author_id    INTEGER REFERENCES people (id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX updates_entity_idx ON updates (entity_type, entity_id, created_at DESC);

-- ---------------------------------------------------------------- milestones
CREATE TABLE milestones (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  project_id      INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'Upcoming' CHECK (status IN
                    ('Upcoming','At risk','Slipped','Delivered')),
  due_on          DATE,
  owner_id        INTEGER REFERENCES people (id) ON DELETE SET NULL,
  client_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX milestones_project_idx ON milestones (project_id);

-- ---------------------------------------------------------------- bugs
CREATE TABLE bugs (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  project_id   INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  severity     TEXT NOT NULL DEFAULT 'Minor' CHECK (severity IN
                 ('Blocker','Critical','Major','Minor','Trivial')),
  status       TEXT NOT NULL DEFAULT 'New' CHECK (status IN
                 ('New','Triaged','In progress','Ready for QA','Verified','Closed','Won''t fix')),
  platform     TEXT CHECK (platform IN ('iOS','Android','Web','Backend','Cross-platform')),
  department   TEXT CHECK (department IN
                 ('Backend','iOS','Design','Android','Web','Product','DevOps','QA')),
  assignee_id  INTEGER REFERENCES people (id) ON DELETE SET NULL,
  reporter_id  INTEGER REFERENCES people (id) ON DELETE SET NULL,
  found_in     TEXT NOT NULL DEFAULT '',
  reported_on  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bugs_project_idx  ON bugs (project_id);
CREATE INDEX bugs_severity_idx ON bugs (severity);

-- ---------------------------------------------------------------- test runs
CREATE TABLE test_runs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  project_id  INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'Not started' CHECK (status IN
                ('Not started','Running','Passed','Failed','Blocked')),
  platform    TEXT CHECK (platform IN ('iOS','Android','Web','Backend','Cross-platform')),
  owner_id    INTEGER REFERENCES people (id) ON DELETE SET NULL,
  cases       INTEGER NOT NULL DEFAULT 0 CHECK (cases >= 0),
  passed      INTEGER NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed      INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  coverage    SMALLINT CHECK (coverage BETWEEN 0 AND 100),
  run_on      DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT test_runs_counts CHECK (passed + failed <= cases)
);

-- ---------------------------------------------------------------- releases
CREATE TABLE releases (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  project_id     INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'Planning' CHECK (status IN
                   ('Planning','Building','In QA','Submitted','In review','Live','Rejected')),
  platform       TEXT CHECK (platform IN ('iOS','Android','Web','Backend','Cross-platform')),
  build          TEXT NOT NULL DEFAULT '',
  owner_id       INTEGER REFERENCES people (id) ON DELETE SET NULL,
  code_freeze_on DATE,
  target_on      DATE,
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX releases_project_idx ON releases (project_id);

-- ---------------------------------------------------------------- support
CREATE TABLE tickets (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  subject      TEXT NOT NULL,
  client_id    INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'New' CHECK (status IN
                 ('New','Open','Pending client','Escalated','Resolved','Closed')),
  priority     TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Critical','High','Medium','Low')),
  assignee_id  INTEGER REFERENCES people (id) ON DELETE SET NULL,
  channel      TEXT CHECK (channel IN ('Portal','Email','Slack','Phone')),
  opened_on    DATE,
  sla_due_at   TIMESTAMPTZ,
  first_reply  TEXT NOT NULL DEFAULT '',
  csat         SMALLINT CHECK (csat BETWEEN 1 AND 5),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_client_idx ON tickets (client_id);
CREATE INDEX tickets_status_idx ON tickets (status);

-- ---------------------------------------------------------------- approvals
CREATE TABLE approvals (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  project_id  INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'Awaiting client' CHECK (status IN
                ('Awaiting client','Changes requested','Approved')),
  owner_id    INTEGER REFERENCES people (id) ON DELETE SET NULL,
  sent_on     DATE,
  due_on      DATE,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX approvals_project_idx ON approvals (project_id);

-- ---------------------------------------------------------------- invoices
CREATE TABLE invoices (
  id          SERIAL PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  client_id   INTEGER NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','Paid','Overdue')),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  issued_on   DATE,
  due_on      DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoices_client_idx ON invoices (client_id);

-- ---------------------------------------------------------------- people ops
CREATE TABLE leave_requests (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  person_id  INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('Annual','Sick','Public holiday','Unpaid')),
  status     TEXT NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested','Approved','Declined')),
  start_on   DATE NOT NULL,
  end_on     DATE NOT NULL,
  days       SMALLINT CHECK (days >= 0),
  cover_id   INTEGER REFERENCES people (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates CHECK (end_on >= start_on)
);
CREATE INDEX leave_person_idx ON leave_requests (person_id);

CREATE TABLE time_logs (
  id          SERIAL PRIMARY KEY,
  note        TEXT NOT NULL DEFAULT '',
  person_id   INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  task_id     INTEGER REFERENCES tasks (id) ON DELETE SET NULL,
  department  TEXT CHECK (department IN
                ('Backend','iOS','Design','Android','Web','Product','DevOps','QA')),
  logged_on   DATE NOT NULL,
  hours       NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  billable    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX time_logs_person_idx ON time_logs (person_id, logged_on DESC);

-- ---------------------------------------------------------------- activity
CREATE TABLE activity (
  id           SERIAL PRIMARY KEY,
  actor_id     INTEGER REFERENCES people (id) ON DELETE SET NULL,
  text         TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_created_idx ON activity (created_at DESC);

-- ---------------------------------------------------------------- updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['people','clients','users','contacts','leads','deals','proposals',
                           'projects','sprints','tasks','milestones','bugs','test_runs','releases',
                           'tickets','approvals','invoices','leave_requests','time_logs']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t, t);
  END LOOP;
END $$;

COMMIT;
