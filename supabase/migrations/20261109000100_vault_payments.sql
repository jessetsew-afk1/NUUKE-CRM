-- Finance vault: log a client payment in one go.
-- One payment (what the client paid, the PayPal/merchant fees and tax taken off,
-- the USD → GBP → PKR conversion and what landed in the bank) becomes one
-- vault_payments row plus the ledger lines it implies (revenue, fees, tax,
-- conversion cost, bank charges), saved together and edited together.

create table public.vault_payments (
  id          bigint generated always as identity primary key,
  month       date not null check (extract(day from month) = 1),
  investor_id bigint references public.vault_investors (id) on delete cascade,
  client      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.vault_payments enable row level security;
alter table public.vault_payments force row level security;
revoke all on public.vault_payments from anon, authenticated;

alter table public.vault_entries
  add column payment_id bigint references public.vault_payments (id) on delete cascade;
create index vault_entries_payment on public.vault_entries (payment_id);

-- Save a payment and replace its ledger lines, all in one transaction.
-- p = { id?, month, investor_id?, client, details, entries: [{ kind, category_id?, label?, amount, currency?, original_amount?, fx?, note? }] }
create or replace function public.vault_save_payment(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_month date := date_trunc('month', (p ->> 'month')::date)::date;
  v_inv bigint := nullif(p ->> 'investor_id', '')::bigint;
  out jsonb;
begin
  perform public.vault_check(p_token);
  if jsonb_typeof(p -> 'entries') <> 'array' or jsonb_array_length(p -> 'entries') = 0 then
    raise exception 'A payment needs at least the amount received';
  end if;
  if v_id is null then
    insert into public.vault_payments (month, investor_id, client, details)
    values (v_month, v_inv, nullif(btrim(p ->> 'client'), ''), coalesce(p -> 'details', '{}'))
    returning id into v_id;
  else
    update public.vault_payments set month = v_month, investor_id = v_inv, client = nullif(btrim(p ->> 'client'), ''),
      details = coalesce(p -> 'details', '{}'), updated_at = now()
     where id = v_id;
    if not found then raise exception 'Payment not found'; end if;
    delete from public.vault_entries where payment_id = v_id;
  end if;
  insert into public.vault_entries (month, investor_id, kind, category_id, label, amount, currency, original_amount, fx, recurring, note, payment_id)
  select v_month, v_inv, e ->> 'kind', nullif(e ->> 'category_id', '')::bigint, nullif(e ->> 'label', ''), (e ->> 'amount')::numeric,
         coalesce(nullif(e ->> 'currency', ''), 'USD'), nullif(e ->> 'original_amount', '')::numeric, nullif(e ->> 'fx', '')::numeric,
         false, nullif(e ->> 'note', ''), v_id
    from jsonb_array_elements(p -> 'entries') e
   where (e ->> 'amount')::numeric > 0;
  select to_jsonb(x) into out from public.vault_payments x where x.id = v_id;
  return out;
end $$;
revoke all on function public.vault_save_payment(text, jsonb) from public, anon;
grant execute on function public.vault_save_payment(text, jsonb) to authenticated;

create or replace function public.vault_delete(p_token text, p_table text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.vault_check(p_token);
  if p_table = 'entry' then delete from public.vault_entries where id = p_id;
  elsif p_table = 'investor' then delete from public.vault_investors where id = p_id;
  elsif p_table = 'category' then delete from public.vault_categories where id = p_id;
  elsif p_table = 'stats' then delete from public.vault_stats where id = p_id;
  elsif p_table = 'payment' then delete from public.vault_payments where id = p_id;
  else raise exception 'Unknown table %', p_table;
  end if;
end $$;

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
    'payments',   coalesce((select jsonb_agg(to_jsonb(x) order by x.month, x.id) from public.vault_payments x), '[]'),
    'stats',      coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from public.vault_stats s), '[]'),
    'log',        coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc)
                              from (select * from public.vault_log order by at desc limit 30) l), '[]'),
    'passcode_set_at', (select passcode_set_at from public.vault_config where id = 1)
  );
end $$;

insert into public.vault_categories (kind, name, acquisition) values
  ('direct_cost', 'Merchant & gateway fees', false),
  ('expense', 'Currency conversion cost', false)
on conflict do nothing;
