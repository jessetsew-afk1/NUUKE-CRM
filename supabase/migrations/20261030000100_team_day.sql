-- The Team page's days run 10pm to 10pm US Eastern, so a day never rolls over in the
-- middle of the US afternoon. Anything from 10pm ET on the 29th counts as the 30th.

/** The Team page day an instant belongs to. */
create or replace function public.team_day(p_at timestamptz)
returns date
language sql immutable
as $$ select ((p_at at time zone 'America/New_York') + interval '2 hours')::date $$;

/** When a Team page day starts: 10pm Eastern the evening before. */
create or replace function public.team_day_start(p_day date)
returns timestamptz
language sql immutable
as $$ select (p_day::timestamp - interval '2 hours') at time zone 'America/New_York' $$;

create index if not exists lead_attempts_rep_created on public.lead_attempts (rep_id, created_at);

create or replace function public.team_activity(p_from date, p_to date)
returns table (
  profile_id uuid, full_name text, avatar jsonb, role public.app_role, daily_target int,
  dials bigint, connected bigint, meetings_booked bigint, prospects bigint, last_call_at timestamptz,
  texts_sent bigint, texts_replied bigint, texts_opted_out bigint, texts_left bigint, texts_total bigint, last_text_at timestamptz,
  outcomes jsonb, daily jsonb
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
         (select max(t.texted_at) from texts t where t.owner_id = pe.id),
         (select coalesce(jsonb_agg(jsonb_build_object('outcome', x.outcome, 'label', coalesce(o.short_label, x.outcome, 'No outcome'),
                    'tone', coalesce(o.tone, 'neutral'), 'count', x.n) order by x.n desc), '[]'::jsonb)
            from (select c.outcome, count(*) n from calls c where c.rep_id = pe.id group by c.outcome) x
            left join public.lead_outcomes o on o.key = x.outcome),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', dd.d,
                    'dials', (select count(*) from calls c where c.rep_id = pe.id and c.day = dd.d),
                    'connected', (select count(*) from calls c where c.rep_id = pe.id and c.connected and c.day = dd.d),
                    'texts', (select count(*) from texts t where t.owner_id = pe.id and t.sent_on = dd.d)
                  ) order by dd.d), '[]'::jsonb) from days dd)
    from people pe
    left join public.employment e on e.profile_id = pe.id
   order by pe.full_name;
end
$$;
revoke execute on function public.team_activity(date, date) from public, anon;
grant execute on function public.team_activity(date, date) to authenticated;
