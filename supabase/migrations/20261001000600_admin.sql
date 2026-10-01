-- =============================================================================
-- Admin helpers
-- =============================================================================

-- Distinct services and platforms across every lead, with counts, for the admin's
-- filters (selecting the columns directly would stop at the API's row cap).
create or replace function public.admin_lead_facets()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('value', service, 'count', n) order by n desc)
                            from (select service, count(*) n from public.leads where service is not null group by service) s), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('value', platform, 'count', n) order by n desc)
                             from (select platform, count(*) n from public.leads where platform is not null group by platform) s), '[]'::jsonb)
  );
end
$$;
