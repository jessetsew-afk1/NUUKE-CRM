-- Text kits: a hand-picked list of leads for one salesperson to text from Zoom Phone,
-- each with its message ready to paste. The rows are loaded by an admin (SQL); the
-- salesperson only ticks what happened. Two message versions run side by side so we
-- can see which gets more replies.

create table public.text_kit (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  kit           text not null default 'Bark',
  position      int not null default 0,
  name          text not null,
  phone         text not null,                -- +E.164, e.g. +12606673672
  time_zone     text not null,                -- IANA, e.g. America/New_York
  tz_label      text,                         -- "Eastern", "Mountain (Arizona, no daylight saving)"
  tz_note       text,
  posted_on     date,
  asked_for     text,
  version       text not null check (version in ('A', 'B')),
  message       text not null,
  past_notes    text,
  status        text not null default 'to_text' check (status in ('to_text', 'texted', 'replied', 'opted_out')),
  texted_at     timestamptz,
  replied_at    timestamptz,
  opted_out_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index text_kit_owner on public.text_kit (owner_id, kit, position);

create trigger text_kit_touch before update on public.text_kit
  for each row execute function public.touch_updated_at();
create trigger text_kit_audit after insert or update or delete on public.text_kit
  for each row execute function public.audit_row();

alter table public.text_kit enable row level security;
create policy text_kit_read on public.text_kit for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.text_kit from anon;
revoke insert, update, delete on public.text_kit from authenticated;

/** Tick what happened with one text: texted, replied, opted_out, or reset (undo). */
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
  elsif p_status = 'reset' then
    update public.text_kit set status = 'to_text', texted_at = null, replied_at = null, opted_out_at = null
     where id = p_id returning * into r;
  else
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  return r;
end
$$;
revoke execute on function public.text_kit_mark(bigint, text) from public, anon;
grant execute on function public.text_kit_mark(bigint, text) to authenticated;
