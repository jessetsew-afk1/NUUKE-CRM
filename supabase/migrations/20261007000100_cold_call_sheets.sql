-- =============================================================================
-- NUUKE CRM — cold call sheets
--
-- A cold call sheet is a list of businesses to cold call (not enquiries), uploaded
-- by the admin for the dialers they pick. It stays apart from the normal leads:
--   * the dialers on the sheet choose it on the dialer before pressing Start, and a
--     session on it only serves that sheet's businesses;
--   * normal dialing never serves a cold-sheet business;
--   * everyone on the sheet works from one shared pile. A business stays with
--     whoever is handed it first (2-day repeats, call-backs and meetings come back
--     to them), so no business is called by two people. Cards picked up but never
--     called go back on the pile when the session ends, or after 12 hours;
--   * every column of the sheet is kept and shown on the card, and the columns the
--     sheet leaves for the caller (with their dropdown choices) are filled in on the
--     card.
-- Priority A is served first, then B, then C, in the sheet's own order.
-- =============================================================================

create table public.lead_sheets (
  id           bigint generated always as identity primary key,
  name         text not null check (btrim(name) <> ''),
  kind         text not null default 'cold' check (kind = 'cold'),
  instructions text,                                  -- the sheet's "How to use" tab
  fill_fields  jsonb not null default '[]'::jsonb,    -- [{label, options?: text[], number?: bool}]
  columns      jsonb not null default '[]'::jsonb,    -- the sheet's columns in order: [{label, role}]
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.lead_sheet_members (
  sheet_id bigint not null references public.lead_sheets (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (sheet_id, user_id)
);
create index lead_sheet_members_user on public.lead_sheet_members (user_id);

alter table public.leads
  add column sheet_id   bigint references public.lead_sheets (id) on delete set null,
  add column details    jsonb,          -- cold sheets: {contact, priority, ref, row, fields: [{label, value}], answers: {label: value}}
  add column claimed_at timestamptz;    -- cold sheets: when a dialer was handed it from the pile
create index leads_sheet on public.leads (sheet_id, assigned_to) where sheet_id is not null;

alter table public.lead_sheets enable row level security;
create policy lead_sheets_read on public.lead_sheets for select to authenticated
  using ((select public.is_admin())
         or id in (select m.sheet_id from public.lead_sheet_members m where m.user_id = (select auth.uid())));
create policy lead_sheets_admin on public.lead_sheets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.lead_sheet_members enable row level security;
create policy lead_sheet_members_read on public.lead_sheet_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy lead_sheet_members_admin on public.lead_sheet_members for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.is_sheet_member(p_sheet bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.lead_sheet_members where sheet_id = p_sheet and user_id = auth.uid())
$$;

-- Call order on a cold sheet: priority A (or 1, High, Hot) first, then B, then C, then the rest.
create or replace function public.sheet_rank(p_details jsonb)
returns int
language sql immutable parallel safe
as $$
  select case upper(left(btrim(coalesce(p_details ->> 'priority', '')), 1))
           when 'A' then 1 when '1' then 1 when 'H' then 1
           when 'B' then 2 when '2' then 2 when 'M' then 2 when 'W' then 2
           when 'C' then 3 when '3' then 3 when 'L' then 3
           else 4 end
$$;

-- -----------------------------------------------------------------------------
-- Normal dialing leaves cold-sheet businesses alone (otherwise unchanged)
-- -----------------------------------------------------------------------------
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
             and x.sheet_id is null
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
       and l.sheet_id is null
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

create or replace function public.lead_filter_options()
returns jsonb
language sql stable
as $$
  with mine as materialized (
    select service, platform, lead_date
      from public.leads
     where assigned_to = (select auth.uid()) and sheet_id is null
  )
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('value', service, 'count', n) order by n desc)
                            from (select service, count(*) n from mine
                                   where service is not null and service <> '' group by service) s), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('value', platform, 'count', n) order by n desc)
                             from (select platform, count(*) n from mine
                                    where platform is not null and platform <> '' group by platform) s), '[]'::jsonb),
    'date_min', (select min(lead_date) from mine),
    'date_max', (select max(lead_date) from mine)
  )
$$;

-- -----------------------------------------------------------------------------
-- Dialing a cold sheet
-- -----------------------------------------------------------------------------
-- The sheets I'm on, with how many cards are ready for me on each.
create or replace function public.my_lead_sheets()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'instructions', s.instructions, 'fill_fields', s.fill_fields,
           'ready', (select count(*) from public.leads l
                      where l.sheet_id = s.id
                        and ((l.assigned_to is null and l.stage = 'queue')
                             or (l.assigned_to = auth.uid()
                                 and (l.stage = 'queue' or (l.stage = 'pipeline' and l.next_action_at is not null))))
                        and (l.next_action_at is null or l.next_action_at <= now())),
           'total', (select count(*) from public.leads l where l.sheet_id = s.id))
           order by s.created_at desc), '[]'::jsonb)
    from public.lead_sheets s
   where s.id in (select m.sheet_id from public.lead_sheet_members m where m.user_id = auth.uid())
$$;

-- The start-screen counts for one sheet, in the same shape as queue_summary.
create or replace function public.sheet_queue_summary(p_sheet bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pile int;
  v_out jsonb;
begin
  if not public.is_sheet_member(p_sheet) then
    raise exception 'You don''t have access to that sheet' using errcode = '42501';
  end if;
  select count(*) into v_pile from public.leads
   where sheet_id = p_sheet and assigned_to is null and stage = 'queue'
     and (next_action_at is null or next_action_at <= now());
  select jsonb_build_object(
    'due_followups', count(*) filter (where stage in ('queue', 'pipeline') and next_action_at is not null
                                       and next_action_at <= now() and skipped_at is null),
    'fresh', v_pile + count(*) filter (where stage = 'queue' and next_action_at is null and attempts = 0 and skipped_at is null),
    'skipped', count(*) filter (where (stage = 'queue' or (stage = 'pipeline' and next_action_at is not null))
                                 and skipped_at is not null and (next_action_at is null or next_action_at <= now())),
    'scheduled_later', count(*) filter (where stage in ('queue', 'pipeline') and next_action_at > now()),
    'in_pipeline', count(*) filter (where stage = 'pipeline'),
    'closed', count(*) filter (where stage = 'closed'),
    'total', count(*) + v_pile,
    'pile', v_pile)
    into v_out
    from public.leads
   where sheet_id = p_sheet and assigned_to = auth.uid();
  return v_out;
end
$$;

-- The next cards on a sheet. Tops the dialer up from the shared pile first (each
-- business handed to one dialer only, even when two press Start at once), then
-- serves their own due cards: call-backs first, then by priority and sheet order.
create or replace function public.next_sheet_leads(p_sheet bigint, p_limit int default 3)
returns setof public.leads
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 3), 1), 20);
  v_have int;
begin
  if not public.is_sheet_member(p_sheet) then
    raise exception 'You don''t have access to that sheet' using errcode = '42501';
  end if;
  -- One top-up at a time per dialer, so two loads at once can't both take cards.
  perform pg_advisory_xact_lock(hashtextextended('sheet:' || p_sheet || ':' || v_uid, 0));

  -- Picked up but never called for 12 hours: back on the pile.
  update public.leads
     set assigned_to = null, assigned_at = null, claimed_at = null, skipped_at = null
   where sheet_id = p_sheet and claimed_at < now() - interval '12 hours'
     and attempts = 0 and stage = 'queue';

  select count(*) into v_have
    from public.leads l
   where l.sheet_id = p_sheet and l.assigned_to = v_uid
     and (l.stage = 'queue' or (l.stage = 'pipeline' and l.next_action_at is not null))
     and (l.next_action_at is null or l.next_action_at <= now())
     and not coalesce(l.skipped_at > now() - interval '12 hours', false);

  if v_have < v_limit then
    update public.leads l
       set assigned_to = v_uid, assigned_at = now(), claimed_at = now(), skipped_at = null
     where l.id in (
       select p.id from public.leads p
        where p.sheet_id = p_sheet and p.assigned_to is null and p.stage = 'queue'
          and (p.next_action_at is null or p.next_action_at <= now())
        order by public.sheet_rank(p.details), (p.details ->> 'row')::int nulls last, p.id
        limit v_limit - v_have
        for update skip locked);
  end if;

  return query
  select l.*
    from public.leads l
    join (
      select d.id, d.skipped_today, d.appointment, d.next_action_at, d.rank, d.rn,
             row_number() over (partition by d.client_key
                                order by d.skipped_today, d.appointment desc, d.next_action_at nulls last, d.id) as n
        from (
          select x.id, x.client_key, x.next_action_at,
                 coalesce(x.skipped_at > now() - interval '12 hours', false) as skipped_today,
                 (x.status = 'busy_callback' or x.stage = 'pipeline') and x.next_action_at is not null as appointment,
                 public.sheet_rank(x.details) as rank,
                 (x.details ->> 'row')::int as rn
            from public.leads x
           where x.sheet_id = p_sheet and x.assigned_to = v_uid
             and (x.stage = 'queue' or (x.stage = 'pipeline' and x.next_action_at is not null))
             and (x.next_action_at is null or x.next_action_at <= now())
        ) d
    ) q on q.id = l.id
   where q.n = 1
   order by q.skipped_today, q.appointment desc,
            case when q.appointment then q.next_action_at end nulls last,
            q.rank, q.rn nulls last, l.id
   limit v_limit;
end
$$;

-- Ending a session puts the cards I was handed but never called back on the pile
-- (just the ones that session showed, when it says which).
create or replace function public.release_sheet_leads(p_sheet bigint, p_ids bigint[] default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('sheet:' || p_sheet || ':' || auth.uid(), 0));
  update public.leads
     set assigned_to = null, assigned_at = null, claimed_at = null, skipped_at = null
   where sheet_id = p_sheet and assigned_to = auth.uid() and claimed_at is not null
     and attempts = 0 and stage = 'queue'
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- What the dialer filled in on the card (the sheet's "fill in while calling" columns).
create or replace function public.save_lead_answers(p_lead_id bigint, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_lead public.leads;
  v_fields jsonb;
  v_answers jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Nothing to save';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists';
  end if;
  if v_lead.assigned_to is distinct from auth.uid() and not public.is_admin() then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;
  select fill_fields into v_fields from public.lead_sheets where id = v_lead.sheet_id;
  if v_fields is null then
    raise exception 'This lead has nothing to fill in';
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_answers
    from jsonb_each(coalesce(v_lead.details -> 'answers', '{}'::jsonb) || p_answers) e
   where e.value not in ('""'::jsonb, 'null'::jsonb)
     and length(e.value #>> '{}') <= 2000
     and e.key in (select f ->> 'label' from jsonb_array_elements(v_fields) f);

  update public.leads
     set details = jsonb_set(coalesce(details, '{}'::jsonb), '{answers}', v_answers)
   where id = p_lead_id;
  return v_answers;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: who is on a sheet, uploading into it, deleting it
-- -----------------------------------------------------------------------------
-- Sets exactly who is on a sheet. Someone taken off hands back the businesses they
-- hadn't finished (their call history stays); someone added is told about it.
create or replace function public.set_sheet_members(p_sheet bigint, p_members uuid[], p_notify boolean default true)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_sheet public.lead_sheets;
  v_members uuid[] := coalesce(p_members, '{}');
  r record;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can choose who dials a sheet' using errcode = '42501';
  end if;
  select * into v_sheet from public.lead_sheets where id = p_sheet;
  if not found then
    raise exception 'That sheet no longer exists';
  end if;

  update public.leads
     set assigned_to = null, assigned_at = null, claimed_at = null, skipped_at = null
   where sheet_id = p_sheet and stage = 'queue' and assigned_to is not null
     and not (assigned_to = any (v_members));
  delete from public.lead_sheet_members where sheet_id = p_sheet and not (user_id = any (v_members));

  for r in
    insert into public.lead_sheet_members (sheet_id, user_id)
    select p_sheet, p.id from public.profiles p where p.id = any (v_members)
    on conflict do nothing
    returning user_id
  loop
    if p_notify then
      perform public.notify(r.user_id, 'leads.sheet', format('You can now dial %s', v_sheet.name),
        'Pick it under "What to dial" on the dialer, then press Start.', '/sales', 'info',
        jsonb_build_object('sheet_id', p_sheet));
    end if;
  end loop;

  select count(*) into v_count from public.lead_sheet_members where sheet_id = p_sheet;
  return v_count;
end
$$;

-- One chunk of a cold call sheet. Each business is added once: a repeat in the file,
-- or one already on this sheet, is skipped, and so is anyone who asked not to be
-- called or already has a meeting set.
create or replace function public.import_sheet_leads(p_import_id bigint, p_sheet bigint, p_rows jsonb)
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
  if not exists (select 1 from public.lead_sheets where id = p_sheet) then
    raise exception 'That sheet no longer exists';
  end if;

  drop table if exists _incoming;
  create temporary table _incoming on commit drop as
  select x.*,
         public.lead_client_key(x.phone, x.personal_email, x.work_email, x.name, null, null) as client_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (name text, phone text, personal_email text, work_email text, details jsonb);

  delete from _incoming
   where coalesce(btrim(name), '') = '' and coalesce(btrim(phone), '') = ''
     and coalesce(btrim(personal_email), '') = '' and coalesce(btrim(work_email), '') = '';
  get diagnostics v_invalid = row_count;

  delete from _incoming i using _incoming j where j.rn < i.rn and i.client_key = j.client_key;

  delete from _incoming i
   where exists (select 1 from public.leads l
                  where l.client_key = i.client_key
                    and (l.sheet_id = p_sheet
                         or l.status in ('do_not_call', 'won')
                         or (l.stage = 'pipeline' and l.status <> 'interested')));

  insert into public.leads (name, phone, personal_email, work_email, platform, details, sheet_id, import_id)
  select coalesce(btrim(name), ''), nullif(btrim(phone), ''), nullif(btrim(personal_email), ''),
         nullif(btrim(work_email), ''), 'Cold call', details, p_sheet, p_import_id
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

-- After an upload: tell everyone on the sheet, and log it.
create or replace function public.finish_sheet_import(p_import_id bigint, p_sheet bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_import public.lead_imports;
  v_sheet public.lead_sheets;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;
  select * into v_import from public.lead_imports where id = p_import_id;
  select * into v_sheet from public.lead_sheets where id = p_sheet;
  if v_import.inserted > 0 then
    for r in select user_id from public.lead_sheet_members where sheet_id = p_sheet loop
      perform public.notify(r.user_id, 'leads.sheet', format('%s businesses to cold call on %s', v_import.inserted, v_sheet.name),
        'Pick the sheet under "What to dial" on the dialer, then press Start.', '/sales', 'info',
        jsonb_build_object('sheet_id', p_sheet, 'count', v_import.inserted));
    end loop;
  end if;
  perform public.audit('import', 'leads', p_import_id::text,
    format('Imported %s businesses from %s into the cold call sheet %s (%s repeats skipped)',
           v_import.inserted, v_import.file_name, v_sheet.name, v_import.duplicates));
  return to_jsonb(v_import);
end
$$;

-- Deletes a sheet and the businesses on it. Any that became a prospect, a meeting or
-- a deal are kept as ordinary leads with whoever has them.
create or replace function public.delete_lead_sheet(p_sheet bigint)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a sheet' using errcode = '42501';
  end if;
  select name into v_name from public.lead_sheets where id = p_sheet;
  if not found then
    return 0;
  end if;
  delete from public.leads l
   where l.sheet_id = p_sheet and l.stage <> 'pipeline' and l.deal_id is null and l.status <> 'won'
     and not exists (select 1 from public.meetings m where m.lead_id = l.id);
  get diagnostics v_count = row_count;
  delete from public.lead_sheets where id = p_sheet;
  perform public.audit('delete', 'lead_sheets', p_sheet::text, format('Deleted the cold call sheet %s (%s businesses)', v_name, v_count));
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin lists: "Unassigned" means waiting for a rep, not on a cold sheet's pile,
-- and the lead list can be narrowed to one sheet
-- -----------------------------------------------------------------------------
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
         and (p_filter ->> 'sheet' is null or l.sheet_id = (p_filter ->> 'sheet')::bigint)
         and (p_filter ->> 'assigned' is null
              or (p_filter ->> 'assigned' = 'unassigned' and l.assigned_to is null and l.sheet_id is null)
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

-- Remove repeats works on the normal leads only; a cold sheet is its own list.
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
   where l.assigned_to is not null and l.sheet_id is null;
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
           where l.assigned_to is not null and l.sheet_id is null
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
