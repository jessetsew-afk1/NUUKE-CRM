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
