-- Story&House: a separate lead category for the ebooks department.
-- Each lead and each import belongs to a brand ('nuuke' or 'story_house').
-- Leads take their brand from their import, so the import wizard only has
-- to tag the import. Agents join the department via profiles.department.

alter table public.lead_imports
  add column if not exists brand text not null default 'nuuke' check (brand in ('nuuke', 'story_house'));
alter table public.leads
  add column if not exists brand text not null default 'nuuke' check (brand in ('nuuke', 'story_house'));
create index if not exists leads_brand_idx on public.leads (brand);

create or replace function public.leads_brand_from_import() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.import_id is not null then
    select i.brand into new.brand from public.lead_imports i where i.id = new.import_id;
    new.brand := coalesce(new.brand, 'nuuke');
  end if;
  return new;
end $$;

drop trigger if exists leads_brand_from_import on public.leads;
create trigger leads_brand_from_import before insert on public.leads
  for each row execute function public.leads_brand_from_import();

-- Admin tags an import (and any leads already in it) with a brand.
create or replace function public.set_import_brand(p_import_id bigint, p_brand text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_brand not in ('nuuke', 'story_house') then
    raise exception 'Unknown brand %', p_brand;
  end if;
  update public.lead_imports set brand = p_brand where id = p_import_id;
  update public.leads set brand = p_brand where import_id = p_import_id and brand <> p_brand;
end $$;
revoke all on function public.set_import_brand(bigint, text) from public, anon;
grant execute on function public.set_import_brand(bigint, text) to authenticated;

-- "Select all matching" respects the brand (and the search box is now grouped).
create or replace function public.admin_lead_ids(p_filter jsonb, p_limit integer default 100000)
returns bigint[] language plpgsql stable security definer set search_path = public as $$
declare
  v_ids bigint[];
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_ids
    from (
      select l.id from public.leads l
       where (p_filter ->> 'brand' is null or l.brand = p_filter ->> 'brand')
         and (p_filter ->> 'service' is null or l.service = p_filter ->> 'service')
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
         and (p_filter ->> 'q' is null or (l.name ilike '%' || (p_filter ->> 'q') || '%'
              or l.phone ilike '%' || (p_filter ->> 'q') || '%'
              or l.personal_email ilike '%' || (p_filter ->> 'q') || '%'))
       order by l.id
       limit p_limit
    ) x;
  return v_ids;
end $$;
