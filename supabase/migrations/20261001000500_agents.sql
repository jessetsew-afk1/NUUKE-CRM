-- =============================================================================
-- Agents — everyone's little character, and the items they earn
--
-- Most of the wardrobe is free. A few items are earned, game-style; the database
-- refuses an outfit containing an item that person has not unlocked yet.
-- Item keys are "<slot>:<item>" and match client/src/agent/catalog.ts.
-- =============================================================================

create table public.agent_locked_items (
  item_key    text primary key,
  label       text not null,
  rule        text not null check (rule in ('best_day_dials', 'total_dials', 'meetings_total', 'won_usd_total',
                                             'on_time_days', 'tenure_days')),
  threshold   numeric not null,
  hint        text not null
);

insert into public.agent_locked_items (item_key, label, rule, threshold, hint) values
  ('hat:headset_gold', 'Golden headset', 'best_day_dials', 250,   'Hit 250 dials in a single day'),
  ('glasses:star',     'Star shades',    'total_dials',    1000,  'Make 1,000 dials'),
  ('held:trophy',      'Trophy',         'meetings_total', 10,    'Book 10 meetings'),
  ('hat:crown',        'Crown',          'won_usd_total',  5000,  'Close $5,000 in deals'),
  ('pet:dragon',       'Baby dragon',    'won_usd_total',  20000, 'Close $20,000 in deals'),
  ('hat:halo',         'Halo',           'on_time_days',   20,    'Be on time for 20 shifts'),
  ('bg:galaxy',        'Galaxy',         'on_time_days',   60,    'Be on time for 60 shifts'),
  ('outfit:tuxedo',    'Tuxedo',         'tenure_days',    30,    'Spend 30 days at NUUKE');

create table public.agent_unlocks (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  item_key     text not null references public.agent_locked_items (item_key) on delete cascade,
  unlocked_at  timestamptz not null default now(),
  primary key (profile_id, item_key)
);

alter table public.agent_locked_items enable row level security;
alter table public.agent_unlocks enable row level security;
create policy agent_locked_items_read on public.agent_locked_items for select to authenticated using (true);
create policy agent_unlocks_read on public.agent_unlocks for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Progress towards every earnable item, for the wardrobe screen.
create or replace function public.agent_progress(p_profile uuid default null)
returns table (item_key text, label text, hint text, threshold numeric, progress numeric, unlocked boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_profile, auth.uid());
  v_best_day numeric;
  v_total_dials numeric;
  v_meetings numeric;
  v_won numeric;
  v_on_time numeric;
  v_tenure numeric;
begin
  if v_uid <> auth.uid() and not public.is_admin() then
    raise exception 'Not yours' using errcode = '42501';
  end if;
  select coalesce(max(n), 0) into v_best_day
    from (select count(*) n from public.lead_attempts where rep_id = v_uid and action = 'call' group by work_date) x;
  select count(*) into v_total_dials from public.lead_attempts where rep_id = v_uid and action = 'call';
  select count(*) into v_meetings from public.meetings where owner_id = v_uid;
  select coalesce(sum(amount_usd), 0) into v_won from public.deals where owner_id = v_uid and stage = 'won';
  select count(*) into v_on_time from public.attendance_days
   where profile_id = v_uid and first_in is not null and arrival = 'on_time';
  select greatest(0, public.local_today() - coalesce(e.joined_on, (p.created_at at time zone public.app_tz())::date))
    into v_tenure
    from public.profiles p left join public.employment e on e.profile_id = p.id where p.id = v_uid;

  return query
  select li.item_key, li.label, li.hint, li.threshold,
         case li.rule
           when 'best_day_dials' then v_best_day
           when 'total_dials' then v_total_dials
           when 'meetings_total' then v_meetings
           when 'won_usd_total' then v_won
           when 'on_time_days' then v_on_time
           when 'tenure_days' then v_tenure
         end,
         exists (select 1 from public.agent_unlocks u where u.profile_id = v_uid and u.item_key = li.item_key)
    from public.agent_locked_items li
   order by li.threshold;
end
$$;

-- Grants anything newly earned and says so. The app calls this on load and after
-- moments that might earn something (a Done on the dialer, a won deal).
create or replace function public.check_agent_unlocks()
returns text[]
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then return '{}'; end if;
  for r in
    select * from public.agent_progress(auth.uid()) ap
     where not ap.unlocked and ap.progress >= ap.threshold
  loop
    insert into public.agent_unlocks (profile_id, item_key) values (auth.uid(), r.item_key)
    on conflict do nothing;
    perform public.notify(auth.uid(), 'agent.unlock', format('Unlocked: %s', r.label),
      format('%s. Dress your agent up in it from the wardrobe.', r.hint), '/me/agent', 'celebrate',
      jsonb_build_object('item_key', r.item_key));
  end loop;
  return coalesce((select array_agg(item_key) from public.agent_unlocks where profile_id = auth.uid()), '{}');
end
$$;

create or replace function public.guard_agent_items()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_locked text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select li.label into v_locked
    from jsonb_each_text(coalesce(new.avatar, '{}'::jsonb)) kv
    join public.agent_locked_items li on li.item_key = kv.key || ':' || kv.value
   where not exists (select 1 from public.agent_unlocks u where u.profile_id = new.id and u.item_key = li.item_key)
   limit 1;
  if v_locked is not null then
    raise exception '% is still locked', v_locked using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_agent_items before insert or update of avatar on public.profiles
  for each row execute function public.guard_agent_items();
