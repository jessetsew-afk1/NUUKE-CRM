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
