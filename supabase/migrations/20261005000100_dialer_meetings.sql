-- =============================================================================
-- NUUKE CRM — dialer and meeting upgrades
--
--   * Reps can edit the details of their own leads (every change is logged).
--   * Meetings carry the client's time zone, a technical manager, the call
--     transcript, the client's website / socials and prep notes.
--   * The admin marks who the technical managers are; they see the meetings they
--     are given, with the lead's details, and are told when one is booked, moved or
--     cancelled, and shortly before it starts.
--   * Closed leads come back to the same rep after a few days (2 by default) for a
--     fresh round, except Do not call (never) and Won (they are clients). The card
--     remembers how the last round ended.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
alter table public.settings
  add column if not exists recycle_after_days int not null default 2 check (recycle_after_days between 0 and 365),
  add column if not exists company_website   text,
  add column if not exists booking_link      text,
  add column if not exists company_pitch     text not null default 'a design and development studio';

comment on column public.settings.recycle_after_days is
  'Days after a lead closes before it returns to the same rep. 0 switches automatic recycling off.';

-- -----------------------------------------------------------------------------
-- Technical managers
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists is_technical_manager boolean not null default false;

-- Only an admin decides who is a technical manager.
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
       or new.is_technical_manager is distinct from old.is_technical_manager then
      raise exception 'Only an admin can change that' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Meetings: time zone, technical manager, prep
-- -----------------------------------------------------------------------------
alter table public.meetings
  add column if not exists timezone             text,
  add column if not exists technical_manager_id uuid references public.profiles (id) on delete set null,
  add column if not exists transcript           text,
  add column if not exists client_website       text,
  add column if not exists client_links         text,
  add column if not exists prep_notes           text;

comment on column public.meetings.timezone is 'The client''s time zone (IANA name, e.g. America/Chicago). The time is stored as an instant.';

create index if not exists meetings_tm on public.meetings (technical_manager_id, starts_at) where technical_manager_id is not null;
create index if not exists meetings_lead on public.meetings (lead_id);
create index if not exists meetings_starts on public.meetings (starts_at);

-- "Eastern", "Central", … for alerts.
create or replace function public.tz_label(p_tz text)
returns text
language sql immutable
as $$
  select case p_tz
    when 'America/New_York' then 'Eastern' when 'America/Chicago' then 'Central'
    when 'America/Denver' then 'Mountain' when 'America/Phoenix' then 'Arizona'
    when 'America/Los_Angeles' then 'Pacific' when 'America/Anchorage' then 'Alaska'
    when 'Pacific/Honolulu' then 'Hawaii' when 'America/Halifax' then 'Atlantic'
    when 'America/St_Johns' then 'Newfoundland' when 'Europe/London' then 'UK'
    when 'Europe/Berlin' then 'Central Europe' when 'Asia/Dubai' then 'Gulf'
    when 'Asia/Karachi' then 'Pakistan' when 'Australia/Sydney' then 'Sydney'
    when 'Australia/Perth' then 'Perth' when 'Pacific/Auckland' then 'New Zealand'
    else replace(coalesce(split_part(p_tz, '/', 2), p_tz), '_', ' ')
  end
$$;

-- "Tue 06 Oct, 08:00 PM PKT · 11:00 AM Eastern"
create or replace function public.meeting_when(p_at timestamptz, p_tz text)
returns text
language sql stable
as $$
  select to_char(p_at at time zone public.app_tz(), 'Dy DD Mon, HH12:MI AM') || ' PKT'
      || case when p_tz is not null and p_tz <> public.app_tz()
              then ' · ' || to_char(p_at at time zone p_tz, 'HH12:MI AM') || ' ' || public.tz_label(p_tz)
              else '' end
$$;

create or replace function public.meetings_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.timezone := nullif(btrim(coalesce(new.timezone, '')), '');
  if new.timezone is not null then
    begin
      perform now() at time zone new.timezone;
    exception when others then
      raise exception 'Unknown time zone %', new.timezone using errcode = '22023';
    end;
  end if;
  if new.technical_manager_id is not null
     and (tg_op = 'INSERT' or new.technical_manager_id is distinct from old.technical_manager_id)
     and not exists (select 1 from public.profiles
                      where id = new.technical_manager_id and is_technical_manager and is_active) then
    raise exception 'Pick someone the admin has made a technical manager' using errcode = '22023';
  end if;
  -- A moved meeting gets its reminder again.
  if tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at then
    new.reminded_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists meetings_guard on public.meetings;
create trigger meetings_guard before insert or update on public.meetings
  for each row execute function public.meetings_guard();

create or replace function public.on_meeting_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rep text := coalesce((select full_name from public.profiles where id = new.owner_id), 'A rep');
  v_when text := public.meeting_when(new.starts_at, new.timezone);
  -- When a login is deleted, its meetings drop it automatically; there is nobody left to tell.
  v_old_tm_exists boolean := tg_op = 'UPDATE' and old.technical_manager_id is not null
                             and exists (select 1 from public.profiles where id = old.technical_manager_id);
begin
  if new.technical_manager_id is null or new.technical_manager_id = auth.uid() then
    -- Someone taken off a meeting is told too.
    if v_old_tm_exists and old.technical_manager_id is distinct from new.technical_manager_id
       and old.technical_manager_id is distinct from auth.uid() then
      perform public.notify(old.technical_manager_id, 'meeting.tm_removed', 'Taken off a meeting: ' || new.title,
        v_when, '/meetings/tech', 'info');
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' or new.technical_manager_id is distinct from old.technical_manager_id then
    perform public.notify(new.technical_manager_id, 'meeting.tm_assigned', 'New client meeting: ' || new.title,
      v_when || ' · booked by ' || v_rep, '/meetings/tech?meeting=' || new.id, 'info');
    if v_old_tm_exists and old.technical_manager_id is distinct from auth.uid() then
      perform public.notify(old.technical_manager_id, 'meeting.tm_removed', 'Taken off a meeting: ' || new.title,
        v_when, '/meetings/tech', 'info');
    end if;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.notify(new.technical_manager_id, 'meeting.cancelled', 'Meeting cancelled: ' || new.title,
      v_when, '/meetings/tech?meeting=' || new.id, 'warning');
  elsif new.starts_at is distinct from old.starts_at then
    perform public.notify(new.technical_manager_id, 'meeting.moved', 'Meeting moved: ' || new.title,
      'Now ' || v_when, '/meetings/tech?meeting=' || new.id, 'warning');
  end if;
  return new;
end
$$;
drop trigger if exists meetings_notify on public.meetings;
create trigger meetings_notify after insert or update of technical_manager_id, starts_at, status on public.meetings
  for each row execute function public.on_meeting_change();

-- Technical managers see the meetings they are on, and those leads' details.
drop policy if exists meetings_tm_read on public.meetings;
create policy meetings_tm_read on public.meetings for select to authenticated
  using (technical_manager_id = auth.uid());

create or replace function public.is_tm_for_lead(p_lead bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.meetings where lead_id = p_lead and technical_manager_id = auth.uid())
$$;

drop policy if exists leads_tm_read on public.leads;
create policy leads_tm_read on public.leads for select to authenticated
  using (public.is_tm_for_lead(id));

-- Reminders 15 minutes before: the rep, and the technical manager.
create or replace function public.sales_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in
    update public.meetings set reminded_at = now()
     where status = 'scheduled' and reminded_at is null
       and starts_at between now() and now() + interval '15 minutes'
    returning id, owner_id, technical_manager_id, title, starts_at, timezone
  loop
    perform public.notify(r.owner_id, 'meeting.soon', 'Meeting starting soon',
      format('%s — %s', r.title, public.meeting_when(r.starts_at, r.timezone)), '/sales/meetings', 'info');
    if r.technical_manager_id is not null then
      perform public.notify(r.technical_manager_id, 'meeting.soon', 'Your client meeting starts soon',
        format('%s — %s', r.title, public.meeting_when(r.starts_at, r.timezone)), '/meetings/tech?meeting=' || r.id, 'warning');
    end if;
  end loop;
end
$$;
revoke execute on function public.sales_sweep() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Logging a call can now book the meeting with everything the rep collected:
-- p_meeting = { timezone, technical_manager_id, location, transcript,
--               client_website, client_links, prep_notes }
-- -----------------------------------------------------------------------------
drop function if exists public.log_lead_action(bigint, text, text, text, timestamptz, timestamptz, int, numeric);

create or replace function public.log_lead_action(
  p_lead_id bigint,
  p_action text,
  p_outcome text default null,
  p_comment text default null,
  p_followup_at timestamptz default null,
  p_meeting_at timestamptz default null,
  p_meeting_minutes int default 30,
  p_deal_amount numeric default null,
  p_meeting jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lead public.leads;
  v_outcome public.lead_outcomes;
  v_settings public.settings;
  v_work_date date;
  v_attempt int;
  v_next timestamptz;
  v_stage text;
  v_closed text;
  v_deal_id bigint;
  v_meeting_id bigint;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  m jsonb := coalesce(p_meeting, '{}'::jsonb);
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists';
  end if;
  if v_lead.assigned_to is distinct from v_uid and not public.is_admin() then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;

  select * into v_settings from public.settings;
  v_work_date := public.resolve_work_date(v_uid, now());

  if p_action = 'skip' then
    update public.leads set skipped_at = now() where id = p_lead_id;
    insert into public.lead_attempts (lead_id, rep_id, action, comment, work_date)
    values (p_lead_id, v_uid, 'skip', v_comment, v_work_date);
    return jsonb_build_object('today', public.my_today());
  end if;

  if p_action = 'note' then
    if v_comment is null then
      raise exception 'Write something first';
    end if;
    update public.leads set last_comment = v_comment where id = p_lead_id;
    insert into public.lead_attempts (lead_id, rep_id, action, comment, work_date)
    values (p_lead_id, v_uid, 'note', v_comment, v_work_date);
    return jsonb_build_object('today', public.my_today());
  end if;

  if p_action <> 'call' then
    raise exception 'Unknown action %', p_action;
  end if;

  select * into v_outcome from public.lead_outcomes where key = p_outcome;
  if not found then
    raise exception 'Choose how the call went';
  end if;
  if v_outcome.effect = 'callback' and p_followup_at is null then
    raise exception 'Pick when to call them back';
  end if;
  if v_outcome.key = 'meeting_booked' and p_meeting_at is null then
    raise exception 'Pick the meeting date and time';
  end if;
  if v_outcome.key = 'won' and coalesce(p_deal_amount, 0) <= 0 then
    raise exception 'Enter the amount you closed';
  end if;

  v_attempt := v_lead.attempts + 1;
  v_stage := 'queue';
  v_closed := null;
  v_next := null;

  case v_outcome.effect
    when 'retry' then
      if p_followup_at is not null then
        v_next := p_followup_at;
      elsif v_attempt >= v_settings.max_attempts then
        v_stage := 'closed';
        v_closed := 'exhausted';
      else
        v_next := public.next_followup_at(v_uid, v_work_date);
      end if;
    when 'callback' then
      v_next := p_followup_at;
    when 'pipeline' then
      v_stage := 'pipeline';
      v_next := p_followup_at;
    when 'closed' then
      v_stage := 'closed';
      v_closed := v_outcome.key;
  end case;

  if v_outcome.pipeline_stage is not null then
    if v_lead.deal_id is null then
      insert into public.deals (owner_id, lead_id, title, contact_name, email, phone, service, amount_usd, stage)
      values (coalesce(v_lead.assigned_to, v_uid), v_lead.id,
              coalesce(nullif(v_lead.name, ''), 'New prospect') || coalesce(' — ' || nullif(v_lead.service, ''), ''),
              nullif(v_lead.name, ''), coalesce(v_lead.personal_email, v_lead.work_email), v_lead.phone,
              v_lead.service, coalesce(p_deal_amount, 0), v_outcome.pipeline_stage)
      returning id into v_deal_id;
    else
      v_deal_id := v_lead.deal_id;
      update public.deals
         set stage = case when public.deal_stage_rank(v_outcome.pipeline_stage) > public.deal_stage_rank(stage)
                          then v_outcome.pipeline_stage else stage end,
             amount_usd = coalesce(p_deal_amount, amount_usd)
       where id = v_deal_id;
    end if;
  end if;

  update public.leads
     set status = v_outcome.key,
         attempts = v_attempt,
         connected = connected or v_outcome.connected,
         stage = v_stage,
         closed_reason = v_closed,
         next_action_at = v_next,
         skipped_at = null,
         last_attempt_at = now(),
         last_comment = coalesce(v_comment, last_comment),
         deal_id = coalesce(v_deal_id, deal_id)
   where id = p_lead_id
  returning * into v_lead;

  insert into public.lead_attempts (lead_id, rep_id, action, outcome, comment, attempt_no, followup_at, work_date)
  values (p_lead_id, v_uid, 'call', v_outcome.key, v_comment, v_attempt, v_next, v_work_date);

  if p_meeting_at is not null then
    insert into public.meetings (owner_id, deal_id, lead_id, title, starts_at, duration_minutes, timezone,
                                 technical_manager_id, location, transcript, client_website, client_links, prep_notes)
    values (coalesce(v_lead.assigned_to, v_uid), v_lead.deal_id, v_lead.id,
            'Meeting with ' || coalesce(nullif(v_lead.name, ''), 'prospect')
              || coalesce(' — ' || nullif(v_lead.service, ''), ''),
            p_meeting_at, coalesce(p_meeting_minutes, 30),
            nullif(m ->> 'timezone', ''), nullif(m ->> 'technical_manager_id', '')::uuid,
            nullif(btrim(m ->> 'location'), ''), nullif(btrim(m ->> 'transcript'), ''),
            nullif(btrim(m ->> 'client_website'), ''), nullif(btrim(m ->> 'client_links'), ''),
            nullif(btrim(m ->> 'prep_notes'), ''))
    returning id into v_meeting_id;
  end if;

  return jsonb_build_object('lead', to_jsonb(v_lead), 'today', public.my_today(), 'meeting_id', v_meeting_id);
end
$$;

-- -----------------------------------------------------------------------------
-- Editing a lead's details (their own leads for reps; any lead for the admin)
-- -----------------------------------------------------------------------------
create or replace function public.update_lead_details(p_lead_id bigint, p_fields jsonb)
returns public.leads
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.leads;
  v_new public.leads;
  v_changed text[] := '{}';
  v_labels jsonb := '{"name":"name","personal_email":"personal email","work_email":"work email","phone":"phone",
                      "country":"country","service":"service","platform":"platform","query":"query",
                      "post_link":"post link","lead_date":"enquiry date"}';
  k text;
  val text;
begin
  select * into v_old from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead no longer exists';
  end if;
  if v_old.assigned_to is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only edit your own leads' using errcode = '42501';
  end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not v_labels ? k then
      raise exception 'That field cannot be edited: %', k using errcode = '22023';
    end if;
  end loop;
  if p_fields ? 'personal_email' and nullif(btrim(p_fields ->> 'personal_email'), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The personal email does not look right' using errcode = '22023';
  end if;
  if p_fields ? 'work_email' and nullif(btrim(p_fields ->> 'work_email'), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The work email does not look right' using errcode = '22023';
  end if;

  update public.leads l set
    name           = case when p_fields ? 'name' then coalesce(btrim(p_fields ->> 'name'), '') else l.name end,
    personal_email = case when p_fields ? 'personal_email' then nullif(btrim(p_fields ->> 'personal_email'), '') else l.personal_email end,
    work_email     = case when p_fields ? 'work_email' then nullif(btrim(p_fields ->> 'work_email'), '') else l.work_email end,
    phone          = case when p_fields ? 'phone' then nullif(btrim(p_fields ->> 'phone'), '') else l.phone end,
    country        = case when p_fields ? 'country' then nullif(btrim(p_fields ->> 'country'), '') else l.country end,
    service        = case when p_fields ? 'service' then nullif(btrim(p_fields ->> 'service'), '') else l.service end,
    platform       = case when p_fields ? 'platform' then nullif(btrim(p_fields ->> 'platform'), '') else l.platform end,
    query          = case when p_fields ? 'query' then nullif(btrim(p_fields ->> 'query'), '') else l.query end,
    post_link      = case when p_fields ? 'post_link' then nullif(btrim(p_fields ->> 'post_link'), '') else l.post_link end,
    lead_date      = case when p_fields ? 'lead_date' then nullif(p_fields ->> 'lead_date', '')::date else l.lead_date end
  where l.id = p_lead_id
  returning * into v_new;

  for k in select jsonb_object_keys(v_labels) loop
    if (to_jsonb(v_old) -> k) is distinct from (to_jsonb(v_new) -> k) then
      v_changed := v_changed || (v_labels ->> k);
    end if;
  end loop;

  if cardinality(v_changed) > 0 then
    insert into public.lead_attempts (lead_id, rep_id, action, comment, work_date)
    values (p_lead_id, auth.uid(), 'note', 'Updated the ' || array_to_string(v_changed, ', '),
            public.resolve_work_date(auth.uid(), now()));
  end if;
  return v_new;
end
$$;

-- -----------------------------------------------------------------------------
-- Recycling: every closed lead except Do not call and Won comes back for a new round
-- -----------------------------------------------------------------------------
alter table public.leads
  add column if not exists closed_at      timestamptz,
  add column if not exists recycle_count  int not null default 0,
  add column if not exists previous_round jsonb;

comment on column public.leads.previous_round is
  'How the last round ended: {round, closed_reason, status, attempts, closed_at, comment, rep_id}.';

update public.leads set closed_at = coalesce(last_attempt_at, updated_at, now())
 where stage = 'closed' and closed_at is null;

create or replace function public.leads_track_close()
returns trigger
language plpgsql
as $$
begin
  if new.stage = 'closed' and old.stage is distinct from 'closed' then
    new.closed_at := now();
  end if;
  return new;
end
$$;
drop trigger if exists leads_track_close on public.leads;
create trigger leads_track_close before update of stage on public.leads
  for each row execute function public.leads_track_close();

create index if not exists leads_recycle on public.leads (closed_at) where stage = 'closed';

-- The one place a lead is put back. Do not call and Won never are.
create or replace function public.recycle_lead_ids(p_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  update public.leads l
     set stage = 'queue', status = 'new', attempts = 0, closed_reason = null,
         next_action_at = null, skipped_at = null,
         recycle_count = l.recycle_count + 1,
         previous_round = jsonb_build_object(
           'round', l.recycle_count + 1,
           'closed_reason', l.closed_reason,
           'status', l.status,
           'attempts', l.attempts,
           'closed_at', l.closed_at,
           'comment', l.last_comment,
           'rep_id', l.assigned_to)
   where l.id = any (p_ids) and l.stage = 'closed'
     and coalesce(l.closed_reason, '') not in ('do_not_call', 'won');
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke execute on function public.recycle_lead_ids(bigint[]) from public, anon, authenticated;

create or replace function public.recycle_leads(p_lead_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can recycle leads' using errcode = '42501';
  end if;
  v_count := public.recycle_lead_ids(p_lead_ids);
  perform public.audit('recycle', 'leads', null, format('Recycled %s leads', v_count));
  return v_count;
end
$$;

create or replace function public.lead_recycle_sweep()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_days int := (select recycle_after_days from public.settings limit 1);
begin
  if coalesce(v_days, 0) <= 0 then
    return 0;
  end if;
  return public.recycle_lead_ids(array(
    select id from public.leads
     where stage = 'closed' and assigned_to is not null
       and coalesce(closed_reason, '') not in ('do_not_call', 'won')
       and closed_at <= now() - make_interval(days => v_days)
     limit 20000));
end
$$;
revoke execute on function public.lead_recycle_sweep() from public, anon, authenticated;

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
  perform public.project_sweep();
  perform public.lead_recycle_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;
