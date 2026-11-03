-- Text follow-ups: a 2nd and 3rd text for people who haven't answered, sent a few days
-- apart. The follow-up messages are written outside the CRM (a bot fills in a sheet) and
-- an admin uploads them; the rep sees each one on the Texts page when it's due and
-- ticks it once sent. Anyone who replied or opted out gets no more follow-ups.

alter table public.text_kit
  add column if not exists followup_2 text,
  add column if not exists followup_3 text,
  add column if not exists touch2_at timestamptz,
  add column if not exists touch3_at timestamptz;

/**
 * Tick what happened with one text: texted, replied, opted_out, touch2 / touch3 (that
 * follow-up was sent), or reset (undo the last step: the latest follow-up if there is
 * one, otherwise back to "to text").
 */
create or replace function public.text_kit_mark(p_id bigint, p_status text)
returns public.text_kit
language plpgsql security definer set search_path = public
as $$
declare
  r public.text_kit;
begin
  select * into r from public.text_kit where id = p_id for update;
  if not found or not (r.owner_id = auth.uid() or public.is_admin()) then
    raise exception 'Not your text kit' using errcode = '42501';
  end if;
  if p_status = 'texted' then
    if r.status = 'opted_out' then
      raise exception 'They opted out. Don''t text them again.' using errcode = '22023';
    end if;
    update public.text_kit set status = 'texted', texted_at = coalesce(texted_at, now()), replied_at = null
     where id = p_id returning * into r;
  elsif p_status = 'replied' then
    update public.text_kit set status = 'replied', replied_at = now(), texted_at = coalesce(texted_at, now()), opted_out_at = null
     where id = p_id returning * into r;
  elsif p_status = 'opted_out' then
    update public.text_kit set status = 'opted_out', opted_out_at = now()
     where id = p_id returning * into r;
  elsif p_status in ('touch2', 'touch3') then
    if r.status <> 'texted' then
      raise exception 'Only people who haven''t replied get follow-ups' using errcode = '22023';
    end if;
    if p_status = 'touch2' then
      if r.followup_2 is null then
        raise exception 'There''s no 2nd text written for them yet' using errcode = '22023';
      end if;
      update public.text_kit set touch2_at = coalesce(touch2_at, now()) where id = p_id returning * into r;
    else
      if r.touch2_at is null then
        raise exception 'Send the 2nd text first' using errcode = '22023';
      end if;
      if r.followup_3 is null then
        raise exception 'There''s no 3rd text written for them yet' using errcode = '22023';
      end if;
      update public.text_kit set touch3_at = coalesce(touch3_at, now()) where id = p_id returning * into r;
    end if;
  elsif p_status = 'reset' then
    if r.status = 'texted' and r.touch3_at is not null then
      update public.text_kit set touch3_at = null where id = p_id returning * into r;
    elsif r.status = 'texted' and r.touch2_at is not null then
      update public.text_kit set touch2_at = null where id = p_id returning * into r;
    else
      update public.text_kit set status = 'to_text', texted_at = null, replied_at = null, opted_out_at = null, touch2_at = null, touch3_at = null
       where id = p_id returning * into r;
    end if;
  else
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  return r;
end
$$;
revoke execute on function public.text_kit_mark(bigint, text) from public, anon;
grant execute on function public.text_kit_mark(bigint, text) to authenticated;

/**
 * Load follow-ups from a filled sheet. Each row: {id?, phone?, followup_2?, followup_3?,
 * said_no?}. Rows are matched by id, or by phone when there's no id. A blank follow-up
 * leaves the one already saved; "said no" opts them out so they're never texted again.
 * Admin only. Returns how many rows were matched, updated and opted out.
 */
create or replace function public.text_kit_followups(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  x jsonb;
  k public.text_kit;
  v_id bigint;
  v_digits text;
  f2 text;
  f3 text;
  said boolean;
  n_matched int := 0;
  n_written int := 0;
  n_no int := 0;
  missing jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can load follow-ups' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5000 rows at a time' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    v_id := nullif(regexp_replace(coalesce(x->>'id', ''), '\D', '', 'g'), '')::bigint;
    v_digits := right(regexp_replace(coalesce(x->>'phone', ''), '\D', '', 'g'), 10);
    k := null;
    if v_id is not null then
      select * into k from public.text_kit where id = v_id for update;
    end if;
    if k.id is null and length(v_digits) = 10 then
      select * into k from public.text_kit where right(phone, 10) = v_digits order by id desc limit 1 for update;
    end if;
    if k.id is null then
      missing := missing || jsonb_build_array(coalesce(x->>'id', x->>'phone', '?'));
      continue;
    end if;
    n_matched := n_matched + 1;
    f2 := nullif(btrim(replace(coalesce(x->>'followup_2', ''), E'\r', '')), '');
    f3 := nullif(btrim(replace(coalesce(x->>'followup_3', ''), E'\r', '')), '');
    said := coalesce((x->>'said_no')::boolean, false);
    if f2 is not null or f3 is not null then
      update public.text_kit set followup_2 = coalesce(f2, followup_2), followup_3 = coalesce(f3, followup_3) where id = k.id;
      n_written := n_written + 1;
    end if;
    if said and k.status <> 'opted_out' then
      update public.text_kit set status = 'opted_out', opted_out_at = now(), texted_at = coalesce(texted_at, now()) where id = k.id;
      n_no := n_no + 1;
    end if;
  end loop;
  return jsonb_build_object('matched', n_matched, 'written', n_written, 'said_no', n_no, 'not_found', missing);
end
$$;
revoke execute on function public.text_kit_followups(jsonb) from public, anon;
grant execute on function public.text_kit_followups(jsonb) to authenticated;

-- The Team page counts follow-ups too, so a rep working through them doesn't look idle.
drop function if exists public.team_activity(date, date);
create function public.team_activity(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb, role public.app_role, daily_target int,
  dials bigint, connected bigint, meetings_booked bigint, prospects bigint, last_call_at timestamptz,
  texts_sent bigint, texts_replied bigint, texts_opted_out bigint, texts_left bigint, texts_total bigint, last_text_at timestamptz,
  followups_sent bigint, outcomes jsonb, daily jsonb
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_start timestamptz := public.team_day_start(p_from);
  v_end timestamptz := public.team_day_start(p_to + 1);
begin
  if not public.sees_team() then
    raise exception 'Only admins and sales leads can see the team' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a range of up to a year' using errcode = '22023';
  end if;
  return query
  with people as (
    select p.id, p.full_name, p.avatar, p.role
      from public.profiles p
     where p.is_active and (p.role in ('sales', 'setter') or exists (select 1 from public.text_kit k where k.owner_id = p.id))
  ),
  calls as (
    select a.rep_id, public.team_day(a.created_at) as day, a.outcome, a.created_at, coalesce(o.connected, false) as connected
      from public.lead_attempts a
      left join public.lead_outcomes o on o.key = a.outcome
     where a.action = 'call' and a.created_at >= v_start and a.created_at < v_end
       and a.rep_id in (select id from people)
  ),
  texts as (
    select k.owner_id, k.status, k.texted_at, public.team_day(k.texted_at) as sent_on
      from public.text_kit k
     where k.owner_id in (select id from people)
  ),
  followups as (
    select k.owner_id, public.team_day(t.at) as sent_on, t.at
      from public.text_kit k
      cross join lateral (values (k.touch2_at), (k.touch3_at)) t(at)
     where t.at is not null and k.owner_id in (select id from people)
  ),
  days as (select g::date as d from generate_series(p_from, p_to, interval '1 day') g)
  select pe.id, pe.full_name, pe.avatar, pe.role, e.daily_dial_target,
         (select count(*) from calls c where c.rep_id = pe.id),
         (select count(*) from calls c where c.rep_id = pe.id and c.connected),
         (select count(*) from public.meetings m where m.owner_id = pe.id and m.created_at >= v_start and m.created_at < v_end),
         (select count(*) from public.deals d where d.owner_id = pe.id and d.created_at >= v_start and d.created_at < v_end),
         (select max(a.created_at) from public.lead_attempts a where a.rep_id = pe.id and a.action = 'call'),
         (select count(*) from texts t where t.owner_id = pe.id and t.sent_on between p_from and p_to),
         -- Replies and opt-outs are counted against the texts sent in the range, so the reply
         -- rate reads as "of the texts sent, how many answered".
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'replied' and t.sent_on between p_from and p_to),
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'opted_out' and t.sent_on between p_from and p_to),
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'to_text'),
         (select count(*) from texts t where t.owner_id = pe.id),
         (select max(x) from (select max(t.texted_at) x from texts t where t.owner_id = pe.id
                              union all select max(f.at) from followups f where f.owner_id = pe.id) m),
         (select count(*) from followups f where f.owner_id = pe.id and f.sent_on between p_from and p_to),
         (select coalesce(jsonb_agg(jsonb_build_object('outcome', x.outcome, 'label', coalesce(o.short_label, x.outcome, 'No outcome'),
                    'tone', coalesce(o.tone, 'neutral'), 'count', x.n) order by x.n desc), '[]'::jsonb)
            from (select c.outcome, count(*) n from calls c where c.rep_id = pe.id group by c.outcome) x
            left join public.lead_outcomes o on o.key = x.outcome),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', dd.d,
                    'dials', (select count(*) from calls c where c.rep_id = pe.id and c.day = dd.d),
                    'connected', (select count(*) from calls c where c.rep_id = pe.id and c.connected and c.day = dd.d),
                    'texts', (select count(*) from texts t where t.owner_id = pe.id and t.sent_on = dd.d),
                    'followups', (select count(*) from followups f where f.owner_id = pe.id and f.sent_on = dd.d)
                  ) order by dd.d), '[]'::jsonb) from days dd)
    from people pe
    left join public.employment e on e.profile_id = pe.id
   order by pe.full_name;
end
$$;
revoke execute on function public.team_activity(date, date) from public, anon;
grant execute on function public.team_activity(date, date) to authenticated;
