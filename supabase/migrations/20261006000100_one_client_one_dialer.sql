-- =============================================================================
-- NUUKE CRM — one client, one card: repeats every 2 days, no duplicates
--
-- How a lead moves now:
--   * Every call that isn't a final answer brings the client back to the same
--     dialer 2 days later (Rules & settings → "Days until a lead comes back"),
--     however many times it takes. No answer, voicemail, spoke briefly, not
--     interested, wrong person, number not valid: all come back.
--   * Only three things take a client off the dialer cards for good:
--       Do not call   (every copy of that number, for every dialer)
--       a meeting set (and everything after it: proposal, negotiation, won;
--                      other dialers holding the same number stop calling too)
--       Duplicate     (a copy merged into the one that stays)
--   * The queue serves due call-backs first, then everything else that's due
--     (new numbers and 2-day repeats) shuffled together, a fresh shuffle each
--     day. A number never shows twice in a dialer's deck.
--
-- Plus a one-time tidy for the admin (Leads & import → Remove repeats):
--   * each dialer keeps one card per client, with the call history merged in;
--   * a client held by more than one dialer stays with one of them, except for
--     the dialers the admin marks as having the whole sheet;
-- and imports now drop repeated rows and skip numbers the dialer already has.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who is the same client: the phone number (last ten digits), else the personal
-- email, else the work email, else an identical name + post link + query.
-- -----------------------------------------------------------------------------
alter table public.leads add column if not exists client_key text generated always as (
  coalesce(
    'p:' || nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), ''),
    'e:' || nullif(lower(btrim(coalesce(personal_email, ''))), ''),
    'w:' || nullif(lower(btrim(coalesce(work_email, ''))), ''),
    'n:' || md5(lower(btrim(coalesce(name, ''))) || '|' || btrim(coalesce(post_link, '')) || '|' || left(btrim(coalesce(query, '')), 200))
  )
) stored;
create index if not exists leads_client_key on public.leads (client_key, assigned_to);

-- Not interested, wrong person and number-not-valid now come back like no answer.
update public.lead_outcomes set effect = 'retry'
 where key in ('not_interested', 'wrong_person', 'invalid_number');

-- "After 2 days".
update public.settings set followup_gap_days = 2 where followup_gap_days < 2;
alter table public.settings alter column followup_gap_days set default 2;
comment on column public.settings.followup_gap_days is
  'Days until a called lead comes back to its dialer (working days are skipped over).';

-- -----------------------------------------------------------------------------
-- Logging a call
-- -----------------------------------------------------------------------------
create or replace function public.log_lead_action(
  p_lead_id bigint,
  p_action text,
  p_outcome text default null,
  p_comment text default null,
  p_followup_at timestamptz default null,
  p_meeting_at timestamptz default null,
  p_meeting_minutes int default 30,
  p_deal_amount numeric default null,
  p_meeting jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lead public.leads;
  v_outcome public.lead_outcomes;
  v_work_date date;
  v_attempt int;
  v_next timestamptz;
  v_stage text;
  v_closed text;
  v_deal_id bigint;
  v_meeting_id bigint;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_me text;
  m jsonb := coalesce(p_meeting, '{}'::jsonb);
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists';
  end if;
  if v_lead.assigned_to is distinct from v_uid and not public.is_admin() then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;

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
      -- Not a final answer: back on this dialer's cards in a couple of days, every time.
      v_next := coalesce(p_followup_at, public.next_followup_at(v_uid, v_work_date));
    when 'callback' then
      v_next := p_followup_at;
    when 'pipeline' then
      v_stage := 'pipeline';
      -- Interested but no meeting yet: keep coming back like any other lead.
      v_next := coalesce(p_followup_at,
                         case when v_outcome.pipeline_stage = 'prospect' then public.next_followup_at(v_uid, v_work_date) end);
    when 'closed' then
      v_stage := 'closed';
      v_closed := v_outcome.key;
  end case;

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

  -- Another card this dialer still has for the same client (before Remove repeats has
  -- run) waits with this one, so the client can't pop up again straight away.
  if v_lead.client_key is not null and v_next is not null then
    update public.leads o set next_action_at = v_next, skipped_at = null
     where o.client_key = v_lead.client_key and o.assigned_to = v_lead.assigned_to
       and o.id <> v_lead.id and o.stage = 'queue';
  end if;

  -- One client, one answer. Do not call takes the number off every dialer's cards;
  -- once a meeting is set, nobody else cold-calls them either.
  if v_lead.client_key is not null then
    select split_part(full_name, ' ', 1) into v_me from public.profiles where id = v_uid;
    if v_outcome.key = 'do_not_call' then
      update public.leads o
         set stage = 'closed', status = 'do_not_call', closed_reason = 'do_not_call', next_action_at = null,
             last_comment = format('Asked not to be called (logged by %s)', coalesce(v_me, 'a colleague'))
       where o.client_key = v_lead.client_key and o.id <> v_lead.id and o.stage <> 'closed';
    elsif v_outcome.pipeline_stage in ('meeting', 'proposal', 'negotiation', 'won') then
      update public.leads o
         set stage = 'closed', status = 'duplicate', closed_reason = 'duplicate', next_action_at = null,
             last_comment = format('Meeting set by %s', coalesce(v_me, 'a colleague'))
       where o.client_key = v_lead.client_key and o.id <> v_lead.id and o.stage = 'queue';
    end if;
  end if;

  if p_meeting_at is not null then
    insert into public.meetings (owner_id, deal_id, lead_id, title, starts_at, duration_minutes, timezone,
                                 technical_manager_id, location, transcript, client_website, client_links, prep_notes)
    values (coalesce(v_lead.assigned_to, v_uid), v_lead.deal_id, v_lead.id,
            'Meeting with ' || coalesce(nullif(v_lead.name, ''), 'prospect')
              || coalesce(' — ' || nullif(v_lead.service, ''), ''),
            p_meeting_at, coalesce(p_meeting_minutes, 30),
            nullif(m ->> 'timezone', ''), nullif(m ->> 'technical_manager_id', '')::uuid,
            nullif(btrim(m ->> 'location'), ''), nullif(btrim(m ->> 'transcript'), ''),
            nullif(btrim(m ->> 'client_website'), ''), nullif(btrim(m ->> 'client_links'), ''),
            nullif(btrim(m ->> 'prep_notes'), ''))
    returning id into v_meeting_id;
  end if;

  return jsonb_build_object('lead', to_jsonb(v_lead), 'today', public.my_today(), 'meeting_id', v_meeting_id);
end
$$;

-- -----------------------------------------------------------------------------
-- The dialer queue
-- -----------------------------------------------------------------------------
-- What's due for the signed-in dialer:
--   1. call-backs and pipeline reminders that have come due, oldest first
--   2. everything else that's due (new numbers and 2-day repeats), shuffled,
--      with a new shuffle each day so the same order never repeats
--   3. cards skipped today, at the back
-- and never the same client twice.
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
    join (
      select d.id, d.skipped_today, d.appointment, d.next_action_at, d.shuffle,
             row_number() over (partition by d.client_key
                                order by d.skipped_today, d.appointment desc, d.next_action_at nulls last, d.id) as n
        from (
          select x.id, x.client_key, x.next_action_at,
                 coalesce(x.skipped_at > now() - interval '12 hours', false) as skipped_today,
                 (x.status = 'busy_callback' or x.stage = 'pipeline') and x.next_action_at is not null as appointment,
                 hashtext(x.id::text || ':' || ((now() at time zone public.app_tz())::date)::text) as shuffle
            from public.leads x
           where x.assigned_to = auth.uid()
             and (x.stage = 'queue' or (x.stage = 'pipeline' and x.next_action_at is not null))
             and (x.next_action_at is null or x.next_action_at <= now())
             and (p_services is null or cardinality(p_services) = 0 or x.service = any (p_services))
             and (p_platforms is null or cardinality(p_platforms) = 0 or x.platform = any (p_platforms))
             and (p_from is null or x.lead_date >= p_from)
             and (p_to is null or x.lead_date <= p_to)
        ) d
    ) q on q.id = l.id
   where q.n = 1
   order by q.skipped_today, q.appointment desc,
            case when q.appointment then q.next_action_at end nulls last,
            q.shuffle, l.id
   limit least(greatest(p_limit, 1), 20)
$$;

-- -----------------------------------------------------------------------------
-- Leads that were resting under the old rules come back into the rotation
-- -----------------------------------------------------------------------------
create or replace function public.reopen_resting_leads()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_gap int := greatest(coalesce((select followup_gap_days from public.settings limit 1), 2), 1);
  v_count int;
begin
  update public.leads
     set stage = 'queue', closed_reason = null, skipped_at = null,
         next_action_at = greatest(coalesce(last_attempt_at, closed_at, now()) + make_interval(days => v_gap), now())
   where stage = 'closed'
     and coalesce(closed_reason, '') not in ('do_not_call', 'won', 'duplicate');
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke execute on function public.reopen_resting_leads() from public, anon, authenticated;
select public.reopen_resting_leads();

-- The old 2-day recycling has nothing left to do (nothing rests any more), but it must
-- never bring back a merged duplicate.
create or replace function public.recycle_lead_ids(p_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.leads l
     set stage = 'queue', status = 'new', attempts = 0, closed_reason = null,
         next_action_at = null, skipped_at = null,
         recycle_count = l.recycle_count + 1,
         previous_round = jsonb_build_object(
           'round', l.recycle_count + 1,
           'closed_reason', l.closed_reason,
           'status', l.status,
           'attempts', l.attempts,
           'closed_at', l.closed_at,
           'comment', l.last_comment,
           'rep_id', l.assigned_to)
   where l.id = any (p_ids) and l.stage = 'closed'
     and coalesce(l.closed_reason, '') not in ('do_not_call', 'won', 'duplicate');
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke execute on function public.recycle_lead_ids(bigint[]) from public, anon, authenticated;

create or replace function public.lead_recycle_sweep()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_days int := (select recycle_after_days from public.settings limit 1);
begin
  if coalesce(v_days, 0) <= 0 then
    return 0;
  end if;
  return public.recycle_lead_ids(array(
    select id from public.leads
     where stage = 'closed' and assigned_to is not null
       and coalesce(closed_reason, '') not in ('do_not_call', 'won', 'duplicate')
       and closed_at <= now() - make_interval(days => v_days)
     limit 20000));
end
$$;
revoke execute on function public.lead_recycle_sweep() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Remove repeats (admin)
-- -----------------------------------------------------------------------------
-- p_whole_sheet: dialers who each keep their own copy of every client.
-- p_apply = false only reports what would change.
-- A client is matched by client_key (phone, else email, else an identical row).
-- The copy that stays is the one that got furthest (a meeting, a deal, the most
-- calls); the others' call history, meetings and deals move onto it.
create or replace function public.tidy_repeat_leads(p_whole_sheet uuid[] default '{}', p_apply boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_whole uuid[] := coalesce(p_whole_sheet, '{}');
  v_dnc int;
  v_taken int;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove repeats' using errcode = '42501';
  end if;

  drop table if exists _tidy_leads;
  drop table if exists _tidy_map;
  create temporary table _tidy_leads on commit drop as
  select l.id, l.assigned_to, l.attempts,
         l.client_key as gkey,
         (l.assigned_to = any (v_whole)) as whole,
         case when l.stage = 'pipeline' or l.status = 'won' then 4
              when exists (select 1 from public.meetings m where m.lead_id = l.id) then 3
              when l.status = 'do_not_call' then 2
              when l.closed_reason = 'duplicate' then -1
              else 0 end as weight
    from public.leads l
   where l.assigned_to is not null;
  delete from _tidy_leads where gkey is null;

  -- 1. the same client more than once for the same dialer
  create temporary table _tidy_map on commit drop as
  select id as loser, keeper, assigned_to, 'own'::text as kind
    from (select t.id, t.assigned_to,
                 first_value(t.id) over (partition by t.assigned_to, t.gkey order by t.weight desc, t.attempts desc, t.id) as keeper
            from _tidy_leads t) x
   where id <> keeper;

  -- 2. the same client with more than one dialer (except the whole-sheet dialers)
  insert into _tidy_map (loser, keeper, assigned_to, kind)
  select id, keeper, assigned_to, 'shared'
    from (select t.id, t.assigned_to,
                 first_value(t.id) over (partition by t.gkey order by t.weight desc, t.attempts desc, t.id) as keeper
            from _tidy_leads t
           where not t.whole and not exists (select 1 from _tidy_map m where m.loser = t.id)) x
   where id <> keeper;

  select coalesce(jsonb_agg(jsonb_build_object(
           'dialer', p.full_name, 'whole_sheet', p.id = any (v_whole),
           'leads', s.leads, 'own_repeats', s.own, 'shared', s.shared, 'after', s.leads - s.own - s.shared)
           order by p.full_name), '[]'::jsonb)
    into v_rows
    from (select l.assigned_to, count(*) as leads,
                 count(m.loser) filter (where m.kind = 'own') as own,
                 count(m.loser) filter (where m.kind = 'shared') as shared
            from public.leads l
            left join _tidy_map m on m.loser = l.id
           where l.assigned_to is not null
           group by l.assigned_to) s
    join public.profiles p on p.id = s.assigned_to;

  if p_apply then
    -- the copy that stays carries everything that happened on the others
    update public.lead_attempts a set lead_id = m.keeper from _tidy_map m where a.lead_id = m.loser;
    update public.meetings x set lead_id = m.keeper from _tidy_map m where x.lead_id = m.loser;
    update public.deals x set lead_id = m.keeper from _tidy_map m where x.lead_id = m.loser;
    update public.leads k
       set attempts = greatest(k.attempts, agg.attempts),
           last_attempt_at = greatest(k.last_attempt_at, agg.last_attempt_at),
           deal_id = coalesce(k.deal_id, agg.deal_id),
           connected = k.connected or agg.connected,
           status = case when agg.dnc and k.stage = 'queue' then 'do_not_call' else k.status end,
           closed_reason = case when agg.dnc and k.stage = 'queue' then 'do_not_call' else k.closed_reason end,
           next_action_at = case when agg.dnc and k.stage = 'queue' then null else k.next_action_at end,
           stage = case when agg.dnc and k.stage = 'queue' then 'closed' else k.stage end
      from (select m.keeper, max(l.attempts) as attempts, max(l.last_attempt_at) as last_attempt_at,
                   max(l.deal_id) as deal_id, bool_or(l.connected) as connected,
                   bool_or(l.status = 'do_not_call') as dnc
              from _tidy_map m join public.leads l on l.id = m.loser
             group by m.keeper) agg
     where k.id = agg.keeper;
    delete from public.leads l using _tidy_map m where l.id = m.loser;
  end if;

  -- Same number elsewhere: Do not call anywhere stops it everywhere, and a meeting
  -- with one dialer takes it off the others' cards.
  if p_apply then
    update public.leads o
       set stage = 'closed', status = 'do_not_call', closed_reason = 'do_not_call', next_action_at = null
     where o.stage <> 'closed' and o.client_key is not null
       and exists (select 1 from public.leads d where d.client_key = o.client_key and d.id <> o.id and d.status = 'do_not_call');
    get diagnostics v_dnc = row_count;
    update public.leads o
       set stage = 'closed', status = 'duplicate', closed_reason = 'duplicate', next_action_at = null,
           last_comment = 'A colleague has a meeting set with this client'
     where o.stage = 'queue' and o.client_key is not null
       and exists (select 1 from public.leads d where d.client_key = o.client_key and d.id <> o.id
                     and (d.stage = 'pipeline' and d.status not in ('interested') or d.status = 'won'));
    get diagnostics v_taken = row_count;
  else
    select count(*) into v_dnc from public.leads o
     where o.stage <> 'closed' and o.client_key is not null and o.status <> 'do_not_call'
       and not exists (select 1 from _tidy_map m where m.loser = o.id)
       and exists (select 1 from public.leads d where d.client_key = o.client_key and d.id <> o.id and d.status = 'do_not_call');
    select count(*) into v_taken from public.leads o
     where o.stage = 'queue' and o.client_key is not null
       and not exists (select 1 from _tidy_map m where m.loser = o.id)
       and exists (select 1 from public.leads d where d.client_key = o.client_key and d.id <> o.id
                     and (d.stage = 'pipeline' and d.status not in ('interested') or d.status = 'won'));
  end if;

  return jsonb_build_object(
    'applied', p_apply,
    'dialers', v_rows,
    'own_repeats', (select count(*) from _tidy_map where kind = 'own'),
    'shared', (select count(*) from _tidy_map where kind = 'shared'),
    'do_not_call_elsewhere', v_dnc,
    'meeting_elsewhere', v_taken);
end
$$;

-- -----------------------------------------------------------------------------
-- Imports: no repeats
-- -----------------------------------------------------------------------------
-- A number that appears twice in a sheet is imported once, and a number the dialer
-- already has is skipped (so giving someone the whole sheet again only adds what
-- they're missing). "Skip numbers already in NUUKE" still skips numbers any
-- dialer has.
drop function if exists public.import_leads(bigint, jsonb, boolean);
create or replace function public.import_leads(
  p_import_id bigint, p_rows jsonb, p_skip_duplicates boolean default false, p_skip_owned boolean default true
) returns jsonb
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

  drop table if exists _incoming;
  create temporary table _incoming on commit drop as
  select x.*,
         nullif(right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10), '') as phone_key,
         nullif(lower(btrim(coalesce(x.personal_email, ''))), '') as email_key,
         coalesce(
           'p:' || nullif(right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10), ''),
           'e:' || nullif(lower(btrim(coalesce(x.personal_email, ''))), ''),
           'w:' || nullif(lower(btrim(coalesce(x.work_email, ''))), ''),
           'n:' || md5(lower(btrim(coalesce(x.name, ''))) || '|' || btrim(coalesce(x.post_link, '')) || '|' || left(btrim(coalesce(x.query, '')), 200))
         ) as client_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (
      lead_date date, platform text, country text, name text, personal_email text, work_email text,
      phone text, post_link text, query text, service text, assigned_to uuid, legacy jsonb
    );

  delete from _incoming
   where coalesce(btrim(name), '') = '' and phone_key is null and email_key is null and coalesce(btrim(work_email), '') = '';
  get diagnostics v_invalid = row_count;

  -- the same client twice in this upload: keep the first
  delete from _incoming i
   using _incoming j
   where j.rn < i.rn and i.client_key = j.client_key;

  if p_skip_owned then
    -- clients the dialer already has
    delete from _incoming i
     where i.assigned_to is not null
       and exists (select 1 from public.leads l where l.client_key = i.client_key and l.assigned_to = i.assigned_to);
  end if;

  -- clients who said Do not call to anyone, or already have a meeting set with someone
  delete from _incoming i
   where exists (select 1 from public.leads l
                  where l.client_key = i.client_key
                    and (l.status in ('do_not_call', 'won') or (l.stage = 'pipeline' and l.status <> 'interested')));

  if p_skip_duplicates then
    -- clients any dialer already has
    delete from _incoming i
     where exists (select 1 from public.leads l where l.client_key = i.client_key);
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
