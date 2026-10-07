-- =============================================================================
-- NUUKE CRM — handing a salesperson's work to colleagues
--
-- When someone leaves (their login is switched off), the admin hands what they
-- were working on to one or more colleagues (Team & access → their card →
-- Hand over their work):
--   * their leads, each client to one colleague: a colleague who already has
--     that client keeps it, the rest are shared out evenly;
--   * where a colleague already had the same client, the two cards become one,
--     carrying both call histories, meetings and deals (like Remove repeats);
--   * their open deals and booked meetings go with the client (shared out when
--     there's no lead);
--   * cold call sheets: businesses they were handed but never called go back on
--     the sheet's pile; the rest go to the colleague, who joins that sheet.
-- Won and lost deals, past meetings and who made each call stay in their name,
-- so pay, stats and the leaderboard don't change.
-- =============================================================================

-- What each salesperson is holding, for the Team page.
create or replace function public.people_work()
returns table (id uuid, leads bigint, open_leads bigint, deals bigint, meetings bigint)
language sql stable security definer set search_path = public
as $$
  select p.id,
         (select count(*) from public.leads l where l.assigned_to = p.id),
         (select count(*) from public.leads l where l.assigned_to = p.id and l.stage <> 'closed'),
         (select count(*) from public.deals d where d.owner_id = p.id and d.stage not in ('won', 'lost')),
         (select count(*) from public.meetings m where m.owner_id = p.id and m.status = 'scheduled')
    from public.profiles p
   where p.role = 'sales' and public.is_admin()
$$;

-- p_apply = false only works out who would get what.
create or replace function public.hand_over_work(p_from uuid, p_to uuid[], p_apply boolean default false)
returns jsonb
language plpgsql security definer set search_path = public set plan_cache_mode = force_custom_plan
as $$
declare
  v_from public.profiles;
  v_to uuid[];
  v_n int;
  v_back int;
  v_merged int := 0;
  v_out jsonb;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can hand over work' using errcode = '42501';
  end if;
  select * into v_from from public.profiles where id = p_from;
  if not found then
    raise exception 'That person no longer exists';
  end if;
  select coalesce(array_agg(p.id order by p.full_name), '{}') into v_to
    from public.profiles p
   where p.id = any (coalesce(p_to, '{}')) and p.id <> p_from and p.is_active and p.role = 'sales';
  v_n := cardinality(v_to);
  if v_n = 0 then
    raise exception 'Pick at least one active salesperson to hand the work to';
  end if;

  drop table if exists _ho_leads;
  drop table if exists _ho_clients;
  drop table if exists _ho_map;
  drop table if exists _ho_merge;

  -- Everything they hold, except cold-sheet businesses they were handed but never called.
  create temporary table _ho_leads on commit drop as
  select l.id, coalesce(l.client_key, 'id:' || l.id) as k, l.stage, l.sheet_id
    from public.leads l
   where l.assigned_to = p_from
     and not (l.sheet_id is not null and l.claimed_at is not null and l.attempts = 0 and l.stage = 'queue');
  select count(*) into v_back from public.leads l
   where l.assigned_to = p_from and l.sheet_id is not null and l.claimed_at is not null and l.attempts = 0 and l.stage = 'queue';

  -- One colleague per client: whoever already has it, else shared out evenly.
  -- (One pass over the colleagues' leads, so it stays quick however many clients there are.)
  create temporary table _ho_clients on commit drop as
  with keys as (
    select k, min(id) as first_id from _ho_leads group by k
  ), held as (
    select distinct on (l.client_key) l.client_key as k, l.assigned_to as who
      from public.leads l
      join keys on keys.k = l.client_key
     where l.assigned_to = any (v_to)
     order by l.client_key, array_position(v_to, l.assigned_to)
  )
  select keys.k, held.who is not null as had,
         coalesce(held.who, v_to[((row_number() over (partition by held.who is null order by keys.first_id) - 1) % v_n)::int + 1]) as to_id
    from keys left join held on held.k = keys.k;

  create temporary table _ho_map on commit drop as
  select l.id, c.to_id, c.had, l.stage from _ho_leads l join _ho_clients c on c.k = l.k;

  select jsonb_build_object(
    'from', v_from.full_name,
    'clients', (select count(*) from _ho_clients),
    'leads', (select count(*) from _ho_map),
    'open', (select count(*) from _ho_map where stage <> 'closed'),
    'pipeline', (select count(*) from _ho_map where stage = 'pipeline'),
    'already_had', (select count(*) from _ho_clients where had),
    'deals', (select count(*) from public.deals d where d.owner_id = p_from and d.stage not in ('won', 'lost')),
    'meetings', (select count(*) from public.meetings m where m.owner_id = p_from and m.status = 'scheduled'),
    'back_to_sheet', v_back,
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name', p.full_name,
                 'clients', (select count(*) from _ho_clients c where c.to_id = p.id),
                 'already_had', (select count(*) from _ho_clients c where c.to_id = p.id and c.had),
                 'open', (select count(*) from _ho_map m where m.to_id = p.id and m.stage <> 'closed'),
                 'pipeline', (select count(*) from _ho_map m where m.to_id = p.id and m.stage = 'pipeline'),
                 'deals', (select count(*) from public.deals d
                            where d.owner_id = p_from and d.stage not in ('won', 'lost')
                              and coalesce((select m.to_id from _ho_map m where m.id = d.lead_id), v_to[(d.id % v_n)::int + 1]) = p.id),
                 'meetings', (select count(*) from public.meetings x
                               where x.owner_id = p_from and x.status = 'scheduled'
                                 and coalesce((select m.to_id from _ho_map m where m.id = x.lead_id), v_to[(x.id % v_n)::int + 1]) = p.id))
                 order by p.full_name), '[]'::jsonb)
                 from public.profiles p where p.id = any (v_to)))
    into v_out;

  if not p_apply then
    return v_out || jsonb_build_object('applied', false);
  end if;

  -- Cold-sheet businesses never called: back on the sheet's pile for the others on it.
  update public.leads
     set assigned_to = null, assigned_at = null, claimed_at = null, skipped_at = null
   where assigned_to = p_from and sheet_id is not null and claimed_at is not null and attempts = 0 and stage = 'queue';

  -- Open deals and booked meetings follow their client.
  update public.deals d
     set owner_id = coalesce((select m.to_id from _ho_map m where m.id = d.lead_id), v_to[(d.id % v_n)::int + 1])
   where d.owner_id = p_from and d.stage not in ('won', 'lost');
  update public.meetings x
     set owner_id = coalesce((select m.to_id from _ho_map m where m.id = x.lead_id), v_to[(x.id % v_n)::int + 1])
   where x.owner_id = p_from and x.status = 'scheduled';

  update public.leads l
     set assigned_to = m.to_id, assigned_at = now(), skipped_at = null, claimed_at = null
    from _ho_map m
   where l.id = m.id;

  -- Cold call sheets: a colleague who took businesses from a sheet joins it; the leaver leaves.
  insert into public.lead_sheet_members (sheet_id, user_id)
  select distinct l.sheet_id, m.to_id from _ho_map m join public.leads l on l.id = m.id where l.sheet_id is not null
  on conflict do nothing;
  delete from public.lead_sheet_members where user_id = p_from;

  -- A client a colleague already had: one card, carrying everything from both.
  create temporary table _ho_merge on commit drop as
  select id as loser, keeper
    from (select l.id,
                 first_value(l.id) over (
                   partition by l.assigned_to, l.client_key, coalesce(l.sheet_id, 0)
                   order by case when l.stage = 'pipeline' or l.status = 'won' then 4
                                 when exists (select 1 from public.meetings mt where mt.lead_id = l.id) then 3
                                 when l.status = 'do_not_call' then 2
                                 when l.closed_reason = 'duplicate' then -1
                                 else 0 end desc,
                            l.attempts desc, l.id) as keeper
            from public.leads l
           where (l.assigned_to, l.client_key, coalesce(l.sheet_id, 0)) in (
                   select l2.assigned_to, l2.client_key, coalesce(l2.sheet_id, 0)
                     from public.leads l2 join _ho_map m on m.id = l2.id)) x
   where id <> keeper;
  select count(*) into v_merged from _ho_merge;

  update public.lead_attempts a set lead_id = m.keeper from _ho_merge m where a.lead_id = m.loser;
  update public.meetings x set lead_id = m.keeper from _ho_merge m where x.lead_id = m.loser;
  update public.deals x set lead_id = m.keeper from _ho_merge m where x.lead_id = m.loser;
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
            from _ho_merge m join public.leads l on l.id = m.loser
           group by m.keeper) agg
   where k.id = agg.keeper;
  delete from public.leads l using _ho_merge m where l.id = m.loser;

  for r in select p.value as person from jsonb_array_elements(v_out -> 'people') p loop
    if (r.person ->> 'clients')::int + (r.person ->> 'deals')::int + (r.person ->> 'meetings')::int > 0 then
      perform public.notify((r.person ->> 'id')::uuid, 'leads.handover',
        format('%s''s work is now yours', split_part(v_from.full_name, ' ', 1)),
        format('%s clients, %s open deals and %s booked meetings are on your dialer and pipeline now.',
               r.person ->> 'clients', r.person ->> 'deals', r.person ->> 'meetings'),
        '/sales', 'info', jsonb_build_object('from', p_from));
    end if;
  end loop;

  perform public.audit('handover', 'users', p_from::text,
    format('Handed %s''s work to %s: %s clients, %s open deals, %s meetings',
           v_from.full_name, (select string_agg(full_name, ', ' order by full_name) from public.profiles where id = any (v_to)),
           v_out ->> 'clients', v_out ->> 'deals', v_out ->> 'meetings'),
    jsonb_build_object('to', to_jsonb(v_to)));

  return v_out || jsonb_build_object('applied', true, 'merged', v_merged);
end
$$;
