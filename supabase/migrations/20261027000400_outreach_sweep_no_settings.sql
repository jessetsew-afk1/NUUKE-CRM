-- The outreach sweep and numbers, without writing to settings:
--   * Friday's report checks whether today's report already went out;
--   * the daily target (10, then 25, 50, 100) counts from the setter's first memo
--     when Settings has no start date.
create or replace function public.outreach_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_today date := public.outreach_today();
  v_now_et timestamp := now() at time zone 'America/New_York';
  v_closer uuid := (select outreach_closer_id from public.settings);
  v_nums jsonb;
  v_text text;
begin
  for r in
    select id from public.outreach_prospects
     where status = 'sent' and follow_step = 2 and next_follow_on < v_today
     for update skip locked
  loop
    update public.outreach_prospects set status = 'no_reply', next_follow_on = null where id = r.id;
    insert into public.outreach_events (prospect_id, kind) values (r.id, 'no_reply');
  end loop;

  if extract(hour from v_now_et) >= 10 then
    for r in
      select p.* from public.outreach_prospects p
       where p.status = 'booked' and p.reminded_at is null and p.setter_id is not null
         and (p.call_at at time zone 'America/New_York')::date = v_today + 1
         and not exists (select 1 from public.notifications n
                          where n.user_id = p.setter_id and n.kind = 'outreach.remind'
                            and (n.data ->> 'prospect_id')::bigint = p.id and n.created_at > now() - interval '20 hours')
    loop
      perform public.notify(r.setter_id, 'outreach.remind', format('Remind %s about tomorrow', r.name),
        format('Their call with Isaiah is %s ET. Send the "looking forward to tomorrow" note.',
               to_char(r.call_at at time zone 'America/New_York', 'Dy HH12:MI AM')),
        '/outreach?p=' || r.id, 'warning', jsonb_build_object('prospect_id', r.id));
    end loop;
  end if;

  -- Friday from 4 PM Eastern: the week's numbers, once per setter (an earlier
  -- report today means it already went out).
  if extract(isodow from v_now_et) = 5 and extract(hour from v_now_et) >= 16 then
    for r in
      select distinct p.setter_id, pr.full_name from public.outreach_prospects p
        join public.profiles pr on pr.id = p.setter_id
       where pr.is_active
         and not exists (select 1 from public.notifications n
                          where n.kind = 'outreach.week' and n.data ->> 'setter_id' = p.setter_id::text
                            and (n.created_at at time zone 'America/New_York')::date = v_today)
    loop
      v_nums := public.outreach_numbers_for(r.setter_id);
      v_text := format('Memos %s · Replies %s · Booked %s · Held %s · No IG %s',
                       v_nums #>> '{week,memos}', v_nums #>> '{week,replies}', v_nums #>> '{week,booked}',
                       v_nums #>> '{week,held}', v_nums #>> '{week,no_ig}');
      if v_closer is not null then
        perform public.notify(v_closer, 'outreach.week', format('%s''s week', r.full_name), v_text,
          '/outreach', 'info', jsonb_build_object('setter_id', r.setter_id));
      end if;
      perform public.notify_admins('outreach.week', format('%s''s week', r.full_name), v_text,
        '/outreach', 'info', jsonb_build_object('setter_id', r.setter_id));
    end loop;
  end if;
end
$$;
revoke execute on function public.outreach_sweep() from public, anon, authenticated;

create or replace function public.outreach_numbers(p_setter uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_setter uuid := coalesce(p_setter, auth.uid());
  v_today date := public.outreach_today();
  v_week_start date := v_today - ((extract(isodow from v_today)::int) - 1);
  v_start date;
  v_day int;
  v_target int;
  v_pay numeric := (select outreach_pay_per_held from public.settings);
begin
  if not (v_setter = auth.uid() or public.runs_outreach()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_start := coalesce(
    (select outreach_started_on from public.settings),
    (select min((e.created_at at time zone 'America/New_York')::date)
       from public.outreach_events e join public.outreach_prospects p on p.id = e.prospect_id
      where p.setter_id = v_setter and e.kind = 'memo'),
    v_today);
  v_day := v_today - v_start;
  v_target := case when v_day <= 0 then 10 when v_day < 7 then 25 when v_day < 14 then 50 else 100 end;
  return (
    with mine as (select * from public.outreach_prospects where setter_id = v_setter),
         ev as (
           select e.kind, (e.created_at at time zone 'America/New_York')::date as d
             from public.outreach_events e join mine m on m.id = e.prospect_id)
    select jsonb_build_object(
      'today', v_today,
      'target', v_target,
      'touches_today', (select count(*) from ev where d = v_today and kind in ('memo', 'follow_up')),
      'memos_today', (select count(*) from ev where d = v_today and kind = 'memo'),
      'week', jsonb_build_object(
        'memos', (select count(*) from ev where d >= v_week_start and kind = 'memo'),
        'follow_ups', (select count(*) from ev where d >= v_week_start and kind = 'follow_up'),
        'replies', (select count(*) from ev where d >= v_week_start and kind = 'reply'),
        'booked', (select count(*) from ev where d >= v_week_start and kind = 'booked'),
        'held', (select count(*) from ev where d >= v_week_start and kind = 'held'),
        'no_ig', (select count(*) from ev where d >= v_week_start and kind = 'no_ig')),
      'all', jsonb_build_object(
        'sent', (select count(*) from mine where status not in ('not_sent', 'no_ig')),
        'replies', (select count(*) from mine where status in ('replied', 'info', 'booked', 'held', 'no_show')
                                              or (status = 'no' and replied_at is not null)),
        'booked', (select count(*) from mine where status in ('booked', 'held', 'no_show')),
        'held', (select count(*) from mine where status = 'held'),
        'no_ig', (select count(*) from mine where status = 'no_ig'),
        'left', (select count(*) from mine where status = 'not_sent' and ready <> 'info')),
      'pay_per_held', v_pay,
      'earned', v_pay * (select count(*) from mine where status = 'held'),
      -- Names for the scripts (a setter can't read other people's profiles).
      'setter_name', (select full_name from public.profiles where id = v_setter),
      'closer_name', (select p.full_name from public.profiles p join public.settings s on s.outreach_closer_id = p.id))
  );
end
$$;
revoke execute on function public.outreach_numbers(uuid) from public, anon;
grant execute on function public.outreach_numbers(uuid) to authenticated;
