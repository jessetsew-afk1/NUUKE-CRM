-- =============================================================================
-- NUUKE CRM — mini games: anyone whose attendance isn't tracked can play any time
--
-- Games open on your break. People the admin has set to not track attendance
-- have no shift and no breaks, so (like admins) they can play whenever they
-- like. Everyone else still plays only while on a break.
-- =============================================================================

create or replace function public.can_play(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select p.role = 'admin'
           -- not on the attendance clock: no breaks, so always free
           or not exists (select 1 from public.employment e where e.profile_id = p.id and e.tracks_attendance)
           or exists (select 1 from public.attendance_breaks b where b.profile_id = p.id and b.ended_at is null)
      from public.profiles p
     where p.id = p_user and p.is_active and p.role in ('admin', 'sales', 'production')
  ), false)
$$;

-- Who's free to play right now: on a break, an admin, or not on the attendance clock.
create or replace function public.players_on_break()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
    from public.profiles p
   where public.is_staff()
     and p.is_active and p.role in ('admin', 'sales', 'production')
     and public.can_play(p.id)
$$;
