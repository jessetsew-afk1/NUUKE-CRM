-- =============================================================================
-- NUUKE CRM — telling clients apart correctly
--
-- The lead sheet often has contact details in the wrong column: an email under
-- Phone, phone numbers under Personal email. The old matching took any digits in
-- the Phone column as the phone number, so "walrus07@yahoo.com" became the
-- "number" 07, and different people with the same stray digits were treated as
-- the same client (for repeats, Do not call and meetings).
--
-- Now:
--   * a phone number needs at least 7 digits, and digits inside an email address
--     never count;
--   * numbers found in the email column are used when the Phone column has none;
--   * an email found in the Phone column is used when the email column has none.
-- Plus a repair for anything the old matching closed for the wrong person.
-- =============================================================================

-- The phone number a lead is reached on: the last ten digits, from the Phone column,
-- or from the Personal email column when the sheet put the numbers there.
create or replace function public.contact_phone_digits(p_phone text, p_personal_email text)
returns text
language sql immutable parallel safe
as $$
  select case
    when length(regexp_replace(regexp_replace(coalesce(p_phone, ''), '\S+@\S+', '', 'g'), '\D', '', 'g')) >= 7
      then right(regexp_replace(regexp_replace(coalesce(p_phone, ''), '\S+@\S+', '', 'g'), '\D', '', 'g'), 10)
    when length(regexp_replace(regexp_replace(coalesce(p_personal_email, ''), '\S+@\S+', '', 'g'), '\D', '', 'g')) >= 7
      then right(regexp_replace(regexp_replace(coalesce(p_personal_email, ''), '\S+@\S+', '', 'g'), '\D', '', 'g'), 10)
  end
$$;

-- Who the client is: their phone number, else an email (wherever it was typed),
-- else the work email, else an identical name + post link + query.
create or replace function public.lead_client_key(
  p_phone text, p_personal_email text, p_work_email text, p_name text, p_post_link text, p_query text
) returns text
language sql immutable parallel safe
as $$
  select coalesce(
    'p:' || public.contact_phone_digits(p_phone, p_personal_email),
    'e:' || lower(substring(coalesce(p_personal_email, '') from '[^\s|,;<>()]+@[^\s|,;<>()]+')),
    'e:' || lower(substring(coalesce(p_phone, '') from '[^\s|,;<>()]+@[^\s|,;<>()]+')),
    'w:' || lower(substring(coalesce(p_work_email, '') from '[^\s|,;<>()]+@[^\s|,;<>()]+')),
    'n:' || md5(lower(btrim(coalesce(p_name, ''))) || '|' || btrim(coalesce(p_post_link, '')) || '|' || left(btrim(coalesce(p_query, '')), 200))
  )
$$;

-- Rebuild both keys on every lead with the new rules.
drop index if exists public.leads_phone;
drop index if exists public.leads_client_key;
alter table public.leads drop column if exists client_key;
alter table public.leads drop column if exists phone_key;
alter table public.leads add column phone_key text
  generated always as (public.contact_phone_digits(phone, personal_email)) stored;
alter table public.leads add column client_key text
  generated always as (public.lead_client_key(phone, personal_email, work_email, name, post_link, query)) stored;
create index leads_phone on public.leads (phone_key);
create index leads_client_key on public.leads (client_key, assigned_to);

-- -----------------------------------------------------------------------------
-- Repair: undo what the old matching closed for the wrong person
-- -----------------------------------------------------------------------------
-- "Asked not to be called (logged by …)" copied onto someone who isn't, under the
-- new matching, the same client as anyone who actually said it.
update public.leads l
   set stage = 'queue', closed_reason = null, next_action_at = now(), last_comment = null,
       status = coalesce((select a.outcome from public.lead_attempts a
                           where a.lead_id = l.id and a.action = 'call' and a.outcome <> 'do_not_call'
                           order by a.created_at desc limit 1), 'new')
 where l.status = 'do_not_call' and l.stage = 'closed'
   and l.last_comment like 'Asked not to be called (logged by %'
   and not exists (select 1 from public.leads d
                     join public.lead_attempts a on a.lead_id = d.id and a.outcome = 'do_not_call'
                    where d.client_key = l.client_key and d.id <> l.id);

-- "Meeting set by …" copied onto someone who isn't the client with the meeting.
update public.leads l
   set stage = 'queue', closed_reason = null, next_action_at = now(), last_comment = null,
       status = coalesce((select a.outcome from public.lead_attempts a
                           where a.lead_id = l.id and a.action = 'call'
                           order by a.created_at desc limit 1), 'new')
 where l.status = 'duplicate' and l.stage = 'closed'
   and (l.last_comment like 'Meeting set by %' or l.last_comment = 'A colleague has a meeting set with this client')
   and not exists (select 1 from public.leads d
                    where d.client_key = l.client_key and d.id <> l.id
                      and ((d.stage = 'pipeline' and d.status <> 'interested') or d.status = 'won'));

-- -----------------------------------------------------------------------------
-- Imports use the same rules
-- -----------------------------------------------------------------------------
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
         public.contact_phone_digits(x.phone, x.personal_email) as phone_key,
         nullif(lower(btrim(coalesce(x.personal_email, ''))), '') as email_key,
         public.lead_client_key(x.phone, x.personal_email, x.work_email, x.name, x.post_link, x.query) as client_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (
      lead_date date, platform text, country text, name text, personal_email text, work_email text,
      phone text, post_link text, query text, service text, assigned_to uuid, legacy jsonb
    );

  delete from _incoming
   where coalesce(btrim(name), '') = '' and phone_key is null and email_key is null
     and coalesce(btrim(work_email), '') = '' and coalesce(btrim(phone), '') = '';
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
