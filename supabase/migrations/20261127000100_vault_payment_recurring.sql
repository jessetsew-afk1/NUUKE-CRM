-- Finance vault: a client payment can be a monthly retainer, so its revenue line repeats and counts toward MRR.

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
         coalesce((e ->> 'recurring')::boolean, false), nullif(e ->> 'note', ''), v_id
    from jsonb_array_elements(p -> 'entries') e
   where (e ->> 'amount')::numeric > 0;
  select to_jsonb(x) into out from public.vault_payments x where x.id = v_id;
  return out;
end $$;
revoke all on function public.vault_save_payment(text, jsonb) from public, anon;
grant execute on function public.vault_save_payment(text, jsonb) to authenticated;
