-- Hand text kit leads to other people (e.g. 50 each to the appointment setters).
-- Only an admin can; only leads still "to text" move, so nobody inherits a
-- half-finished conversation. The leads moved are the last ones in the giver's list
-- (the newest batch added), so the giver keeps the ones they were working through.

create or replace function public.text_kit_assign(p_to uuid, p_count int, p_from uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  moved int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can hand out texts' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'Choose between 1 and 500' using errcode = '22023';
  end if;
  if p_to = p_from then
    raise exception 'Pick someone else to give them to' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_to and is_active and role in ('admin', 'sales', 'setter')) then
    raise exception 'They need an active sales, setter or admin login' using errcode = '22023';
  end if;
  with picked as (
    select id from public.text_kit
     where owner_id = p_from and status = 'to_text'
     order by position desc
     limit p_count
     for update
  )
  update public.text_kit k set owner_id = p_to
    from picked where k.id = picked.id;
  get diagnostics moved = row_count;
  return moved;
end
$$;
revoke execute on function public.text_kit_assign(uuid, int, uuid) from public, anon;
grant execute on function public.text_kit_assign(uuid, int, uuid) to authenticated;
