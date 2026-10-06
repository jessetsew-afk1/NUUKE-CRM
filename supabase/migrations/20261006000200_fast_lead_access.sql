-- =============================================================================
-- NUUKE CRM — fast lead access for big lead lists
--
-- The permission rules on leads ran a check for every row in the table: "is
-- this an admin?" and "is this person the technical manager on a meeting for
-- this lead?" were worked out once per lead, for every lead in the company,
-- on every request. With tens of thousands of leads that took seconds, and
-- Supabase stops a request after 8 seconds, so the dialer's filters (and other
-- lead lists) came back empty.
--
-- Same rules, written so each question is answered once per request:
--   (select auth.uid()) and (select public.is_admin()) are worked out once,
--   and "leads on my meetings" is one list, looked up instead of re-checked.
-- =============================================================================

-- Leads ---------------------------------------------------------------------
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select to authenticated
  using (assigned_to = (select auth.uid()) or (select public.is_admin()));

drop policy if exists leads_admin on public.leads;
create policy leads_admin on public.leads for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Technical managers read the leads of the meetings they're on.
drop policy if exists leads_tm_read on public.leads;
create policy leads_tm_read on public.leads for select to authenticated
  using (id in (select m.lead_id from public.meetings m
                 where m.technical_manager_id = (select auth.uid()) and m.lead_id is not null));

-- Call history ----------------------------------------------------------------
drop policy if exists lead_attempts_read on public.lead_attempts;
create policy lead_attempts_read on public.lead_attempts for select to authenticated
  using (rep_id = (select auth.uid())
         or (select public.is_admin())
         or lead_id in (select l.id from public.leads l where l.assigned_to = (select auth.uid())));

-- Deals and meetings ------------------------------------------------------------
drop policy if exists deals_own on public.deals;
create policy deals_own on public.deals for all to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check ((owner_id = (select auth.uid()) and (select public.my_role()) = 'sales') or (select public.is_admin()));

drop policy if exists meetings_own on public.meetings;
create policy meetings_own on public.meetings for all to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check ((owner_id = (select auth.uid()) and (select public.my_role()) = 'sales') or (select public.is_admin()));

drop policy if exists meetings_tm_read on public.meetings;
create policy meetings_tm_read on public.meetings for select to authenticated
  using (technical_manager_id = (select auth.uid()));

-- One pass over the dialer's own leads for the filter lists ------------------------
create or replace function public.lead_filter_options()
returns jsonb
language sql stable
as $$
  with mine as materialized (
    select service, platform, lead_date
      from public.leads
     where assigned_to = (select auth.uid())
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
