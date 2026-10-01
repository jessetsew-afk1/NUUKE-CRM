-- =============================================================================
-- NUUKE — the whole database in one file.
-- Paste all of this into Supabase → SQL Editor → New query, then press Run.
-- Run it once, on a new empty project. (Generated from supabase/migrations/.)
-- =============================================================================

-- >>> 20261001000100_core.sql
-- =============================================================================
-- NUUKE CRM — core: people, roles, settings, notifications, audit trail
--
-- Every permission in this app is enforced here, in Postgres, with row level
-- security. The React app hides what a role cannot use, but the browser talks to
-- the database directly through Supabase, so the database is the only place a
-- rule can actually be trusted.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Roles
--   admin       the owner and anyone trusted with everything
--   sales       reps working the dialer and their own pipeline
--   production  developers, designers, marketing (phase 3)
--   client      portal users, scoped to their own projects (phase 4)
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'sales', 'production', 'client');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        public.app_role not null,
  department  text,             -- sales | development | design | marketing | management
  title       text,
  phone       text,
  avatar      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.avatar is
  'The person''s agent: {"skin":"s3","hair":"bob",...}. Items marked locked in agent_locked_items must be unlocked first.';

-- Pay, shift and targets live apart from the profile so that colleagues can see
-- each other''s names and agents without ever seeing each other''s salary.
create table public.employment (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  monthly_salary_pkr  numeric(12, 2) not null default 0 check (monthly_salary_pkr >= 0),
  tracks_attendance   boolean not null default true,
  shift_start         time not null default '09:00',
  shift_minutes       int not null default 540 check (shift_minutes between 60 and 960),
  work_days           smallint[] not null default '{1,2,3,4,5}',  -- ISO weekday, 1 = Monday
  daily_dial_target   int not null default 250 check (daily_dial_target >= 0),
  monthly_target_usd  numeric(12, 2) not null default 0 check (monthly_target_usd >= 0),
  joined_on           date,
  updated_at          timestamptz not null default now()
);

-- One row of company-wide rules. The admin edits these from Settings.
create table public.settings (
  id                            boolean primary key default true check (id),
  company_name                  text not null default 'NUUKE',
  timezone                      text not null default 'Asia/Karachi',
  -- attendance
  grace_minutes                 int not null default 15,   -- later than this is a short day
  short_day_max_minutes         int not null default 45,   -- up to this is a short day
  half_day_max_minutes          int not null default 90,   -- up to this is a half day; later is absent
  free_short_days               int not null default 1,    -- short days per period that only warn
  reduced_half_days             int not null default 1,    -- half days per period paid at half
  break_allowance_minutes       int not null default 60,
  signout_grace_minutes         int not null default 60,   -- auto sign-out this long after the reminder
  absent_alert_minutes          int not null default 30,   -- tell the admin when someone has not signed in
  -- payroll
  payroll_cutoff_day            int not null default 20 check (payroll_cutoff_day between 1 and 28),
  daily_rate_basis              text not null default 'working_days' check (daily_rate_basis in ('working_days', 'calendar_30')),
  usd_to_pkr                    numeric(10, 2) not null default 280 check (usd_to_pkr > 0),
  low_performance_ratio         numeric(5, 4) not null default 0.30,
  low_performance_salary_factor numeric(5, 4) not null default 0.30,
  commission_rate               numeric(5, 4) not null default 0.25,
  -- sales
  followup_gap_days             int not null default 1 check (followup_gap_days between 0 and 14),
  max_attempts                  int not null default 4 check (max_attempts between 1 and 12),
  default_daily_dials           int not null default 250,
  updated_at                    timestamptz not null default now()
);
insert into public.settings default values;

create table public.holidays (
  day   date primary key,
  name  text not null
);

-- -----------------------------------------------------------------------------
-- Who is asking?
-- security definer so policies can call them without recursing into profiles'
-- own policies.
-- -----------------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and is_active), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role in ('admin', 'sales', 'production') from public.profiles
                    where id = auth.uid() and is_active), false)
$$;

create or replace function public.app_tz()
returns text
language sql stable security definer set search_path = public
as $$ select timezone from public.settings limit 1 $$;

-- "Today" in the company's timezone, not the database server's.
create or replace function public.local_today()
returns date
language sql stable
as $$ select (now() at time zone public.app_tz())::date $$;

-- -----------------------------------------------------------------------------
-- Notifications — every in-app alert for every party.
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  tone        text not null default 'info' check (tone in ('info', 'success', 'warning', 'danger', 'celebrate')),
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_recent on public.notifications (user_id, created_at desc);
create index notifications_user_unread on public.notifications (user_id) where read_at is null;

create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_tone text default 'info', p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  values (p_user, p_kind, p_title, p_body, p_link, p_tone, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function public.notify_admins(
  p_kind text, p_title text, p_body text default null,
  p_link text default null, p_tone text default 'info', p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select id, p_kind, p_title, p_body, p_link, p_tone, coalesce(p_data, '{}'::jsonb)
    from public.profiles where role = 'admin' and is_active
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void
language sql security definer set search_path = public
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids))
$$;

-- -----------------------------------------------------------------------------
-- Audit trail — who changed what, and when. Admin only.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  summary     text,
  changes     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_recent on public.audit_log (created_at desc);
create index audit_log_actor on public.audit_log (actor_id, created_at desc);
create index audit_log_entity on public.audit_log (entity, entity_id);

create or replace function public.audit(
  p_action text, p_entity text, p_entity_id text, p_summary text, p_changes jsonb default null
) returns void
language sql security definer set search_path = public
as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, summary, changes)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_summary, p_changes)
$$;

-- Generic row trigger: records inserts, deletes, and the columns an update changed.
create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_id text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key not in ('updated_at') and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id', v_new ->> 'day', v_old ->> 'day');

  insert into public.audit_log (actor_id, action, entity, entity_id, summary, changes)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, null, v_changes);

  return coalesce(new, old);
end
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Sign-ins — "when they visited, when they did not"
-- -----------------------------------------------------------------------------
create table public.login_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('login', 'logout', 'resume')),
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index login_events_user on public.login_events (user_id, created_at desc);

create or replace function public.record_login(p_kind text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  -- A page refresh is not a visit; keep at most one "resume" every 30 minutes.
  if p_kind = 'resume' and exists (
    select 1 from public.login_events
     where user_id = auth.uid() and created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into public.login_events (user_id, kind, user_agent)
  values (auth.uid(), p_kind, left(p_user_agent, 300));
end
$$;

-- -----------------------------------------------------------------------------
-- Profile guard: people may change their own name, phone and agent; only an
-- admin changes role, email, department, title or whether the login works.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- auth.uid() is null for the service role (the admin-users function) and for SQL run
  -- from the dashboard; both are trusted.
  if auth.uid() is not null and not public.is_admin() then
    if new.id <> auth.uid() then
      raise exception 'You can only change your own profile' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.department is distinct from old.department
       or new.title is distinct from old.title
       or new.is_active is distinct from old.is_active then
      raise exception 'Only an admin can change that' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create trigger employment_touch before update on public.employment
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

create trigger profiles_audit after insert or delete or update of email, full_name, role, department, title, phone, is_active
  on public.profiles for each row execute function public.audit_row();
create trigger employment_audit after insert or update or delete on public.employment
  for each row execute function public.audit_row();
create trigger settings_audit after update on public.settings
  for each row execute function public.audit_row();
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.employment    enable row level security;
alter table public.settings      enable row level security;
alter table public.holidays      enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log     enable row level security;
alter table public.login_events  enable row level security;

-- Staff see every colleague's name and agent (the leaderboard needs it). Clients see
-- themselves here; the portal phase adds the teams on their own projects.
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy employment_read on public.employment for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy employment_admin on public.employment for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy holidays_read on public.holidays for select to authenticated using (true);
create policy holidays_admin on public.holidays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy audit_admin on public.audit_log for select to authenticated
  using (public.is_admin());

create policy login_events_read on public.login_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- The helpers that write on someone else's behalf are not for the browser to call.
revoke execute on function public.notify(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- First admin. Run once from the Supabase SQL editor after creating the login
-- under Authentication → Users:
--   select public.bootstrap_admin('you@nuuke.com', 'Your Name');
-- -----------------------------------------------------------------------------
create or replace function public.bootstrap_admin(p_email text, p_full_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No login with email % — create it under Authentication → Users first', p_email;
  end if;
  insert into public.profiles (id, email, full_name, role, department, title)
  values (v_id, lower(p_email), p_full_name, 'admin', 'management', 'Owner')
  on conflict (id) do update set role = 'admin', is_active = true;
  insert into public.employment (profile_id, tracks_attendance) values (v_id, false)
  on conflict (profile_id) do nothing;
  return v_id;
end
$$;
revoke execute on function public.bootstrap_admin(text, text) from public, anon, authenticated;

-- >>> 20261001000200_attendance.sql
-- =============================================================================
-- Attendance
--
-- Signing in to the app starts the clock; signing out stops it. A day belongs to
-- the shift it started in, so a 6 pm – 3 am shift is one work day, not two.
--
-- Arrival is judged once, at the first sign-in of the work day:
--   up to grace_minutes late         on time
--   up to short_day_max_minutes      short day   (first one per period is a warning)
--   up to half_day_max_minutes       half day    (first one per period is half pay)
--   later than that                  counted as absent
-- Payroll (see payroll migration) turns these into deductions.
-- =============================================================================

create table public.attendance_days (
  id                   bigint generated always as identity primary key,
  profile_id           uuid not null references public.profiles (id) on delete cascade,
  work_date            date not null,
  scheduled_start      timestamptz,
  scheduled_end        timestamptz,
  first_in             timestamptz,
  last_out             timestamptz,
  late_minutes         int not null default 0,
  arrival              text not null default 'on_time'
                       check (arrival in ('on_time', 'short', 'half', 'late_absent', 'off_schedule')),
  override_status      text check (override_status in ('present', 'short', 'half', 'absent', 'paid_leave', 'unpaid_leave', 'holiday')),
  override_note        text,
  overridden_by        uuid references public.profiles (id) on delete set null,
  signout_reminded_at  timestamptz,
  auto_signed_out      boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (profile_id, work_date)
);
create index attendance_days_date on public.attendance_days (work_date);

create table public.attendance_sessions (
  id          bigint generated always as identity primary key,
  day_id      bigint not null references public.attendance_days (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  end_reason  text check (end_reason in ('signout', 'auto', 'admin'))
);
create unique index attendance_one_open_session on public.attendance_sessions (profile_id) where ended_at is null;
create index attendance_sessions_day on public.attendance_sessions (day_id);

create table public.attendance_breaks (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.attendance_sessions (id) on delete cascade,
  day_id      bigint not null references public.attendance_days (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index attendance_one_open_break on public.attendance_breaks (profile_id) where ended_at is null;
create index attendance_breaks_day on public.attendance_breaks (day_id);

-- One alert of each kind per person per day, so the sweep never nags twice.
create table public.attendance_alerts (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (profile_id, work_date, kind)
);

alter table public.attendance_days     enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_breaks   enable row level security;
alter table public.attendance_alerts   enable row level security;

-- Read your own, admin reads all. Every write goes through the functions below.
create policy attendance_days_read on public.attendance_days for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy attendance_sessions_read on public.attendance_sessions for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy attendance_breaks_read on public.attendance_breaks for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy attendance_alerts_read on public.attendance_alerts for select to authenticated
  using (public.is_admin());

create trigger attendance_days_audit after update of override_status, override_note on public.attendance_days
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Shift arithmetic
-- -----------------------------------------------------------------------------

-- When the shift for a given work date starts, as an instant.
create or replace function public.shift_start_at(p_profile uuid, p_date date)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select ((p_date + e.shift_start)::timestamp at time zone public.app_tz())
    from public.employment e where e.profile_id = p_profile
$$;

create or replace function public.is_work_day(p_profile uuid, p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select extract(isodow from p_date)::smallint = any (e.work_days)
       from public.employment e where e.profile_id = p_profile), false)
    and not exists (select 1 from public.holidays h where h.day = p_date)
$$;

-- Which work day an instant belongs to. Normally the local calendar date, except in
-- the small hours after a shift that started the evening before.
create or replace function public.resolve_work_date(p_profile uuid, p_at timestamptz)
returns date
language plpgsql stable security definer set search_path = public
as $$
declare
  v_local date := (p_at at time zone public.app_tz())::date;
  v_emp public.employment;
  v_today_start timestamptz;
  v_yesterday_end timestamptz;
begin
  select * into v_emp from public.employment where profile_id = p_profile;
  if not found then
    return v_local;
  end if;
  v_today_start := public.shift_start_at(p_profile, v_local);
  v_yesterday_end := public.shift_start_at(p_profile, v_local - 1) + make_interval(mins => v_emp.shift_minutes);
  if p_at < v_today_start - interval '4 hours' and p_at < v_yesterday_end + interval '2 hours' then
    return v_local - 1;
  end if;
  return v_local;
end
$$;

create or replace function public.classify_arrival(p_late_minutes int)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_late_minutes < s.grace_minutes then 'on_time'
    when p_late_minutes <= s.short_day_max_minutes then 'short'
    when p_late_minutes <= s.half_day_max_minutes then 'half'
    else 'late_absent'
  end
  from public.settings s
$$;

-- Seconds actually worked on a day: time signed in, minus breaks.
create or replace function public.day_worked_seconds(p_day_id bigint)
returns int
language sql stable security definer set search_path = public
as $$
  select greatest(0,
    coalesce((select sum(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)))
                from public.attendance_sessions s where s.day_id = p_day_id), 0)
  - coalesce((select sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)))
                from public.attendance_breaks b where b.day_id = p_day_id), 0)
  )::int
$$;

create or replace function public.day_break_seconds(p_day_id bigint)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at))), 0)::int
    from public.attendance_breaks b where b.day_id = p_day_id
$$;

-- -----------------------------------------------------------------------------
-- The person's own clock
-- -----------------------------------------------------------------------------
create or replace function public.my_attendance()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp public.employment;
  v_session public.attendance_sessions;
  v_break public.attendance_breaks;
  v_day public.attendance_days;
  v_work_date date;
begin
  if v_uid is null then return null; end if;
  select * into v_emp from public.employment where profile_id = v_uid;

  select * into v_session from public.attendance_sessions where profile_id = v_uid and ended_at is null;
  if found then
    select * into v_day from public.attendance_days where id = v_session.day_id;
  else
    v_work_date := public.resolve_work_date(v_uid, now());
    select * into v_day from public.attendance_days where profile_id = v_uid and work_date = v_work_date;
  end if;
  select * into v_break from public.attendance_breaks where profile_id = v_uid and ended_at is null;

  return jsonb_build_object(
    'tracks_attendance', coalesce(v_emp.tracks_attendance, false),
    'clocked_in', v_session.id is not null,
    'session_started_at', v_session.started_at,
    'on_break', v_break.id is not null,
    'break_started_at', v_break.started_at,
    'break_allowance_seconds', (select break_allowance_minutes * 60 from public.settings),
    'work_date', coalesce(v_day.work_date, public.resolve_work_date(v_uid, now())),
    'first_in', v_day.first_in,
    'scheduled_start', coalesce(v_day.scheduled_start, public.shift_start_at(v_uid, public.resolve_work_date(v_uid, now()))),
    'scheduled_end', coalesce(v_day.scheduled_end,
        public.shift_start_at(v_uid, public.resolve_work_date(v_uid, now())) + make_interval(mins => coalesce(v_emp.shift_minutes, 540))),
    'late_minutes', coalesce(v_day.late_minutes, 0),
    'arrival', v_day.arrival,
    'worked_seconds', case when v_day.id is null then 0 else public.day_worked_seconds(v_day.id) end,
    'break_seconds', case when v_day.id is null then 0 else public.day_break_seconds(v_day.id) end,
    'server_now', now()
  );
end
$$;

create or replace function public.clock_in()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp public.employment;
  v_work_date date;
  v_start timestamptz;
  v_day public.attendance_days;
  v_late int := 0;
  v_arrival text := 'on_time';
  v_name text;
  v_period_start date;
  v_count int;
  v_label text;
begin
  if v_uid is null or not public.is_staff() then
    raise exception 'Only staff sign in to a shift' using errcode = '42501';
  end if;
  if exists (select 1 from public.attendance_sessions where profile_id = v_uid and ended_at is null) then
    return public.my_attendance();
  end if;

  select * into v_emp from public.employment where profile_id = v_uid;
  if not found then
    insert into public.employment (profile_id) values (v_uid) returning * into v_emp;
  end if;

  v_work_date := public.resolve_work_date(v_uid, now());
  v_start := public.shift_start_at(v_uid, v_work_date);

  select * into v_day from public.attendance_days where profile_id = v_uid and work_date = v_work_date for update;
  if not found then
    if public.is_work_day(v_uid, v_work_date) then
      v_late := greatest(0, floor(extract(epoch from (now() - v_start)) / 60))::int;
      v_arrival := public.classify_arrival(v_late);
    else
      v_arrival := 'off_schedule';
    end if;
    insert into public.attendance_days (profile_id, work_date, scheduled_start, scheduled_end, first_in, late_minutes, arrival)
    values (v_uid, v_work_date, v_start, v_start + make_interval(mins => v_emp.shift_minutes), now(), v_late, v_arrival)
    returning * into v_day;

    if v_emp.tracks_attendance and v_arrival in ('short', 'half', 'late_absent') then
      select full_name into v_name from public.profiles where id = v_uid;
      v_period_start := public.payroll_period_start(v_work_date);
      select count(*) into v_count from public.attendance_days
       where profile_id = v_uid and arrival = v_arrival
         and work_date between v_period_start and v_work_date;
      v_label := case v_arrival
        when 'short' then case when v_count <= (select free_short_days from public.settings)
                                then 'Short day — this one is a warning'
                                else 'Short day — one day will be deducted' end
        when 'half' then case when v_count <= (select reduced_half_days from public.settings)
                               then 'Half day — half the day''s pay'
                               else 'Half day — a full day will be deducted' end
        else 'Arrived too late — counted as absent'
      end;
      perform public.notify(v_uid, 'attendance.late', v_label,
        format('You signed in %s minutes after your shift started.', v_late), '/me/pay', 'warning');
      perform public.notify_admins('attendance.late', format('%s arrived %s min late', v_name, v_late),
        v_label, '/admin/attendance', 'warning', jsonb_build_object('profile_id', v_uid, 'work_date', v_work_date));
    end if;
  elsif v_day.first_in is null then
    update public.attendance_days set first_in = now() where id = v_day.id returning * into v_day;
  end if;

  insert into public.attendance_sessions (day_id, profile_id) values (v_day.id, v_uid);
  return public.my_attendance();
end
$$;

create or replace function public.clock_out(p_reason text default 'signout')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.attendance_sessions;
begin
  select * into v_session from public.attendance_sessions where profile_id = v_uid and ended_at is null for update;
  if not found then
    return public.my_attendance();
  end if;
  update public.attendance_breaks set ended_at = now() where session_id = v_session.id and ended_at is null;
  update public.attendance_sessions set ended_at = now(), end_reason = 'signout' where id = v_session.id;
  update public.attendance_days set last_out = now() where id = v_session.day_id;
  return public.my_attendance();
end
$$;

create or replace function public.start_break()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.attendance_sessions;
begin
  select * into v_session from public.attendance_sessions where profile_id = v_uid and ended_at is null;
  if not found then
    raise exception 'Sign in to your shift before taking a break';
  end if;
  insert into public.attendance_breaks (session_id, day_id, profile_id)
  values (v_session.id, v_session.day_id, v_uid)
  on conflict do nothing;
  return public.my_attendance();
end
$$;

create or replace function public.end_break()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day_id bigint;
  v_over int;
  v_name text;
begin
  update public.attendance_breaks set ended_at = now()
   where profile_id = v_uid and ended_at is null
  returning day_id into v_day_id;

  if v_day_id is not null then
    v_over := public.day_break_seconds(v_day_id) / 60 - (select break_allowance_minutes from public.settings);
    if v_over > 0 then
      insert into public.attendance_alerts (profile_id, work_date, kind)
      select v_uid, work_date, 'break_over' from public.attendance_days where id = v_day_id
      on conflict do nothing;
      if found then
        select full_name into v_name from public.profiles where id = v_uid;
        perform public.notify(v_uid, 'attendance.break', 'Break allowance used up',
          format('You are %s minutes over today''s break allowance.', v_over), null, 'warning');
        perform public.notify_admins('attendance.break', format('%s went %s min over their break', v_name, v_over),
          null, '/admin/attendance', 'warning', jsonb_build_object('profile_id', v_uid));
      end if;
    end if;
  end if;
  return public.my_attendance();
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: correct a day (sick leave, a holiday, a forgiven late arrival)
-- -----------------------------------------------------------------------------
create or replace function public.set_attendance_override(
  p_profile uuid, p_date date, p_status text, p_note text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz;
  v_emp public.employment;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can correct attendance' using errcode = '42501';
  end if;
  select * into v_emp from public.employment where profile_id = p_profile;
  v_start := public.shift_start_at(p_profile, p_date);
  insert into public.attendance_days (profile_id, work_date, scheduled_start, scheduled_end, override_status, override_note, overridden_by, arrival)
  values (p_profile, p_date, v_start, v_start + make_interval(mins => coalesce(v_emp.shift_minutes, 540)),
          p_status, p_note, auth.uid(), 'on_time')
  on conflict (profile_id, work_date) do update
    set override_status = excluded.override_status,
        override_note = excluded.override_note,
        overridden_by = excluded.overridden_by;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: the live board — who is in, who is on a break, who has not shown up.
-- -----------------------------------------------------------------------------
create or replace function public.attendance_board(p_date date default null)
returns table (
  profile_id uuid, full_name text, role public.app_role, department text, title text, avatar jsonb,
  work_date date, scheduled_start timestamptz, scheduled_end timestamptz,
  first_in timestamptz, last_out timestamptz, late_minutes int, arrival text, override_status text,
  state text, worked_seconds int, break_seconds int, auto_signed_out boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can see the attendance board' using errcode = '42501';
  end if;
  return query
  with people as (
    select p.*, e.shift_minutes,
           coalesce(p_date, public.resolve_work_date(p.id, now())) as d
      from public.profiles p
      join public.employment e on e.profile_id = p.id
     where p.is_active and p.role <> 'client' and e.tracks_attendance
  )
  select pe.id, pe.full_name, pe.role, pe.department, pe.title, pe.avatar,
         pe.d,
         coalesce(ad.scheduled_start, public.shift_start_at(pe.id, pe.d)),
         coalesce(ad.scheduled_end, public.shift_start_at(pe.id, pe.d) + make_interval(mins => pe.shift_minutes)),
         ad.first_in, ad.last_out, coalesce(ad.late_minutes, 0), ad.arrival, ad.override_status,
         case
           when ad.override_status is not null and ad.first_in is null then ad.override_status
           when exists (select 1 from public.attendance_breaks b where b.profile_id = pe.id and b.ended_at is null) then 'break'
           when exists (select 1 from public.attendance_sessions s where s.profile_id = pe.id and s.ended_at is null and s.day_id = ad.id) then 'online'
           when ad.first_in is not null then 'signed_out'
           when not public.is_work_day(pe.id, pe.d) then 'day_off'
           when now() < public.shift_start_at(pe.id, pe.d) then 'not_started'
           else 'absent'
         end,
         case when ad.id is null then 0 else public.day_worked_seconds(ad.id) end,
         case when ad.id is null then 0 else public.day_break_seconds(ad.id) end,
         coalesce(ad.auto_signed_out, false)
    from people pe
    left join public.attendance_days ad on ad.profile_id = pe.id and ad.work_date = pe.d
   order by pe.full_name;
end
$$;

-- -----------------------------------------------------------------------------
-- The sweep. pg_cron runs it every five minutes (see the cron migration).
--   1. Shift over and still signed in       → remind them to sign out
--   2. Reminded an hour ago, still signed in → sign them out, tell them and the admin
--   3. Shift started, nobody has signed in  → tell the admin and the person
--   4. Break running past the allowance     → tell them and the admin
-- -----------------------------------------------------------------------------
create or replace function public.attendance_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_grace int;
  v_absent int;
  v_allow int;
begin
  select signout_grace_minutes, absent_alert_minutes, break_allowance_minutes
    into v_grace, v_absent, v_allow from public.settings;

  -- 1. reminders
  for r in
    select s.id as session_id, d.id as day_id, d.profile_id, d.scheduled_end
      from public.attendance_sessions s
      join public.attendance_days d on d.id = s.day_id
     where s.ended_at is null and d.signout_reminded_at is null
       and d.scheduled_end is not null and d.scheduled_end < now()
  loop
    update public.attendance_days set signout_reminded_at = now() where id = r.day_id;
    perform public.notify(r.profile_id, 'attendance.signout_reminder', 'Your shift is over — remember to sign out',
      format('If you are still signed in %s minutes from now, we will sign you out automatically.', v_grace),
      null, 'warning');
  end loop;

  -- 2. automatic sign-out
  for r in
    select s.id as session_id, d.id as day_id, d.profile_id, p.full_name
      from public.attendance_sessions s
      join public.attendance_days d on d.id = s.day_id
      join public.profiles p on p.id = d.profile_id
     where s.ended_at is null and d.signout_reminded_at is not null
       and d.signout_reminded_at + make_interval(mins => v_grace) < now()
  loop
    update public.attendance_breaks set ended_at = now() where session_id = r.session_id and ended_at is null;
    update public.attendance_sessions set ended_at = now(), end_reason = 'auto' where id = r.session_id;
    update public.attendance_days set last_out = now(), auto_signed_out = true where id = r.day_id;
    perform public.notify(r.profile_id, 'attendance.auto_signout', 'You were signed out automatically',
      'You did not sign out after your shift, so the system did it for you. Your admin has been told.', null, 'danger');
    perform public.notify_admins('attendance.auto_signout', format('%s did not sign out', r.full_name),
      'They were signed out automatically an hour after the reminder.', '/admin/attendance', 'danger',
      jsonb_build_object('profile_id', r.profile_id));
  end loop;

  -- 3. no-shows, for today's and (night shifts) yesterday's work date
  for r in
    select p.id as profile_id, p.full_name, dd.d as work_date, public.shift_start_at(p.id, dd.d) as starts
      from public.profiles p
      join public.employment e on e.profile_id = p.id
      cross join lateral (values (public.local_today()), (public.local_today() - 1)) as dd (d)
     where p.is_active and p.role <> 'client' and e.tracks_attendance
       and public.is_work_day(p.id, dd.d)
       and now() > public.shift_start_at(p.id, dd.d) + make_interval(mins => v_absent)
       and now() < public.shift_start_at(p.id, dd.d) + make_interval(mins => e.shift_minutes)
       and (e.joined_on is null or e.joined_on <= dd.d)
       and not exists (select 1 from public.attendance_days ad
                        where ad.profile_id = p.id and ad.work_date = dd.d
                          and (ad.first_in is not null or ad.override_status is not null))
  loop
    insert into public.attendance_alerts (profile_id, work_date, kind)
    values (r.profile_id, r.work_date, 'no_show') on conflict do nothing;
    if found then
      perform public.notify(r.profile_id, 'attendance.no_show', 'You have not signed in yet',
        format('Your shift started at %s.', to_char(r.starts at time zone public.app_tz(), 'HH12:MI AM')), null, 'danger');
      perform public.notify_admins('attendance.no_show', format('%s has not signed in', r.full_name),
        format('Their shift started at %s.', to_char(r.starts at time zone public.app_tz(), 'HH12:MI AM')),
        '/admin/attendance', 'danger', jsonb_build_object('profile_id', r.profile_id));
    end if;
  end loop;

  -- 4. long breaks still running
  for r in
    select b.profile_id, b.day_id, d.work_date, p.full_name
      from public.attendance_breaks b
      join public.attendance_days d on d.id = b.day_id
      join public.profiles p on p.id = b.profile_id
     where b.ended_at is null
       and public.day_break_seconds(b.day_id) > v_allow * 60
  loop
    insert into public.attendance_alerts (profile_id, work_date, kind)
    values (r.profile_id, r.work_date, 'break_over') on conflict do nothing;
    if found then
      perform public.notify(r.profile_id, 'attendance.break', 'Break allowance used up',
        'Your break has gone past today''s allowance.', null, 'warning');
      perform public.notify_admins('attendance.break', format('%s is over their break allowance', r.full_name),
        null, '/admin/attendance', 'warning', jsonb_build_object('profile_id', r.profile_id));
    end if;
  end loop;
end
$$;

revoke execute on function public.attendance_sweep() from public, anon, authenticated;

-- >>> 20261001000300_sales.sql
-- =============================================================================
-- Sales: leads, the dialer queue, call outcomes, pipeline, meetings, stats
--
-- A rep only ever sees leads assigned to them, and only their own deals and
-- meetings. The leaderboard is the single place their numbers meet a colleague's,
-- and it carries totals only — never a lead, a phone number or a deal.
-- =============================================================================

-- What a call can end in, and what that does to the lead.
--   retry     try again on the next work day; after max_attempts the lead is exhausted
--   callback  the person asked for a specific time
--   pipeline  a real prospect: create or advance a deal in the rep's pipeline
--   closed    take it out of the queue for good
create table public.lead_outcomes (
  key             text primary key,
  label           text not null,
  short_label     text not null,
  connected       boolean not null,          -- did a human pick up?
  effect          text not null check (effect in ('retry', 'callback', 'pipeline', 'closed')),
  pipeline_stage  text,
  tone            text not null default 'neutral',
  sort            int not null
);

insert into public.lead_outcomes (key, label, short_label, connected, effect, pipeline_stage, tone, sort) values
  ('contact_not_established', 'Contact not established',  'No contact',    false, 'retry',    null,          'neutral', 10),
  ('voicemail',               'Voicemail left',            'Voicemail',     false, 'retry',    null,          'neutral', 20),
  ('busy_callback',           'Busy — call back later',    'Call back',     true,  'callback', null,          'info',    30),
  ('contact_established',     'Contact established',       'Connected',     true,  'retry',    null,          'info',    40),
  ('interested',              'Interested — follow up',    'Interested',    true,  'pipeline', 'prospect',    'good',    50),
  ('meeting_booked',          'Meeting booked',            'Meeting',       true,  'pipeline', 'meeting',     'good',    60),
  ('proposal_presentation',   'Proposal presentation',     'Presentation',  true,  'pipeline', 'proposal',    'good',    70),
  ('proposal_sent',           'Proposal sent',             'Proposal sent', true,  'pipeline', 'proposal',    'good',    80),
  ('negotiation',             'Negotiation',               'Negotiation',   true,  'pipeline', 'negotiation', 'good',    90),
  ('won',                     'Closed — won',              'Won',           true,  'closed',   'won',         'great',  100),
  ('not_interested',          'Not interested',            'Not interested',true,  'closed',   null,          'bad',    110),
  ('wrong_person',            'Wrong person',              'Wrong person',  true,  'closed',   null,          'bad',    120),
  ('invalid_number',          'Number not valid',          'Invalid',       false, 'closed',   null,          'bad',    130),
  ('do_not_call',             'Do not call',               'Do not call',   true,  'closed',   null,          'bad',    140),
  ('duplicate',               'Duplicate lead',            'Duplicate',     false, 'closed',   null,          'bad',    150);

create table public.lead_imports (
  id           bigint generated always as identity primary key,
  file_name    text not null,
  imported_by  uuid references public.profiles (id) on delete set null,
  total_rows   int not null default 0,
  inserted     int not null default 0,
  duplicates   int not null default 0,
  invalid      int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.leads (
  id              bigint generated always as identity primary key,
  lead_date       date,
  platform        text,
  country         text,
  name            text not null default '',
  personal_email  text,
  work_email      text,
  phone           text,
  phone_key       text generated always as (
                    nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')
                  ) stored,
  post_link       text,
  query           text,
  service         text,
  status          text not null default 'new',
  stage           text not null default 'queue' check (stage in ('queue', 'pipeline', 'closed')),
  closed_reason   text,
  assigned_to     uuid references public.profiles (id) on delete set null,
  assigned_at     timestamptz,
  attempts        int not null default 0,
  connected       boolean not null default false,
  next_action_at  timestamptz,
  skipped_at      timestamptz,
  last_attempt_at timestamptz,
  last_comment    text,
  deal_id         bigint,
  import_id       bigint references public.lead_imports (id) on delete set null,
  legacy          jsonb,       -- columns carried over from the old sheet: comments, follow-ups, status
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index leads_queue on public.leads (assigned_to, stage, next_action_at);
create index leads_phone on public.leads (phone_key);
create index leads_personal_email on public.leads (lower(personal_email));
create index leads_date on public.leads (lead_date);
create index leads_name_trgm on public.leads using gin (name extensions.gin_trgm_ops);
create index leads_service on public.leads (service);
create index leads_platform on public.leads (platform);

create table public.lead_attempts (
  id           bigint generated always as identity primary key,
  lead_id      bigint not null references public.leads (id) on delete cascade,
  rep_id       uuid references public.profiles (id) on delete set null,
  action       text not null check (action in ('call', 'skip', 'note')),
  outcome      text references public.lead_outcomes (key),
  comment      text,
  attempt_no   int,
  followup_at  timestamptz,
  work_date    date not null,
  created_at   timestamptz not null default now()
);
create index lead_attempts_rep_day on public.lead_attempts (rep_id, work_date);
create index lead_attempts_lead on public.lead_attempts (lead_id, created_at desc);

create table public.deals (
  id              bigint generated always as identity primary key,
  owner_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  lead_id         bigint references public.leads (id) on delete set null,
  title           text not null,
  contact_name    text,
  company         text,
  email           text,
  phone           text,
  service         text,
  amount_usd      numeric(12, 2) not null default 0 check (amount_usd >= 0),
  probability     int not null default 10 check (probability between 0 and 100),
  stage           text not null default 'prospect'
                  check (stage in ('prospect', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close  date,
  won_on          date,
  lost_reason     text,
  next_step       text,
  next_step_at    timestamptz,
  notes           text,
  position        double precision not null default extract(epoch from now()),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index deals_owner on public.deals (owner_id, stage);
create index deals_won on public.deals (won_on) where stage = 'won';

alter table public.leads add constraint leads_deal_fk
  foreign key (deal_id) references public.deals (id) on delete set null;

create table public.meetings (
  id                bigint generated always as identity primary key,
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  deal_id           bigint references public.deals (id) on delete set null,
  lead_id           bigint references public.leads (id) on delete set null,
  title             text not null,
  starts_at         timestamptz not null,
  duration_minutes  int not null default 30 check (duration_minutes between 5 and 480),
  location          text,
  status            text not null default 'scheduled' check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  notes             text,
  reminded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index meetings_owner on public.meetings (owner_id, starts_at);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create trigger deals_touch_ts before update on public.deals for each row execute function public.touch_updated_at();
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();

-- Lead edits by the admin are audited; the thousands of status changes the dialer
-- makes are already recorded, one row per call, in lead_attempts.
create trigger leads_audit after delete or update of name, phone, personal_email, work_email, service, platform
  on public.leads for each row execute function public.audit_row();
create trigger deals_audit after insert or update or delete on public.deals
  for each row execute function public.audit_row();
create trigger meetings_audit after insert or update or delete on public.meetings
  for each row execute function public.audit_row();

create or replace function public.deal_stage_rank(p_stage text)
returns int language sql immutable as $$
  select case p_stage when 'prospect' then 1 when 'meeting' then 2 when 'proposal' then 3
                      when 'negotiation' then 4 when 'won' then 5 when 'lost' then 5 else 0 end
$$;

create or replace function public.deal_default_probability(p_stage text)
returns int language sql immutable as $$
  select case p_stage when 'prospect' then 10 when 'meeting' then 25 when 'proposal' then 50
                      when 'negotiation' then 75 when 'won' then 100 else 0 end
$$;

-- Keeps probability, won date and the owner honest, and celebrates a win.
create or replace function public.deals_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- A rep cannot hand a deal to somebody else.
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid();
    elsif new.owner_id is distinct from old.owner_id then
      raise exception 'Only an admin can move a deal to another rep' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    if tg_op = 'INSERT' or new.probability is not distinct from old.probability then
      new.probability := public.deal_default_probability(new.stage);
    end if;
    if new.stage = 'won' then
      new.won_on := coalesce(new.won_on, public.local_today());
    else
      new.won_on := null;
    end if;
  end if;
  return new;
end
$$;
create trigger deals_before before insert or update on public.deals
  for each row execute function public.deals_before_write();

create or replace function public.deals_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage is distinct from 'won') then
    select full_name into v_name from public.profiles where id = new.owner_id;
    perform public.notify(new.owner_id, 'deal.won', 'Deal closed!',
      format('%s — $%s. Huge.', new.title, to_char(new.amount_usd, 'FM999,999,990')), '/sales/pipeline', 'celebrate',
      jsonb_build_object('deal_id', new.id, 'amount', new.amount_usd));
    perform public.notify_admins('deal.won', format('%s closed $%s', v_name, to_char(new.amount_usd, 'FM999,999,990')),
      new.title, '/admin/sales', 'celebrate', jsonb_build_object('deal_id', new.id, 'owner_id', new.owner_id));
  end if;
  -- Keep the lead's place in the funnel in step with its deal.
  if new.lead_id is not null and tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    update public.leads
       set stage = case when new.stage in ('won', 'lost') then 'closed' else 'pipeline' end,
           status = case new.stage when 'won' then 'won' when 'lost' then 'not_interested' else status end
     where id = new.lead_id;
  end if;
  return new;
end
$$;
create trigger deals_after after insert or update on public.deals
  for each row execute function public.deals_after_write();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.lead_outcomes enable row level security;
alter table public.lead_imports  enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_attempts enable row level security;
alter table public.deals         enable row level security;
alter table public.meetings      enable row level security;

create policy lead_outcomes_read on public.lead_outcomes for select to authenticated using (true);

create policy lead_imports_admin on public.lead_imports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy leads_read on public.leads for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());
create policy leads_admin on public.leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy lead_attempts_read on public.lead_attempts for select to authenticated
  using (rep_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.leads l where l.id = lead_id and l.assigned_to = auth.uid()));

create policy deals_own on public.deals for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check ((owner_id = auth.uid() and public.my_role() = 'sales') or public.is_admin());

create policy meetings_own on public.meetings for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check ((owner_id = auth.uid() and public.my_role() = 'sales') or public.is_admin());

-- -----------------------------------------------------------------------------
-- Scheduling the next attempt
-- -----------------------------------------------------------------------------

-- The next work day after a gap, opened a few hours before that shift starts so the
-- follow-ups are waiting when the rep signs in.
create or replace function public.next_followup_at(p_profile uuid, p_work_date date)
returns timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gap int := (select followup_gap_days from public.settings);
  v_day date := p_work_date + greatest(v_gap, 1);
  v_start timestamptz;
  i int := 0;
begin
  while i < 10 and not public.is_work_day(p_profile, v_day) loop
    v_day := v_day + 1;
    i := i + 1;
  end loop;
  v_start := public.shift_start_at(p_profile, v_day);
  if v_start is null then
    return (v_day::timestamp at time zone public.app_tz());
  end if;
  return v_start - interval '4 hours';
end
$$;

-- -----------------------------------------------------------------------------
-- The dialer
-- -----------------------------------------------------------------------------

-- Which cards are due for the signed-in rep, in the order they should be dialled:
--   1. follow-ups and call-backs that have come due, oldest first
--   2. fresh leads, newest enquiry first
--   3. anything skipped, in the order it was skipped (the back of the queue)
create or replace function public.next_leads(
  p_services text[] default null,
  p_platforms text[] default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 3
) returns setof public.leads
language sql stable
as $$
  select l.*
    from public.leads l
   where l.assigned_to = auth.uid()
     and (l.stage = 'queue' or (l.stage = 'pipeline' and l.next_action_at is not null))
     and (l.next_action_at is null or l.next_action_at <= now())
     and (p_services is null or cardinality(p_services) = 0 or l.service = any (p_services))
     and (p_platforms is null or cardinality(p_platforms) = 0 or l.platform = any (p_platforms))
     and (p_from is null or l.lead_date >= p_from)
     and (p_to is null or l.lead_date <= p_to)
   order by (l.skipped_at is not null), l.skipped_at,
            (l.next_action_at is null), l.next_action_at,
            l.lead_date desc nulls last, l.id
   limit least(greatest(p_limit, 1), 20)
$$;

create or replace function public.queue_summary(
  p_services text[] default null,
  p_platforms text[] default null,
  p_from date default null,
  p_to date default null
) returns jsonb
language sql stable
as $$
  with mine as (
    select l.*
      from public.leads l
     where l.assigned_to = auth.uid()
       and (p_services is null or cardinality(p_services) = 0 or l.service = any (p_services))
       and (p_platforms is null or cardinality(p_platforms) = 0 or l.platform = any (p_platforms))
       and (p_from is null or l.lead_date >= p_from)
       and (p_to is null or l.lead_date <= p_to)
  )
  select jsonb_build_object(
    'due_followups', count(*) filter (where (stage = 'queue' or stage = 'pipeline') and next_action_at is not null
                                       and next_action_at <= now() and skipped_at is null),
    'fresh', count(*) filter (where stage = 'queue' and next_action_at is null and attempts = 0 and skipped_at is null),
    'skipped', count(*) filter (where (stage = 'queue' or (stage = 'pipeline' and next_action_at is not null))
                                 and skipped_at is not null and (next_action_at is null or next_action_at <= now())),
    'scheduled_later', count(*) filter (where stage in ('queue', 'pipeline') and next_action_at > now()),
    'in_pipeline', count(*) filter (where stage = 'pipeline'),
    'closed', count(*) filter (where stage = 'closed'),
    'total', count(*)
  )
  from mine
$$;

-- Distinct services and platforms in the rep's own leads, for the start-screen filters.
create or replace function public.lead_filter_options()
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('value', service, 'count', n) order by n desc)
                            from (select service, count(*) n from public.leads
                                   where service is not null and service <> ''
                                     and assigned_to = auth.uid()
                                   group by service) s), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('value', platform, 'count', n) order by n desc)
                             from (select platform, count(*) n from public.leads
                                    where platform is not null and platform <> ''
                                      and assigned_to = auth.uid()
                                    group by platform) s), '[]'::jsonb),
    'date_min', (select min(lead_date) from public.leads where assigned_to = auth.uid()),
    'date_max', (select max(lead_date) from public.leads where assigned_to = auth.uid())
  )
$$;

-- Today's numbers for the progress bar.
create or replace function public.my_today()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with d as (select public.resolve_work_date(auth.uid(), now()) as wd)
  select jsonb_build_object(
    'work_date', d.wd,
    'dials', count(a.*) filter (where a.action = 'call'),
    'connected', count(a.*) filter (where a.action = 'call' and o.connected),
    'skips', count(a.*) filter (where a.action = 'skip'),
    'prospects', count(a.*) filter (where a.action = 'call' and o.effect = 'pipeline'),
    'target', coalesce((select daily_dial_target from public.employment where profile_id = auth.uid()),
                       (select default_daily_dials from public.settings))
  )
  from d
  left join public.lead_attempts a on a.rep_id = auth.uid() and a.work_date = d.wd
  left join public.lead_outcomes o on o.key = a.outcome
  group by d.wd
$$;

-- Done / skip / note on a card. One call = one row in lead_attempts, whatever happens.
create or replace function public.log_lead_action(
  p_lead_id bigint,
  p_action text,
  p_outcome text default null,
  p_comment text default null,
  p_followup_at timestamptz default null,
  p_meeting_at timestamptz default null,
  p_meeting_minutes int default 30,
  p_deal_amount numeric default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lead public.leads;
  v_outcome public.lead_outcomes;
  v_settings public.settings;
  v_work_date date;
  v_attempt int;
  v_next timestamptz;
  v_stage text;
  v_closed text;
  v_deal_id bigint;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists';
  end if;
  if v_lead.assigned_to is distinct from v_uid and not public.is_admin() then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;

  select * into v_settings from public.settings;
  v_work_date := public.resolve_work_date(v_uid, now());

  if p_action = 'skip' then
    update public.leads set skipped_at = now() where id = p_lead_id;
    insert into public.lead_attempts (lead_id, rep_id, action, comment, work_date)
    values (p_lead_id, v_uid, 'skip', v_comment, v_work_date);
    return jsonb_build_object('today', public.my_today());
  end if;

  if p_action = 'note' then
    if v_comment is null then
      raise exception 'Write something first';
    end if;
    update public.leads set last_comment = v_comment where id = p_lead_id;
    insert into public.lead_attempts (lead_id, rep_id, action, comment, work_date)
    values (p_lead_id, v_uid, 'note', v_comment, v_work_date);
    return jsonb_build_object('today', public.my_today());
  end if;

  if p_action <> 'call' then
    raise exception 'Unknown action %', p_action;
  end if;

  select * into v_outcome from public.lead_outcomes where key = p_outcome;
  if not found then
    raise exception 'Choose how the call went';
  end if;
  if v_outcome.effect = 'callback' and p_followup_at is null then
    raise exception 'Pick when to call them back';
  end if;
  if v_outcome.key = 'meeting_booked' and p_meeting_at is null then
    raise exception 'Pick the meeting date and time';
  end if;
  if v_outcome.key = 'won' and coalesce(p_deal_amount, 0) <= 0 then
    raise exception 'Enter the amount you closed';
  end if;

  v_attempt := v_lead.attempts + 1;
  v_stage := 'queue';
  v_closed := null;
  v_next := null;

  case v_outcome.effect
    when 'retry' then
      if p_followup_at is not null then
        v_next := p_followup_at;
      elsif v_attempt >= v_settings.max_attempts then
        v_stage := 'closed';
        v_closed := 'exhausted';
      else
        v_next := public.next_followup_at(v_uid, v_work_date);
      end if;
    when 'callback' then
      v_next := p_followup_at;
    when 'pipeline' then
      v_stage := 'pipeline';
      v_next := p_followup_at;
    when 'closed' then
      v_stage := 'closed';
      v_closed := v_outcome.key;
  end case;

  -- Deal first, so the lead row can point at it.
  if v_outcome.pipeline_stage is not null then
    if v_lead.deal_id is null then
      insert into public.deals (owner_id, lead_id, title, contact_name, email, phone, service, amount_usd, stage)
      values (coalesce(v_lead.assigned_to, v_uid), v_lead.id,
              coalesce(nullif(v_lead.name, ''), 'New prospect') || coalesce(' — ' || nullif(v_lead.service, ''), ''),
              nullif(v_lead.name, ''), coalesce(v_lead.personal_email, v_lead.work_email), v_lead.phone,
              v_lead.service, coalesce(p_deal_amount, 0), v_outcome.pipeline_stage)
      returning id into v_deal_id;
    else
      v_deal_id := v_lead.deal_id;
      update public.deals
         set stage = case when public.deal_stage_rank(v_outcome.pipeline_stage) > public.deal_stage_rank(stage)
                          then v_outcome.pipeline_stage else stage end,
             amount_usd = coalesce(p_deal_amount, amount_usd)
       where id = v_deal_id;
    end if;
  end if;

  update public.leads
     set status = v_outcome.key,
         attempts = v_attempt,
         connected = connected or v_outcome.connected,
         stage = v_stage,
         closed_reason = v_closed,
         next_action_at = v_next,
         skipped_at = null,
         last_attempt_at = now(),
         last_comment = coalesce(v_comment, last_comment),
         deal_id = coalesce(v_deal_id, deal_id)
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_attempts (lead_id, rep_id, action, outcome, comment, attempt_no, followup_at, work_date)
  values (p_lead_id, v_uid, 'call', v_outcome.key, v_comment, v_attempt, v_next, v_work_date);

  if p_meeting_at is not null then
    insert into public.meetings (owner_id, deal_id, lead_id, title, starts_at, duration_minutes)
    values (coalesce(v_lead.assigned_to, v_uid), v_lead.deal_id, v_lead.id,
            'Meeting with ' || coalesce(nullif(v_lead.name, ''), 'prospect'),
            p_meeting_at, coalesce(p_meeting_minutes, 30));
  end if;

  return jsonb_build_object('lead', to_jsonb(v_lead), 'today', public.my_today());
end
$$;

-- Fix a typo on a lead you own (name, email, phone) without touching its history.
create or replace function public.update_lead_contact(
  p_lead_id bigint, p_name text, p_personal_email text, p_work_email text, p_phone text
) returns public.leads
language plpgsql security definer set search_path = public
as $$
declare
  v_lead public.leads;
begin
  update public.leads
     set name = coalesce(p_name, name),
         personal_email = p_personal_email,
         work_email = p_work_email,
         phone = p_phone
   where id = p_lead_id and (assigned_to = auth.uid() or public.is_admin())
  returning * into v_lead;
  if not found then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;
  return v_lead;
end
$$;

-- -----------------------------------------------------------------------------
-- Numbers
-- -----------------------------------------------------------------------------
create or replace function public.sales_stats(p_user uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_result jsonb;
begin
  if v_user <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own numbers' using errcode = '42501';
  end if;

  with att as (
    select a.*, o.connected, o.effect
      from public.lead_attempts a
      left join public.lead_outcomes o on o.key = a.outcome
     where a.rep_id = v_user and a.work_date between p_from and p_to
  ),
  days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'dials', (select count(*) from att where action = 'call'),
      'connected', (select count(*) from att where action = 'call' and connected),
      'skips', (select count(*) from att where action = 'skip'),
      'prospects', (select count(*) from public.deals where owner_id = v_user
                      and (created_at at time zone public.app_tz())::date between p_from and p_to),
      'meetings_booked', (select count(*) from public.meetings where owner_id = v_user
                            and (created_at at time zone public.app_tz())::date between p_from and p_to),
      'meetings_held', (select count(*) from public.meetings where owner_id = v_user and status = 'completed'
                          and (starts_at at time zone public.app_tz())::date between p_from and p_to),
      'won_count', (select count(*) from public.deals where owner_id = v_user and stage = 'won'
                      and won_on between p_from and p_to),
      'won_usd', (select coalesce(sum(amount_usd), 0) from public.deals where owner_id = v_user and stage = 'won'
                    and won_on between p_from and p_to),
      'open_pipeline_usd', (select coalesce(sum(amount_usd), 0) from public.deals where owner_id = v_user
                              and stage not in ('won', 'lost')),
      'weighted_pipeline_usd', (select coalesce(sum(amount_usd * probability / 100.0), 0) from public.deals
                                  where owner_id = v_user and stage not in ('won', 'lost')),
      'work_days', (select count(distinct work_date) from att)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                 'date', days.d,
                 'dials', (select count(*) from att where action = 'call' and work_date = days.d),
                 'connected', (select count(*) from att where action = 'call' and connected and work_date = days.d),
                 'prospects', (select count(*) from att where action = 'call' and effect = 'pipeline' and work_date = days.d)
               ) order by days.d), '[]'::jsonb) from days),
    'outcomes', (select coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', n) order by n desc), '[]'::jsonb)
                   from (select outcome, count(*) n from att where action = 'call' group by outcome) x),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'count', n, 'amount', amt)), '[]'::jsonb)
                 from (select stage, count(*) n, sum(amount_usd) amt from public.deals where owner_id = v_user group by stage) x),
    'forecast', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'amount', amt, 'weighted', w) order by m), '[]'::jsonb)
                   from (select date_trunc('month', expected_close)::date m, sum(amount_usd) amt,
                                sum(amount_usd * probability / 100.0) w
                           from public.deals
                          where owner_id = v_user and stage not in ('won', 'lost') and expected_close is not null
                            and expected_close >= date_trunc('month', public.local_today())
                            and expected_close < date_trunc('month', public.local_today()) + interval '6 months'
                          group by 1) x)
  ) into v_result;

  return v_result;
end
$$;

-- The one place reps' numbers meet. Totals only.
create or replace function public.sales_leaderboard(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb,
  dials bigint, connected bigint, prospects bigint, meetings bigint, won_usd numeric, won_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.avatar,
         (select count(*) from public.lead_attempts a
           where a.rep_id = p.id and a.action = 'call' and a.work_date between p_from and p_to),
         (select count(*) from public.lead_attempts a join public.lead_outcomes o on o.key = a.outcome
           where a.rep_id = p.id and a.action = 'call' and o.connected and a.work_date between p_from and p_to),
         (select count(*) from public.deals d
           where d.owner_id = p.id and (d.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select count(*) from public.meetings m
           where m.owner_id = p.id and (m.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select coalesce(sum(d.amount_usd), 0) from public.deals d
           where d.owner_id = p.id and d.stage = 'won' and d.won_on between p_from and p_to),
         (select count(*) from public.deals d
           where d.owner_id = p.id and d.stage = 'won' and d.won_on between p_from and p_to)
    from public.profiles p
   where p.role = 'sales' and p.is_active;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: importing and handing out leads
-- -----------------------------------------------------------------------------
create or replace function public.start_lead_import(p_file_name text, p_total int)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;
  insert into public.lead_imports (file_name, imported_by, total_rows)
  values (p_file_name, auth.uid(), p_total) returning id into v_id;
  return v_id;
end
$$;

-- Inserts one chunk of parsed sheet rows. Rows whose phone (last ten digits) or
-- personal email already exists — in the table or earlier in the same chunk — are
-- counted as duplicates and skipped. Each row may carry its own assigned_to.
create or replace function public.import_leads(p_import_id bigint, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inserted int := 0;
  v_dupes int := 0;
  v_invalid int := 0;
  v_total int := jsonb_array_length(p_rows);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;

  create temporary table _incoming on commit drop as
  select x.*,
         nullif(right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10), '') as phone_key,
         nullif(lower(btrim(coalesce(x.personal_email, ''))), '') as email_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (
      lead_date date, platform text, country text, name text, personal_email text, work_email text,
      phone text, post_link text, query text, service text, assigned_to uuid, legacy jsonb
    );

  delete from _incoming
   where coalesce(btrim(name), '') = '' and phone_key is null and email_key is null and coalesce(btrim(work_email), '') = '';
  get diagnostics v_invalid = row_count;

  -- duplicates against what is already stored
  delete from _incoming i
   where (i.phone_key is not null and exists (select 1 from public.leads l where l.phone_key = i.phone_key))
      or (i.phone_key is null and i.email_key is not null
          and exists (select 1 from public.leads l where lower(l.personal_email) = i.email_key));

  -- duplicates inside this chunk: keep the first
  delete from _incoming i
   using _incoming j
   where j.rn < i.rn
     and ((i.phone_key is not null and i.phone_key = j.phone_key)
          or (i.phone_key is null and i.email_key is not null and i.email_key = j.email_key));

  insert into public.leads (lead_date, platform, country, name, personal_email, work_email, phone, post_link,
                            query, service, assigned_to, assigned_at, import_id, legacy)
  select lead_date, nullif(btrim(platform), ''), nullif(btrim(country), ''), coalesce(btrim(name), ''),
         nullif(btrim(personal_email), ''), nullif(btrim(work_email), ''), nullif(btrim(phone), ''),
         nullif(btrim(post_link), ''), nullif(btrim(query), ''), nullif(btrim(service), ''),
         assigned_to, case when assigned_to is not null then now() end, p_import_id, legacy
    from _incoming
   order by rn;
  get diagnostics v_inserted = row_count;

  v_dupes := v_total - v_invalid - v_inserted;

  update public.lead_imports
     set inserted = inserted + v_inserted, duplicates = duplicates + v_dupes, invalid = invalid + v_invalid
   where id = p_import_id;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dupes, 'invalid', v_invalid);
end
$$;

-- Tell each rep how many leads they were just given. Called once after an import.
create or replace function public.finish_lead_import(p_import_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_import public.lead_imports;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;
  select * into v_import from public.lead_imports where id = p_import_id;
  for r in select assigned_to, count(*) n from public.leads
            where import_id = p_import_id and assigned_to is not null group by assigned_to
  loop
    perform public.notify(r.assigned_to, 'leads.assigned', format('%s new leads are waiting for you', r.n),
      'Press Start on the dialer to work through them.', '/sales', 'info', jsonb_build_object('count', r.n));
  end loop;
  perform public.audit('import', 'leads', p_import_id::text,
    format('Imported %s leads from %s (%s duplicates skipped)', v_import.inserted, v_import.file_name, v_import.duplicates));
  return to_jsonb(v_import);
end
$$;

-- Hand leads to one or more reps, round-robin. p_reps = '{}' unassigns them.
create or replace function public.assign_leads(p_lead_ids bigint[], p_reps uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
  v_n int := coalesce(cardinality(p_reps), 0);
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign leads' using errcode = '42501';
  end if;

  with picked as (
    select id, row_number() over (order by id) - 1 as i
      from public.leads where id = any (p_lead_ids)
  )
  update public.leads l
     set assigned_to = case when v_n = 0 then null else p_reps[(picked.i % v_n) + 1] end,
         assigned_at = case when v_n = 0 then null else now() end,
         skipped_at = null
    from picked
   where l.id = picked.id;
  get diagnostics v_count = row_count;

  if v_n > 0 then
    for r in select assigned_to, count(*) n from public.leads
              where id = any (p_lead_ids) and assigned_to is not null group by assigned_to
    loop
      perform public.notify(r.assigned_to, 'leads.assigned', format('%s new leads are waiting for you', r.n),
        'Press Start on the dialer to work through them.', '/sales', 'info', jsonb_build_object('count', r.n));
    end loop;
  end if;

  perform public.audit('assign', 'leads', null,
    case when v_n = 0 then format('Unassigned %s leads', v_count)
         else format('Assigned %s leads across %s rep(s)', v_count, v_n) end,
    jsonb_build_object('lead_count', v_count, 'reps', to_jsonb(p_reps)));
  return v_count;
end
$$;

-- Same, for every lead matching a filter (so the admin can hand out 5,000 leads
-- without the browser holding 5,000 ids).
create or replace function public.admin_lead_ids(p_filter jsonb, p_limit int default 100000)
returns bigint[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ids bigint[];
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_ids
    from (
      select l.id from public.leads l
       where (p_filter ->> 'service' is null or l.service = p_filter ->> 'service')
         and (p_filter ->> 'platform' is null or l.platform = p_filter ->> 'platform')
         and (p_filter ->> 'stage' is null or l.stage = p_filter ->> 'stage')
         and (p_filter ->> 'status' is null or l.status = p_filter ->> 'status')
         and (p_filter ->> 'from' is null or l.lead_date >= (p_filter ->> 'from')::date)
         and (p_filter ->> 'to' is null or l.lead_date <= (p_filter ->> 'to')::date)
         and (p_filter ->> 'import_id' is null or l.import_id = (p_filter ->> 'import_id')::bigint)
         and (p_filter ->> 'assigned' is null
              or (p_filter ->> 'assigned' = 'unassigned' and l.assigned_to is null)
              or (p_filter ->> 'assigned' <> 'unassigned' and l.assigned_to::text = p_filter ->> 'assigned'))
         and (p_filter ->> 'q' is null or l.name ilike '%' || (p_filter ->> 'q') || '%'
              or l.phone ilike '%' || (p_filter ->> 'q') || '%'
              or l.personal_email ilike '%' || (p_filter ->> 'q') || '%')
       order by l.id
       limit p_limit
    ) x;
  return v_ids;
end
$$;

-- Put exhausted or closed leads back in the queue for another round.
create or replace function public.recycle_leads(p_lead_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can recycle leads' using errcode = '42501';
  end if;
  update public.leads
     set stage = 'queue', status = 'new', attempts = 0, closed_reason = null,
         next_action_at = null, skipped_at = null
   where id = any (p_lead_ids) and stage = 'closed'
     and coalesce(closed_reason, '') not in ('do_not_call', 'invalid_number', 'won');
  get diagnostics v_count = row_count;
  perform public.audit('recycle', 'leads', null, format('Recycled %s leads', v_count));
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: the whole sales floor at a glance
-- -----------------------------------------------------------------------------
create or replace function public.sales_team_overview(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb,
  dials bigint, connected bigint, prospects bigint, meetings bigint,
  won_usd numeric, won_count bigint, open_pipeline_usd numeric,
  leads_total bigint, leads_open bigint, target_usd numeric, daily_target int
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
  select lb.profile_id, lb.full_name, lb.avatar, lb.dials, lb.connected, lb.prospects, lb.meetings,
         lb.won_usd, lb.won_count,
         (select coalesce(sum(d.amount_usd), 0) from public.deals d
           where d.owner_id = lb.profile_id and d.stage not in ('won', 'lost')),
         (select count(*) from public.leads l where l.assigned_to = lb.profile_id),
         (select count(*) from public.leads l where l.assigned_to = lb.profile_id and l.stage <> 'closed'),
         e.monthly_target_usd, e.daily_dial_target
    from public.sales_leaderboard(p_from, p_to) lb
    left join public.employment e on e.profile_id = lb.profile_id
   order by lb.won_usd desc, lb.dials desc;
end
$$;

-- -----------------------------------------------------------------------------
-- Meeting reminders (pg_cron, every five minutes)
-- -----------------------------------------------------------------------------
create or replace function public.sales_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in
    update public.meetings set reminded_at = now()
     where status = 'scheduled' and reminded_at is null
       and starts_at between now() and now() + interval '15 minutes'
    returning owner_id, title, starts_at
  loop
    perform public.notify(r.owner_id, 'meeting.soon', 'Meeting starting soon',
      format('%s at %s', r.title, to_char(r.starts_at at time zone public.app_tz(), 'HH12:MI AM')),
      '/sales/meetings', 'info');
  end loop;
end
$$;
revoke execute on function public.sales_sweep() from public, anon, authenticated;

-- >>> 20261001000400_payroll.sql
-- =============================================================================
-- Payroll — the 20th to the 20th
--
-- A period starts on the cutoff day (20th) and ends the day before the next
-- cutoff. Pay for each person is worked out live from attendance and, for sales,
-- from the deals they closed in the period:
--
--   Attendance (per period, counted in date order)
--     absent / unpaid leave / arrived too late   one day deducted
--     short day   first one is a warning,        every one after deducts a day
--     half day    first one deducts half a day,  every one after deducts a day
--
--   Sales target (monthly, in USD)
--     closed ≤ 30% of target     paid 30% of salary
--     30% – 100%                 full salary
--     ≥ 100%                     full salary + 25% commission on everything closed
--
-- The daily rate is the monthly salary divided by the scheduled working days in
-- the period (or by 30, if the admin prefers that in Settings).
-- =============================================================================

create or replace function public.payroll_period_start(p_date date)
returns date
language sql stable security definer set search_path = public
as $$
  select case
    when extract(day from p_date) >= s.payroll_cutoff_day
      then make_date(extract(year from p_date)::int, extract(month from p_date)::int, s.payroll_cutoff_day)
    else (make_date(extract(year from p_date)::int, extract(month from p_date)::int, s.payroll_cutoff_day)
          - interval '1 month')::date
  end
  from public.settings s
$$;

create or replace function public.payroll_period_end(p_start date)
returns date
language sql immutable
as $$ select ((p_start + interval '1 month')::date - 1) $$;

-- A released payslip is frozen: later corrections to attendance do not change it.
create table public.payroll_releases (
  period_start  date not null,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  snapshot      jsonb not null,
  released_at   timestamptz not null default now(),
  released_by   uuid references public.profiles (id) on delete set null,
  primary key (period_start, profile_id)
);
alter table public.payroll_releases enable row level security;
create policy payroll_releases_read on public.payroll_releases for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create or replace function public.payroll_compute(p_profile uuid, p_period_start date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.settings;
  e public.employment;
  p public.profiles;
  ad public.attendance_days;
  v_start date;
  v_end date;
  v_today date := public.local_today();
  d date;
  v_scheduled boolean;
  v_sched_days int := 0;
  v_daily numeric := 0;
  v_status text;
  v_ded numeric;
  v_note text;
  v_short int := 0;
  v_half int := 0;
  v_ded_days numeric := 0;
  v_counts jsonb := '{}'::jsonb;
  v_days jsonb := '[]'::jsonb;
  v_ded_pkr numeric;
  v_after_att numeric;
  v_tier text := 'none';
  v_factor numeric := 1;
  v_closed numeric := 0;
  v_ratio numeric := null;
  v_comm_usd numeric := 0;
  v_net numeric;
  v_release public.payroll_releases;
begin
  if p_profile <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own pay' using errcode = '42501';
  end if;

  select * into s from public.settings;
  select * into p from public.profiles where id = p_profile;
  select * into e from public.employment where profile_id = p_profile;
  if p.id is null or e.profile_id is null then
    return null;
  end if;

  v_start := public.payroll_period_start(coalesce(p_period_start, v_today));
  v_end := public.payroll_period_end(v_start);

  select * into v_release from public.payroll_releases where period_start = v_start and profile_id = p_profile;
  if found then
    return v_release.snapshot || jsonb_build_object('released_at', v_release.released_at);
  end if;

  for d in select g::date from generate_series(v_start, v_end, interval '1 day') g loop
    if public.is_work_day(p_profile, d) and (e.joined_on is null or d >= e.joined_on) then
      v_sched_days := v_sched_days + 1;
    end if;
  end loop;

  v_daily := case s.daily_rate_basis
               when 'calendar_30' then e.monthly_salary_pkr / 30.0
               else e.monthly_salary_pkr / greatest(v_sched_days, 1)
             end;

  for d in select g::date from generate_series(v_start, least(v_end, v_today), interval '1 day') g loop
    v_scheduled := public.is_work_day(p_profile, d) and (e.joined_on is null or d >= e.joined_on);
    select * into ad from public.attendance_days where profile_id = p_profile and work_date = d;
    v_ded := 0;
    v_note := null;

    if ad.id is not null and ad.override_status is not null then
      v_status := ad.override_status;
      v_note := ad.override_note;
    elsif ad.id is not null and ad.first_in is not null then
      v_status := case ad.arrival
                    when 'on_time' then 'present' when 'short' then 'short' when 'half' then 'half'
                    when 'late_absent' then 'late_absent' else 'extra' end;
    elsif exists (select 1 from public.holidays h where h.day = d) then
      v_status := 'holiday';
    elsif v_scheduled then
      if d < v_today or now() > public.shift_start_at(p_profile, d) + make_interval(mins => e.shift_minutes) then
        v_status := 'absent';
      else
        v_status := 'pending';
      end if;
    else
      v_status := 'off';
    end if;

    if e.tracks_attendance then
      case v_status
        when 'absent', 'unpaid_leave', 'late_absent' then
          v_ded := 1;
        when 'short' then
          v_short := v_short + 1;
          if v_short <= s.free_short_days then
            v_note := coalesce(v_note, 'Warning — no deduction');
          else
            v_ded := 1;
          end if;
        when 'half' then
          v_half := v_half + 1;
          if v_half <= s.reduced_half_days then
            v_ded := 0.5;
          else
            v_ded := 1;
          end if;
        else
          null;
      end case;
    end if;

    v_ded_days := v_ded_days + v_ded;
    v_counts := jsonb_set(v_counts, array[v_status], to_jsonb(coalesce((v_counts ->> v_status)::int, 0) + 1));
    v_days := v_days || jsonb_build_object(
      'date', d, 'status', v_status, 'deduction_days', v_ded, 'note', v_note,
      'late_minutes', coalesce(ad.late_minutes, 0), 'first_in', ad.first_in, 'last_out', ad.last_out,
      'auto_signed_out', coalesce(ad.auto_signed_out, false));
  end loop;

  v_ded_pkr := round(v_ded_days * v_daily);
  v_after_att := greatest(0, e.monthly_salary_pkr - v_ded_pkr);

  if p.role = 'sales' and e.monthly_target_usd > 0 then
    select coalesce(sum(amount_usd), 0) into v_closed
      from public.deals where owner_id = p_profile and stage = 'won' and won_on between v_start and v_end;
    v_ratio := v_closed / e.monthly_target_usd;
    if v_ratio <= s.low_performance_ratio then
      v_tier := 'below';
      v_factor := s.low_performance_salary_factor;
    elsif v_ratio < 1 then
      v_tier := 'base';
    else
      v_tier := 'commission';
      v_comm_usd := round(v_closed * s.commission_rate, 2);
    end if;
  end if;

  v_net := round(v_after_att * v_factor + v_comm_usd * s.usd_to_pkr);

  return jsonb_build_object(
    'profile_id', p_profile,
    'full_name', p.full_name,
    'role', p.role,
    'avatar', p.avatar,
    'period_start', v_start,
    'period_end', v_end,
    'pay_day', v_end + 1,
    'is_current', v_today between v_start and v_end,
    'monthly_salary_pkr', e.monthly_salary_pkr,
    'scheduled_days', v_sched_days,
    'daily_rate_pkr', round(v_daily),
    'deduction_days', v_ded_days,
    'deduction_pkr', v_ded_pkr,
    'after_attendance_pkr', v_after_att,
    'counts', v_counts,
    'days', v_days,
    'sales', case when p.role = 'sales' then jsonb_build_object(
      'target_usd', e.monthly_target_usd,
      'closed_usd', v_closed,
      'ratio', v_ratio,
      'tier', v_tier,
      'salary_factor', v_factor,
      'low_threshold_usd', round(e.monthly_target_usd * s.low_performance_ratio, 2),
      'commission_rate', s.commission_rate,
      'commission_usd', v_comm_usd,
      'commission_pkr', round(v_comm_usd * s.usd_to_pkr),
      'usd_to_pkr', s.usd_to_pkr
    ) end,
    'net_pkr', v_net,
    'released_at', null
  );
end
$$;

create or replace function public.payroll_overview(p_period_start date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.payroll_compute(p.id, p_period_start) - 'days' order by p.full_name)
      from public.profiles p
      join public.employment e on e.profile_id = p.id
     where p.role <> 'client' and (p.is_active or exists (
             select 1 from public.attendance_days ad where ad.profile_id = p.id
              and ad.work_date >= public.payroll_period_start(coalesce(p_period_start, public.local_today()))))
       and e.monthly_salary_pkr > 0
  ), '[]'::jsonb);
end
$$;

-- Freeze every payslip for a finished period.
create or replace function public.release_payroll(p_period_start date)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_start date := public.payroll_period_start(p_period_start);
  v_count int := 0;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can release payroll' using errcode = '42501';
  end if;
  if public.payroll_period_end(v_start) >= public.local_today() then
    raise exception 'This period has not finished yet';
  end if;
  for r in
    select p.id from public.profiles p join public.employment e on e.profile_id = p.id
     where p.role <> 'client' and e.monthly_salary_pkr > 0
       and not exists (select 1 from public.payroll_releases pr where pr.period_start = v_start and pr.profile_id = p.id)
  loop
    insert into public.payroll_releases (period_start, profile_id, snapshot, released_by)
    values (v_start, r.id, public.payroll_compute(r.id, v_start), auth.uid());
    perform public.notify(r.id, 'payroll.released', 'Your payslip is ready',
      format('Pay for %s – %s has been released.', to_char(v_start, 'DD Mon'),
             to_char(public.payroll_period_end(v_start), 'DD Mon')), '/me/pay', 'success');
    v_count := v_count + 1;
  end loop;
  perform public.audit('release', 'payroll', v_start::text, format('Released payroll for %s people', v_count));
  return v_count;
end
$$;

-- >>> 20261001000500_agents.sql
-- =============================================================================
-- Agents — everyone's little character, and the items they earn
--
-- Most of the wardrobe is free. A few items are earned, game-style; the database
-- refuses an outfit containing an item that person has not unlocked yet.
-- Item keys are "<slot>:<item>" and match client/src/agent/catalog.ts.
-- =============================================================================

create table public.agent_locked_items (
  item_key    text primary key,
  label       text not null,
  rule        text not null check (rule in ('best_day_dials', 'total_dials', 'meetings_total', 'won_usd_total',
                                             'on_time_days', 'tenure_days')),
  threshold   numeric not null,
  hint        text not null
);

insert into public.agent_locked_items (item_key, label, rule, threshold, hint) values
  ('hat:headset_gold', 'Golden headset', 'best_day_dials', 250,   'Hit 250 dials in a single day'),
  ('glasses:star',     'Star shades',    'total_dials',    1000,  'Make 1,000 dials'),
  ('held:trophy',      'Trophy',         'meetings_total', 10,    'Book 10 meetings'),
  ('hat:crown',        'Crown',          'won_usd_total',  5000,  'Close $5,000 in deals'),
  ('pet:dragon',       'Baby dragon',    'won_usd_total',  20000, 'Close $20,000 in deals'),
  ('hat:halo',         'Halo',           'on_time_days',   20,    'Be on time for 20 shifts'),
  ('bg:galaxy',        'Galaxy',         'on_time_days',   60,    'Be on time for 60 shifts'),
  ('outfit:tuxedo',    'Tuxedo',         'tenure_days',    30,    'Spend 30 days at NUUKE');

create table public.agent_unlocks (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  item_key     text not null references public.agent_locked_items (item_key) on delete cascade,
  unlocked_at  timestamptz not null default now(),
  primary key (profile_id, item_key)
);

alter table public.agent_locked_items enable row level security;
alter table public.agent_unlocks enable row level security;
create policy agent_locked_items_read on public.agent_locked_items for select to authenticated using (true);
create policy agent_unlocks_read on public.agent_unlocks for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Progress towards every earnable item, for the wardrobe screen.
create or replace function public.agent_progress(p_profile uuid default null)
returns table (item_key text, label text, hint text, threshold numeric, progress numeric, unlocked boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_profile, auth.uid());
  v_best_day numeric;
  v_total_dials numeric;
  v_meetings numeric;
  v_won numeric;
  v_on_time numeric;
  v_tenure numeric;
begin
  if v_uid <> auth.uid() and not public.is_admin() then
    raise exception 'Not yours' using errcode = '42501';
  end if;
  select coalesce(max(n), 0) into v_best_day
    from (select count(*) n from public.lead_attempts where rep_id = v_uid and action = 'call' group by work_date) x;
  select count(*) into v_total_dials from public.lead_attempts where rep_id = v_uid and action = 'call';
  select count(*) into v_meetings from public.meetings where owner_id = v_uid;
  select coalesce(sum(amount_usd), 0) into v_won from public.deals where owner_id = v_uid and stage = 'won';
  select count(*) into v_on_time from public.attendance_days
   where profile_id = v_uid and first_in is not null and arrival = 'on_time';
  select greatest(0, public.local_today() - coalesce(e.joined_on, (p.created_at at time zone public.app_tz())::date))
    into v_tenure
    from public.profiles p left join public.employment e on e.profile_id = p.id where p.id = v_uid;

  return query
  select li.item_key, li.label, li.hint, li.threshold,
         case li.rule
           when 'best_day_dials' then v_best_day
           when 'total_dials' then v_total_dials
           when 'meetings_total' then v_meetings
           when 'won_usd_total' then v_won
           when 'on_time_days' then v_on_time
           when 'tenure_days' then v_tenure
         end,
         exists (select 1 from public.agent_unlocks u where u.profile_id = v_uid and u.item_key = li.item_key)
    from public.agent_locked_items li
   order by li.threshold;
end
$$;

-- Grants anything newly earned and says so. The app calls this on load and after
-- moments that might earn something (a Done on the dialer, a won deal).
create or replace function public.check_agent_unlocks()
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then return '{}'; end if;
  for r in
    select * from public.agent_progress(auth.uid()) ap
     where not ap.unlocked and ap.progress >= ap.threshold
  loop
    insert into public.agent_unlocks (profile_id, item_key) values (auth.uid(), r.item_key)
    on conflict do nothing;
    perform public.notify(auth.uid(), 'agent.unlock', format('Unlocked: %s', r.label),
      format('%s. Dress your agent up in it from the wardrobe.', r.hint), '/me/agent', 'celebrate',
      jsonb_build_object('item_key', r.item_key));
  end loop;
  return coalesce((select array_agg(item_key) from public.agent_unlocks where profile_id = auth.uid()), '{}');
end
$$;

create or replace function public.guard_agent_items()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_locked text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select li.label into v_locked
    from jsonb_each_text(coalesce(new.avatar, '{}'::jsonb)) kv
    join public.agent_locked_items li on li.item_key = kv.key || ':' || kv.value
   where not exists (select 1 from public.agent_unlocks u where u.profile_id = new.id and u.item_key = li.item_key)
   limit 1;
  if v_locked is not null then
    raise exception '% is still locked', v_locked using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_agent_items before insert or update of avatar on public.profiles
  for each row execute function public.guard_agent_items();

-- >>> 20261001000600_admin.sql
-- =============================================================================
-- Admin helpers
-- =============================================================================

-- Distinct services and platforms across every lead, with counts, for the admin's
-- filters (selecting the columns directly would stop at the API's row cap).
create or replace function public.admin_lead_facets()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('value', service, 'count', n) order by n desc)
                            from (select service, count(*) n from public.leads where service is not null group by service) s), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('value', platform, 'count', n) order by n desc)
                             from (select platform, count(*) n from public.leads where platform is not null group by platform) s), '[]'::jsonb)
  );
end
$$;

-- >>> 20261001000700_tracking_start.sql
-- =============================================================================
-- "Track attendance from" — the day the CRM went live.
--
-- Payroll looks back over the whole pay period. Without a start date, every
-- working day before go-live had no sign-in and was counted as absent. Days
-- before attendance_starts_on now show as "Before go-live" and are never
-- deducted; the admin can move the date in Rules & settings.
--
-- Safe to run more than once. On an existing project the start date is set to
-- today (company time) unless one is already set.
-- =============================================================================

alter table public.settings add column if not exists attendance_starts_on date;
update public.settings set attendance_starts_on = coalesce(attendance_starts_on, public.local_today());

create or replace function public.payroll_compute(p_profile uuid, p_period_start date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.settings;
  e public.employment;
  p public.profiles;
  ad public.attendance_days;
  v_start date;
  v_end date;
  v_today date := public.local_today();
  d date;
  v_scheduled boolean;
  v_sched_days int := 0;
  v_daily numeric := 0;
  v_status text;
  v_ded numeric;
  v_note text;
  v_short int := 0;
  v_half int := 0;
  v_ded_days numeric := 0;
  v_counts jsonb := '{}'::jsonb;
  v_days jsonb := '[]'::jsonb;
  v_ded_pkr numeric;
  v_after_att numeric;
  v_tier text := 'none';
  v_factor numeric := 1;
  v_closed numeric := 0;
  v_ratio numeric := null;
  v_comm_usd numeric := 0;
  v_net numeric;
  v_release public.payroll_releases;
begin
  if p_profile <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own pay' using errcode = '42501';
  end if;

  select * into s from public.settings;
  select * into p from public.profiles where id = p_profile;
  select * into e from public.employment where profile_id = p_profile;
  if p.id is null or e.profile_id is null then
    return null;
  end if;

  v_start := public.payroll_period_start(coalesce(p_period_start, v_today));
  v_end := public.payroll_period_end(v_start);

  select * into v_release from public.payroll_releases where period_start = v_start and profile_id = p_profile;
  if found then
    return v_release.snapshot || jsonb_build_object('released_at', v_release.released_at);
  end if;

  for d in select g::date from generate_series(v_start, v_end, interval '1 day') g loop
    if public.is_work_day(p_profile, d) and (e.joined_on is null or d >= e.joined_on) then
      v_sched_days := v_sched_days + 1;
    end if;
  end loop;

  v_daily := case s.daily_rate_basis
               when 'calendar_30' then e.monthly_salary_pkr / 30.0
               else e.monthly_salary_pkr / greatest(v_sched_days, 1)
             end;

  for d in select g::date from generate_series(v_start, least(v_end, v_today), interval '1 day') g loop
    v_scheduled := public.is_work_day(p_profile, d) and (e.joined_on is null or d >= e.joined_on);
    select * into ad from public.attendance_days where profile_id = p_profile and work_date = d;
    v_ded := 0;
    v_note := null;

    if s.attendance_starts_on is not null and d < s.attendance_starts_on
       and (ad.id is null or (ad.first_in is null and ad.override_status is null)) then
      -- Before the CRM started keeping attendance: never counted against anyone.
      v_status := 'untracked';
    elsif ad.id is not null and ad.override_status is not null then
      v_status := ad.override_status;
      v_note := ad.override_note;
    elsif ad.id is not null and ad.first_in is not null then
      v_status := case ad.arrival
                    when 'on_time' then 'present' when 'short' then 'short' when 'half' then 'half'
                    when 'late_absent' then 'late_absent' else 'extra' end;
    elsif exists (select 1 from public.holidays h where h.day = d) then
      v_status := 'holiday';
    elsif v_scheduled then
      if d < v_today or now() > public.shift_start_at(p_profile, d) + make_interval(mins => e.shift_minutes) then
        v_status := 'absent';
      else
        v_status := 'pending';
      end if;
    else
      v_status := 'off';
    end if;

    if e.tracks_attendance then
      case v_status
        when 'absent', 'unpaid_leave', 'late_absent' then
          v_ded := 1;
        when 'short' then
          v_short := v_short + 1;
          if v_short <= s.free_short_days then
            v_note := coalesce(v_note, 'Warning — no deduction');
          else
            v_ded := 1;
          end if;
        when 'half' then
          v_half := v_half + 1;
          if v_half <= s.reduced_half_days then
            v_ded := 0.5;
          else
            v_ded := 1;
          end if;
        else
          null;
      end case;
    end if;

    v_ded_days := v_ded_days + v_ded;
    v_counts := jsonb_set(v_counts, array[v_status], to_jsonb(coalesce((v_counts ->> v_status)::int, 0) + 1));
    v_days := v_days || jsonb_build_object(
      'date', d, 'status', v_status, 'deduction_days', v_ded, 'note', v_note,
      'late_minutes', coalesce(ad.late_minutes, 0), 'first_in', ad.first_in, 'last_out', ad.last_out,
      'auto_signed_out', coalesce(ad.auto_signed_out, false));
  end loop;

  v_ded_pkr := round(v_ded_days * v_daily);
  v_after_att := greatest(0, e.monthly_salary_pkr - v_ded_pkr);

  if p.role = 'sales' and e.monthly_target_usd > 0 then
    select coalesce(sum(amount_usd), 0) into v_closed
      from public.deals where owner_id = p_profile and stage = 'won' and won_on between v_start and v_end;
    v_ratio := v_closed / e.monthly_target_usd;
    if v_ratio <= s.low_performance_ratio then
      v_tier := 'below';
      v_factor := s.low_performance_salary_factor;
    elsif v_ratio < 1 then
      v_tier := 'base';
    else
      v_tier := 'commission';
      v_comm_usd := round(v_closed * s.commission_rate, 2);
    end if;
  end if;

  v_net := round(v_after_att * v_factor + v_comm_usd * s.usd_to_pkr);

  return jsonb_build_object(
    'profile_id', p_profile,
    'full_name', p.full_name,
    'role', p.role,
    'avatar', p.avatar,
    'period_start', v_start,
    'period_end', v_end,
    'pay_day', v_end + 1,
    'is_current', v_today between v_start and v_end,
    'monthly_salary_pkr', e.monthly_salary_pkr,
    'scheduled_days', v_sched_days,
    'daily_rate_pkr', round(v_daily),
    'deduction_days', v_ded_days,
    'deduction_pkr', v_ded_pkr,
    'after_attendance_pkr', v_after_att,
    'counts', v_counts,
    'days', v_days,
    'sales', case when p.role = 'sales' then jsonb_build_object(
      'target_usd', e.monthly_target_usd,
      'closed_usd', v_closed,
      'ratio', v_ratio,
      'tier', v_tier,
      'salary_factor', v_factor,
      'low_threshold_usd', round(e.monthly_target_usd * s.low_performance_ratio, 2),
      'commission_rate', s.commission_rate,
      'commission_usd', v_comm_usd,
      'commission_pkr', round(v_comm_usd * s.usd_to_pkr),
      'usd_to_pkr', s.usd_to_pkr
    ) end,
    'net_pkr', v_net,
    'released_at', null
  );
end
$$;

create or replace function public.attendance_board(p_date date default null)
returns table (
  profile_id uuid, full_name text, role public.app_role, department text, title text, avatar jsonb,
  work_date date, scheduled_start timestamptz, scheduled_end timestamptz,
  first_in timestamptz, last_out timestamptz, late_minutes int, arrival text, override_status text,
  state text, worked_seconds int, break_seconds int, auto_signed_out boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can see the attendance board' using errcode = '42501';
  end if;
  return query
  with people as (
    select p.*, e.shift_minutes,
           coalesce(p_date, public.resolve_work_date(p.id, now())) as d
      from public.profiles p
      join public.employment e on e.profile_id = p.id
     where p.is_active and p.role <> 'client' and e.tracks_attendance
  )
  select pe.id, pe.full_name, pe.role, pe.department, pe.title, pe.avatar,
         pe.d,
         coalesce(ad.scheduled_start, public.shift_start_at(pe.id, pe.d)),
         coalesce(ad.scheduled_end, public.shift_start_at(pe.id, pe.d) + make_interval(mins => pe.shift_minutes)),
         ad.first_in, ad.last_out, coalesce(ad.late_minutes, 0), ad.arrival, ad.override_status,
         case
           when ad.override_status is not null and ad.first_in is null then ad.override_status
           when exists (select 1 from public.attendance_breaks b where b.profile_id = pe.id and b.ended_at is null) then 'break'
           when exists (select 1 from public.attendance_sessions s where s.profile_id = pe.id and s.ended_at is null and s.day_id = ad.id) then 'online'
           when ad.first_in is not null then 'signed_out'
           when (select attendance_starts_on from public.settings) > pe.d then 'untracked'
           when not public.is_work_day(pe.id, pe.d) then 'day_off'
           when now() < public.shift_start_at(pe.id, pe.d) then 'not_started'
           else 'absent'
         end,
         case when ad.id is null then 0 else public.day_worked_seconds(ad.id) end,
         case when ad.id is null then 0 else public.day_break_seconds(ad.id) end,
         coalesce(ad.auto_signed_out, false)
    from people pe
    left join public.attendance_days ad on ad.profile_id = pe.id and ad.work_date = pe.d
   order by pe.full_name;
end
$$;

create or replace function public.attendance_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_grace int;
  v_absent int;
  v_allow int;
begin
  select signout_grace_minutes, absent_alert_minutes, break_allowance_minutes
    into v_grace, v_absent, v_allow from public.settings;

  -- 1. reminders
  for r in
    select s.id as session_id, d.id as day_id, d.profile_id, d.scheduled_end
      from public.attendance_sessions s
      join public.attendance_days d on d.id = s.day_id
     where s.ended_at is null and d.signout_reminded_at is null
       and d.scheduled_end is not null and d.scheduled_end < now()
  loop
    update public.attendance_days set signout_reminded_at = now() where id = r.day_id;
    perform public.notify(r.profile_id, 'attendance.signout_reminder', 'Your shift is over — remember to sign out',
      format('If you are still signed in %s minutes from now, we will sign you out automatically.', v_grace),
      null, 'warning');
  end loop;

  -- 2. automatic sign-out
  for r in
    select s.id as session_id, d.id as day_id, d.profile_id, p.full_name
      from public.attendance_sessions s
      join public.attendance_days d on d.id = s.day_id
      join public.profiles p on p.id = d.profile_id
     where s.ended_at is null and d.signout_reminded_at is not null
       and d.signout_reminded_at + make_interval(mins => v_grace) < now()
  loop
    update public.attendance_breaks set ended_at = now() where session_id = r.session_id and ended_at is null;
    update public.attendance_sessions set ended_at = now(), end_reason = 'auto' where id = r.session_id;
    update public.attendance_days set last_out = now(), auto_signed_out = true where id = r.day_id;
    perform public.notify(r.profile_id, 'attendance.auto_signout', 'You were signed out automatically',
      'You did not sign out after your shift, so the system did it for you. Your admin has been told.', null, 'danger');
    perform public.notify_admins('attendance.auto_signout', format('%s did not sign out', r.full_name),
      'They were signed out automatically an hour after the reminder.', '/admin/attendance', 'danger',
      jsonb_build_object('profile_id', r.profile_id));
  end loop;

  -- 3. no-shows, for today's and (night shifts) yesterday's work date
  for r in
    select p.id as profile_id, p.full_name, dd.d as work_date, public.shift_start_at(p.id, dd.d) as starts
      from public.profiles p
      join public.employment e on e.profile_id = p.id
      cross join lateral (values (public.local_today()), (public.local_today() - 1)) as dd (d)
     where p.is_active and p.role <> 'client' and e.tracks_attendance
       and public.is_work_day(p.id, dd.d)
       and now() > public.shift_start_at(p.id, dd.d) + make_interval(mins => v_absent)
       and now() < public.shift_start_at(p.id, dd.d) + make_interval(mins => e.shift_minutes)
       and (e.joined_on is null or e.joined_on <= dd.d)
       and dd.d >= coalesce((select attendance_starts_on from public.settings), dd.d)
       and not exists (select 1 from public.attendance_days ad
                        where ad.profile_id = p.id and ad.work_date = dd.d
                          and (ad.first_in is not null or ad.override_status is not null))
  loop
    insert into public.attendance_alerts (profile_id, work_date, kind)
    values (r.profile_id, r.work_date, 'no_show') on conflict do nothing;
    if found then
      perform public.notify(r.profile_id, 'attendance.no_show', 'You have not signed in yet',
        format('Your shift started at %s.', to_char(r.starts at time zone public.app_tz(), 'HH12:MI AM')), null, 'danger');
      perform public.notify_admins('attendance.no_show', format('%s has not signed in', r.full_name),
        format('Their shift started at %s.', to_char(r.starts at time zone public.app_tz(), 'HH12:MI AM')),
        '/admin/attendance', 'danger', jsonb_build_object('profile_id', r.profile_id));
    end if;
  end loop;

  -- 4. long breaks still running
  for r in
    select b.profile_id, b.day_id, d.work_date, p.full_name
      from public.attendance_breaks b
      join public.attendance_days d on d.id = b.day_id
      join public.profiles p on p.id = b.profile_id
     where b.ended_at is null
       and public.day_break_seconds(b.day_id) > v_allow * 60
  loop
    insert into public.attendance_alerts (profile_id, work_date, kind)
    values (r.profile_id, r.work_date, 'break_over') on conflict do nothing;
    if found then
      perform public.notify(r.profile_id, 'attendance.break', 'Break allowance used up',
        'Your break has gone past today''s allowance.', null, 'warning');
      perform public.notify_admins('attendance.break', format('%s is over their break allowance', r.full_name),
        null, '/admin/attendance', 'warning', jsonb_build_object('profile_id', r.profile_id));
    end if;
  end loop;
end
$$;

-- >>> 20261001000800_import_keep_duplicates.sql
-- =============================================================================
-- Lead import keeps repeats
--
-- The sheet often has the same person more than once (a second enquiry, a new
-- service). Those rows are now all imported; only blank rows — no name, phone or
-- email — are dropped. Skipping numbers that already exist is an opt-in tick box
-- in the import wizard, for re-uploading the same sheet by mistake.
-- =============================================================================

drop function if exists public.import_leads(bigint, jsonb);

-- Inserts one chunk of parsed sheet rows. Every row with a name, phone or email is
-- kept — repeats included. Only when p_skip_duplicates is true are rows whose phone
-- (last ten digits) or personal email already exists skipped. Each row may carry its
-- own assigned_to.
create or replace function public.import_leads(p_import_id bigint, p_rows jsonb, p_skip_duplicates boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inserted int := 0;
  v_dupes int := 0;
  v_invalid int := 0;
  v_total int := jsonb_array_length(p_rows);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;

  create temporary table _incoming on commit drop as
  select x.*,
         nullif(right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10), '') as phone_key,
         nullif(lower(btrim(coalesce(x.personal_email, ''))), '') as email_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (
      lead_date date, platform text, country text, name text, personal_email text, work_email text,
      phone text, post_link text, query text, service text, assigned_to uuid, legacy jsonb
    );

  delete from _incoming
   where coalesce(btrim(name), '') = '' and phone_key is null and email_key is null and coalesce(btrim(work_email), '') = '';
  get diagnostics v_invalid = row_count;

  if p_skip_duplicates then
  -- duplicates against what is already stored
  delete from _incoming i
   where (i.phone_key is not null and exists (select 1 from public.leads l where l.phone_key = i.phone_key))
      or (i.phone_key is null and i.email_key is not null
          and exists (select 1 from public.leads l where lower(l.personal_email) = i.email_key));

  -- duplicates inside this chunk: keep the first
  delete from _incoming i
   using _incoming j
   where j.rn < i.rn
     and ((i.phone_key is not null and i.phone_key = j.phone_key)
          or (i.phone_key is null and i.email_key is not null and i.email_key = j.email_key));
  end if;

  insert into public.leads (lead_date, platform, country, name, personal_email, work_email, phone, post_link,
                            query, service, assigned_to, assigned_at, import_id, legacy)
  select lead_date, nullif(btrim(platform), ''), nullif(btrim(country), ''), coalesce(btrim(name), ''),
         nullif(btrim(personal_email), ''), nullif(btrim(work_email), ''), nullif(btrim(phone), ''),
         nullif(btrim(post_link), ''), nullif(btrim(query), ''), nullif(btrim(service), ''),
         assigned_to, case when assigned_to is not null then now() end, p_import_id, legacy
    from _incoming
   order by rn;
  get diagnostics v_inserted = row_count;

  v_dupes := v_total - v_invalid - v_inserted;

  update public.lead_imports
     set inserted = inserted + v_inserted, duplicates = duplicates + v_dupes, invalid = invalid + v_invalid
   where id = p_import_id;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dupes, 'invalid', v_invalid);
end
$$;

-- >>> 20261001000900_schedule.sql
-- =============================================================================
-- Background jobs, and live updates
--
-- pg_cron runs the sweeps every five minutes: sign-out reminders, automatic
-- sign-outs, no-show alerts, long breaks, meeting reminders. It is available on
-- every Supabase project; if it is not enabled the app still works, the sweeps
-- just do not run.
-- =============================================================================

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available here (%). Enable it under Database → Extensions, then run this file again.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'nuuke-sweeps';
  perform cron.schedule('nuuke-sweeps', '*/5 * * * *', 'select public.run_sweeps()');
end
$$;

-- Live notifications in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then
  null;
end
$$;

-- >>> 20261001001000_projects.sql
-- =============================================================================
-- NUUKE CRM — projects: the production workspace and the client portal
--
-- The admin creates a project and puts people on it: production staff (who do
-- the work) and client logins (who watch it happen). Nobody sees a project they
-- are not on, except admins, who see everything.
--
-- Inside a project, the team plans sprints, runs a Kanban board, keeps a
-- calendar and a content calendar, uploads files and shares them with the client
-- for review. Clients see only what the team marks as visible to them, and can
-- comment, approve or ask for changes, and message the team.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Projects and who is on them
-- -----------------------------------------------------------------------------
create table public.projects (
  id           bigint generated always as identity primary key,
  name         text not null check (length(trim(name)) > 0),
  client_name  text,                                   -- the client's company, as it should read on screen
  service      text,
  description  text,
  color        text not null default '#7c5cff',
  status       text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  starts_on    date,
  due_on       date,
  archived_at  timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.project_members (
  project_id  bigint not null references public.projects (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  is_lead     boolean not null default false,          -- shown as the project lead; gets client alerts first
  added_at    timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile on public.project_members (profile_id);

-- 'admin' | 'team' | 'client' | null — how the person asking relates to a project.
create or replace function public.project_access(p_project bigint)
returns text
language sql stable security definer set search_path = public
as $$
  select case
           when pr.role = 'admin' then 'admin'
           when pm.profile_id is null then null
           when pr.role = 'client' then 'client'
           else 'team'
         end
    from public.profiles pr
    left join public.project_members pm on pm.project_id = p_project and pm.profile_id = pr.id
   where pr.id = auth.uid() and pr.is_active
$$;

create or replace function public.can_see_project(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.project_access(p_project) is not null $$;

-- The people who do the work (and admins). Clients only read.
create or replace function public.can_work_project(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.project_access(p_project) in ('admin', 'team'), false) $$;

create or replace function public.is_project_client(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.project_access(p_project) = 'client', false) $$;

-- Does the person asking share a project with this profile? (Clients may see their team.)
create or replace function public.shares_project_with(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members a
      join public.project_members b on b.project_id = a.project_id
     where a.profile_id = auth.uid() and b.profile_id = p_profile
  )
$$;

-- The name of whoever is acting, for alerts and the activity feed.
create or replace function public.actor_name()
returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select full_name from public.profiles where id = auth.uid()), 'NUUKE') $$;

-- -----------------------------------------------------------------------------
-- Sprints
-- -----------------------------------------------------------------------------
create table public.sprints (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references public.projects (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  goal          text,
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'planned' check (status in ('planned', 'active', 'done')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index sprints_project on public.sprints (project_id, starts_on);
create unique index sprints_one_active on public.sprints (project_id) where status = 'active';

-- -----------------------------------------------------------------------------
-- Tasks — the Kanban board
-- -----------------------------------------------------------------------------
create table public.tasks (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  sprint_id       bigint references public.sprints (id) on delete set null,
  title           text not null check (length(trim(title)) > 0),
  description     text,
  status          text not null default 'todo' check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id     uuid references public.profiles (id) on delete set null,
  due_on          date,
  labels          text[] not null default '{}',
  client_visible  boolean not null default true,
  position        double precision not null default extract(epoch from clock_timestamp()),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  completed_at    timestamptz,
  reminded_on     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_project on public.tasks (project_id, status, position);
create index tasks_assignee on public.tasks (assignee_id) where status <> 'done';
create index tasks_sprint on public.tasks (sprint_id);

create table public.task_comments (
  id          bigint generated always as identity primary key,
  task_id     bigint not null references public.tasks (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index task_comments_task on public.task_comments (task_id, created_at);

-- -----------------------------------------------------------------------------
-- Files, wireframes, prototypes — and the client's review of them
--   Versions of one deliverable share a group_id (the first version's id).
-- -----------------------------------------------------------------------------
create table public.project_files (
  id                   bigint generated always as identity primary key,
  project_id           bigint not null references public.projects (id) on delete cascade,
  group_id             bigint,
  version              int not null default 1,
  title                text not null check (length(trim(title)) > 0),
  kind                 text not null default 'document'
                         check (kind in ('wireframe', 'design', 'prototype', 'document', 'video', 'other')),
  description          text,
  storage_path         text unique,     -- in the private "project-files" bucket
  external_url         text,            -- or a link: Figma, a prototype, a Google Doc
  mime_type            text,
  size_bytes           bigint,
  client_visible       boolean not null default false,
  from_client          boolean not null default false,
  review_status        text not null default 'none'
                         check (review_status in ('none', 'pending', 'approved', 'changes_requested')),
  review_note          text,
  review_requested_at  timestamptz,
  review_reminded_at   timestamptz,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  uploaded_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index project_files_project on public.project_files (project_id, created_at desc);
create index project_files_group on public.project_files (group_id, version);
create index project_files_pending on public.project_files (project_id) where review_status = 'pending';

create table public.file_comments (
  id           bigint generated always as identity primary key,
  file_id      bigint not null references public.project_files (id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 4000),
  pin_x        real check (pin_x between 0 and 1),    -- where on the image it was dropped, 0–1
  pin_y        real check (pin_y between 0 and 1),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index file_comments_file on public.file_comments (file_id, created_at);

-- -----------------------------------------------------------------------------
-- Calendars: the content calendar, and meetings / milestones / deadlines
-- -----------------------------------------------------------------------------
create table public.content_posts (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  platform        text not null default 'instagram'
                    check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'website', 'email', 'other')),
  scheduled_at    timestamptz,
  status          text not null default 'idea' check (status in ('idea', 'drafting', 'ready', 'scheduled', 'posted')),
  caption         text,
  file_id         bigint references public.project_files (id) on delete set null,
  owner_id        uuid default auth.uid() references public.profiles (id) on delete set null,
  client_visible  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index content_posts_project on public.content_posts (project_id, scheduled_at);

create table public.project_events (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  kind            text not null default 'meeting' check (kind in ('meeting', 'milestone', 'deadline', 'launch', 'other')),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location        text,                -- a room, or the Zoom / Meet link
  notes           text,
  client_visible  boolean not null default true,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index project_events_project on public.project_events (project_id, starts_at);

-- -----------------------------------------------------------------------------
-- Messages between the client and the team, and the activity feed
-- -----------------------------------------------------------------------------
create table public.project_messages (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index project_messages_project on public.project_messages (project_id, created_at desc);

-- When each person last read a project's messages (for unread counts).
create table public.project_reads (
  profile_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id        bigint not null references public.projects (id) on delete cascade,
  messages_seen_at  timestamptz not null default now(),
  primary key (profile_id, project_id)
);

create table public.project_activity (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete set null,
  kind            text not null,
  summary         text not null,
  link            text,
  client_visible  boolean not null default true,
  created_at      timestamptz not null default now()
);
create index project_activity_project on public.project_activity (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers that write on someone's behalf (not callable from the browser)
-- -----------------------------------------------------------------------------
create or replace function public.log_project(
  p_project bigint, p_kind text, p_summary text, p_link text default null, p_client_visible boolean default true
) returns void
language sql security definer set search_path = public
as $$
  insert into public.project_activity (project_id, actor_id, kind, summary, link, client_visible)
  values (p_project, auth.uid(), p_kind, p_summary, p_link, coalesce(p_client_visible, true))
$$;

-- Alert the people on a project. p_who: 'clients' | 'team' | 'team_admins' (team plus every admin).
create or replace function public.notify_project(
  p_project bigint, p_who text, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_tone text default 'info', p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select id, p_kind, p_title, p_body, p_link, p_tone, coalesce(p_data, '{}'::jsonb)
    from (
      select pr.id
        from public.project_members pm
        join public.profiles pr on pr.id = pm.profile_id
       where pm.project_id = p_project and pr.is_active
         and ((p_who = 'clients' and pr.role = 'client') or (p_who in ('team', 'team_admins') and pr.role <> 'client'))
      union
      select pr.id from public.profiles pr
       where p_who = 'team_admins' and pr.role = 'admin' and pr.is_active
    ) people
   where id is distinct from auth.uid()
$$;

revoke execute on function public.log_project(bigint, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_project(bigint, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rules that keep the data straight
-- -----------------------------------------------------------------------------
create or replace function public.tasks_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.sprint_id is not null and not exists (
    select 1 from public.sprints where id = new.sprint_id and project_id = new.project_id
  ) then
    raise exception 'That sprint belongs to another project' using errcode = '22023';
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.profiles pr
        where pr.id = new.assignee_id and pr.role <> 'client'
          and (pr.role = 'admin' or exists (
                select 1 from public.project_members pm where pm.project_id = new.project_id and pm.profile_id = pr.id))
     ) then
    raise exception 'Only someone on this project''s team can be given a task' using errcode = '22023';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.project_id := old.project_id;   -- tasks never jump between projects
  end if;
  return new;
end
$$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

create or replace function public.files_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_root public.project_files;
begin
  if tg_op = 'INSERT' then
    if new.group_id is null or new.group_id = new.id then
      new.group_id := new.id;
      new.version := 1;
    else
      select * into v_root from public.project_files where id = new.group_id;
      if v_root.id is null or v_root.project_id <> new.project_id then
        raise exception 'That file belongs to another project' using errcode = '22023';
      end if;
      select coalesce(max(version), 0) + 1 into new.version from public.project_files where group_id = new.group_id;
      -- A new version replaces whatever was waiting for review.
      update public.project_files set review_status = 'none'
       where group_id = new.group_id and review_status = 'pending';
    end if;
  else
    new.project_id := old.project_id;
    new.group_id := old.group_id;
    new.version := old.version;
    -- Approving or asking for changes is the client's call (through review_file), or an admin's.
    if new.review_status in ('approved', 'changes_requested')
       and new.review_status is distinct from old.review_status
       and coalesce(current_setting('nuuke.reviewing', true), '') <> '1'
       and auth.uid() is not null and not public.is_admin() then
      raise exception 'Only the client can approve or ask for changes' using errcode = '42501';
    end if;
  end if;
  if new.review_status = 'pending' then
    new.client_visible := true;
    if tg_op = 'INSERT' or old.review_status <> 'pending' then
      new.review_requested_at := now();
      new.review_reminded_at := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
  end if;
  return new;
end
$$;
create trigger files_guard before insert or update on public.project_files
  for each row execute function public.files_guard();

create or replace function public.posts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.project_id := old.project_id;
  return new;
end
$$;
create trigger content_posts_touch before update on public.content_posts
  for each row execute function public.posts_touch();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Alerts and the activity feed
-- -----------------------------------------------------------------------------
create or replace function public.project_name(p_project bigint)
returns text
language sql stable security definer set search_path = public
as $$ select name from public.projects where id = p_project $$;

create or replace function public.on_member_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := public.project_name(new.project_id);
  v_person public.profiles;
begin
  select * into v_person from public.profiles where id = new.profile_id;
  if new.profile_id is distinct from auth.uid() then
    perform public.notify(new.profile_id, 'project_added',
      case when v_person.role = 'client' then 'Your project is ready: ' || v_name else 'You''re on ' || v_name end,
      case when v_person.role = 'client' then 'See the team, the plan and everything being made for you.'
           else 'Added by ' || public.actor_name() || '.' end,
      '/projects/' || new.project_id, 'celebrate');
  end if;
  perform public.log_project(new.project_id, 'member',
    v_person.full_name || case when v_person.role = 'client' then ' joined as the client' else ' joined the team' end,
    null, true);
  return new;
end
$$;
create trigger project_members_added after insert on public.project_members
  for each row execute function public.on_member_added();

create or replace function public.on_task_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link text := '/projects/' || new.project_id || '/board?task=' || new.id;
  v_status text := case new.status
    when 'backlog' then 'Backlog' when 'todo' then 'To do' when 'in_progress' then 'In progress'
    when 'review' then 'In review' else 'Done' end;
begin
  if tg_op = 'INSERT' then
    perform public.log_project(new.project_id, 'task', public.actor_name() || ' added “' || new.title || '”', v_link, new.client_visible);
  elsif new.status is distinct from old.status then
    perform public.log_project(new.project_id, case when new.status = 'done' then 'task_done' else 'task' end,
      public.actor_name() || case when new.status = 'done' then ' finished “' || new.title || '”'
                                  else ' moved “' || new.title || '” to ' || v_status end,
      v_link, new.client_visible);
    if new.status = 'review' and new.created_by is not null and new.created_by is distinct from auth.uid()
       and new.created_by is distinct from new.assignee_id then
      perform public.notify(new.created_by, 'task_review', 'Ready for review: ' || new.title,
        public.actor_name() || ' · ' || public.project_name(new.project_id), v_link, 'info');
    end if;
  end if;

  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task_assigned', 'New task: ' || new.title,
      public.actor_name() || ' gave you this on ' || public.project_name(new.project_id)
        || coalesce(' · due ' || to_char(new.due_on, 'DD Mon'), ''),
      v_link, case when new.priority = 'urgent' then 'warning' else 'info' end);
  end if;
  return new;
end
$$;
create trigger tasks_activity after insert or update of status, assignee_id on public.tasks
  for each row execute function public.on_task_change();

create or replace function public.on_task_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_link text;
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
begin
  select * into v_task from public.tasks where id = new.task_id;
  v_link := '/projects/' || v_task.project_id || '/board?task=' || v_task.id;
  if v_client then
    perform public.notify_project(v_task.project_id, 'team', 'client_comment',
      public.actor_name() || ' commented on “' || v_task.title || '”', left(new.body, 160), v_link, 'warning');
  else
    insert into public.notifications (user_id, kind, title, body, link, tone)
    select distinct u, 'task_comment', public.actor_name() || ' on “' || v_task.title || '”', left(new.body, 160), v_link, 'info'
      from unnest(array[v_task.assignee_id, v_task.created_by]) u
     where u is not null and u is distinct from auth.uid();
  end if;
  return new;
end
$$;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.on_task_comment();

create or replace function public.on_file_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link text := '/projects/' || new.project_id || '/files/' || new.id;
  v_label text := new.title || case when new.version > 1 then ' (v' || new.version || ')' else '' end;
begin
  if tg_op = 'INSERT' then
    if new.from_client then
      perform public.log_project(new.project_id, 'file', public.actor_name() || ' sent “' || v_label || '”', v_link, true);
      perform public.notify_project(new.project_id, 'team', 'client_file', public.actor_name() || ' sent a file',
        v_label || ' · ' || public.project_name(new.project_id), v_link, 'info');
    else
      perform public.log_project(new.project_id, 'file',
        public.actor_name() || case when new.version > 1 then ' uploaded a new version of “' else ' uploaded “' end || v_label || '”',
        v_link, new.client_visible);
    end if;
  end if;

  if new.review_status = 'pending' and (tg_op = 'INSERT' or old.review_status is distinct from 'pending') then
    if tg_op = 'UPDATE' then
      perform public.log_project(new.project_id, 'review_requested',
        public.actor_name() || ' asked for a review of “' || v_label || '”', v_link, true);
    end if;
    perform public.notify_project(new.project_id, 'clients', 'review_requested', 'Review now: ' || v_label,
      public.actor_name() || ' shared this for your review on ' || public.project_name(new.project_id) || '.',
      v_link, 'danger', jsonb_build_object('file_id', new.id));
  elsif tg_op = 'UPDATE' and new.client_visible and not old.client_visible and new.review_status = 'none' then
    perform public.log_project(new.project_id, 'file', public.actor_name() || ' shared “' || v_label || '”', v_link, true);
  end if;
  return new;
end
$$;
create trigger project_files_activity after insert or update of review_status, client_visible on public.project_files
  for each row execute function public.on_file_change();

create or replace function public.on_file_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_file public.project_files;
  v_link text;
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
begin
  select * into v_file from public.project_files where id = new.file_id;
  v_link := '/projects/' || v_file.project_id || '/files/' || v_file.id;
  if v_client then
    perform public.notify_project(v_file.project_id, 'team', 'client_comment',
      public.actor_name() || ' commented on “' || v_file.title || '”', left(new.body, 160), v_link, 'warning');
    perform public.log_project(v_file.project_id, 'comment',
      public.actor_name() || ' commented on “' || v_file.title || '”', v_link, true);
  elsif v_file.client_visible then
    perform public.notify_project(v_file.project_id, 'clients', 'team_comment',
      public.actor_name() || ' replied on “' || v_file.title || '”', left(new.body, 160), v_link, 'info');
  end if;
  return new;
end
$$;
create trigger file_comments_notify after insert on public.file_comments
  for each row execute function public.on_file_comment();

create or replace function public.on_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
  v_link text := '/projects/' || new.project_id || '/messages';
begin
  if v_client then
    perform public.notify_project(new.project_id, 'team_admins', 'client_message',
      public.actor_name() || ' · ' || public.project_name(new.project_id), left(new.body, 160), v_link, 'warning');
  else
    perform public.notify_project(new.project_id, 'clients', 'team_message',
      public.actor_name() || ' from NUUKE', left(new.body, 160), v_link, 'info');
  end if;
  -- Sending a message means you have read the thread.
  insert into public.project_reads (profile_id, project_id, messages_seen_at)
  values (new.author_id, new.project_id, new.created_at)
  on conflict (profile_id, project_id) do update set messages_seen_at = excluded.messages_seen_at;
  return new;
end
$$;
create trigger project_messages_notify after insert on public.project_messages
  for each row execute function public.on_message();

create or replace function public.on_post_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_project(new.project_id, 'post', public.actor_name() || ' planned a ' || new.platform || ' post: “' || new.title || '”',
      '/projects/' || new.project_id || '/content', new.client_visible);
  elsif new.status = 'posted' and old.status <> 'posted' then
    perform public.log_project(new.project_id, 'post_live', '“' || new.title || '” went live on ' || new.platform,
      '/projects/' || new.project_id || '/content', new.client_visible);
  end if;
  return new;
end
$$;
create trigger content_posts_activity after insert or update of status on public.content_posts
  for each row execute function public.on_post_change();

create or replace function public.on_event_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.log_project(new.project_id, 'event',
    public.actor_name() || ' added ' || new.kind || ' “' || new.title || '” on ' || to_char(new.starts_at at time zone public.app_tz(), 'DD Mon'),
    '/projects/' || new.project_id || '/calendar', new.client_visible);
  if new.client_visible and new.kind in ('meeting', 'launch', 'milestone') then
    perform public.notify_project(new.project_id, 'clients', 'project_event', 'New on your calendar: ' || new.title,
      to_char(new.starts_at at time zone public.app_tz(), 'Dy DD Mon, HH12:MI AM'), '/projects/' || new.project_id || '/calendar', 'info');
  end if;
  return new;
end
$$;
create trigger project_events_activity after insert on public.project_events
  for each row execute function public.on_event_added();

create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.audit_row();
create trigger project_members_audit after insert or update or delete on public.project_members
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Actions
-- -----------------------------------------------------------------------------

-- The client approves a deliverable or asks for changes.
create or replace function public.review_file(p_file bigint, p_decision text, p_note text default null)
returns public.project_files
language plpgsql security definer set search_path = public
as $$
declare
  v_file public.project_files;
  v_note text := nullif(trim(p_note), '');
  v_link text;
begin
  select * into v_file from public.project_files where id = p_file;
  if v_file.id is null or not public.can_see_project(v_file.project_id) then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if not (public.is_project_client(v_file.project_id) or public.is_admin()) then
    raise exception 'Only the client can approve or ask for changes' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Choose approve or ask for changes' using errcode = '22023';
  end if;
  if v_file.review_status <> 'pending' then
    raise exception 'This is not waiting for a review any more' using errcode = '22023';
  end if;
  if p_decision = 'changes_requested' and v_note is null then
    raise exception 'Tell the team what to change' using errcode = '22023';
  end if;

  perform set_config('nuuke.reviewing', '1', true);
  update public.project_files
     set review_status = p_decision, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_file
  returning * into v_file;
  perform set_config('nuuke.reviewing', '', true);

  if v_note is not null then
    insert into public.file_comments (file_id, author_id, body)
    values (p_file, auth.uid(), case when p_decision = 'approved' then 'Approved: ' else 'Changes requested: ' end || v_note);
  end if;

  v_link := '/projects/' || v_file.project_id || '/files/' || v_file.id;
  perform public.log_project(v_file.project_id, 'review',
    public.actor_name() || case when p_decision = 'approved' then ' approved “' else ' asked for changes to “' end || v_file.title || '”',
    v_link, true);
  perform public.notify_project(v_file.project_id, 'team_admins', 'review_done',
    case when p_decision = 'approved' then 'Approved ✓ ' else 'Changes requested: ' end || v_file.title,
    public.actor_name() || coalesce(' — ' || left(v_note, 140), ''), v_link,
    case when p_decision = 'approved' then 'celebrate' else 'warning' end);
  return v_file;
end
$$;

create or replace function public.start_sprint(p_sprint bigint)
returns public.sprints
language plpgsql security definer set search_path = public
as $$
declare
  v public.sprints;
begin
  select * into v from public.sprints where id = p_sprint;
  if v.id is null or not public.can_work_project(v.project_id) then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.sprints where project_id = v.project_id and status = 'active' and id <> p_sprint) then
    raise exception 'Finish the current sprint first' using errcode = '22023';
  end if;
  update public.sprints set status = 'active', completed_at = null where id = p_sprint returning * into v;
  perform public.log_project(v.project_id, 'sprint', public.actor_name() || ' started ' || v.name,
    '/projects/' || v.project_id || '/sprints', true);
  return v;
end
$$;

-- Ends a sprint. Unfinished work moves to the next sprint, or back to the backlog.
create or replace function public.complete_sprint(p_sprint bigint, p_move_to bigint default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v public.sprints;
  v_moved int;
begin
  select * into v from public.sprints where id = p_sprint;
  if v.id is null or not public.can_work_project(v.project_id) then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if p_move_to is not null and not exists (
    select 1 from public.sprints where id = p_move_to and project_id = v.project_id and status <> 'done'
  ) then
    raise exception 'Pick a sprint in this project that is not finished' using errcode = '22023';
  end if;
  update public.tasks set sprint_id = p_move_to where sprint_id = p_sprint and status <> 'done';
  get diagnostics v_moved = row_count;
  update public.sprints set status = 'done', completed_at = now() where id = p_sprint;
  perform public.log_project(v.project_id, 'sprint_done',
    public.actor_name() || ' wrapped up ' || v.name
      || (select ' — ' || count(*) filter (where status = 'done') || ' tasks done'
            from public.tasks where sprint_id = p_sprint),
    '/projects/' || v.project_id || '/sprints', true);
  return v_moved;
end
$$;

create or replace function public.mark_project_read(p_project bigint)
returns void
language sql security definer set search_path = public
as $$
  insert into public.project_reads (profile_id, project_id, messages_seen_at)
  select auth.uid(), p_project, now() where public.can_see_project(p_project)
  on conflict (profile_id, project_id) do update set messages_seen_at = now()
$$;

-- Unread messages per project, for the person asking.
create or replace function public.project_unread()
returns table (project_id bigint, unread bigint, last_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.project_id,
         count(*) filter (where m.author_id <> auth.uid() and m.created_at > coalesce(r.messages_seen_at, '-infinity')),
         max(m.created_at)
    from public.project_messages m
    left join public.project_reads r on r.project_id = m.project_id and r.profile_id = auth.uid()
   where public.can_see_project(m.project_id)
   group by m.project_id
$$;

-- -----------------------------------------------------------------------------
-- Reminders, run every five minutes with the other sweeps
-- -----------------------------------------------------------------------------
create or replace function public.project_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := public.local_today();
begin
  -- Tasks due today, and the first day they are overdue.
  with due as (
    update public.tasks t set reminded_on = v_today
      from public.projects p
     where p.id = t.project_id and p.archived_at is null
       and t.status <> 'done' and t.assignee_id is not null and t.due_on is not null
       and ((t.due_on = v_today and t.reminded_on is distinct from v_today)
            or (t.due_on < v_today and (t.reminded_on is null or t.reminded_on <= t.due_on)))
    returning t.*, p.name as project
  )
  insert into public.notifications (user_id, kind, title, body, link, tone)
  select assignee_id, 'task_due',
         case when due_on < v_today then 'Overdue: ' else 'Due today: ' end || title,
         project, '/projects/' || project_id || '/board?task=' || id,
         case when due_on < v_today then 'danger' else 'warning' end
    from due;

  -- Reviews the client has not got to after two days.
  with waiting as (
    update public.project_files f set review_reminded_at = now()
      from public.projects p
     where p.id = f.project_id and p.archived_at is null
       and f.review_status = 'pending' and f.review_requested_at < now() - interval '48 hours'
       and (f.review_reminded_at is null or f.review_reminded_at < now() - interval '48 hours')
    returning f.*, p.name as project
  )
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select pm.profile_id, 'review_reminder', 'Still waiting on your review: ' || w.title,
         'The team on ' || w.project || ' needs your go-ahead to keep moving.',
         '/projects/' || w.project_id || '/files/' || w.id, 'danger', jsonb_build_object('file_id', w.id)
    from waiting w
    join public.project_members pm on pm.project_id = w.project_id
    join public.profiles pr on pr.id = pm.profile_id and pr.role = 'client' and pr.is_active;
end
$$;
revoke execute on function public.project_sweep() from public, anon, authenticated;

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
  perform public.project_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.sprints          enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_comments    enable row level security;
alter table public.project_files    enable row level security;
alter table public.file_comments    enable row level security;
alter table public.content_posts    enable row level security;
alter table public.project_events   enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_reads    enable row level security;
alter table public.project_activity enable row level security;

-- Projects and members: everyone on a project can see it; only an admin sets it up.
create policy projects_read on public.projects for select to authenticated using (public.can_see_project(id));
create policy projects_admin on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy project_members_read on public.project_members for select to authenticated
  using (public.can_see_project(project_id));
create policy project_members_admin on public.project_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Clients can now see the people on their projects, and the admins they talk to.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid() or role = 'admin' or public.shares_project_with(id));

-- Sprints: the whole project sees them; the team plans them.
create policy sprints_read on public.sprints for select to authenticated using (public.can_see_project(project_id));
create policy sprints_write on public.sprints for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

-- Tasks: the team sees all of them; the client sees the ones marked visible.
create policy tasks_read on public.tasks for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy tasks_write on public.tasks for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy task_comments_read on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));   -- tasks' own policy decides
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Files: the team sees everything; the client sees what was shared with them (and what they sent).
create policy project_files_read on public.project_files for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy project_files_team on public.project_files for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));
create policy project_files_client_send on public.project_files for insert to authenticated
  with check (public.is_project_client(project_id) and from_client and client_visible
              and review_status = 'none' and uploaded_by = auth.uid());

create policy file_comments_read on public.file_comments for select to authenticated
  using (exists (select 1 from public.project_files f where f.id = file_id));
create policy file_comments_insert on public.file_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.project_files f where f.id = file_id));
create policy file_comments_update on public.file_comments for update to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.project_files f where f.id = file_id and public.can_work_project(f.project_id)));
create policy file_comments_delete on public.file_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy content_posts_read on public.content_posts for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy content_posts_write on public.content_posts for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy project_events_read on public.project_events for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy project_events_write on public.project_events for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy project_messages_read on public.project_messages for select to authenticated
  using (public.can_see_project(project_id));
create policy project_messages_insert on public.project_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_project(project_id));
create policy project_messages_delete on public.project_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy project_reads_own on public.project_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.can_see_project(project_id));

create policy project_activity_read on public.project_activity for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));

-- -----------------------------------------------------------------------------
-- File storage: a private bucket, one folder per project ("<project id>/<file>")
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.storage_project(p_name text)
returns bigint
language sql immutable
as $$ select case when split_part(p_name, '/', 1) ~ '^\d{1,18}$' then split_part(p_name, '/', 1)::bigint end $$;

create or replace function public.can_read_project_object(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_work_project(public.storage_project(p_name))
      or exists (select 1 from public.project_files f
                  where f.storage_path = p_name and f.client_visible and public.is_project_client(f.project_id))
$$;

drop policy if exists project_files_object_read on storage.objects;
drop policy if exists project_files_object_upload on storage.objects;
drop policy if exists project_files_object_delete on storage.objects;
create policy project_files_object_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_read_project_object(name));
create policy project_files_object_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_see_project(public.storage_project(name)));
create policy project_files_object_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.can_work_project(public.storage_project(name)));

-- Live messages in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.project_messages;
  end if;
exception when duplicate_object then
  null;
end
$$;
