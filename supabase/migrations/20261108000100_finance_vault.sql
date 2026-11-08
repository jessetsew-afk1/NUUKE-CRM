-- Finance vault: the owner's private finance and investor panel.
--
-- Only one person can open it: the admin whose login email is the vault's
-- owner email (jesse@nuuke.us), and only after typing a passcode they set.
-- Every vault table has row level security on and NO policies, so nothing
-- can be read or written through the normal API. The only way in is through
-- the functions below, and each checks the owner and an unlock token. A token
-- comes from vault_unlock (right passcode) and lapses after 30 idle minutes.
-- Five wrong passcodes lock the vault for 15 minutes. Every attempt is logged.

create extension if not exists pgcrypto with schema extensions;

/* ------------------------------------------------------------------ tables */
create table public.vault_config (
  id            int primary key default 1 check (id = 1),
  owner_email   text not null default 'jesse@nuuke.us',
  owner_id      uuid,                      -- pinned the first time the passcode is set
  passcode_hash text,
  failed        int not null default 0,
  locked_until  timestamptz,
  passcode_set_at timestamptz,
  settings      jsonb not null default '{}'::jsonb
);
insert into public.vault_config (id) values (1);

create table public.vault_sessions (
  token_hash text primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.vault_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  email   text,
  event   text not null,
  ok      boolean not null
);

-- What the money is (the owner types these: kinds of expense, commission, income, tax...).
create table public.vault_categories (
  id          bigint generated always as identity primary key,
  kind        text not null,
  name        text not null check (length(btrim(name)) between 1 and 80),
  note        text,
  acquisition boolean not null default false,   -- counts toward customer acquisition cost
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index vault_categories_name on public.vault_categories (kind, lower(name));

create table public.vault_investors (
  id                bigint generated always as identity primary key,
  name              text not null check (length(btrim(name)) between 1 and 120),
  company           text,
  email             text,
  phone             text,
  joined_on         date,
  share_pct         numeric(7,3) not null default 0 check (share_pct between 0 and 100),
  share_basis       text not null default 'net_profit' check (share_basis in ('net_profit', 'gross_profit', 'revenue')),
  carry_losses      boolean not null default true,
  target_return_pct numeric(7,3) check (target_return_pct is null or target_return_pct between 0 and 1000),
  payout_day        int check (payout_day is null or payout_day between 1 and 31),
  agreement         text,
  notes             text,
  color             text,
  status            text not null default 'active' check (status in ('active', 'paused', 'exited')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Which CRM agents work on an investor's team (used to pull their deals and pay from the CRM).
create table public.vault_investor_agents (
  investor_id bigint not null references public.vault_investors (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (investor_id, profile_id)
);

create table public.vault_entries (
  id              bigint generated always as identity primary key,
  month           date not null check (extract(day from month) = 1),
  investor_id     bigint references public.vault_investors (id) on delete cascade,
  kind            text not null check (kind in ('revenue', 'refund', 'other_income', 'direct_cost', 'commission', 'salary', 'rent',
                    'marketing', 'software', 'expense', 'depreciation', 'interest', 'tax', 'capital_in', 'capital_out', 'payout', 'capex')),
  category_id     bigint references public.vault_categories (id) on delete set null,
  label           text,
  amount          numeric(14,2) not null check (amount >= 0),   -- always USD
  currency        text not null default 'USD' check (currency in ('USD', 'PKR')),
  original_amount numeric(16,2),                                -- what was typed, in `currency`
  fx              numeric(12,4),                                -- PKR per 1 USD used for this entry
  recurring       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index vault_entries_month on public.vault_entries (month);
create index vault_entries_investor on public.vault_entries (investor_id);

-- Monthly numbers that are not money: agents, leads, clients, hours, and the month-end balance sheet.
create table public.vault_stats (
  id          bigint generated always as identity primary key,
  month       date not null check (extract(day from month) = 1),
  investor_id bigint references public.vault_investors (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create unique index vault_stats_month on public.vault_stats (month, coalesce(investor_id, 0));

do $$
declare t text;
begin
  foreach t in array array['vault_config', 'vault_sessions', 'vault_log', 'vault_categories', 'vault_investors',
                           'vault_investor_agents', 'vault_entries', 'vault_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

/* --------------------------------------------------------------- the gate */
create or replace function public.vault_my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid()
$$;
revoke all on function public.vault_my_email() from public, anon, authenticated;

-- The owner: an active admin whose login email is the owner email, and (once pinned) the same account.
create or replace function public.vault_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.is_admin()
     and exists (select 1 from public.vault_config c
                  where lower(c.owner_email) = public.vault_my_email()
                    and (c.owner_id is null or c.owner_id = auth.uid()))
$$;
revoke all on function public.vault_is_owner() from public, anon;
grant execute on function public.vault_is_owner() to authenticated;

create or replace function public.vault_log_event(p_event text, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.vault_log (user_id, email, event, ok) values (auth.uid(), public.vault_my_email(), p_event, p_ok);
$$;
revoke all on function public.vault_log_event(text, boolean) from public, anon, authenticated;

-- What the page needs to draw the lock screen. Says nothing to anyone but the owner.
create or replace function public.vault_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.vault_config;
begin
  if not public.vault_is_owner() then
    return jsonb_build_object('owner', false);
  end if;
  select * into c from public.vault_config where id = 1;
  return jsonb_build_object('owner', true, 'has_passcode', c.passcode_hash is not null,
    'locked_until', case when c.locked_until > now() then c.locked_until end);
end $$;
revoke all on function public.vault_status() from public, anon;
grant execute on function public.vault_status() to authenticated;

-- First time: set it. After that: changing it needs the current passcode.
create or replace function public.vault_set_passcode(p_new text, p_old text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.vault_config;
begin
  if not public.vault_is_owner() then
    perform public.vault_log_event('set passcode refused (not owner)', false);
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;
  if p_new is null or length(p_new) < 6 or length(p_new) > 64 then
    return jsonb_build_object('ok', false, 'error', 'Use 6 to 64 characters');
  end if;
  select * into c from public.vault_config where id = 1 for update;
  if c.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Locked', 'locked_until', c.locked_until);
  end if;
  if c.passcode_hash is not null then
    if p_old is null or crypt(p_old, c.passcode_hash) <> c.passcode_hash then
      update public.vault_config
         set locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
             failed = case when failed + 1 >= 5 then 0 else failed + 1 end
       where id = 1;
      perform public.vault_log_event('change passcode: wrong current passcode', false);
      return jsonb_build_object('ok', false, 'error', 'Current passcode is wrong');
    end if;
  end if;
  update public.vault_config
     set passcode_hash = crypt(p_new, gen_salt('bf', 10)), owner_id = auth.uid(), failed = 0,
         locked_until = null, passcode_set_at = now()
   where id = 1;
  delete from public.vault_sessions where true;   -- every open session must unlock again
  perform public.vault_log_event(case when c.passcode_hash is null then 'passcode set' else 'passcode changed' end, true);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.vault_set_passcode(text, text) from public, anon;
grant execute on function public.vault_set_passcode(text, text) to authenticated;

create or replace function public.vault_unlock(p_passcode text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.vault_config;
  v_token text;
begin
  if not public.vault_is_owner() then
    perform public.vault_log_event('unlock refused (not owner)', false);
    return jsonb_build_object('ok', false, 'error', 'Not allowed');
  end if;
  select * into c from public.vault_config where id = 1 for update;
  if c.passcode_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Set a passcode first');
  end if;
  if c.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Locked', 'locked_until', c.locked_until);
  end if;
  if p_passcode is null or crypt(p_passcode, c.passcode_hash) <> c.passcode_hash then
    if c.failed + 1 >= 5 then
      update public.vault_config set failed = 0, locked_until = now() + interval '15 minutes' where id = 1;
      perform public.vault_log_event('wrong passcode, locked 15 min', false);
      return jsonb_build_object('ok', false, 'error', 'Locked', 'locked_until', now() + interval '15 minutes');
    end if;
    update public.vault_config set failed = c.failed + 1 where id = 1;
    perform public.vault_log_event('wrong passcode', false);
    return jsonb_build_object('ok', false, 'error', 'Wrong passcode', 'tries_left', 5 - (c.failed + 1));
  end if;
  update public.vault_config set failed = 0, locked_until = null where id = 1;
  delete from public.vault_sessions where expires_at < now() or user_id <> auth.uid();
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.vault_sessions (token_hash, user_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '30 minutes');
  perform public.vault_log_event('unlocked', true);
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;
revoke all on function public.vault_unlock(text) from public, anon;
grant execute on function public.vault_unlock(text) to authenticated;

-- Every data call goes through this: owner + live token. Keeps the token alive for 30 more minutes.
create or replace function public.vault_check(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.vault_is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.vault_sessions set expires_at = now() + interval '30 minutes'
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and user_id = auth.uid() and expires_at > now();
  if not found then
    raise exception 'Vault locked' using errcode = '42501', hint = 'vault_locked';
  end if;
end $$;
revoke all on function public.vault_check(text) from public, anon, authenticated;

create or replace function public.vault_lock(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.vault_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if found then perform public.vault_log_event('locked', true); end if;
end $$;
revoke all on function public.vault_lock(text) from public, anon;
grant execute on function public.vault_lock(text) to authenticated;

/* ------------------------------------------------------------------- data */
create or replace function public.vault_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.vault_check(p_token);
  return jsonb_build_object(
    'settings',   (select settings from public.vault_config where id = 1),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.kind, c.name) from public.vault_categories c), '[]'),
    'investors',  coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.vault_investors i), '[]'),
    'agents',     coalesce((select jsonb_agg(jsonb_build_object('investor_id', a.investor_id, 'profile_id', a.profile_id))
                              from public.vault_investor_agents a), '[]'),
    'entries',    coalesce((select jsonb_agg(to_jsonb(e) order by e.month, e.id) from public.vault_entries e), '[]'),
    'stats',      coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from public.vault_stats s), '[]'),
    'log',        coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc)
                              from (select * from public.vault_log order by at desc limit 30) l), '[]'),
    'passcode_set_at', (select passcode_set_at from public.vault_config where id = 1)
  );
end $$;
revoke all on function public.vault_load(text) from public, anon;
grant execute on function public.vault_load(text) to authenticated;

create or replace function public.vault_save_settings(p_token text, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.vault_check(p_token);
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Settings must be an object'; end if;
  update public.vault_config set settings = p_settings where id = 1;
end $$;
revoke all on function public.vault_save_settings(text, jsonb) from public, anon;
grant execute on function public.vault_save_settings(text, jsonb) to authenticated;

-- One save for each kind of row. `p` holds the fields; an `id` updates, no id inserts.
create or replace function public.vault_save(p_token text, p_table text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_inv bigint := nullif(p ->> 'investor_id', '')::bigint;
  out jsonb;
begin
  perform public.vault_check(p_token);
  if p_table = 'category' then
    if v_id is null then
      insert into public.vault_categories (kind, name, note, acquisition)
      values (p ->> 'kind', btrim(p ->> 'name'), nullif(p ->> 'note', ''), coalesce((p ->> 'acquisition')::boolean, false))
      returning to_jsonb(vault_categories.*) into out;
    else
      update public.vault_categories set name = btrim(p ->> 'name'), note = nullif(p ->> 'note', ''),
        acquisition = coalesce((p ->> 'acquisition')::boolean, false), archived = coalesce((p ->> 'archived')::boolean, false)
       where id = v_id returning to_jsonb(vault_categories.*) into out;
    end if;
  elsif p_table = 'investor' then
    if v_id is null then
      insert into public.vault_investors (name, company, email, phone, joined_on, share_pct, share_basis, carry_losses,
        target_return_pct, payout_day, agreement, notes, color, status)
      values (btrim(p ->> 'name'), nullif(p ->> 'company', ''), nullif(p ->> 'email', ''), nullif(p ->> 'phone', ''),
        nullif(p ->> 'joined_on', '')::date, coalesce(nullif(p ->> 'share_pct', '')::numeric, 0),
        coalesce(nullif(p ->> 'share_basis', ''), 'net_profit'), coalesce((p ->> 'carry_losses')::boolean, true),
        nullif(p ->> 'target_return_pct', '')::numeric, nullif(p ->> 'payout_day', '')::int,
        nullif(p ->> 'agreement', ''), nullif(p ->> 'notes', ''), nullif(p ->> 'color', ''), coalesce(nullif(p ->> 'status', ''), 'active'))
      returning to_jsonb(vault_investors.*) into out;
    else
      update public.vault_investors set name = btrim(p ->> 'name'), company = nullif(p ->> 'company', ''),
        email = nullif(p ->> 'email', ''), phone = nullif(p ->> 'phone', ''), joined_on = nullif(p ->> 'joined_on', '')::date,
        share_pct = coalesce(nullif(p ->> 'share_pct', '')::numeric, 0), share_basis = coalesce(nullif(p ->> 'share_basis', ''), 'net_profit'),
        carry_losses = coalesce((p ->> 'carry_losses')::boolean, true), target_return_pct = nullif(p ->> 'target_return_pct', '')::numeric,
        payout_day = nullif(p ->> 'payout_day', '')::int, agreement = nullif(p ->> 'agreement', ''), notes = nullif(p ->> 'notes', ''),
        color = nullif(p ->> 'color', ''), status = coalesce(nullif(p ->> 'status', ''), 'active'), updated_at = now()
       where id = v_id returning to_jsonb(vault_investors.*) into out;
    end if;
  elsif p_table = 'entry' then
    if v_id is null then
      insert into public.vault_entries (month, investor_id, kind, category_id, label, amount, currency, original_amount, fx, recurring, note)
      values (date_trunc('month', (p ->> 'month')::date)::date, v_inv, p ->> 'kind', nullif(p ->> 'category_id', '')::bigint,
        nullif(p ->> 'label', ''), (p ->> 'amount')::numeric, coalesce(nullif(p ->> 'currency', ''), 'USD'),
        nullif(p ->> 'original_amount', '')::numeric, nullif(p ->> 'fx', '')::numeric,
        coalesce((p ->> 'recurring')::boolean, false), nullif(p ->> 'note', ''))
      returning to_jsonb(vault_entries.*) into out;
    else
      update public.vault_entries set month = date_trunc('month', (p ->> 'month')::date)::date, investor_id = v_inv, kind = p ->> 'kind',
        category_id = nullif(p ->> 'category_id', '')::bigint, label = nullif(p ->> 'label', ''), amount = (p ->> 'amount')::numeric,
        currency = coalesce(nullif(p ->> 'currency', ''), 'USD'), original_amount = nullif(p ->> 'original_amount', '')::numeric,
        fx = nullif(p ->> 'fx', '')::numeric, recurring = coalesce((p ->> 'recurring')::boolean, false), note = nullif(p ->> 'note', ''),
        updated_at = now()
       where id = v_id returning to_jsonb(vault_entries.*) into out;
    end if;
  elsif p_table = 'stats' then
    insert into public.vault_stats (month, investor_id, data)
    values (date_trunc('month', (p ->> 'month')::date)::date, v_inv, coalesce(p -> 'data', '{}'))
    on conflict (month, coalesce(investor_id, 0)) do update set data = excluded.data, updated_at = now()
    returning to_jsonb(vault_stats.*) into out;
  elsif p_table = 'agents' then
    delete from public.vault_investor_agents where investor_id = v_inv;
    insert into public.vault_investor_agents (investor_id, profile_id)
    select v_inv, x::uuid from jsonb_array_elements_text(coalesce(p -> 'profile_ids', '[]')) x
    on conflict do nothing;
    out := jsonb_build_object('investor_id', v_inv);
  else
    raise exception 'Unknown table %', p_table;
  end if;
  if out is null then raise exception 'Not found'; end if;
  return out;
end $$;
revoke all on function public.vault_save(text, text, jsonb) from public, anon;
grant execute on function public.vault_save(text, text, jsonb) to authenticated;

create or replace function public.vault_delete(p_token text, p_table text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.vault_check(p_token);
  if p_table = 'entry' then delete from public.vault_entries where id = p_id;
  elsif p_table = 'investor' then delete from public.vault_investors where id = p_id;
  elsif p_table = 'category' then delete from public.vault_categories where id = p_id;
  elsif p_table = 'stats' then delete from public.vault_stats where id = p_id;
  else raise exception 'Unknown table %', p_table;
  end if;
end $$;
revoke all on function public.vault_delete(text, text, bigint) from public, anon;
grant execute on function public.vault_delete(text, text, bigint) to authenticated;

-- Copy every recurring entry of one month into the next (skips ones already copied).
create or replace function public.vault_roll_recurring(p_token text, p_from date) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_from)::date;
  v_to date := (date_trunc('month', p_from) + interval '1 month')::date;
  n int;
begin
  perform public.vault_check(p_token);
  insert into public.vault_entries (month, investor_id, kind, category_id, label, amount, currency, original_amount, fx, recurring, note)
  select v_to, e.investor_id, e.kind, e.category_id, e.label, e.amount, e.currency, e.original_amount, e.fx, true, e.note
    from public.vault_entries e
   where e.month = v_from and e.recurring
     and not exists (select 1 from public.vault_entries x
                      where x.month = v_to and x.recurring and x.kind = e.kind
                        and x.investor_id is not distinct from e.investor_id
                        and x.category_id is not distinct from e.category_id
                        and x.label is not distinct from e.label);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.vault_roll_recurring(text, date) from public, anon;
grant execute on function public.vault_roll_recurring(text, date) to authenticated;

-- What the CRM already knows about a month (optionally just some agents): to copy into the vault.
create or replace function public.vault_crm_month(p_token text, p_month date, p_agents uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  perform public.vault_check(p_token);
  return jsonb_build_object(
    'deals_won', (select count(*) from public.deals d where d.won_on >= v_from and d.won_on < v_to
                     and (p_agents is null or d.owner_id = any (p_agents))),
    'deals_won_usd', (select coalesce(sum(d.amount_usd), 0) from public.deals d where d.won_on >= v_from and d.won_on < v_to
                     and (p_agents is null or d.owner_id = any (p_agents))),
    'payments_count', (select count(*) from public.payment_links l where l.paid_at >= v_from and l.paid_at < v_to
                     and (p_agents is null or coalesce(l.commission_owner, l.created_by) = any (p_agents))),
    'payments_usd', (select coalesce(sum(l.paid_amount), 0) from public.payment_links l where l.paid_at >= v_from and l.paid_at < v_to
                     and (p_agents is null or coalesce(l.commission_owner, l.created_by) = any (p_agents))),
    'paypal_fees_usd', (select coalesce(sum(l.paypal_fee), 0) from public.payment_links l where l.paid_at >= v_from and l.paid_at < v_to
                     and (p_agents is null or coalesce(l.commission_owner, l.created_by) = any (p_agents))),
    'refunds_usd', (select coalesce(sum(l.refunded_amount), 0) from public.payment_links l where l.paid_at >= v_from and l.paid_at < v_to
                     and (p_agents is null or coalesce(l.commission_owner, l.created_by) = any (p_agents))),
    'commission_usd', (select coalesce(sum(l.commission_usd), 0) from public.payment_links l where l.paid_at >= v_from and l.paid_at < v_to
                     and l.counts_for_commission and (p_agents is null or coalesce(l.commission_owner, l.created_by) = any (p_agents))),
    'agents', (select count(*) from public.profiles p where p.role = 'sales' and p.is_active
                     and (p_agents is null or p.id = any (p_agents))),
    'salaries_pkr', (select coalesce(sum(e.monthly_salary_pkr), 0) from public.employment e join public.profiles p on p.id = e.profile_id
                     where p.is_active and p.role <> 'client' and (p_agents is null or p.id = any (p_agents))),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role) order by p.full_name)
                          from public.profiles p where p.is_active and p.role in ('sales', 'setter', 'production', 'admin')), '[]')
  );
end $$;
revoke all on function public.vault_crm_month(text, date, uuid[]) from public, anon;
grant execute on function public.vault_crm_month(text, date, uuid[]) to authenticated;

/* ------------------------------------------------------- starter types */
insert into public.vault_categories (kind, name, acquisition) values
  ('revenue', 'Website projects', false), ('revenue', 'App & software projects', false), ('revenue', 'Marketing retainers', false),
  ('revenue', 'Maintenance & hosting plans', false), ('revenue', 'Ebooks (Story&House)', false), ('revenue', 'Design work', false),
  ('refund', 'Client refunds', false), ('refund', 'Chargebacks & disputes', false),
  ('other_income', 'Bank interest', false), ('other_income', 'Currency gains', false),
  ('direct_cost', 'Freelancers & contractors', false), ('direct_cost', 'Hosting & domains for clients', false),
  ('direct_cost', 'Payment processing fees (PayPal)', false), ('direct_cost', 'Stock assets & licences', false),
  ('commission', 'Closer commission', true), ('commission', 'Setter commission', true), ('commission', 'Referral commission', true),
  ('salary', 'Sales team', true), ('salary', 'Production team', false), ('salary', 'Management & admin', false),
  ('rent', 'Office rent', false), ('rent', 'Electricity, internet & utilities', false),
  ('marketing', 'Bark credits', true), ('marketing', 'Facebook & Instagram ads', true), ('marketing', 'Google ads', true),
  ('marketing', 'Lead lists & data', true),
  ('software', 'CRM, hosting & servers', false), ('software', 'Zoom & phone lines', true), ('software', 'Design & dev tools', false),
  ('expense', 'Legal & accounting', false), ('expense', 'Bank charges', false), ('expense', 'Travel & meals', false),
  ('expense', 'Equipment repairs', false), ('expense', 'Training', false),
  ('depreciation', 'Laptops & equipment', false),
  ('interest', 'Loan interest', false),
  ('tax', 'Income tax', false), ('tax', 'Sales tax / GST', false), ('tax', 'Withholding tax', false),
  ('capital_in', 'Investor capital', false), ('capital_out', 'Capital returned', false),
  ('payout', 'Monthly profit share', false),
  ('capex', 'Laptops & equipment', false), ('capex', 'Furniture & office setup', false);
