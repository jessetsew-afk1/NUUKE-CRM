-- =============================================================================
-- NUUKE CRM — project plans on the calendar
--
-- A project's plan (for example a 90-day marketing plan) lives as ordinary tasks,
-- so every dated item is on the calendar and on the board at the same time:
--   * each task says who does it (our team, the client, or both), the owner as
--     the plan words it, and the deliverable that marks it done;
--   * a plan's phases are the project's sprints, with their goals and dates;
--     the phase whose dates have come starts by itself, and an ended phase hands
--     its unfinished tasks to the next one;
--   * alerts: the person on a task (or the project lead when nobody is) hears the
--     day before, on the day, and the first day it's late. The client hears about
--     their own tasks the same way, and can mark them started or done;
--   * Import a plan adds a whole plan in one go (one alert, not one per task);
--     Move dates shifts everything from a day onward when the start moves.
-- =============================================================================

alter table public.tasks
  add column side        text not null default 'team' check (side in ('team', 'client', 'both')),
  add column owner_label text check (owner_label is null or length(owner_label) <= 80),
  add column deliverable text check (deliverable is null or length(deliverable) <= 300);
comment on column public.tasks.side is 'Who does it: team (us), client, or both.';
create index tasks_due_open on public.tasks (due_on) where status <> 'done' and due_on is not null;

alter table public.project_events add column all_day boolean not null default false;
comment on column public.project_events.all_day is 'A day (or days) with no time, stored at 12:00 UTC so it lands on the same date everywhere.';

-- -----------------------------------------------------------------------------
-- New tasks: the person on it hears about it; with nobody on it, the project lead
-- does. A plan import is announced once instead of once per task.
-- -----------------------------------------------------------------------------
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
  if coalesce(current_setting('nuuke.bulk', true), '') = 'on' then
    return new;
  end if;

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
  elsif tg_op = 'INSERT' and new.assignee_id is null and new.due_on is not null then
    -- On the calendar with nobody on it yet: the project lead hears about it.
    insert into public.notifications (user_id, kind, title, body, link, tone)
    select pm.profile_id, 'task_assigned', 'On the calendar: ' || new.title,
           public.project_name(new.project_id) || ' · due ' || to_char(new.due_on, 'Dy DD Mon') || ' · nobody on it yet',
           v_link, 'info'
      from public.project_members pm
      join public.profiles pr on pr.id = pm.profile_id and pr.is_active and pr.role <> 'client'
     where pm.project_id = new.project_id and pm.is_lead and pm.profile_id is distinct from auth.uid();
  end if;
  return new;
end
$$;

create or replace function public.on_event_added()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(current_setting('nuuke.bulk', true), '') = 'on' then
    return new;
  end if;
  perform public.log_project(new.project_id, 'event',
    public.actor_name() || ' added ' || new.kind || ' “' || new.title || '” on ' || to_char(new.starts_at at time zone public.app_tz(), 'DD Mon'),
    '/projects/' || new.project_id || '/calendar', new.client_visible);
  if new.client_visible and new.kind in ('meeting', 'launch', 'milestone') then
    perform public.notify_project(new.project_id, 'clients', 'project_event', 'New on your calendar: ' || new.title,
      case when new.all_day then to_char(new.starts_at at time zone 'UTC', 'Dy DD Mon')
           else to_char(new.starts_at at time zone public.app_tz(), 'Dy DD Mon, HH12:MI AM') end,
      '/projects/' || new.project_id || '/calendar', 'info');
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Every five minutes: phases move on, and reminders go out
-- -----------------------------------------------------------------------------
create or replace function public.project_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := public.local_today();
  r record;
  a record;
begin
  -- A phase (sprint) whose dates have come starts by itself. The one before it, if
  -- its dates are over, finishes and hands its unfinished tasks on.
  for r in
    select s.* from public.sprints s join public.projects p on p.id = s.project_id
     where p.archived_at is null and s.status = 'planned' and s.starts_on <= v_today and s.ends_on >= v_today
     order by s.project_id, s.starts_on
  loop
    if exists (select 1 from public.sprints x where x.project_id = r.project_id and x.status = 'active' and x.ends_on >= v_today) then
      continue;
    end if;
    for a in select * from public.sprints where project_id = r.project_id and status = 'active' loop
      update public.tasks set sprint_id = r.id where sprint_id = a.id and status <> 'done';
      update public.sprints set status = 'done', completed_at = now() where id = a.id;
      perform public.log_project(a.project_id, 'sprint_done', a.name || ' ended', '/projects/' || a.project_id || '/sprints', true);
    end loop;
    update public.sprints set status = 'active', completed_at = null where id = r.id;
    perform public.log_project(r.project_id, 'sprint', r.name || ' started', '/projects/' || r.project_id || '/calendar', true);
    perform public.notify_project(r.project_id, 'team_admins', 'project_phase', 'Now: ' || r.name,
      coalesce(r.goal, public.project_name(r.project_id)), '/projects/' || r.project_id || '/calendar', 'info');
    perform public.notify_project(r.project_id, 'clients', 'project_phase', 'Now: ' || r.name,
      coalesce(r.goal, public.project_name(r.project_id)), '/projects/' || r.project_id || '/calendar', 'info');
  end loop;

  -- Reminders: the day before, on the day, and the first day late. To the person on
  -- the task, or the project lead when nobody is; and to the client for their tasks.
  with due as (
    update public.tasks t set reminded_on = v_today
      from public.projects p
     where p.id = t.project_id and p.archived_at is null
       and t.status <> 'done' and t.due_on is not null
       and (t.reminded_on is null or t.reminded_on < v_today)
       and (t.due_on = v_today + 1 or t.due_on = v_today
            or (t.due_on < v_today and (t.reminded_on is null or t.reminded_on <= t.due_on)))
    returning t.id, t.project_id, t.title, t.due_on, t.assignee_id, t.side, t.client_visible, t.owner_label, p.name as project
  ), who as (
    select d.*, d.assignee_id as user_id, false as for_client from due d where d.assignee_id is not null
    union
    select d.*, pm.profile_id, false from due d
      join public.project_members pm on pm.project_id = d.project_id and pm.is_lead
      join public.profiles pr on pr.id = pm.profile_id and pr.is_active and pr.role <> 'client'
     where d.assignee_id is null
    union
    select d.*, pm.profile_id, true from due d
      join public.project_members pm on pm.project_id = d.project_id
      join public.profiles pr on pr.id = pm.profile_id and pr.is_active and pr.role = 'client'
     where d.side in ('client', 'both') and d.client_visible
  )
  insert into public.notifications (user_id, kind, title, body, link, tone, data)
  select user_id, 'task_due',
         case when due_on < v_today then 'Overdue: ' when due_on = v_today then 'Due today: ' else 'Tomorrow: ' end || title,
         project || coalesce(' · ' || owner_label, '')
           || case when for_client and side = 'client' then ' · this one is yours'
                   when for_client then ' · yours and ours' else '' end,
         '/projects/' || project_id || '/calendar?task=' || id,
         case when due_on < v_today then 'danger' when due_on = v_today then 'warning' else 'info' end,
         jsonb_build_object('task_id', id)
    from who;

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

-- -----------------------------------------------------------------------------
-- The client marks their own tasks started or done
-- -----------------------------------------------------------------------------
create or replace function public.client_task_status(p_task bigint, p_status text)
returns public.tasks
language plpgsql security definer set search_path = public
as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not public.is_project_client(t.project_id) or not t.client_visible or t.side = 'team' then
    raise exception 'You can only update the tasks that are yours' using errcode = '42501';
  end if;
  if p_status not in ('todo', 'in_progress', 'done') then
    raise exception 'Pick to do, started or done' using errcode = '22023';
  end if;
  update public.tasks set status = p_status where id = p_task returning * into t;
  perform public.notify_project(t.project_id, 'team', 'client_task',
    public.actor_name() || case p_status when 'done' then ' finished: ' when 'in_progress' then ' started: ' else ' reopened: ' end || t.title,
    public.project_name(t.project_id), '/projects/' || t.project_id || '/calendar?task=' || t.id,
    case when p_status = 'done' then 'success' else 'info' end);
  return t;
end
$$;

-- -----------------------------------------------------------------------------
-- Move dates: when the start (or launch) moves, everything from that day moves with it
-- -----------------------------------------------------------------------------
create or replace function public.shift_project_plan(p_project bigint, p_from date, p_days int)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tasks int;
  v_events int;
  v_phases int;
begin
  if not public.can_work_project(p_project) then
    raise exception 'Only the project team can move the plan' using errcode = '42501';
  end if;
  if p_from is null or coalesce(p_days, 0) = 0 or abs(p_days) > 365 then
    raise exception 'Pick a day and how many days to move it by' using errcode = '22023';
  end if;

  update public.tasks set due_on = due_on + p_days, reminded_on = null
   where project_id = p_project and status <> 'done' and due_on >= p_from;
  get diagnostics v_tasks = row_count;

  update public.project_events
     set starts_at = starts_at + make_interval(days => p_days),
         ends_at = ends_at + make_interval(days => p_days)
   where project_id = p_project
     and (case when all_day then (starts_at at time zone 'UTC')::date else (starts_at at time zone public.app_tz())::date end) >= p_from;
  get diagnostics v_events = row_count;

  update public.sprints
     set starts_on = case when starts_on >= p_from then starts_on + p_days else starts_on end,
         ends_on = greatest(case when ends_on >= p_from then ends_on + p_days else ends_on end,
                            case when starts_on >= p_from then starts_on + p_days else starts_on end)
   where project_id = p_project and ends_on >= p_from;
  get diagnostics v_phases = row_count;

  update public.projects
     set starts_on = case when starts_on >= p_from then starts_on + p_days else starts_on end,
         due_on = case when due_on >= p_from then due_on + p_days else due_on end
   where id = p_project;

  perform public.log_project(p_project, 'plan_moved',
    public.actor_name() || ' moved the plan ' || abs(p_days) || case when abs(p_days) = 1 then ' day ' else ' days ' end
      || case when p_days > 0 then 'later' else 'earlier' end || ' from ' || to_char(p_from, 'DD Mon'),
    '/projects/' || p_project || '/calendar', true);
  perform public.notify_project(p_project, 'team', 'plan_moved',
    'The plan moved ' || abs(p_days) || case when abs(p_days) = 1 then ' day ' else ' days ' end || case when p_days > 0 then 'later' else 'earlier' end,
    public.project_name(p_project) || ' · everything from ' || to_char(p_from, 'Dy DD Mon'), '/projects/' || p_project || '/calendar', 'warning');
  perform public.notify_project(p_project, 'clients', 'plan_moved',
    'Your plan moved ' || abs(p_days) || case when abs(p_days) = 1 then ' day ' else ' days ' end || case when p_days > 0 then 'later' else 'earlier' end,
    'Everything from ' || to_char(p_from, 'Dy DD Mon') || ' is on its new date.', '/projects/' || p_project || '/calendar', 'info');

  return jsonb_build_object('tasks', v_tasks, 'events', v_events, 'phases', v_phases);
end
$$;

-- -----------------------------------------------------------------------------
-- Import a plan: phases, tasks and calendar days in one go
-- p_plan = {
--   start: date, end: date, rhythm: text,
--   phases: [{name, goal, starts_on, ends_on}],
--   tasks:  [{title, description, deliverable, owner_label, side, due_on, phase, priority, status, labels, client_visible}],
--   events: [{title, kind, starts_on, ends_on, notes, client_visible}]
-- }
-- Anything already there (same phase name; same task title on the same day; same
-- event title on the same day) is skipped, so importing twice adds nothing.
-- -----------------------------------------------------------------------------
create or replace function public.import_project_plan(p_project bigint, p_plan jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_project public.projects;
  v_phases int := 0;
  v_tasks int := 0;
  v_events int := 0;
  v_skipped int := 0;
  v_total int := jsonb_array_length(coalesce(p_plan -> 'tasks', '[]'::jsonb));
  v_today date := public.local_today();
  v_rhythm text := nullif(btrim(p_plan ->> 'rhythm'), '');
begin
  select * into v_project from public.projects where id = p_project;
  if not found then
    raise exception 'That project no longer exists';
  end if;
  -- The project team, an admin, or the SQL editor (no signed-in user).
  if auth.uid() is not null and not public.can_work_project(p_project) then
    raise exception 'Only the project team can import a plan' using errcode = '42501';
  end if;
  perform set_config('nuuke.bulk', 'on', true);

  insert into public.sprints (project_id, name, goal, starts_on, ends_on, status)
  select p_project, btrim(x.name), nullif(btrim(x.goal), ''), x.starts_on, greatest(x.ends_on, x.starts_on), 'planned'
    from jsonb_to_recordset(coalesce(p_plan -> 'phases', '[]'::jsonb)) as x (name text, goal text, starts_on date, ends_on date)
   where coalesce(btrim(x.name), '') <> '' and x.starts_on is not null
     and not exists (select 1 from public.sprints s where s.project_id = p_project and lower(s.name) = lower(btrim(x.name)));
  get diagnostics v_phases = row_count;

  insert into public.tasks (project_id, sprint_id, title, description, deliverable, owner_label, side, due_on,
                            priority, status, labels, client_visible, position)
  select p_project,
         (select s.id from public.sprints s where s.project_id = p_project and lower(s.name) = lower(btrim(x.phase)) limit 1),
         left(btrim(x.title), 200), nullif(btrim(x.description), ''), left(nullif(btrim(x.deliverable), ''), 300),
         left(nullif(btrim(x.owner_label), ''), 80),
         case when x.side in ('team', 'client', 'both') then x.side else 'team' end,
         x.due_on,
         case when x.priority in ('low', 'medium', 'high', 'urgent') then x.priority else 'medium' end,
         case when x.status in ('backlog', 'todo', 'in_progress', 'review', 'done') then x.status else 'todo' end,
         coalesce(x.labels, '{}'), coalesce(x.client_visible, true),
         coalesce(extract(epoch from x.due_on::timestamp), extract(epoch from now())) + x.n
    from (select y.*, row_number() over () as n
            from jsonb_to_recordset(coalesce(p_plan -> 'tasks', '[]'::jsonb)) as y (
              title text, description text, deliverable text, owner_label text, side text, due_on date,
              phase text, priority text, status text, labels text[], client_visible boolean)) x
   where coalesce(btrim(x.title), '') <> ''
     and not exists (select 1 from public.tasks t
                      where t.project_id = p_project and lower(t.title) = lower(left(btrim(x.title), 200))
                        and t.due_on is not distinct from x.due_on);
  get diagnostics v_tasks = row_count;
  v_skipped := v_total - v_tasks;

  insert into public.project_events (project_id, title, kind, starts_at, ends_at, all_day, notes, client_visible)
  select p_project, btrim(x.title),
         case when x.kind in ('meeting', 'milestone', 'deadline', 'launch', 'other') then x.kind else 'other' end,
         (x.starts_on::timestamp + interval '12 hours') at time zone 'UTC',
         case when x.ends_on > x.starts_on then (x.ends_on::timestamp + interval '12 hours') at time zone 'UTC' end,
         true, nullif(btrim(x.notes), ''), coalesce(x.client_visible, true)
    from jsonb_to_recordset(coalesce(p_plan -> 'events', '[]'::jsonb)) as x (title text, kind text, starts_on date, ends_on date, notes text, client_visible boolean)
   where coalesce(btrim(x.title), '') <> '' and x.starts_on is not null
     and not exists (select 1 from public.project_events e
                      where e.project_id = p_project and lower(e.title) = lower(btrim(x.title))
                        and (e.starts_at at time zone 'UTC')::date = x.starts_on);
  get diagnostics v_events = row_count;

  update public.projects
     set starts_on = coalesce(starts_on, (p_plan ->> 'start')::date),
         due_on = coalesce(due_on, (p_plan ->> 'end')::date),
         description = case when v_rhythm is null or coalesce(description, '') ilike '%' || left(v_rhythm, 40) || '%' then description
                            else concat_ws(E'\n\n', nullif(description, ''), v_rhythm) end
   where id = p_project;

  -- The phase that covers today starts now.
  if not exists (select 1 from public.sprints where project_id = p_project and status = 'active') then
    update public.sprints set status = 'active'
     where id = (select id from public.sprints where project_id = p_project and status = 'planned'
                    and starts_on <= v_today and ends_on >= v_today order by starts_on limit 1);
  end if;

  perform set_config('nuuke.bulk', 'off', true);
  if v_tasks + v_events + v_phases > 0 then
    perform public.log_project(p_project, 'plan',
      public.actor_name() || ' added the plan: ' || v_tasks || ' tasks' || case when v_phases > 0 then ' in ' || v_phases || ' phases' else '' end,
      '/projects/' || p_project || '/calendar', true);
    perform public.notify_project(p_project, 'team_admins', 'project_plan', 'The plan is on the calendar: ' || v_project.name,
      v_tasks || ' tasks are on the board and the calendar. You''ll be reminded the day before each one is due.',
      '/projects/' || p_project || '/calendar', 'info');
    perform public.notify_project(p_project, 'clients', 'project_plan', 'Your plan is on the calendar',
      'Every step, who does it and what it delivers. You''ll get a reminder before each of yours.',
      '/projects/' || p_project || '/calendar', 'celebrate');
  end if;

  return jsonb_build_object('phases', v_phases, 'tasks', v_tasks, 'skipped', v_skipped, 'events', v_events);
end
$$;
