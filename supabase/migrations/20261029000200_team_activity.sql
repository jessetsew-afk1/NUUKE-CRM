-- Sales leads: salespeople an admin trusts to watch the team (e.g. Isaiah). They get a
-- Team page with every rep's calls, call outcomes and Zoom texts. Nothing else about
-- other reps opens up to them (leads, deals and pay stay private).

alter table public.profiles add column if not exists is_sales_lead boolean not null default false;

-- Only an admin decides who is a technical manager or a sales lead.
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
       or new.is_technical_manager is distinct from old.is_technical_manager
       or new.is_sales_lead is distinct from old.is_sales_lead then
      raise exception 'Only an admin can change that' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

/** Admins, and active salespeople marked as sales leads. */
create or replace function public.sees_team()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'admin' or (role = 'sales' and is_sales_lead)
                     from public.profiles where id = auth.uid() and is_active), false)
$$;
revoke execute on function public.sees_team() from public, anon;
grant execute on function public.sees_team() to authenticated;

/**
 * Each rep's calls and texts for a date range (days in the company time zone, the same
 * days the dialer counts). Covers active salespeople and setters, plus anyone holding
 * text kit leads.
 */
create or replace function public.team_activity(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb, role public.app_role, daily_target int,
  dials bigint, connected bigint, meetings_booked bigint, prospects bigint, last_call_at timestamptz,
  texts_sent bigint, texts_replied bigint, texts_opted_out bigint, texts_left bigint, texts_total bigint, last_text_at timestamptz,
  outcomes jsonb, daily jsonb
)
language plpgsql stable security definer set search_path = public
as $$
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
    select a.rep_id, a.work_date, a.outcome, a.created_at, coalesce(o.connected, false) as connected
      from public.lead_attempts a
      left join public.lead_outcomes o on o.key = a.outcome
     where a.action = 'call' and a.work_date between p_from and p_to
       and a.rep_id in (select id from people)
  ),
  texts as (
    select k.owner_id, k.status, k.texted_at, k.replied_at, k.opted_out_at,
           (k.texted_at at time zone public.app_tz())::date as sent_on
      from public.text_kit k
     where k.owner_id in (select id from people)
  ),
  days as (select g::date as d from generate_series(p_from, p_to, interval '1 day') g)
  select pe.id, pe.full_name, pe.avatar, pe.role, e.daily_dial_target,
         (select count(*) from calls c where c.rep_id = pe.id),
         (select count(*) from calls c where c.rep_id = pe.id and c.connected),
         (select count(*) from public.meetings m where m.owner_id = pe.id
            and (m.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select count(*) from public.deals d where d.owner_id = pe.id
            and (d.created_at at time zone public.app_tz())::date between p_from and p_to),
         (select max(a.created_at) from public.lead_attempts a where a.rep_id = pe.id and a.action = 'call'),
         (select count(*) from texts t where t.owner_id = pe.id and t.sent_on between p_from and p_to),
         -- Replies and opt-outs are counted against the texts sent in the range, so the reply
         -- rate reads as "of the texts sent, how many answered".
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'replied' and t.sent_on between p_from and p_to),
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'opted_out' and t.sent_on between p_from and p_to),
         (select count(*) from texts t where t.owner_id = pe.id and t.status = 'to_text'),
         (select count(*) from texts t where t.owner_id = pe.id),
         (select max(t.texted_at) from texts t where t.owner_id = pe.id),
         (select coalesce(jsonb_agg(jsonb_build_object('outcome', x.outcome, 'label', coalesce(o.short_label, x.outcome, 'No outcome'),
                    'tone', coalesce(o.tone, 'neutral'), 'count', x.n) order by x.n desc), '[]'::jsonb)
            from (select c.outcome, count(*) n from calls c where c.rep_id = pe.id group by c.outcome) x
            left join public.lead_outcomes o on o.key = x.outcome),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', dd.d,
                    'dials', (select count(*) from calls c where c.rep_id = pe.id and c.work_date = dd.d),
                    'connected', (select count(*) from calls c where c.rep_id = pe.id and c.connected and c.work_date = dd.d),
                    'texts', (select count(*) from texts t where t.owner_id = pe.id and t.sent_on = dd.d)
                  ) order by dd.d), '[]'::jsonb) from days dd)
    from people pe
    left join public.employment e on e.profile_id = pe.id
   order by pe.full_name;
end
$$;
revoke execute on function public.team_activity(date, date) from public, anon;
grant execute on function public.team_activity(date, date) to authenticated;
