-- Project managers: production staff an admin trusts to run the project folder. They see
-- and work every project, and can create projects and set up who is on them. Making client
-- logins stays with admins.

alter table public.profiles add column if not exists is_project_manager boolean not null default false;

-- Only an admin decides who is a technical manager, sales lead or project manager.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id <> auth.uid() then
      raise exception 'You can only change your own profile' using errcode = '42501';
    end if;
    if new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.department is distinct from old.department
       or new.title is distinct from old.title
       or new.is_active is distinct from old.is_active
       or new.is_technical_manager is distinct from old.is_technical_manager
       or new.is_sales_lead is distinct from old.is_sales_lead
       or new.is_project_manager is distinct from old.is_project_manager
       or new.also_story_house is distinct from old.also_story_house then
      raise exception 'Only an admin can change that' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

/** Active staff (never a client) marked as project managers. */
create or replace function public.is_project_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_project_manager and role <> 'client'
                     from public.profiles where id = auth.uid() and is_active), false)
$$;
revoke execute on function public.is_project_manager() from public, anon;
grant execute on function public.is_project_manager() to authenticated;

-- A project manager counts as part of every project's team.
create or replace function public.project_access(p_project bigint)
returns text
language sql stable security definer set search_path = public
as $$
  select case
           when pr.role = 'admin' then 'admin'
           when pr.is_project_manager and pr.role <> 'client' then 'team'
           when pm.profile_id is null then null
           when pr.role = 'client' then 'client'
           else 'team'
         end
    from public.profiles pr
    left join public.project_members pm on pm.project_id = p_project and pm.profile_id = pr.id
   where pr.id = auth.uid() and pr.is_active
$$;

-- Project managers create and edit projects and their teams. Deleting stays with admins
-- (archiving is how a project is put away).
drop policy if exists projects_pm_insert on public.projects;
create policy projects_pm_insert on public.projects for insert to authenticated
  with check (public.is_project_manager());
drop policy if exists projects_pm_update on public.projects;
create policy projects_pm_update on public.projects for update to authenticated
  using (public.is_project_manager()) with check (public.is_project_manager());

drop policy if exists project_members_pm on public.project_members;
create policy project_members_pm on public.project_members for all to authenticated
  using (public.is_project_manager()) with check (public.is_project_manager());
