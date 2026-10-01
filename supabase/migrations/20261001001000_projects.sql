-- =============================================================================
-- NUUKE CRM — projects: the production workspace and the client portal
--
-- The admin creates a project and puts people on it: production staff (who do
-- the work) and client logins (who watch it happen). Nobody sees a project they
-- are not on, except admins, who see everything.
--
-- Inside a project, the team plans sprints, runs a Kanban board, keeps a
-- calendar and a content calendar, uploads files and shares them with the client
-- for review. Clients see only what the team marks as visible to them, and can
-- comment, approve or ask for changes, and message the team.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Projects and who is on them
-- -----------------------------------------------------------------------------
create table public.projects (
  id           bigint generated always as identity primary key,
  name         text not null check (length(trim(name)) > 0),
  client_name  text,                                   -- the client's company, as it should read on screen
  service      text,
  description  text,
  color        text not null default '#7c5cff',
  status       text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  starts_on    date,
  due_on       date,
  archived_at  timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.project_members (
  project_id  bigint not null references public.projects (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  is_lead     boolean not null default false,          -- shown as the project lead; gets client alerts first
  added_at    timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile on public.project_members (profile_id);

-- 'admin' | 'team' | 'client' | null — how the person asking relates to a project.
create or replace function public.project_access(p_project bigint)
returns text
language sql stable security definer set search_path = public
as $$
  select case
           when pr.role = 'admin' then 'admin'
           when pm.profile_id is null then null
           when pr.role = 'client' then 'client'
           else 'team'
         end
    from public.profiles pr
    left join public.project_members pm on pm.project_id = p_project and pm.profile_id = pr.id
   where pr.id = auth.uid() and pr.is_active
$$;

create or replace function public.can_see_project(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.project_access(p_project) is not null $$;

-- The people who do the work (and admins). Clients only read.
create or replace function public.can_work_project(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.project_access(p_project) in ('admin', 'team'), false) $$;

create or replace function public.is_project_client(p_project bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.project_access(p_project) = 'client', false) $$;

-- Does the person asking share a project with this profile? (Clients may see their team.)
create or replace function public.shares_project_with(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members a
      join public.project_members b on b.project_id = a.project_id
     where a.profile_id = auth.uid() and b.profile_id = p_profile
  )
$$;

-- The name of whoever is acting, for alerts and the activity feed.
create or replace function public.actor_name()
returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select full_name from public.profiles where id = auth.uid()), 'NUUKE') $$;

-- -----------------------------------------------------------------------------
-- Sprints
-- -----------------------------------------------------------------------------
create table public.sprints (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references public.projects (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  goal          text,
  starts_on     date not null,
  ends_on       date not null,
  status        text not null default 'planned' check (status in ('planned', 'active', 'done')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index sprints_project on public.sprints (project_id, starts_on);
create unique index sprints_one_active on public.sprints (project_id) where status = 'active';

-- -----------------------------------------------------------------------------
-- Tasks — the Kanban board
-- -----------------------------------------------------------------------------
create table public.tasks (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  sprint_id       bigint references public.sprints (id) on delete set null,
  title           text not null check (length(trim(title)) > 0),
  description     text,
  status          text not null default 'todo' check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id     uuid references public.profiles (id) on delete set null,
  due_on          date,
  labels          text[] not null default '{}',
  client_visible  boolean not null default true,
  position        double precision not null default extract(epoch from clock_timestamp()),
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  completed_at    timestamptz,
  reminded_on     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_project on public.tasks (project_id, status, position);
create index tasks_assignee on public.tasks (assignee_id) where status <> 'done';
create index tasks_sprint on public.tasks (sprint_id);

create table public.task_comments (
  id          bigint generated always as identity primary key,
  task_id     bigint not null references public.tasks (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index task_comments_task on public.task_comments (task_id, created_at);

-- -----------------------------------------------------------------------------
-- Files, wireframes, prototypes — and the client's review of them
--   Versions of one deliverable share a group_id (the first version's id).
-- -----------------------------------------------------------------------------
create table public.project_files (
  id                   bigint generated always as identity primary key,
  project_id           bigint not null references public.projects (id) on delete cascade,
  group_id             bigint,
  version              int not null default 1,
  title                text not null check (length(trim(title)) > 0),
  kind                 text not null default 'document'
                         check (kind in ('wireframe', 'design', 'prototype', 'document', 'video', 'other')),
  description          text,
  storage_path         text unique,     -- in the private "project-files" bucket
  external_url         text,            -- or a link: Figma, a prototype, a Google Doc
  mime_type            text,
  size_bytes           bigint,
  client_visible       boolean not null default false,
  from_client          boolean not null default false,
  review_status        text not null default 'none'
                         check (review_status in ('none', 'pending', 'approved', 'changes_requested')),
  review_note          text,
  review_requested_at  timestamptz,
  review_reminded_at   timestamptz,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  uploaded_by          uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index project_files_project on public.project_files (project_id, created_at desc);
create index project_files_group on public.project_files (group_id, version);
create index project_files_pending on public.project_files (project_id) where review_status = 'pending';

create table public.file_comments (
  id           bigint generated always as identity primary key,
  file_id      bigint not null references public.project_files (id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 4000),
  pin_x        real check (pin_x between 0 and 1),    -- where on the image it was dropped, 0–1
  pin_y        real check (pin_y between 0 and 1),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index file_comments_file on public.file_comments (file_id, created_at);

-- -----------------------------------------------------------------------------
-- Calendars: the content calendar, and meetings / milestones / deadlines
-- -----------------------------------------------------------------------------
create table public.content_posts (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  platform        text not null default 'instagram'
                    check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'website', 'email', 'other')),
  scheduled_at    timestamptz,
  status          text not null default 'idea' check (status in ('idea', 'drafting', 'ready', 'scheduled', 'posted')),
  caption         text,
  file_id         bigint references public.project_files (id) on delete set null,
  owner_id        uuid default auth.uid() references public.profiles (id) on delete set null,
  client_visible  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index content_posts_project on public.content_posts (project_id, scheduled_at);

create table public.project_events (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  kind            text not null default 'meeting' check (kind in ('meeting', 'milestone', 'deadline', 'launch', 'other')),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location        text,                -- a room, or the Zoom / Meet link
  notes           text,
  client_visible  boolean not null default true,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index project_events_project on public.project_events (project_id, starts_at);

-- -----------------------------------------------------------------------------
-- Messages between the client and the team, and the activity feed
-- -----------------------------------------------------------------------------
create table public.project_messages (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index project_messages_project on public.project_messages (project_id, created_at desc);

-- When each person last read a project's messages (for unread counts).
create table public.project_reads (
  profile_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id        bigint not null references public.projects (id) on delete cascade,
  messages_seen_at  timestamptz not null default now(),
  primary key (profile_id, project_id)
);

create table public.project_activity (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references public.projects (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete set null,
  kind            text not null,
  summary         text not null,
  link            text,
  client_visible  boolean not null default true,
  created_at      timestamptz not null default now()
);
create index project_activity_project on public.project_activity (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers that write on someone's behalf (not callable from the browser)
-- -----------------------------------------------------------------------------
create or replace function public.log_project(
  p_project bigint, p_kind text, p_summary text, p_link text default null, p_client_visible boolean default true
) returns void
language sql security definer set search_path = public
as $$
  insert into public.project_activity (project_id, actor_id, kind, summary, link, client_visible)
  values (p_project, auth.uid(), p_kind, p_summary, p_link, coalesce(p_client_visible, true))
$$;

-- Alert the people on a project. p_who: 'clients' | 'team' | 'team_admins' (team plus every admin).
create or replace function public.notify_project(
  p_project bigint, p_who text, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_tone text default 'info', p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select id, p_kind, p_title, p_body, p_link, p_tone, coalesce(p_data, '{}'::jsonb)
    from (
      select pr.id
        from public.project_members pm
        join public.profiles pr on pr.id = pm.profile_id
       where pm.project_id = p_project and pr.is_active
         and ((p_who = 'clients' and pr.role = 'client') or (p_who in ('team', 'team_admins') and pr.role <> 'client'))
      union
      select pr.id from public.profiles pr
       where p_who = 'team_admins' and pr.role = 'admin' and pr.is_active
    ) people
   where id is distinct from auth.uid()
$$;

revoke execute on function public.log_project(bigint, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_project(bigint, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rules that keep the data straight
-- -----------------------------------------------------------------------------
create or replace function public.tasks_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.sprint_id is not null and not exists (
    select 1 from public.sprints where id = new.sprint_id and project_id = new.project_id
  ) then
    raise exception 'That sprint belongs to another project' using errcode = '22023';
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.profiles pr
        where pr.id = new.assignee_id and pr.role <> 'client'
          and (pr.role = 'admin' or exists (
                select 1 from public.project_members pm where pm.project_id = new.project_id and pm.profile_id = pr.id))
     ) then
    raise exception 'Only someone on this project''s team can be given a task' using errcode = '22023';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.project_id := old.project_id;   -- tasks never jump between projects
  end if;
  return new;
end
$$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

create or replace function public.files_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_root public.project_files;
begin
  if tg_op = 'INSERT' then
    if new.group_id is null or new.group_id = new.id then
      new.group_id := new.id;
      new.version := 1;
    else
      select * into v_root from public.project_files where id = new.group_id;
      if v_root.id is null or v_root.project_id <> new.project_id then
        raise exception 'That file belongs to another project' using errcode = '22023';
      end if;
      select coalesce(max(version), 0) + 1 into new.version from public.project_files where group_id = new.group_id;
      -- A new version replaces whatever was waiting for review.
      update public.project_files set review_status = 'none'
       where group_id = new.group_id and review_status = 'pending';
    end if;
  else
    new.project_id := old.project_id;
    new.group_id := old.group_id;
    new.version := old.version;
    -- Approving or asking for changes is the client's call (through review_file), or an admin's.
    if new.review_status in ('approved', 'changes_requested')
       and new.review_status is distinct from old.review_status
       and coalesce(current_setting('nuuke.reviewing', true), '') <> '1'
       and auth.uid() is not null and not public.is_admin() then
      raise exception 'Only the client can approve or ask for changes' using errcode = '42501';
    end if;
  end if;
  if new.review_status = 'pending' then
    new.client_visible := true;
    if tg_op = 'INSERT' or old.review_status <> 'pending' then
      new.review_requested_at := now();
      new.review_reminded_at := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
  end if;
  return new;
end
$$;
create trigger files_guard before insert or update on public.project_files
  for each row execute function public.files_guard();

create or replace function public.posts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.project_id := old.project_id;
  return new;
end
$$;
create trigger content_posts_touch before update on public.content_posts
  for each row execute function public.posts_touch();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Alerts and the activity feed
-- -----------------------------------------------------------------------------
create or replace function public.project_name(p_project bigint)
returns text
language sql stable security definer set search_path = public
as $$ select name from public.projects where id = p_project $$;

create or replace function public.on_member_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := public.project_name(new.project_id);
  v_person public.profiles;
begin
  select * into v_person from public.profiles where id = new.profile_id;
  if new.profile_id is distinct from auth.uid() then
    perform public.notify(new.profile_id, 'project_added',
      case when v_person.role = 'client' then 'Your project is ready: ' || v_name else 'You''re on ' || v_name end,
      case when v_person.role = 'client' then 'See the team, the plan and everything being made for you.'
           else 'Added by ' || public.actor_name() || '.' end,
      '/projects/' || new.project_id, 'celebrate');
  end if;
  perform public.log_project(new.project_id, 'member',
    v_person.full_name || case when v_person.role = 'client' then ' joined as the client' else ' joined the team' end,
    null, true);
  return new;
end
$$;
create trigger project_members_added after insert on public.project_members
  for each row execute function public.on_member_added();

create or replace function public.on_task_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link text := '/projects/' || new.project_id || '/board?task=' || new.id;
  v_status text := case new.status
    when 'backlog' then 'Backlog' when 'todo' then 'To do' when 'in_progress' then 'In progress'
    when 'review' then 'In review' else 'Done' end;
begin
  if tg_op = 'INSERT' then
    perform public.log_project(new.project_id, 'task', public.actor_name() || ' added “' || new.title || '”', v_link, new.client_visible);
  elsif new.status is distinct from old.status then
    perform public.log_project(new.project_id, case when new.status = 'done' then 'task_done' else 'task' end,
      public.actor_name() || case when new.status = 'done' then ' finished “' || new.title || '”'
                                  else ' moved “' || new.title || '” to ' || v_status end,
      v_link, new.client_visible);
    if new.status = 'review' and new.created_by is not null and new.created_by is distinct from auth.uid()
       and new.created_by is distinct from new.assignee_id then
      perform public.notify(new.created_by, 'task_review', 'Ready for review: ' || new.title,
        public.actor_name() || ' · ' || public.project_name(new.project_id), v_link, 'info');
    end if;
  end if;

  if new.assignee_id is not null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task_assigned', 'New task: ' || new.title,
      public.actor_name() || ' gave you this on ' || public.project_name(new.project_id)
        || coalesce(' · due ' || to_char(new.due_on, 'DD Mon'), ''),
      v_link, case when new.priority = 'urgent' then 'warning' else 'info' end);
  end if;
  return new;
end
$$;
create trigger tasks_activity after insert or update of status, assignee_id on public.tasks
  for each row execute function public.on_task_change();

create or replace function public.on_task_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_link text;
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
begin
  select * into v_task from public.tasks where id = new.task_id;
  v_link := '/projects/' || v_task.project_id || '/board?task=' || v_task.id;
  if v_client then
    perform public.notify_project(v_task.project_id, 'team', 'client_comment',
      public.actor_name() || ' commented on “' || v_task.title || '”', left(new.body, 160), v_link, 'warning');
  else
    insert into public.notifications (user_id, kind, title, body, link, tone)
    select distinct u, 'task_comment', public.actor_name() || ' on “' || v_task.title || '”', left(new.body, 160), v_link, 'info'
      from unnest(array[v_task.assignee_id, v_task.created_by]) u
     where u is not null and u is distinct from auth.uid();
  end if;
  return new;
end
$$;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.on_task_comment();

create or replace function public.on_file_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link text := '/projects/' || new.project_id || '/files/' || new.id;
  v_label text := new.title || case when new.version > 1 then ' (v' || new.version || ')' else '' end;
begin
  if tg_op = 'INSERT' then
    if new.from_client then
      perform public.log_project(new.project_id, 'file', public.actor_name() || ' sent “' || v_label || '”', v_link, true);
      perform public.notify_project(new.project_id, 'team', 'client_file', public.actor_name() || ' sent a file',
        v_label || ' · ' || public.project_name(new.project_id), v_link, 'info');
    else
      perform public.log_project(new.project_id, 'file',
        public.actor_name() || case when new.version > 1 then ' uploaded a new version of “' else ' uploaded “' end || v_label || '”',
        v_link, new.client_visible);
    end if;
  end if;

  if new.review_status = 'pending' and (tg_op = 'INSERT' or old.review_status is distinct from 'pending') then
    if tg_op = 'UPDATE' then
      perform public.log_project(new.project_id, 'review_requested',
        public.actor_name() || ' asked for a review of “' || v_label || '”', v_link, true);
    end if;
    perform public.notify_project(new.project_id, 'clients', 'review_requested', 'Review now: ' || v_label,
      public.actor_name() || ' shared this for your review on ' || public.project_name(new.project_id) || '.',
      v_link, 'danger', jsonb_build_object('file_id', new.id));
  elsif tg_op = 'UPDATE' and new.client_visible and not old.client_visible and new.review_status = 'none' then
    perform public.log_project(new.project_id, 'file', public.actor_name() || ' shared “' || v_label || '”', v_link, true);
  end if;
  return new;
end
$$;
create trigger project_files_activity after insert or update of review_status, client_visible on public.project_files
  for each row execute function public.on_file_change();

create or replace function public.on_file_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_file public.project_files;
  v_link text;
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
begin
  select * into v_file from public.project_files where id = new.file_id;
  v_link := '/projects/' || v_file.project_id || '/files/' || v_file.id;
  if v_client then
    perform public.notify_project(v_file.project_id, 'team', 'client_comment',
      public.actor_name() || ' commented on “' || v_file.title || '”', left(new.body, 160), v_link, 'warning');
    perform public.log_project(v_file.project_id, 'comment',
      public.actor_name() || ' commented on “' || v_file.title || '”', v_link, true);
  elsif v_file.client_visible then
    perform public.notify_project(v_file.project_id, 'clients', 'team_comment',
      public.actor_name() || ' replied on “' || v_file.title || '”', left(new.body, 160), v_link, 'info');
  end if;
  return new;
end
$$;
create trigger file_comments_notify after insert on public.file_comments
  for each row execute function public.on_file_comment();

create or replace function public.on_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_client boolean := (select role = 'client' from public.profiles where id = new.author_id);
  v_link text := '/projects/' || new.project_id || '/messages';
begin
  if v_client then
    perform public.notify_project(new.project_id, 'team_admins', 'client_message',
      public.actor_name() || ' · ' || public.project_name(new.project_id), left(new.body, 160), v_link, 'warning');
  else
    perform public.notify_project(new.project_id, 'clients', 'team_message',
      public.actor_name() || ' from NUUKE', left(new.body, 160), v_link, 'info');
  end if;
  -- Sending a message means you have read the thread.
  insert into public.project_reads (profile_id, project_id, messages_seen_at)
  values (new.author_id, new.project_id, new.created_at)
  on conflict (profile_id, project_id) do update set messages_seen_at = excluded.messages_seen_at;
  return new;
end
$$;
create trigger project_messages_notify after insert on public.project_messages
  for each row execute function public.on_message();

create or replace function public.on_post_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_project(new.project_id, 'post', public.actor_name() || ' planned a ' || new.platform || ' post: “' || new.title || '”',
      '/projects/' || new.project_id || '/content', new.client_visible);
  elsif new.status = 'posted' and old.status <> 'posted' then
    perform public.log_project(new.project_id, 'post_live', '“' || new.title || '” went live on ' || new.platform,
      '/projects/' || new.project_id || '/content', new.client_visible);
  end if;
  return new;
end
$$;
create trigger content_posts_activity after insert or update of status on public.content_posts
  for each row execute function public.on_post_change();

create or replace function public.on_event_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.log_project(new.project_id, 'event',
    public.actor_name() || ' added ' || new.kind || ' “' || new.title || '” on ' || to_char(new.starts_at at time zone public.app_tz(), 'DD Mon'),
    '/projects/' || new.project_id || '/calendar', new.client_visible);
  if new.client_visible and new.kind in ('meeting', 'launch', 'milestone') then
    perform public.notify_project(new.project_id, 'clients', 'project_event', 'New on your calendar: ' || new.title,
      to_char(new.starts_at at time zone public.app_tz(), 'Dy DD Mon, HH12:MI AM'), '/projects/' || new.project_id || '/calendar', 'info');
  end if;
  return new;
end
$$;
create trigger project_events_activity after insert on public.project_events
  for each row execute function public.on_event_added();

create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.audit_row();
create trigger project_members_audit after insert or update or delete on public.project_members
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Actions
-- -----------------------------------------------------------------------------

-- The client approves a deliverable or asks for changes.
create or replace function public.review_file(p_file bigint, p_decision text, p_note text default null)
returns public.project_files
language plpgsql security definer set search_path = public
as $$
declare
  v_file public.project_files;
  v_note text := nullif(trim(p_note), '');
  v_link text;
begin
  select * into v_file from public.project_files where id = p_file;
  if v_file.id is null or not public.can_see_project(v_file.project_id) then
    raise exception 'File not found' using errcode = 'P0002';
  end if;
  if not (public.is_project_client(v_file.project_id) or public.is_admin()) then
    raise exception 'Only the client can approve or ask for changes' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Choose approve or ask for changes' using errcode = '22023';
  end if;
  if v_file.review_status <> 'pending' then
    raise exception 'This is not waiting for a review any more' using errcode = '22023';
  end if;
  if p_decision = 'changes_requested' and v_note is null then
    raise exception 'Tell the team what to change' using errcode = '22023';
  end if;

  perform set_config('nuuke.reviewing', '1', true);
  update public.project_files
     set review_status = p_decision, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_file
  returning * into v_file;
  perform set_config('nuuke.reviewing', '', true);

  if v_note is not null then
    insert into public.file_comments (file_id, author_id, body)
    values (p_file, auth.uid(), case when p_decision = 'approved' then 'Approved: ' else 'Changes requested: ' end || v_note);
  end if;

  v_link := '/projects/' || v_file.project_id || '/files/' || v_file.id;
  perform public.log_project(v_file.project_id, 'review',
    public.actor_name() || case when p_decision = 'approved' then ' approved “' else ' asked for changes to “' end || v_file.title || '”',
    v_link, true);
  perform public.notify_project(v_file.project_id, 'team_admins', 'review_done',
    case when p_decision = 'approved' then 'Approved ✓ ' else 'Changes requested: ' end || v_file.title,
    public.actor_name() || coalesce(' — ' || left(v_note, 140), ''), v_link,
    case when p_decision = 'approved' then 'celebrate' else 'warning' end);
  return v_file;
end
$$;

create or replace function public.start_sprint(p_sprint bigint)
returns public.sprints
language plpgsql security definer set search_path = public
as $$
declare
  v public.sprints;
begin
  select * into v from public.sprints where id = p_sprint;
  if v.id is null or not public.can_work_project(v.project_id) then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.sprints where project_id = v.project_id and status = 'active' and id <> p_sprint) then
    raise exception 'Finish the current sprint first' using errcode = '22023';
  end if;
  update public.sprints set status = 'active', completed_at = null where id = p_sprint returning * into v;
  perform public.log_project(v.project_id, 'sprint', public.actor_name() || ' started ' || v.name,
    '/projects/' || v.project_id || '/sprints', true);
  return v;
end
$$;

-- Ends a sprint. Unfinished work moves to the next sprint, or back to the backlog.
create or replace function public.complete_sprint(p_sprint bigint, p_move_to bigint default null)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v public.sprints;
  v_moved int;
begin
  select * into v from public.sprints where id = p_sprint;
  if v.id is null or not public.can_work_project(v.project_id) then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if p_move_to is not null and not exists (
    select 1 from public.sprints where id = p_move_to and project_id = v.project_id and status <> 'done'
  ) then
    raise exception 'Pick a sprint in this project that is not finished' using errcode = '22023';
  end if;
  update public.tasks set sprint_id = p_move_to where sprint_id = p_sprint and status <> 'done';
  get diagnostics v_moved = row_count;
  update public.sprints set status = 'done', completed_at = now() where id = p_sprint;
  perform public.log_project(v.project_id, 'sprint_done',
    public.actor_name() || ' wrapped up ' || v.name
      || (select ' — ' || count(*) filter (where status = 'done') || ' tasks done'
            from public.tasks where sprint_id = p_sprint),
    '/projects/' || v.project_id || '/sprints', true);
  return v_moved;
end
$$;

create or replace function public.mark_project_read(p_project bigint)
returns void
language sql security definer set search_path = public
as $$
  insert into public.project_reads (profile_id, project_id, messages_seen_at)
  select auth.uid(), p_project, now() where public.can_see_project(p_project)
  on conflict (profile_id, project_id) do update set messages_seen_at = now()
$$;

-- Unread messages per project, for the person asking.
create or replace function public.project_unread()
returns table (project_id bigint, unread bigint, last_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.project_id,
         count(*) filter (where m.author_id <> auth.uid() and m.created_at > coalesce(r.messages_seen_at, '-infinity')),
         max(m.created_at)
    from public.project_messages m
    left join public.project_reads r on r.project_id = m.project_id and r.profile_id = auth.uid()
   where public.can_see_project(m.project_id)
   group by m.project_id
$$;

-- -----------------------------------------------------------------------------
-- Reminders, run every five minutes with the other sweeps
-- -----------------------------------------------------------------------------
create or replace function public.project_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := public.local_today();
begin
  -- Tasks due today, and the first day they are overdue.
  with due as (
    update public.tasks t set reminded_on = v_today
      from public.projects p
     where p.id = t.project_id and p.archived_at is null
       and t.status <> 'done' and t.assignee_id is not null and t.due_on is not null
       and ((t.due_on = v_today and t.reminded_on is distinct from v_today)
            or (t.due_on < v_today and (t.reminded_on is null or t.reminded_on <= t.due_on)))
    returning t.*, p.name as project
  )
  insert into public.notifications (user_id, kind, title, body, link, tone)
  select assignee_id, 'task_due',
         case when due_on < v_today then 'Overdue: ' else 'Due today: ' end || title,
         project, '/projects/' || project_id || '/board?task=' || id,
         case when due_on < v_today then 'danger' else 'warning' end
    from due;

  -- Reviews the client has not got to after two days.
  with waiting as (
    update public.project_files f set review_reminded_at = now()
      from public.projects p
     where p.id = f.project_id and p.archived_at is null
       and f.review_status = 'pending' and f.review_requested_at < now() - interval '48 hours'
       and (f.review_reminded_at is null or f.review_reminded_at < now() - interval '48 hours')
    returning f.*, p.name as project
  )
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select pm.profile_id, 'review_reminder', 'Still waiting on your review: ' || w.title,
         'The team on ' || w.project || ' needs your go-ahead to keep moving.',
         '/projects/' || w.project_id || '/files/' || w.id, 'danger', jsonb_build_object('file_id', w.id)
    from waiting w
    join public.project_members pm on pm.project_id = w.project_id
    join public.profiles pr on pr.id = pm.profile_id and pr.role = 'client' and pr.is_active;
end
$$;
revoke execute on function public.project_sweep() from public, anon, authenticated;

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
  perform public.project_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.sprints          enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_comments    enable row level security;
alter table public.project_files    enable row level security;
alter table public.file_comments    enable row level security;
alter table public.content_posts    enable row level security;
alter table public.project_events   enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_reads    enable row level security;
alter table public.project_activity enable row level security;

-- Projects and members: everyone on a project can see it; only an admin sets it up.
create policy projects_read on public.projects for select to authenticated using (public.can_see_project(id));
create policy projects_admin on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy project_members_read on public.project_members for select to authenticated
  using (public.can_see_project(project_id));
create policy project_members_admin on public.project_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Clients can now see the people on their projects, and the admins they talk to.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid() or role = 'admin' or public.shares_project_with(id));

-- Sprints: the whole project sees them; the team plans them.
create policy sprints_read on public.sprints for select to authenticated using (public.can_see_project(project_id));
create policy sprints_write on public.sprints for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

-- Tasks: the team sees all of them; the client sees the ones marked visible.
create policy tasks_read on public.tasks for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy tasks_write on public.tasks for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy task_comments_read on public.task_comments for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));   -- tasks' own policy decides
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Files: the team sees everything; the client sees what was shared with them (and what they sent).
create policy project_files_read on public.project_files for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy project_files_team on public.project_files for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));
create policy project_files_client_send on public.project_files for insert to authenticated
  with check (public.is_project_client(project_id) and from_client and client_visible
              and review_status = 'none' and uploaded_by = auth.uid());

create policy file_comments_read on public.file_comments for select to authenticated
  using (exists (select 1 from public.project_files f where f.id = file_id));
create policy file_comments_insert on public.file_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.project_files f where f.id = file_id));
create policy file_comments_update on public.file_comments for update to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.project_files f where f.id = file_id and public.can_work_project(f.project_id)));
create policy file_comments_delete on public.file_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy content_posts_read on public.content_posts for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy content_posts_write on public.content_posts for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy project_events_read on public.project_events for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));
create policy project_events_write on public.project_events for all to authenticated
  using (public.can_work_project(project_id)) with check (public.can_work_project(project_id));

create policy project_messages_read on public.project_messages for select to authenticated
  using (public.can_see_project(project_id));
create policy project_messages_insert on public.project_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_project(project_id));
create policy project_messages_delete on public.project_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy project_reads_own on public.project_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.can_see_project(project_id));

create policy project_activity_read on public.project_activity for select to authenticated
  using (public.can_work_project(project_id) or (client_visible and public.is_project_client(project_id)));

-- -----------------------------------------------------------------------------
-- File storage: a private bucket, one folder per project ("<project id>/<file>")
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.storage_project(p_name text)
returns bigint
language sql immutable
as $$ select case when split_part(p_name, '/', 1) ~ '^\d{1,18}$' then split_part(p_name, '/', 1)::bigint end $$;

create or replace function public.can_read_project_object(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_work_project(public.storage_project(p_name))
      or exists (select 1 from public.project_files f
                  where f.storage_path = p_name and f.client_visible and public.is_project_client(f.project_id))
$$;

drop policy if exists project_files_object_read on storage.objects;
drop policy if exists project_files_object_upload on storage.objects;
drop policy if exists project_files_object_delete on storage.objects;
create policy project_files_object_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_read_project_object(name));
create policy project_files_object_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_see_project(public.storage_project(name)));
create policy project_files_object_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.can_work_project(public.storage_project(name)));

-- Live messages in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.project_messages;
  end if;
exception when duplicate_object then
  null;
end
$$;
