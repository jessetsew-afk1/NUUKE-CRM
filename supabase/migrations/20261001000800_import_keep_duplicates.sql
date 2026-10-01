-- =============================================================================
-- Lead import keeps repeats
--
-- The sheet often has the same person more than once (a second enquiry, a new
-- service). Those rows are now all imported; only blank rows — no name, phone or
-- email — are dropped. Skipping numbers that already exist is an opt-in tick box
-- in the import wizard, for re-uploading the same sheet by mistake.
-- =============================================================================

drop function if exists public.import_leads(bigint, jsonb);

-- Inserts one chunk of parsed sheet rows. Every row with a name, phone or email is
-- kept — repeats included. Only when p_skip_duplicates is true are rows whose phone
-- (last ten digits) or personal email already exists skipped. Each row may carry its
-- own assigned_to.
create or replace function public.import_leads(p_import_id bigint, p_rows jsonb, p_skip_duplicates boolean default false)
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

  create temporary table _incoming on commit drop as
  select x.*,
         nullif(right(regexp_replace(coalesce(x.phone, ''), '\D', '', 'g'), 10), '') as phone_key,
         nullif(lower(btrim(coalesce(x.personal_email, ''))), '') as email_key,
         row_number() over () as rn
    from jsonb_to_recordset(p_rows) as x (
      lead_date date, platform text, country text, name text, personal_email text, work_email text,
      phone text, post_link text, query text, service text, assigned_to uuid, legacy jsonb
    );

  delete from _incoming
   where coalesce(btrim(name), '') = '' and phone_key is null and email_key is null and coalesce(btrim(work_email), '') = '';
  get diagnostics v_invalid = row_count;

  if p_skip_duplicates then
  -- duplicates against what is already stored
  delete from _incoming i
   where (i.phone_key is not null and exists (select 1 from public.leads l where l.phone_key = i.phone_key))
      or (i.phone_key is null and i.email_key is not null
          and exists (select 1 from public.leads l where lower(l.personal_email) = i.email_key));

  -- duplicates inside this chunk: keep the first
  delete from _incoming i
   using _incoming j
   where j.rn < i.rn
     and ((i.phone_key is not null and i.phone_key = j.phone_key)
          or (i.phone_key is null and i.email_key is not null and i.email_key = j.email_key));
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
