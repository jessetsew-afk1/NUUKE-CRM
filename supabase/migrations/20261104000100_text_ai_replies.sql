-- AI reply assistant for texts. When a prospect answers a text, the setter pastes their
-- reply into the CRM and gets a suggested answer back (netlify/functions/reply-assist).
-- Every message in the conversation is kept here, so each suggestion knows the whole
-- history with that prospect, and the admin can read every conversation.
--
-- The suggestions follow a playbook the admin writes and edits on the Texts page.

create table public.text_thread (
  id          bigint generated always as identity primary key,
  kit_id      bigint not null references public.text_kit (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('them', 'us', 'ai')),  -- them: the prospect; us: what we sent; ai: a suggestion
  body        text not null check (length(btrim(body)) between 1 and 4000),
  intent      text check (intent in ('interested', 'question', 'not_now', 'not_interested', 'stop', 'wrong_person', 'other')),
  next_step   text,
  created_at  timestamptz not null default now()
);
create index text_thread_kit on public.text_thread (kit_id, created_at);

alter table public.text_thread enable row level security;
create policy text_thread_read on public.text_thread for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.text_kit k where k.id = kit_id and k.owner_id = (select auth.uid())));
revoke all on public.text_thread from anon;
revoke insert, update, delete on public.text_thread from authenticated;

/**
 * Add one message to a prospect's conversation. Only the person whose kit it is (or an
 * admin) can. A reply from them marks the text Replied, so it drops out of follow-ups.
 */
create or replace function public.text_thread_add(
  p_kit bigint, p_kind text, p_body text, p_intent text default null, p_next_step text default null
)
returns public.text_thread
language plpgsql security definer set search_path = public
as $$
declare
  k public.text_kit;
  t public.text_thread;
begin
  select * into k from public.text_kit where id = p_kit for update;
  if not found or not (k.owner_id = auth.uid() or public.is_admin()) then
    raise exception 'Not your text kit' using errcode = '42501';
  end if;
  if p_kind not in ('them', 'us', 'ai') then
    raise exception 'Unknown message kind %', p_kind using errcode = '22023';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'The message is empty' using errcode = '22023';
  end if;
  insert into public.text_thread (kit_id, author_id, kind, body, intent, next_step)
  values (p_kit, auth.uid(), p_kind, btrim(replace(p_body, E'\r', '')), p_intent, nullif(btrim(p_next_step), ''))
  returning * into t;
  if p_kind = 'them' and k.status in ('to_text', 'texted') then
    update public.text_kit
       set status = 'replied', replied_at = now(), texted_at = coalesce(texted_at, now())
     where id = p_kit;
  end if;
  return t;
end
$$;
revoke execute on function public.text_thread_add(bigint, text, text, text, text) from public, anon;
grant execute on function public.text_thread_add(bigint, text, text, text, text) to authenticated;

-- The playbook: one shared set of instructions for every suggestion.
create table public.ai_playbook (
  id          int primary key default 1 check (id = 1),
  body        text not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.ai_playbook enable row level security;
create policy ai_playbook_read on public.ai_playbook for select to authenticated using (true);
revoke all on public.ai_playbook from anon;
revoke insert, update, delete on public.ai_playbook from authenticated;

insert into public.ai_playbook (id, body) values (1, btrim($playbook$
Who we are: NUUKE, a small team led by Isaiah that builds websites, apps, logos and branding, and runs social media, SEO and marketing for small businesses.

Who we're texting: people who posted on Bark or Facebook asking for help with one of those. We texted them first, months after their post, with one free offer (a homepage mockup, logo concepts, a brand board, a 2-week post plan, a free Google check, a storyboard).

The goal of every reply: get them on a short call with Isaiah (15 minutes, phone or Zoom). Do the free thing if it helps get there.

How we write:
- Short, friendly, plain words, like a person texting. One or two sentences, usually under 300 characters.
- Answer what they actually said first, then one clear next step or question.
- Use their first name when we know it. Sign off as the sender only if it fits.
- No links, no emojis unless they used them, no pressure, no "just checking in".

Prices: never quote a price or a range by text. Say it depends on what they need and Isaiah can give them real numbers on a quick call.

If they ask who this is or how we got their number: we saw their post on Bark or Facebook asking for help with their project.

If they're interested: offer two specific times for a quick call with Isaiah (e.g. "tomorrow at 11 or 2, your time?"), or ask what time works.

If they already found someone or the timing is wrong: be gracious, ask if it's okay to check back in a few months, and stop there.

If they say no, not interested, or to stop: reply once, politely, without selling ("No problem, I won't text again. Good luck with the project!"). If they say STOP or anything like it, don't reply at all.

If they write in Spanish, reply in Spanish.
$playbook$, E' \n'));

/** Save the playbook. Admin only. */
create or replace function public.ai_playbook_save(p_body text)
returns public.ai_playbook
language plpgsql security definer set search_path = public
as $$
declare
  r public.ai_playbook;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the playbook' using errcode = '42501';
  end if;
  if p_body is null or length(btrim(p_body)) < 20 then
    raise exception 'The playbook is empty' using errcode = '22023';
  end if;
  insert into public.ai_playbook (id, body, updated_by, updated_at)
  values (1, btrim(p_body), auth.uid(), now())
  on conflict (id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into r;
  return r;
end
$$;
revoke execute on function public.ai_playbook_save(text) from public, anon;
grant execute on function public.ai_playbook_save(text) to authenticated;
