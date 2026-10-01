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
