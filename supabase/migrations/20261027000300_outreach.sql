-- =============================================================================
-- NUUKE CRM — outreach (appointment setting by Instagram voice memo)
--
-- A setter works a list of prospects from her phone, following the outreach
-- playbook:
--   * memo (first touch) → follow-up on day 3 → last note on day 7 → "No reply"
--     three days after that if nobody answered;
--   * a reply is answered from a script; "yes" gets the booking message and link;
--   * a booked call tells the closer (Isaiah) everything at once, and the setter
--     is reminded the day before to send the "looking forward to tomorrow" note;
--   * the closer marks each call Held or No-show; every held call earns the setter
--     the set amount ($50);
--   * every Friday afternoon the closer and the admins get the week's five numbers.
-- Days run on US Eastern time, when the prospects check their messages.
-- =============================================================================

alter table public.settings
  add column if not exists outreach_booking_link text,
  add column if not exists outreach_booking_message text,
  add column if not exists outreach_closer_id uuid references public.profiles (id) on delete set null,
  add column if not exists outreach_pay_per_held numeric(10, 2) not null default 50 check (outreach_pay_per_held >= 0),
  add column if not exists outreach_started_on date,
  add column if not exists outreach_reported_on date;

-- "Today" for outreach: US Eastern.
create or replace function public.outreach_today()
returns date
language sql stable
as $$ select (now() at time zone 'America/New_York')::date $$;

create or replace function public.is_setter()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'setter' from public.profiles where id = auth.uid() and is_active), false)
$$;

-- Admins and the closer run outreach: see every prospect, add and edit them, mark calls held.
create or replace function public.runs_outreach()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or coalesce((select s.outreach_closer_id = auth.uid() from public.settings s), false)
$$;

create table public.outreach_prospects (
  id              bigint generated always as identity primary key,
  position        int not null default 0,
  list            text not null default 'A',
  available_on    date not null default public.outreach_today(),
  name            text not null,              -- how they're greeted: "Dr. Naylor", "Sam"
  full_name       text,
  practice        text,
  hook            text,
  instagram       text,
  ig_confirmed    boolean not null default false,
  facebook        text,
  line            text,                       -- the one personal sentence for the memo
  latest_title    text,
  latest_date     text,
  latest_url      text,
  active          text,
  sells           text,
  notes           text,
  ready           text not null default 'ready' check (ready in ('ready', 'check', 'facebook', 'search', 'info')),
  setter_id       uuid references public.profiles (id) on delete set null,
  status          text not null default 'not_sent'
                  check (status in ('not_sent', 'sent', 'replied', 'info', 'booked', 'held', 'no_show', 'no', 'no_reply', 'no_ig')),
  follow_step     int not null default 0 check (follow_step between 0 and 2),
  next_follow_on  date,
  sent_at         timestamptz,
  last_touch_at   timestamptz,
  replied_at      timestamptz,
  reply_kind      text,
  booked_at       timestamptz,
  call_at         timestamptz,
  reminded_at     timestamptz,
  held_at         timestamptz,
  reply_note      text,
  outcome_note    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index outreach_prospects_setter on public.outreach_prospects (setter_id, status, position);
create index outreach_prospects_follow on public.outreach_prospects (next_follow_on) where status in ('sent', 'info');

create table public.outreach_events (
  id           bigint generated always as identity primary key,
  prospect_id  bigint not null references public.outreach_prospects (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('memo', 'follow_up', 'reply', 'booked', 'reminder', 'held', 'no_show', 'no', 'no_reply', 'no_ig', 'handle', 'reopen')),
  note         text,
  created_at   timestamptz not null default now()
);
create index outreach_events_prospect on public.outreach_events (prospect_id, created_at);
create index outreach_events_recent on public.outreach_events (created_at);

create trigger outreach_prospects_touch_ts before update on public.outreach_prospects
  for each row execute function public.touch_updated_at();
create trigger outreach_prospects_audit after insert or update or delete on public.outreach_prospects
  for each row execute function public.audit_row();

alter table public.outreach_prospects enable row level security;
alter table public.outreach_events enable row level security;
create policy outreach_prospects_read on public.outreach_prospects for select to authenticated
  using (setter_id = (select auth.uid()) or (select public.runs_outreach()));
create policy outreach_prospects_manage on public.outreach_prospects for all to authenticated
  using ((select public.runs_outreach())) with check ((select public.runs_outreach()));
create policy outreach_events_read on public.outreach_events for select to authenticated
  using (exists (select 1 from public.outreach_prospects p where p.id = prospect_id
                  and (p.setter_id = (select auth.uid()) or (select public.runs_outreach()))));
revoke all on public.outreach_prospects, public.outreach_events from anon;
revoke insert, update, delete on public.outreach_events from authenticated;

-- -----------------------------------------------------------------------------
-- Every step the setter (or the closer) takes on a prospect.
--   sent       the first voice memo went out; day-3 follow-up due
--   followed   a follow-up went out (day 3, then the last note on day 7)
--   replied    they answered; p_note = yes | cost | info | have_someone | not_interested | medical | other
--   booked     they picked a time; p_call_at = when
--   reminded   the day-before note went out
--   held / no_show   the closer, after the call
--   no         skip them (failed the 2-minute check, or a no)
--   no_ig      no Instagram or Facebook to message
--   handle     the setter found their Instagram; p_note = handle
--   reopen     the closer or an admin puts them back on the list
-- -----------------------------------------------------------------------------
create or replace function public.outreach_act(p_id bigint, p_action text, p_note text default null, p_call_at timestamptz default null)
returns public.outreach_prospects
language plpgsql security definer set search_path = public
as $$
declare
  v public.outreach_prospects;
  v_runs boolean := public.runs_outreach();
  v_today date := public.outreach_today();
  v_closer uuid := (select outreach_closer_id from public.settings);
  v_setter_name text;
  v_link text := '/outreach?p=' || p_id;
  v_kind text;
begin
  select * into v from public.outreach_prospects where id = p_id for update;
  if not found then
    raise exception 'That prospect no longer exists';
  end if;
  if not (v_runs or (v.setter_id = auth.uid() and public.is_setter())) then
    raise exception 'That prospect isn''t on your list' using errcode = '42501';
  end if;
  select full_name into v_setter_name from public.profiles where id = v.setter_id;

  case p_action
  when 'sent' then
    if v.status <> 'not_sent' then
      raise exception '% has already had a memo', v.name;
    end if;
    update public.outreach_prospects
       set status = 'sent', sent_at = now(), last_touch_at = now(), follow_step = 0, next_follow_on = v_today + 3
     where id = p_id returning * into v;
    v_kind := 'memo';

  when 'followed' then
    if v.status not in ('sent', 'info') then
      raise exception 'There''s no follow-up due for %', v.name;
    end if;
    if v.status = 'info' then
      -- "Send me info": asked again two days after Isaiah's examples; then it's a normal wait.
      update public.outreach_prospects
         set status = 'sent', last_touch_at = now(), follow_step = 2, next_follow_on = v_today + 3
       where id = p_id returning * into v;
    elsif v.follow_step = 0 then
      update public.outreach_prospects
         set follow_step = 1, last_touch_at = now(), next_follow_on = greatest(v_today + 1, (v.sent_at at time zone 'America/New_York')::date + 7)
       where id = p_id returning * into v;
    elsif v.follow_step = 1 then
      -- The last note. Three quiet days after it and they become "No reply".
      update public.outreach_prospects
         set follow_step = 2, last_touch_at = now(), next_follow_on = v_today + 3
       where id = p_id returning * into v;
    else
      raise exception 'Both follow-ups have gone to %. Wait for a reply.', v.name;
    end if;
    v_kind := 'follow_up';

  when 'replied' then
    if v.status not in ('sent', 'info', 'replied', 'no_show') then
      raise exception '% isn''t waiting on a reply', v.name;
    end if;
    if p_note not in ('yes', 'cost', 'info', 'have_someone', 'not_interested', 'medical', 'other') or p_note is null then
      raise exception 'Pick what they said';
    end if;
    update public.outreach_prospects
       set status = case p_note when 'info' then 'info' when 'have_someone' then 'no' when 'not_interested' then 'no' else 'replied' end,
           reply_kind = p_note, replied_at = coalesce(replied_at, now()), last_touch_at = now(),
           next_follow_on = case when p_note = 'info' then v_today + 2 else null end
     where id = p_id returning * into v;
    v_kind := 'reply';
    if p_note = 'info' and v_closer is not null then
      perform public.notify(v_closer, 'outreach.info', format('%s wants info', v.name),
        format('%s · %s. Email them two examples today. %s will ask again in 2 days.', coalesce(v.practice, ''), coalesce(v.hook, ''), coalesce(v_setter_name, 'The setter')),
        '/outreach?p=' || v.id, 'warning', jsonb_build_object('prospect_id', v.id));
    elsif p_note = 'yes' and v_closer is not null then
      perform public.notify(v_closer, 'outreach.yes', format('%s said yes', v.name),
        format('%s · booking link sent. You''ll hear when they pick a time.', coalesce(v.practice, '')),
        '/outreach?p=' || v.id, 'success', jsonb_build_object('prospect_id', v.id));
    end if;

  when 'booked' then
    if p_call_at is null then
      raise exception 'Add the time they picked';
    end if;
    if v.status in ('held', 'no_ig') then
      raise exception '% can''t be booked from here', v.name;
    end if;
    update public.outreach_prospects
       set status = 'booked', booked_at = coalesce(booked_at, now()), call_at = p_call_at, reminded_at = null,
           last_touch_at = now(), next_follow_on = null, reply_note = coalesce(nullif(btrim(p_note), ''), reply_note)
     where id = p_id returning * into v;
    v_kind := 'booked';
    if v_closer is not null then
      perform public.notify(v_closer, 'outreach.booked',
        format('Booked: %s, %s ET', v.name, to_char(p_call_at at time zone 'America/New_York', 'Dy DD Mon, HH12:MI AM')),
        concat_ws(' · ', v.practice, 'Hook: ' || v.hook, nullif(btrim(p_note), '')),
        '/outreach?p=' || v.id, 'celebrate', jsonb_build_object('prospect_id', v.id));
    end if;

  when 'reminded' then
    if v.status <> 'booked' then
      raise exception '% has no call booked', v.name;
    end if;
    update public.outreach_prospects set reminded_at = now(), last_touch_at = now() where id = p_id returning * into v;
    v_kind := 'reminder';

  when 'held', 'no_show' then
    if not v_runs then
      raise exception 'Isaiah marks whether the call was held' using errcode = '42501';
    end if;
    if v.status not in ('booked', 'held', 'no_show') then
      raise exception '% has no call booked', v.name;
    end if;
    update public.outreach_prospects
       set status = p_action, held_at = case when p_action = 'held' then now() else null end,
           outcome_note = coalesce(nullif(btrim(p_note), ''), outcome_note)
     where id = p_id returning * into v;
    v_kind := p_action;
    if v.setter_id is not null then
      if p_action = 'held' then
        perform public.notify(v.setter_id, 'outreach.held', format('Call held with %s', v.name),
          format('+$%s for you. Nice work.', to_char((select outreach_pay_per_held from public.settings), 'FM999,990')),
          '/outreach?p=' || v.id, 'celebrate', jsonb_build_object('prospect_id', v.id));
      else
        perform public.notify(v.setter_id, 'outreach.no_show', format('%s missed the call', v.name),
          'Send the rebook note with the booking link.', '/outreach?p=' || v.id, 'warning', jsonb_build_object('prospect_id', v.id));
      end if;
    end if;

  when 'no' then
    update public.outreach_prospects
       set status = 'no', next_follow_on = null, outcome_note = coalesce(nullif(btrim(p_note), ''), outcome_note)
     where id = p_id returning * into v;
    v_kind := 'no';

  when 'no_ig' then
    if v.status <> 'not_sent' then
      raise exception '% has already been messaged', v.name;
    end if;
    update public.outreach_prospects set status = 'no_ig' where id = p_id returning * into v;
    v_kind := 'no_ig';

  when 'handle' then
    if nullif(btrim(p_note), '') is null then
      raise exception 'Type their Instagram handle';
    end if;
    update public.outreach_prospects
       set instagram = lower(regexp_replace(btrim(p_note), '^(https?://)?(www\.)?(instagram\.com/)?@?|/.*$', '', 'g')),
           ig_confirmed = true, ready = case when ready in ('search', 'facebook') then 'check' else ready end
     where id = p_id returning * into v;
    v_kind := 'handle';

  when 'reopen' then
    if not v_runs then
      raise exception 'Ask Isaiah to put them back on your list' using errcode = '42501';
    end if;
    update public.outreach_prospects
       set status = 'not_sent', follow_step = 0, next_follow_on = null, sent_at = null, replied_at = null, reply_kind = null,
           booked_at = null, call_at = null, reminded_at = null, held_at = null
     where id = p_id returning * into v;
    v_kind := 'reopen';

  else
    raise exception 'Unknown step %', p_action;
  end case;

  insert into public.outreach_events (prospect_id, actor_id, kind, note) values (p_id, auth.uid(), v_kind, nullif(btrim(p_note), ''));
  return v;
end
$$;

-- -----------------------------------------------------------------------------
-- The numbers: today's touches against the target, this week's five numbers, pay.
-- -----------------------------------------------------------------------------
create or replace function public.outreach_numbers(p_setter uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_setter uuid := coalesce(p_setter, auth.uid());
  v_today date := public.outreach_today();
  v_week_start date := v_today - ((extract(isodow from v_today)::int) - 1);
  v_start date := coalesce((select outreach_started_on from public.settings), v_today);
  v_day int := v_today - v_start;
  v_target int := case when v_day <= 0 then 10 when v_day < 7 then 25 when v_day < 14 then 50 else 100 end;
  v_pay numeric := (select outreach_pay_per_held from public.settings);
begin
  if not (v_setter = auth.uid() or public.runs_outreach()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
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

-- -----------------------------------------------------------------------------
-- The sweep: quiet prospects close, day-before reminders, Friday numbers.
-- -----------------------------------------------------------------------------
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
begin
  -- Three days after the last note with no answer: "No reply", and stop.
  for r in
    select id from public.outreach_prospects
     where status = 'sent' and follow_step = 2 and next_follow_on < v_today
     for update skip locked
  loop
    update public.outreach_prospects set status = 'no_reply', next_follow_on = null where id = r.id;
    insert into public.outreach_events (prospect_id, kind) values (r.id, 'no_reply');
  end loop;

  -- From 10 AM Eastern the day before a call: remind the setter to send the note.
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

  -- Friday from 4 PM Eastern, once a week: the five numbers to the closer and the admins.
  if extract(isodow from v_now_et) = 5 and extract(hour from v_now_et) >= 16
     and coalesce((select outreach_reported_on from public.settings), date '2000-01-01') < v_today then
    for r in
      select distinct p.setter_id, pr.full_name from public.outreach_prospects p
        join public.profiles pr on pr.id = p.setter_id where pr.is_active
    loop
      v_nums := public.outreach_numbers_for(r.setter_id);
      if v_closer is not null then
        perform public.notify(v_closer, 'outreach.week', format('%s''s week', r.full_name),
          format('Memos %s · Replies %s · Booked %s · Held %s · No IG %s',
                 v_nums #>> '{week,memos}', v_nums #>> '{week,replies}', v_nums #>> '{week,booked}', v_nums #>> '{week,held}', v_nums #>> '{week,no_ig}'),
          '/outreach', 'info', jsonb_build_object('setter_id', r.setter_id));
      end if;
      perform public.notify_admins('outreach.week', format('%s''s week', r.full_name),
        format('Memos %s · Replies %s · Booked %s · Held %s · No IG %s',
               v_nums #>> '{week,memos}', v_nums #>> '{week,replies}', v_nums #>> '{week,booked}', v_nums #>> '{week,held}', v_nums #>> '{week,no_ig}'),
        '/outreach', 'info', jsonb_build_object('setter_id', r.setter_id));
    end loop;
    update public.settings set outreach_reported_on = v_today;
  end if;
end
$$;

-- The same numbers without a signed-in user (for the sweep).
create or replace function public.outreach_numbers_for(p_setter uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with ev as (
    select e.kind, (e.created_at at time zone 'America/New_York')::date as d
      from public.outreach_events e join public.outreach_prospects p on p.id = e.prospect_id
     where p.setter_id = p_setter)
  select jsonb_build_object('week', jsonb_build_object(
    'memos', (select count(*) from ev where d >= public.outreach_today() - 6 and kind = 'memo'),
    'replies', (select count(*) from ev where d >= public.outreach_today() - 6 and kind = 'reply'),
    'booked', (select count(*) from ev where d >= public.outreach_today() - 6 and kind = 'booked'),
    'held', (select count(*) from ev where d >= public.outreach_today() - 6 and kind = 'held'),
    'no_ig', (select count(*) from ev where d >= public.outreach_today() - 6 and kind = 'no_ig')))
$$;

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
  perform public.project_sweep();
  perform public.lead_recycle_sweep();
  perform public.game_sweep();
  perform public.payment_sweep();
  perform public.outreach_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

revoke execute on function public.outreach_act(bigint, text, text, timestamptz) from public, anon;
revoke execute on function public.outreach_numbers(uuid) from public, anon;
revoke execute on function public.outreach_numbers_for(uuid) from public, anon, authenticated;
revoke execute on function public.outreach_sweep() from public, anon, authenticated;
revoke execute on function public.is_setter() from public, anon;
revoke execute on function public.runs_outreach() from public, anon;
grant execute on function public.outreach_act(bigint, text, text, timestamptz) to authenticated;
grant execute on function public.outreach_numbers(uuid) to authenticated;
grant execute on function public.is_setter() to authenticated;
grant execute on function public.runs_outreach() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.outreach_prospects;
  end if;
exception when duplicate_object then
  null;
end
$$;
