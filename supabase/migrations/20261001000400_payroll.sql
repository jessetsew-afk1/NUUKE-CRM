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
