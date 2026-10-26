-- =============================================================================
-- NUUKE CRM — payment links (PayPal)
--
-- A salesperson, a project manager (production staff who lead a project) or an
-- admin makes a payment link for a client: which company it's from (NUUKE or
-- NUUKE.MARKETING), who it's for, what it's for, the lines, a discount, the tax
-- they type in, and USD or GBP. The client opens the link, pays through PayPal,
-- and the same link turns into their receipt.
--   * The amounts are fixed once a link exists. To change them, close it and
--     make a new one (Duplicate on the Payments page).
--   * Links never expire. Every 10 days a link stays unpaid, its maker is asked
--     whether to keep it open or close it.
--   * A paid link counts towards commission: it becomes a won deal for whoever
--     gets the credit (its maker, unless an admin changes it), worth the amount
--     before tax in USD (GBP converted at the rate in Settings). Admins can change
--     who gets it, the amount, or switch it off.
--   * Only the server (Netlify functions holding the PayPal secret) marks a link
--     paid, refunded or disputed — never the browser.
--   * Test payments (PayPal sandbox) are marked as tests and never count.
-- =============================================================================

alter table public.settings
  add column if not exists gbp_to_usd numeric(8, 4) not null default 1.27 check (gbp_to_usd > 0);

-- Who may make payment links: admins, salespeople, and production staff who lead a project.
create or replace function public.can_take_payments()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select p.role in ('admin', 'sales')
        or (p.role = 'production' and exists (
              select 1 from public.project_members m where m.profile_id = p.id and m.is_lead))
      from public.profiles p
     where p.id = auth.uid() and p.is_active), false)
$$;

-- Invoice numbers run per company per year: NK-2026-0001, NM-2026-0001.
create table public.payment_counters (
  prefix  text not null,
  year    int not null,
  last    int not null default 0,
  primary key (prefix, year)
);
alter table public.payment_counters enable row level security;

create table public.payment_links (
  id                    bigint generated always as identity primary key,
  code                  text not null unique
                        default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
  brand                 text not null check (brand in ('nuuke', 'marketing')),
  number                text not null unique,
  created_by            uuid references public.profiles (id) on delete set null,
  client_name           text not null,
  client_email          text,
  client_company        text,
  purpose               text not null,
  -- [{ "description": text, "quantity": int, "unit_price": numeric }]
  items                 jsonb not null,
  currency              text not null check (currency in ('USD', 'GBP')),
  discount              numeric(12, 2) not null default 0 check (discount >= 0),
  tax_label             text not null default 'Tax',
  tax_rate              numeric(6, 3) not null default 0 check (tax_rate between 0 and 100),
  subtotal              numeric(12, 2) not null,
  tax_amount            numeric(12, 2) not null,
  total                 numeric(12, 2) not null check (total > 0),
  note                  text,
  due_on                date,
  lead_id               bigint references public.leads (id) on delete set null,
  project_id            bigint references public.projects (id) on delete set null,
  -- open → pending (PayPal still clearing it) → paid → refunded; or closed by the team
  status                text not null default 'open'
                        check (status in ('open', 'pending', 'paid', 'refunded', 'closed')),
  mode                  text check (mode in ('sandbox', 'live')),
  paypal_order_id       text,
  paypal_capture_id     text unique,
  payer_name            text,
  payer_email           text,
  paid_amount           numeric(12, 2),
  paypal_fee            numeric(12, 2),
  net_amount            numeric(12, 2),
  paid_at               timestamptz,
  refunded_amount       numeric(12, 2) not null default 0,
  refunds               jsonb not null default '[]'::jsonb,
  disputed              boolean not null default false,
  emailed_at            timestamptz,
  receipt_emailed_at    timestamptz,
  -- the 10-day "keep it or close it?" check
  next_check_at         timestamptz not null default now() + interval '10 days',
  asked_at              timestamptz,
  kept_at               timestamptz,
  closed_at             timestamptz,
  closed_by             uuid references public.profiles (id) on delete set null,
  -- commission
  counts_for_commission boolean not null default true,
  commission_owner      uuid references public.profiles (id) on delete set null,
  commission_usd        numeric(12, 2) check (commission_usd >= 0),   -- null = worked out automatically
  commission_fx         numeric(8, 4),
  deal_id               bigint references public.deals (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index payment_links_maker on public.payment_links (created_by, created_at desc);
create index payment_links_owner on public.payment_links (commission_owner);
create index payment_links_check on public.payment_links (next_check_at) where status = 'open';
create index payment_links_order on public.payment_links (paypal_order_id);

create trigger payment_links_touch_ts before update on public.payment_links
  for each row execute function public.touch_updated_at();
create trigger payment_links_audit after insert or update or delete on public.payment_links
  for each row execute function public.audit_row();

alter table public.payment_links enable row level security;
create policy payment_links_read on public.payment_links for select to authenticated
  using (created_by = (select auth.uid()) or commission_owner = (select auth.uid()) or (select public.is_admin()));
-- Every change goes through the functions below.
revoke all on public.payment_links from anon;
revoke insert, update, delete on public.payment_links from authenticated;
revoke all on public.payment_counters from anon, authenticated;

-- "$1,250.00" / "£1,250.00"
create or replace function public.money(p_currency text, p_amount numeric)
returns text
language sql stable
as $$ select (case p_currency when 'GBP' then '£' else '$' end) || to_char(coalesce(p_amount, 0), 'FM999,999,990.00') $$;

-- The amount a paid link counts for, in USD: before tax, after the discount.
create or replace function public.payment_link_commission_auto(l public.payment_links)
returns numeric
language sql stable security definer set search_path = public
as $$
  select round((l.subtotal - l.discount) * case l.currency when 'GBP' then s.gbp_to_usd else 1 end, 2)
    from public.settings s
$$;

-- -----------------------------------------------------------------------------
-- Making, changing, keeping and closing links (the team)
-- -----------------------------------------------------------------------------
create or replace function public.create_payment_link(p jsonb)
returns public.payment_links
language plpgsql security definer set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_desc text;
  v_qty numeric;
  v_price numeric;
  v_sub numeric := 0;
  v_disc numeric := round(coalesce((p ->> 'discount')::numeric, 0), 2);
  v_rate numeric := round(coalesce((p ->> 'tax_rate')::numeric, 0), 3);
  v_tax numeric;
  v_total numeric;
  v_brand text := p ->> 'brand';
  v_currency text := upper(coalesce(p ->> 'currency', 'USD'));
  v_name text := nullif(btrim(p ->> 'client_name'), '');
  v_email text := nullif(lower(btrim(p ->> 'client_email')), '');
  v_purpose text := nullif(btrim(p ->> 'purpose'), '');
  v_lead bigint := nullif(p ->> 'lead_id', '')::bigint;
  v_project bigint := nullif(p ->> 'project_id', '')::bigint;
  v_prefix text;
  v_year int := extract(year from public.local_today())::int;
  v_seq int;
  v_row public.payment_links;
begin
  if not public.can_take_payments() then
    raise exception 'Only admins, salespeople and project managers can make payment links' using errcode = '42501';
  end if;
  if v_brand not in ('nuuke', 'marketing') or v_brand is null then
    raise exception 'Choose the company the invoice is from';
  end if;
  if v_currency not in ('USD', 'GBP') then
    raise exception 'Choose USD or GBP';
  end if;
  if v_name is null or length(v_name) > 200 then
    raise exception 'Type the client''s name';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That client email doesn''t look right';
  end if;
  if v_purpose is null or length(v_purpose) > 200 then
    raise exception 'Say what the payment is for (up to 200 characters)';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Add at least one line';
  end if;
  if jsonb_array_length(p -> 'items') > 30 then
    raise exception 'Up to 30 lines per invoice';
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_desc := nullif(btrim(v_item ->> 'description'), '');
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := round((v_item ->> 'unit_price')::numeric, 2);
    if v_desc is null or length(v_desc) > 127 then
      raise exception 'Every line needs a description (up to 127 characters)';
    end if;
    if v_qty is null or v_qty <> trunc(v_qty) or v_qty < 1 or v_qty > 9999 then
      raise exception 'Quantities are whole numbers from 1 to 9999';
    end if;
    if v_price is null or v_price < 0 or v_price > 999999.99 then
      raise exception 'Check the price on "%"', v_desc;
    end if;
    v_items := v_items || jsonb_build_object('description', v_desc, 'quantity', v_qty::int, 'unit_price', v_price);
    v_sub := v_sub + v_qty * v_price;
  end loop;

  if v_disc < 0 or v_disc > v_sub then
    raise exception 'The discount can''t be more than the lines add up to';
  end if;
  if v_rate < 0 or v_rate > 100 then
    raise exception 'Tax is a percentage from 0 to 100';
  end if;
  v_tax := round((v_sub - v_disc) * v_rate / 100, 2);
  v_total := v_sub - v_disc + v_tax;
  if v_total <= 0 then
    raise exception 'The total must be more than zero';
  end if;
  if v_total > 999999.99 then
    raise exception 'That total is too large for one link';
  end if;

  if v_lead is not null and not exists (
       select 1 from public.leads where id = v_lead and (assigned_to = auth.uid() or public.is_admin())) then
    v_lead := null;
  end if;
  if v_project is not null and not public.can_see_project(v_project) then
    v_project := null;
  end if;

  v_prefix := case v_brand when 'marketing' then 'NM' else 'NK' end;
  insert into public.payment_counters (prefix, year, last) values (v_prefix, v_year, 1)
  on conflict (prefix, year) do update set last = public.payment_counters.last + 1
  returning last into v_seq;

  insert into public.payment_links (
    brand, number, created_by, client_name, client_email, client_company, purpose, items, currency,
    discount, tax_label, tax_rate, subtotal, tax_amount, total, note, due_on, lead_id, project_id, commission_owner)
  values (
    v_brand, format('%s-%s-%s', v_prefix, v_year, lpad(v_seq::text, 4, '0')), auth.uid(), v_name, v_email,
    nullif(btrim(p ->> 'client_company'), ''), v_purpose, v_items, v_currency,
    v_disc, coalesce(nullif(btrim(p ->> 'tax_label'), ''), 'Tax'), v_rate, v_sub, v_tax, v_total,
    nullif(btrim(p ->> 'note'), ''), nullif(p ->> 'due_on', '')::date, v_lead, v_project, auth.uid())
  returning * into v_row;
  return v_row;
end
$$;

-- The maker (or an admin) can fix the words on an open link; the money stays as it is.
create or replace function public.update_payment_link(p_id bigint, p jsonb)
returns public.payment_links
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
  v_email text := nullif(lower(btrim(p ->> 'client_email')), '');
begin
  select * into v from public.payment_links where id = p_id for update;
  if not found or not (v.created_by = auth.uid() or public.is_admin()) then
    raise exception 'That payment link isn''t yours to change' using errcode = '42501';
  end if;
  if v.status <> 'open' then
    raise exception 'Only an open link can be changed';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That client email doesn''t look right';
  end if;
  update public.payment_links set
    client_name    = coalesce(nullif(btrim(p ->> 'client_name'), ''), client_name),
    client_email   = case when p ? 'client_email' then v_email else client_email end,
    client_company = case when p ? 'client_company' then nullif(btrim(p ->> 'client_company'), '') else client_company end,
    purpose        = coalesce(nullif(btrim(p ->> 'purpose'), ''), purpose),
    note           = case when p ? 'note' then nullif(btrim(p ->> 'note'), '') else note end,
    due_on         = case when p ? 'due_on' then nullif(p ->> 'due_on', '')::date else due_on end
  where id = p_id
  returning * into v;
  return v;
end
$$;

create or replace function public.keep_payment_link(p_id bigint)
returns public.payment_links
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  select * into v from public.payment_links where id = p_id for update;
  if not found or not (v.created_by = auth.uid() or public.is_admin()) then
    raise exception 'That payment link isn''t yours' using errcode = '42501';
  end if;
  if v.status not in ('open', 'closed') then
    raise exception 'This link has already been paid';
  end if;
  update public.payment_links
     set status = 'open', kept_at = now(), next_check_at = now() + interval '10 days',
         closed_at = null, closed_by = null
   where id = p_id
  returning * into v;
  return v;
end
$$;

create or replace function public.close_payment_link(p_id bigint)
returns public.payment_links
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  select * into v from public.payment_links where id = p_id for update;
  if not found or not (v.created_by = auth.uid() or public.is_admin()) then
    raise exception 'That payment link isn''t yours' using errcode = '42501';
  end if;
  if v.status = 'pending' then
    raise exception 'PayPal is still clearing a payment on this link, so it can''t be closed now';
  end if;
  if v.status <> 'open' then
    raise exception 'Only an open link can be closed';
  end if;
  update public.payment_links set status = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_id
  returning * into v;
  return v;
end
$$;

-- Admins: who gets the credit, for how much (null = automatic), or not at all.
create or replace function public.set_payment_commission(p_id bigint, p_counts boolean, p_owner uuid, p_amount_usd numeric)
returns public.payment_links
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change commission' using errcode = '42501';
  end if;
  if p_amount_usd is not null and p_amount_usd < 0 then
    raise exception 'The amount can''t be negative';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and role <> 'client') then
    raise exception 'Credit can only go to someone on the team';
  end if;
  select * into v from public.payment_links where id = p_id for update;
  if not found then
    raise exception 'That payment link no longer exists';
  end if;
  update public.payment_links
     set counts_for_commission = p_counts, commission_owner = p_owner, commission_usd = round(p_amount_usd, 2)
   where id = p_id
  returning * into v;
  perform public.payment_link_sync_deal(p_id);
  select * into v from public.payment_links where id = p_id;
  return v;
end
$$;

-- -----------------------------------------------------------------------------
-- The deal that carries a paid link's commission
-- -----------------------------------------------------------------------------
create or replace function public.payment_link_sync_deal(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
  v_amount numeric;
  v_want boolean;
  v_won date;
begin
  select * into v from public.payment_links where id = p_id for update;
  if not found then
    return;
  end if;
  v_want := v.status = 'paid' and v.mode = 'live' and v.counts_for_commission and v.commission_owner is not null;
  if not v_want then
    if v.deal_id is not null then
      update public.payment_links set deal_id = null where id = p_id;
      delete from public.deals where id = v.deal_id;
    end if;
    return;
  end if;
  v_amount := coalesce(v.commission_usd, public.payment_link_commission_auto(v));
  v_won := (coalesce(v.paid_at, now()) at time zone public.app_tz())::date;
  if v.deal_id is not null and exists (select 1 from public.deals where id = v.deal_id) then
    update public.deals
       set owner_id = v.commission_owner, amount_usd = v_amount, stage = 'won', won_on = v_won
     where id = v.deal_id;
  else
    insert into public.deals (owner_id, lead_id, title, contact_name, company, email, service, amount_usd, stage, won_on, notes)
    values (v.commission_owner, v.lead_id, format('%s · %s', v.number, coalesce(v.client_company, v.client_name)),
            v.client_name, v.client_company, v.client_email, v.purpose, v_amount, 'won', v_won,
            format('Paid through payment link %s (%s).', v.number, public.money(v.currency, v.total)))
    returning id into v.deal_id;
    update public.payment_links set deal_id = v.deal_id where id = p_id;
  end if;
  update public.payment_links
     set commission_fx = case v.currency when 'GBP' then (select gbp_to_usd from public.settings) else 1 end
   where id = p_id and commission_fx is null;
end
$$;

-- -----------------------------------------------------------------------------
-- Server only (Netlify functions with the secret key): PayPal told us something.
-- -----------------------------------------------------------------------------
create or replace function public.payment_link_paid(
  p_id bigint, p_status text, p_mode text, p_order text, p_capture text,
  p_payer_name text, p_payer_email text, p_amount numeric, p_currency text,
  p_fee numeric, p_net numeric, p_paid_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
  v_was text;
begin
  select * into v from public.payment_links where id = p_id for update;
  if not found then
    raise exception 'No payment link %', p_id;
  end if;
  v_was := v.status;
  if p_status not in ('paid', 'pending') then
    raise exception 'Unknown status %', p_status;
  end if;
  if v.status in ('paid', 'refunded') or (v.status = 'pending' and p_status = 'pending') then
    return jsonb_build_object('changed', false, 'status', v.status);
  end if;
  if upper(p_currency) <> v.currency or p_amount <> v.total then
    perform public.notify_admins('payment.mismatch', format('Check payment %s', v.number),
      format('PayPal reported %s but the invoice is for %s.', public.money(upper(p_currency), p_amount), public.money(v.currency, v.total)),
      '/payments?link=' || v.id, 'danger', jsonb_build_object('link_id', v.id));
  end if;

  update public.payment_links set
    status = p_status, mode = p_mode, paypal_order_id = coalesce(p_order, paypal_order_id),
    paypal_capture_id = coalesce(p_capture, paypal_capture_id),
    payer_name = coalesce(p_payer_name, payer_name), payer_email = coalesce(p_payer_email, payer_email),
    paid_amount = p_amount, paypal_fee = coalesce(p_fee, paypal_fee), net_amount = coalesce(p_net, net_amount),
    paid_at = case when p_status = 'paid' then coalesce(p_paid_at, now()) else paid_at end,
    closed_at = null, closed_by = null
  where id = p_id
  returning * into v;

  if p_status = 'paid' then
    perform public.payment_link_sync_deal(p_id);
    select * into v from public.payment_links where id = p_id;
    if v.created_by is not null then
      perform public.notify(v.created_by, 'payment.paid',
        format('%s paid %s%s', v.client_name, public.money(v.currency, v.total), case when v.mode = 'sandbox' then ' (test)' else '' end),
        format('%s · %s', v.number, v.purpose), '/payments?link=' || v.id, 'celebrate',
        jsonb_build_object('link_id', v.id));
    end if;
    -- With a deal, the deal's own "closed" alert tells the admins.
    if v.deal_id is null then
      perform public.notify_admins('payment.paid',
        format('Payment received: %s%s', public.money(v.currency, v.total), case when v.mode = 'sandbox' then ' (test)' else '' end),
        format('%s · %s · %s', v.number, v.client_name, v.purpose), '/payments?link=' || v.id, 'success',
        jsonb_build_object('link_id', v.id));
    end if;
  elsif v.created_by is not null then
    perform public.notify(v.created_by, 'payment.pending', format('%s is paying %s', v.client_name, v.number),
      'PayPal is still clearing it. It will turn paid on its own.', '/payments?link=' || v.id, 'info',
      jsonb_build_object('link_id', v.id));
  end if;
  return jsonb_build_object('changed', true, 'status', v.status, 'was', v_was);
end
$$;

-- A payment PayPal was clearing didn't go through: the link is open again.
create or replace function public.payment_link_failed(p_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  update public.payment_links set status = 'open', paid_at = null, paid_amount = null
   where id = p_id and status = 'pending'
  returning * into v;
  if found and v.created_by is not null then
    perform public.notify(v.created_by, 'payment.failed', format('%s''s payment on %s didn''t go through', v.client_name, v.number),
      coalesce(p_reason, 'PayPal declined it. The link is open again.'), '/payments?link=' || v.id, 'danger',
      jsonb_build_object('link_id', v.id));
  end if;
end
$$;

create or replace function public.payment_link_refunded(p_capture text, p_refund_id text, p_amount numeric, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  select * into v from public.payment_links where paypal_capture_id = p_capture for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if v.refunds @> jsonb_build_array(jsonb_build_object('id', p_refund_id)) then
    return jsonb_build_object('found', true, 'changed', false);
  end if;
  update public.payment_links set
    refunds = refunds || jsonb_build_array(jsonb_build_object('id', p_refund_id, 'amount', p_amount, 'at', now(), 'reason', p_reason)),
    refunded_amount = refunded_amount + p_amount,
    status = case when refunded_amount + p_amount >= total then 'refunded' else status end
  where id = v.id
  returning * into v;
  if v.status = 'refunded' then
    perform public.payment_link_sync_deal(v.id);
  end if;
  perform public.notify_admins('payment.refunded',
    format('%s refunded on %s', public.money(v.currency, p_amount), v.number),
    case when v.status = 'refunded' then 'Fully refunded: it no longer counts for commission.'
         else 'Part refund. Check the commission on this payment.' end,
    '/payments?link=' || v.id, 'warning', jsonb_build_object('link_id', v.id));
  if v.created_by is not null and not exists (select 1 from public.profiles where id = v.created_by and role = 'admin') then
    perform public.notify(v.created_by, 'payment.refunded', format('%s refunded on %s', public.money(v.currency, p_amount), v.number),
      v.client_name, '/payments?link=' || v.id, 'warning', jsonb_build_object('link_id', v.id));
  end if;
  return jsonb_build_object('found', true, 'changed', true, 'status', v.status);
end
$$;

create or replace function public.payment_link_disputed(p_capture text, p_open boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.payment_links;
begin
  update public.payment_links set disputed = p_open where paypal_capture_id = p_capture and disputed <> p_open
  returning * into v;
  if found then
    perform public.notify_admins('payment.dispute',
      case when p_open then format('Dispute opened on %s', v.number) else format('Dispute closed on %s', v.number) end,
      coalesce(p_reason, v.client_name) || ' · answer it in PayPal → Resolution Center',
      '/payments?link=' || v.id, case when p_open then 'danger' else 'info' end, jsonb_build_object('link_id', v.id));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- What the client sees (anyone holding the link's code)
-- -----------------------------------------------------------------------------
create or replace function public.payment_link_public(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'code', l.code, 'brand', l.brand, 'number', l.number, 'status', l.status, 'mode', l.mode,
    'client_name', l.client_name, 'client_company', l.client_company, 'client_email', l.client_email,
    'purpose', l.purpose, 'items', l.items, 'currency', l.currency, 'discount', l.discount,
    'tax_label', l.tax_label, 'tax_rate', l.tax_rate, 'subtotal', l.subtotal, 'tax_amount', l.tax_amount,
    'total', l.total, 'note', l.note, 'due_on', l.due_on, 'created_at', l.created_at,
    'paid_at', l.paid_at, 'paid_amount', l.paid_amount, 'payer_name', l.payer_name,
    'reference', l.paypal_capture_id, 'refunded_amount', l.refunded_amount,
    'prepared_by', (select full_name from public.profiles where id = l.created_by))
    from public.payment_links l
   where l.code = p_code
$$;

-- -----------------------------------------------------------------------------
-- Every 10 days: "still waiting — keep it or close it?"
-- -----------------------------------------------------------------------------
create or replace function public.payment_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_body text;
begin
  for r in
    select l.*, p.is_active as maker_active
      from public.payment_links l
      left join public.profiles p on p.id = l.created_by
     where l.status = 'open' and l.next_check_at <= now()
     for update of l skip locked
  loop
    v_body := format('%s · %s, unpaid for %s days. Keep it open or close it?',
                     r.client_name, public.money(r.currency, r.total), extract(day from now() - r.created_at)::int);
    if r.created_by is not null and r.maker_active then
      perform public.notify(r.created_by, 'payment.check', format('Still waiting on %s', r.number), v_body,
        '/payments?link=' || r.id, 'warning', jsonb_build_object('link_id', r.id));
    else
      perform public.notify_admins('payment.check', format('Still waiting on %s', r.number), v_body,
        '/payments?link=' || r.id, 'warning', jsonb_build_object('link_id', r.id));
    end if;
    update public.payment_links set asked_at = now(), next_check_at = now() + interval '10 days' where id = r.id;
  end loop;
end
$$;

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
  perform public.project_sweep();
  perform public.lead_recycle_sweep();
  perform public.game_sweep();
  perform public.payment_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke execute on function public.create_payment_link(jsonb) from public, anon;
revoke execute on function public.update_payment_link(bigint, jsonb) from public, anon;
revoke execute on function public.keep_payment_link(bigint) from public, anon;
revoke execute on function public.close_payment_link(bigint) from public, anon;
revoke execute on function public.set_payment_commission(bigint, boolean, uuid, numeric) from public, anon;
revoke execute on function public.can_take_payments() from public, anon;
grant execute on function public.create_payment_link(jsonb) to authenticated;
grant execute on function public.update_payment_link(bigint, jsonb) to authenticated;
grant execute on function public.keep_payment_link(bigint) to authenticated;
grant execute on function public.close_payment_link(bigint) to authenticated;
grant execute on function public.set_payment_commission(bigint, boolean, uuid, numeric) to authenticated;
grant execute on function public.can_take_payments() to authenticated;

revoke execute on function public.payment_link_sync_deal(bigint) from public, anon, authenticated;
revoke execute on function public.payment_link_commission_auto(public.payment_links) from public, anon, authenticated;
revoke execute on function public.payment_link_paid(bigint, text, text, text, text, text, text, numeric, text, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke execute on function public.payment_link_failed(bigint, text) from public, anon, authenticated;
revoke execute on function public.payment_link_refunded(text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.payment_link_disputed(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.payment_sweep() from public, anon, authenticated;
grant execute on function public.payment_link_paid(bigint, text, text, text, text, text, text, numeric, text, numeric, numeric, timestamptz) to service_role;
grant execute on function public.payment_link_failed(bigint, text) to service_role;
grant execute on function public.payment_link_refunded(text, text, numeric, text) to service_role;
grant execute on function public.payment_link_disputed(text, boolean, text) to service_role;

grant execute on function public.payment_link_public(text) to anon, authenticated;

-- The Payments page turns "paid" the moment PayPal confirms.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payment_links;
  end if;
exception when duplicate_object then
  null;
end
$$;

-- The menu's badge: links the caller made that are waiting on "keep or close?".
create or replace function public.payment_links_to_decide()
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.payment_links
   where created_by = auth.uid() and status = 'open' and asked_at is not null and (kept_at is null or asked_at > kept_at)
$$;
revoke execute on function public.payment_links_to_decide() from public, anon;
grant execute on function public.payment_links_to_decide() to authenticated;
