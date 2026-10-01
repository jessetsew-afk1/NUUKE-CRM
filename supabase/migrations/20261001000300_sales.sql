-- =============================================================================
-- Sales: leads, the dialer queue, call outcomes, pipeline, meetings, stats
--
-- A rep only ever sees leads assigned to them, and only their own deals and
-- meetings. The leaderboard is the single place their numbers meet a colleague's,
-- and it carries totals only — never a lead, a phone number or a deal.
-- =============================================================================

-- What a call can end in, and what that does to the lead.
--   retry     try again on the next work day; after max_attempts the lead is exhausted
--   callback  the person asked for a specific time
--   pipeline  a real prospect: create or advance a deal in the rep's pipeline
--   closed    take it out of the queue for good
create table public.lead_outcomes (
  key             text primary key,
  label           text not null,
  short_label     text not null,
  connected       boolean not null,          -- did a human pick up?
  effect          text not null check (effect in ('retry', 'callback', 'pipeline', 'closed')),
  pipeline_stage  text,
  tone            text not null default 'neutral',
  sort            int not null
);

insert into public.lead_outcomes (key, label, short_label, connected, effect, pipeline_stage, tone, sort) values
  ('contact_not_established', 'Contact not established',  'No contact',    false, 'retry',    null,          'neutral', 10),
  ('voicemail',               'Voicemail left',            'Voicemail',     false, 'retry',    null,          'neutral', 20),
  ('busy_callback',           'Busy — call back later',    'Call back',     true,  'callback', null,          'info',    30),
  ('contact_established',     'Contact established',       'Connected',     true,  'retry',    null,          'info',    40),
  ('interested',              'Interested — follow up',    'Interested',    true,  'pipeline', 'prospect',    'good',    50),
  ('meeting_booked',          'Meeting booked',            'Meeting',       true,  'pipeline', 'meeting',     'good',    60),
  ('proposal_presentation',   'Proposal presentation',     'Presentation',  true,  'pipeline', 'proposal',    'good',    70),
  ('proposal_sent',           'Proposal sent',             'Proposal sent', true,  'pipeline', 'proposal',    'good',    80),
  ('negotiation',             'Negotiation',               'Negotiation',   true,  'pipeline', 'negotiation', 'good',    90),
  ('won',                     'Closed — won',              'Won',           true,  'closed',   'won',         'great',  100),
  ('not_interested',          'Not interested',            'Not interested',true,  'closed',   null,          'bad',    110),
  ('wrong_person',            'Wrong person',              'Wrong person',  true,  'closed',   null,          'bad',    120),
  ('invalid_number',          'Number not valid',          'Invalid',       false, 'closed',   null,          'bad',    130),
  ('do_not_call',             'Do not call',               'Do not call',   true,  'closed',   null,          'bad',    140),
  ('duplicate',               'Duplicate lead',            'Duplicate',     false, 'closed',   null,          'bad',    150);

create table public.lead_imports (
  id           bigint generated always as identity primary key,
  file_name    text not null,
  imported_by  uuid references public.profiles (id) on delete set null,
  total_rows   int not null default 0,
  inserted     int not null default 0,
  duplicates   int not null default 0,
  invalid      int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.leads (
  id              bigint generated always as identity primary key,
  lead_date       date,
  platform        text,
  country         text,
  name            text not null default '',
  personal_email  text,
  work_email      text,
  phone           text,
  phone_key       text generated always as (
                    nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')
                  ) stored,
  post_link       text,
  query           text,
  service         text,
  status          text not null default 'new',
  stage           text not null default 'queue' check (stage in ('queue', 'pipeline', 'closed')),
  closed_reason   text,
  assigned_to     uuid references public.profiles (id) on delete set null,
  assigned_at     timestamptz,
  attempts        int not null default 0,
  connected       boolean not null default false,
  next_action_at  timestamptz,
  skipped_at      timestamptz,
  last_attempt_at timestamptz,
  last_comment    text,
  deal_id         bigint,
  import_id       bigint references public.lead_imports (id) on delete set null,
  legacy          jsonb,       -- columns carried over from the old sheet: comments, follow-ups, status
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index leads_queue on public.leads (assigned_to, stage, next_action_at);
create index leads_phone on public.leads (phone_key);
create index leads_personal_email on public.leads (lower(personal_email));
create index leads_date on public.leads (lead_date);
create index leads_name_trgm on public.leads using gin (name extensions.gin_trgm_ops);
create index leads_service on public.leads (service);
create index leads_platform on public.leads (platform);

create table public.lead_attempts (
  id           bigint generated always as identity primary key,
  lead_id      bigint not null references public.leads (id) on delete cascade,
  rep_id       uuid references public.profiles (id) on delete set null,
  action       text not null check (action in ('call', 'skip', 'note')),
  outcome      text references public.lead_outcomes (key),
  comment      text,
  attempt_no   int,
  followup_at  timestamptz,
  work_date    date not null,
  created_at   timestamptz not null default now()
);
create index lead_attempts_rep_day on public.lead_attempts (rep_id, work_date);
create index lead_attempts_lead on public.lead_attempts (lead_id, created_at desc);

create table public.deals (
  id              bigint generated always as identity primary key,
  owner_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  lead_id         bigint references public.leads (id) on delete set null,
  title           text not null,
  contact_name    text,
  company         text,
  email           text,
  phone           text,
  service         text,
  amount_usd      numeric(12, 2) not null default 0 check (amount_usd >= 0),
  probability     int not null default 10 check (probability between 0 and 100),
  stage           text not null default 'prospect'
                  check (stage in ('prospect', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  expected_close  date,
  won_on          date,
  lost_reason     text,
  next_step       text,
  next_step_at    timestamptz,
  notes           text,
  position        double precision not null default extract(epoch from now()),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index deals_owner on public.deals (owner_id, stage);
create index deals_won on public.deals (won_on) where stage = 'won';

alter table public.leads add constraint leads_deal_fk
  foreign key (deal_id) references public.deals (id) on delete set null;

create table public.meetings (
  id                bigint generated always as identity primary key,
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  deal_id           bigint references public.deals (id) on delete set null,
  lead_id           bigint references public.leads (id) on delete set null,
  title             text not null,
  starts_at         timestamptz not null,
  duration_minutes  int not null default 30 check (duration_minutes between 5 and 480),
  location          text,
  status            text not null default 'scheduled' check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  notes             text,
  reminded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index meetings_owner on public.meetings (owner_id, starts_at);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create trigger deals_touch_ts before update on public.deals for each row execute function public.touch_updated_at();
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();

-- Lead edits by the admin are audited; the thousands of status changes the dialer
-- makes are already recorded, one row per call, in lead_attempts.
create trigger leads_audit after delete or update of name, phone, personal_email, work_email, service, platform
  on public.leads for each row execute function public.audit_row();
create trigger deals_audit after insert or update or delete on public.deals
  for each row execute function public.audit_row();
create trigger meetings_audit after insert or update or delete on public.meetings
  for each row execute function public.audit_row();

create or replace function public.deal_stage_rank(p_stage text)
returns int language sql immutable as $$
  select case p_stage when 'prospect' then 1 when 'meeting' then 2 when 'proposal' then 3
                      when 'negotiation' then 4 when 'won' then 5 when 'lost' then 5 else 0 end
$$;

create or replace function public.deal_default_probability(p_stage text)
returns int language sql immutable as $$
  select case p_stage when 'prospect' then 10 when 'meeting' then 25 when 'proposal' then 50
                      when 'negotiation' then 75 when 'won' then 100 else 0 end
$$;

-- Keeps probability, won date and the owner honest, and celebrates a win.
create or replace function public.deals_before_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- A rep cannot hand a deal to somebody else.
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.owner_id := auth.uid();
    elsif new.owner_id is distinct from old.owner_id then
      raise exception 'Only an admin can move a deal to another rep' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    if tg_op = 'INSERT' or new.probability is not distinct from old.probability then
      new.probability := public.deal_default_probability(new.stage);
    end if;
    if new.stage = 'won' then
      new.won_on := coalesce(new.won_on, public.local_today());
    else
      new.won_on := null;
    end if;
  end if;
  return new;
end
$$;
create trigger deals_before before insert or update on public.deals
  for each row execute function public.deals_before_write();

create or replace function public.deals_after_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if new.stage = 'won' and (tg_op = 'INSERT' or old.stage is distinct from 'won') then
    select full_name into v_name from public.profiles where id = new.owner_id;
    perform public.notify(new.owner_id, 'deal.won', 'Deal closed!',
      format('%s — $%s. Huge.', new.title, to_char(new.amount_usd, 'FM999,999,990')), '/sales/pipeline', 'celebrate',
      jsonb_build_object('deal_id', new.id, 'amount', new.amount_usd));
    perform public.notify_admins('deal.won', format('%s closed $%s', v_name, to_char(new.amount_usd, 'FM999,999,990')),
      new.title, '/admin/sales', 'celebrate', jsonb_build_object('deal_id', new.id, 'owner_id', new.owner_id));
  end if;
  -- Keep the lead's place in the funnel in step with its deal.
  if new.lead_id is not null and tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    update public.leads
       set stage = case when new.stage in ('won', 'lost') then 'closed' else 'pipeline' end,
           status = case new.stage when 'won' then 'won' when 'lost' then 'not_interested' else status end
     where id = new.lead_id;
  end if;
  return new;
end
$$;
create trigger deals_after after insert or update on public.deals
  for each row execute function public.deals_after_write();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.lead_outcomes enable row level security;
alter table public.lead_imports  enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_attempts enable row level security;
alter table public.deals         enable row level security;
alter table public.meetings      enable row level security;

create policy lead_outcomes_read on public.lead_outcomes for select to authenticated using (true);

create policy lead_imports_admin on public.lead_imports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy leads_read on public.leads for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());
create policy leads_admin on public.leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy lead_attempts_read on public.lead_attempts for select to authenticated
  using (rep_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.leads l where l.id = lead_id and l.assigned_to = auth.uid()));

create policy deals_own on public.deals for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check ((owner_id = auth.uid() and public.my_role() = 'sales') or public.is_admin());

create policy meetings_own on public.meetings for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check ((owner_id = auth.uid() and public.my_role() = 'sales') or public.is_admin());

-- -----------------------------------------------------------------------------
-- Scheduling the next attempt
-- -----------------------------------------------------------------------------

-- The next work day after a gap, opened a few hours before that shift starts so the
-- follow-ups are waiting when the rep signs in.
create or replace function public.next_followup_at(p_profile uuid, p_work_date date)
returns timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gap int := (select followup_gap_days from public.settings);
  v_day date := p_work_date + greatest(v_gap, 1);
  v_start timestamptz;
  i int := 0;
begin
  while i < 10 and not public.is_work_day(p_profile, v_day) loop
    v_day := v_day + 1;
    i := i + 1;
  end loop;
  v_start := public.shift_start_at(p_profile, v_day);
  if v_start is null then
    return (v_day::timestamp at time zone public.app_tz());
  end if;
  return v_start - interval '4 hours';
end
$$;

-- -----------------------------------------------------------------------------
-- The dialer
-- -----------------------------------------------------------------------------

-- Which cards are due for the signed-in rep, in the order they should be dialled:
--   1. follow-ups and call-backs that have come due, oldest first
--   2. fresh leads, newest enquiry first
--   3. anything skipped, in the order it was skipped (the back of the queue)
create or replace function public.next_leads(
  p_services text[] default null,
  p_platforms text[] default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 3
) returns setof public.leads
language sql stable
as $$
  select l.*
    from public.leads l
   where l.assigned_to = auth.uid()
     and (l.stage = 'queue' or (l.stage = 'pipeline' and l.next_action_at is not null))
     and (l.next_action_at is null or l.next_action_at <= now())
     and (p_services is null or cardinality(p_services) = 0 or l.service = any (p_services))
     and (p_platforms is null or cardinality(p_platforms) = 0 or l.platform = any (p_platforms))
     and (p_from is null or l.lead_date >= p_from)
     and (p_to is null or l.lead_date <= p_to)
   order by (l.skipped_at is not null), l.skipped_at,
            (l.next_action_at is null), l.next_action_at,
            l.lead_date desc nulls last, l.id
   limit least(greatest(p_limit, 1), 20)
$$;

create or replace function public.queue_summary(
  p_services text[] default null,
  p_platforms text[] default null,
  p_from date default null,
  p_to date default null
) returns jsonb
language sql stable
as $$
  with mine as (
    select l.*
      from public.leads l
     where l.assigned_to = auth.uid()
       and (p_services is null or cardinality(p_services) = 0 or l.service = any (p_services))
       and (p_platforms is null or cardinality(p_platforms) = 0 or l.platform = any (p_platforms))
       and (p_from is null or l.lead_date >= p_from)
       and (p_to is null or l.lead_date <= p_to)
  )
  select jsonb_build_object(
    'due_followups', count(*) filter (where (stage = 'queue' or stage = 'pipeline') and next_action_at is not null
                                       and next_action_at <= now() and skipped_at is null),
    'fresh', count(*) filter (where stage = 'queue' and next_action_at is null and attempts = 0 and skipped_at is null),
    'skipped', count(*) filter (where (stage = 'queue' or (stage = 'pipeline' and next_action_at is not null))
                                 and skipped_at is not null and (next_action_at is null or next_action_at <= now())),
    'scheduled_later', count(*) filter (where stage in ('queue', 'pipeline') and next_action_at > now()),
    'in_pipeline', count(*) filter (where stage = 'pipeline'),
    'closed', count(*) filter (where stage = 'closed'),
    'total', count(*)
  )
  from mine
$$;

-- Distinct services and platforms in the rep's own leads, for the start-screen filters.
create or replace function public.lead_filter_options()
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(jsonb_build_object('value', service, 'count', n) order by n desc)
                            from (select service, count(*) n from public.leads
                                   where service is not null and service <> ''
                                     and assigned_to = auth.uid()
                                   group by service) s), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('value', platform, 'count', n) order by n desc)
                             from (select platform, count(*) n from public.leads
                                    where platform is not null and platform <> ''
                                      and assigned_to = auth.uid()
                                    group by platform) s), '[]'::jsonb),
    'date_min', (select min(lead_date) from public.leads where assigned_to = auth.uid()),
    'date_max', (select max(lead_date) from public.leads where assigned_to = auth.uid())
  )
$$;

-- Today's numbers for the progress bar.
create or replace function public.my_today()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with d as (select public.resolve_work_date(auth.uid(), now()) as wd)
  select jsonb_build_object(
    'work_date', d.wd,
    'dials', count(a.*) filter (where a.action = 'call'),
    'connected', count(a.*) filter (where a.action = 'call' and o.connected),
    'skips', count(a.*) filter (where a.action = 'skip'),
    'prospects', count(a.*) filter (where a.action = 'call' and o.effect = 'pipeline'),
    'target', coalesce((select daily_dial_target from public.employment where profile_id = auth.uid()),
                       (select default_daily_dials from public.settings))
  )
  from d
  left join public.lead_attempts a on a.rep_id = auth.uid() and a.work_date = d.wd
  left join public.lead_outcomes o on o.key = a.outcome
  group by d.wd
$$;

-- Done / skip / note on a card. One call = one row in lead_attempts, whatever happens.
create or replace function public.log_lead_action(
  p_lead_id bigint,
  p_action text,
  p_outcome text default null,
  p_comment text default null,
  p_followup_at timestamptz default null,
  p_meeting_at timestamptz default null,
  p_meeting_minutes int default 30,
  p_deal_amount numeric default null
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
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
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

  -- Deal first, so the lead row can point at it.
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
    insert into public.meetings (owner_id, deal_id, lead_id, title, starts_at, duration_minutes)
    values (coalesce(v_lead.assigned_to, v_uid), v_lead.deal_id, v_lead.id,
            'Meeting with ' || coalesce(nullif(v_lead.name, ''), 'prospect'),
            p_meeting_at, coalesce(p_meeting_minutes, 30));
  end if;

  return jsonb_build_object('lead', to_jsonb(v_lead), 'today', public.my_today());
end
$$;

-- Fix a typo on a lead you own (name, email, phone) without touching its history.
create or replace function public.update_lead_contact(
  p_lead_id bigint, p_name text, p_personal_email text, p_work_email text, p_phone text
) returns public.leads
language plpgsql security definer set search_path = public
as $$
declare
  v_lead public.leads;
begin
  update public.leads
     set name = coalesce(p_name, name),
         personal_email = p_personal_email,
         work_email = p_work_email,
         phone = p_phone
   where id = p_lead_id and (assigned_to = auth.uid() or public.is_admin())
  returning * into v_lead;
  if not found then
    raise exception 'That lead is not assigned to you' using errcode = '42501';
  end if;
  return v_lead;
end
$$;

-- -----------------------------------------------------------------------------
-- Numbers
-- -----------------------------------------------------------------------------
create or replace function public.sales_stats(p_user uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_result jsonb;
begin
  if v_user <> auth.uid() and not public.is_admin() then
    raise exception 'You can only see your own numbers' using errcode = '42501';
  end if;

  with att as (
    select a.*, o.connected, o.effect
      from public.lead_attempts a
      left join public.lead_outcomes o on o.key = a.outcome
     where a.rep_id = v_user and a.work_date between p_from and p_to
  ),
  days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'dials', (select count(*) from att where action = 'call'),
      'connected', (select count(*) from att where action = 'call' and connected),
      'skips', (select count(*) from att where action = 'skip'),
      'prospects', (select count(*) from public.deals where owner_id = v_user
                      and (created_at at time zone public.app_tz())::date between p_from and p_to),
      'meetings_booked', (select count(*) from public.meetings where owner_id = v_user
                            and (created_at at time zone public.app_tz())::date between p_from and p_to),
      'meetings_held', (select count(*) from public.meetings where owner_id = v_user and status = 'completed'
                          and (starts_at at time zone public.app_tz())::date between p_from and p_to),
      'won_count', (select count(*) from public.deals where owner_id = v_user and stage = 'won'
                      and won_on between p_from and p_to),
      'won_usd', (select coalesce(sum(amount_usd), 0) from public.deals where owner_id = v_user and stage = 'won'
                    and won_on between p_from and p_to),
      'open_pipeline_usd', (select coalesce(sum(amount_usd), 0) from public.deals where owner_id = v_user
                              and stage not in ('won', 'lost')),
      'weighted_pipeline_usd', (select coalesce(sum(amount_usd * probability / 100.0), 0) from public.deals
                                  where owner_id = v_user and stage not in ('won', 'lost')),
      'work_days', (select count(distinct work_date) from att)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
                 'date', days.d,
                 'dials', (select count(*) from att where action = 'call' and work_date = days.d),
                 'connected', (select count(*) from att where action = 'call' and connected and work_date = days.d),
                 'prospects', (select count(*) from att where action = 'call' and effect = 'pipeline' and work_date = days.d)
               ) order by days.d), '[]'::jsonb) from days),
    'outcomes', (select coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', n) order by n desc), '[]'::jsonb)
                   from (select outcome, count(*) n from att where action = 'call' group by outcome) x),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'count', n, 'amount', amt)), '[]'::jsonb)
                 from (select stage, count(*) n, sum(amount_usd) amt from public.deals where owner_id = v_user group by stage) x),
    'forecast', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'amount', amt, 'weighted', w) order by m), '[]'::jsonb)
                   from (select date_trunc('month', expected_close)::date m, sum(amount_usd) amt,
                                sum(amount_usd * probability / 100.0) w
                           from public.deals
                          where owner_id = v_user and stage not in ('won', 'lost') and expected_close is not null
                            and expected_close >= date_trunc('month', public.local_today())
                            and expected_close < date_trunc('month', public.local_today()) + interval '6 months'
                          group by 1) x)
  ) into v_result;

  return v_result;
end
$$;

-- The one place reps' numbers meet. Totals only.
create or replace function public.sales_leaderboard(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb,
  dials bigint, connected bigint, prospects bigint, meetings bigint, won_usd numeric, won_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.avatar,
         (select count(*) from public.lead_attempts a
           where a.rep_id = p.id and a.action = 'call' and a.work_date between p_from and p_to),
         (select count(*) from public.lead_attempts a join public.lead_outcomes o on o.key = a.outcome
           where a.rep_id = p.id and a.action = 'call' and o.connected and a.work_date between p_from and p_to),
         (select count(*) from public.deals d
           where d.owner_id = p.id and (d.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select count(*) from public.meetings m
           where m.owner_id = p.id and (m.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select coalesce(sum(d.amount_usd), 0) from public.deals d
           where d.owner_id = p.id and d.stage = 'won' and d.won_on between p_from and p_to),
         (select count(*) from public.deals d
           where d.owner_id = p.id and d.stage = 'won' and d.won_on between p_from and p_to)
    from public.profiles p
   where p.role = 'sales' and p.is_active;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: importing and handing out leads
-- -----------------------------------------------------------------------------
create or replace function public.start_lead_import(p_file_name text, p_total int)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;
  insert into public.lead_imports (file_name, imported_by, total_rows)
  values (p_file_name, auth.uid(), p_total) returning id into v_id;
  return v_id;
end
$$;

-- Inserts one chunk of parsed sheet rows. Rows whose phone (last ten digits) or
-- personal email already exists — in the table or earlier in the same chunk — are
-- counted as duplicates and skipped. Each row may carry its own assigned_to.
create or replace function public.import_leads(p_import_id bigint, p_rows jsonb)
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

-- Tell each rep how many leads they were just given. Called once after an import.
create or replace function public.finish_lead_import(p_import_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_import public.lead_imports;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import leads' using errcode = '42501';
  end if;
  select * into v_import from public.lead_imports where id = p_import_id;
  for r in select assigned_to, count(*) n from public.leads
            where import_id = p_import_id and assigned_to is not null group by assigned_to
  loop
    perform public.notify(r.assigned_to, 'leads.assigned', format('%s new leads are waiting for you', r.n),
      'Press Start on the dialer to work through them.', '/sales', 'info', jsonb_build_object('count', r.n));
  end loop;
  perform public.audit('import', 'leads', p_import_id::text,
    format('Imported %s leads from %s (%s duplicates skipped)', v_import.inserted, v_import.file_name, v_import.duplicates));
  return to_jsonb(v_import);
end
$$;

-- Hand leads to one or more reps, round-robin. p_reps = '{}' unassigns them.
create or replace function public.assign_leads(p_lead_ids bigint[], p_reps uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
  v_n int := coalesce(cardinality(p_reps), 0);
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign leads' using errcode = '42501';
  end if;

  with picked as (
    select id, row_number() over (order by id) - 1 as i
      from public.leads where id = any (p_lead_ids)
  )
  update public.leads l
     set assigned_to = case when v_n = 0 then null else p_reps[(picked.i % v_n) + 1] end,
         assigned_at = case when v_n = 0 then null else now() end,
         skipped_at = null
    from picked
   where l.id = picked.id;
  get diagnostics v_count = row_count;

  if v_n > 0 then
    for r in select assigned_to, count(*) n from public.leads
              where id = any (p_lead_ids) and assigned_to is not null group by assigned_to
    loop
      perform public.notify(r.assigned_to, 'leads.assigned', format('%s new leads are waiting for you', r.n),
        'Press Start on the dialer to work through them.', '/sales', 'info', jsonb_build_object('count', r.n));
    end loop;
  end if;

  perform public.audit('assign', 'leads', null,
    case when v_n = 0 then format('Unassigned %s leads', v_count)
         else format('Assigned %s leads across %s rep(s)', v_count, v_n) end,
    jsonb_build_object('lead_count', v_count, 'reps', to_jsonb(p_reps)));
  return v_count;
end
$$;

-- Same, for every lead matching a filter (so the admin can hand out 5,000 leads
-- without the browser holding 5,000 ids).
create or replace function public.admin_lead_ids(p_filter jsonb, p_limit int default 100000)
returns bigint[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ids bigint[];
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_ids
    from (
      select l.id from public.leads l
       where (p_filter ->> 'service' is null or l.service = p_filter ->> 'service')
         and (p_filter ->> 'platform' is null or l.platform = p_filter ->> 'platform')
         and (p_filter ->> 'stage' is null or l.stage = p_filter ->> 'stage')
         and (p_filter ->> 'status' is null or l.status = p_filter ->> 'status')
         and (p_filter ->> 'from' is null or l.lead_date >= (p_filter ->> 'from')::date)
         and (p_filter ->> 'to' is null or l.lead_date <= (p_filter ->> 'to')::date)
         and (p_filter ->> 'import_id' is null or l.import_id = (p_filter ->> 'import_id')::bigint)
         and (p_filter ->> 'assigned' is null
              or (p_filter ->> 'assigned' = 'unassigned' and l.assigned_to is null)
              or (p_filter ->> 'assigned' <> 'unassigned' and l.assigned_to::text = p_filter ->> 'assigned'))
         and (p_filter ->> 'q' is null or l.name ilike '%' || (p_filter ->> 'q') || '%'
              or l.phone ilike '%' || (p_filter ->> 'q') || '%'
              or l.personal_email ilike '%' || (p_filter ->> 'q') || '%')
       order by l.id
       limit p_limit
    ) x;
  return v_ids;
end
$$;

-- Put exhausted or closed leads back in the queue for another round.
create or replace function public.recycle_leads(p_lead_ids bigint[])
returns int
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can recycle leads' using errcode = '42501';
  end if;
  update public.leads
     set stage = 'queue', status = 'new', attempts = 0, closed_reason = null,
         next_action_at = null, skipped_at = null
   where id = any (p_lead_ids) and stage = 'closed'
     and coalesce(closed_reason, '') not in ('do_not_call', 'invalid_number', 'won');
  get diagnostics v_count = row_count;
  perform public.audit('recycle', 'leads', null, format('Recycled %s leads', v_count));
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Admin: the whole sales floor at a glance
-- -----------------------------------------------------------------------------
create or replace function public.sales_team_overview(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb,
  dials bigint, connected bigint, prospects bigint, meetings bigint,
  won_usd numeric, won_count bigint, open_pipeline_usd numeric,
  leads_total bigint, leads_open bigint, target_usd numeric, daily_target int
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
  select lb.profile_id, lb.full_name, lb.avatar, lb.dials, lb.connected, lb.prospects, lb.meetings,
         lb.won_usd, lb.won_count,
         (select coalesce(sum(d.amount_usd), 0) from public.deals d
           where d.owner_id = lb.profile_id and d.stage not in ('won', 'lost')),
         (select count(*) from public.leads l where l.assigned_to = lb.profile_id),
         (select count(*) from public.leads l where l.assigned_to = lb.profile_id and l.stage <> 'closed'),
         e.monthly_target_usd, e.daily_dial_target
    from public.sales_leaderboard(p_from, p_to) lb
    left join public.employment e on e.profile_id = lb.profile_id
   order by lb.won_usd desc, lb.dials desc;
end
$$;

-- -----------------------------------------------------------------------------
-- Meeting reminders (pg_cron, every five minutes)
-- -----------------------------------------------------------------------------
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
    returning owner_id, title, starts_at
  loop
    perform public.notify(r.owner_id, 'meeting.soon', 'Meeting starting soon',
      format('%s at %s', r.title, to_char(r.starts_at at time zone public.app_tz(), 'HH12:MI AM')),
      '/sales/meetings', 'info');
  end loop;
end
$$;
revoke execute on function public.sales_sweep() from public, anon, authenticated;
