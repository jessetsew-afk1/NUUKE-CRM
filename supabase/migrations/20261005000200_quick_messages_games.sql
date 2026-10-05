-- =============================================================================
-- NUUKE CRM — each rep's own quick messages, and mini games for break time
--
-- Quick messages: short texts a rep writes once and copies into Zoom Phone on
-- any lead. Only the person who wrote them can see or change them.
--
-- Mini games: Tic-Tac-Toe, Checkers, Chess and Ludo against teammates. They
-- only open while you're on a break: you can invite anyone, but every move
-- (and accepting an invite) needs you to be on a break at that moment. A game
-- simply waits between breaks. Admins aren't on the clock, so they can always
-- play. The boards are worked out in the browser; the database decides whose
-- turn it is, rolls the Ludo dice and keeps the score.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Quick messages
-- -----------------------------------------------------------------------------
create table public.quick_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 80),
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  position    int not null default 0,
  uses        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index quick_messages_user on public.quick_messages (user_id, position, id);

alter table public.quick_messages enable row level security;
create policy quick_messages_own on public.quick_messages for all to authenticated
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());

create or replace function public.quick_messages_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and (select count(*) from public.quick_messages where user_id = new.user_id) >= 100 then
    raise exception 'You can keep up to 100 quick messages. Delete one you don''t use first.';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'Quick messages stay with the person who wrote them';
  end if;
  return new;
end
$$;
create trigger quick_messages_guard before insert or update on public.quick_messages
  for each row execute function public.quick_messages_guard();

-- Counts copies, so the ones a rep uses most can float to the top.
create or replace function public.quick_message_used(p_id bigint)
returns void
language sql security invoker set search_path = public
as $$
  update public.quick_messages set uses = uses + 1 where id = p_id and user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Mini games
-- -----------------------------------------------------------------------------
create table public.games (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('tictactoe', 'checkers', 'chess', 'ludo')),
  status       text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  host_id      uuid not null references public.profiles (id) on delete cascade,
  state        jsonb not null default '{}'::jsonb,
  turn_user    uuid references public.profiles (id) on delete set null,
  version      int not null default 0,
  last_roll    smallint check (last_roll between 1 and 6),
  winner_id    uuid references public.profiles (id) on delete set null,
  result       text check (result in ('win', 'draw', 'resigned', 'abandoned')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index games_open on public.games (status, updated_at);

create table public.game_players (
  game_id       bigint not null references public.games (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  seat          smallint not null check (seat between 0 and 3),
  status        text not null default 'invited' check (status in ('invited', 'joined', 'declined', 'left')),
  invited_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (game_id, user_id),
  unique (game_id, seat)
);
create index game_players_user on public.game_players (user_id, game_id desc);

alter table public.games        enable row level security;
alter table public.game_players enable row level security;

create or replace function public.in_game(p_game bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.game_players where game_id = p_game and user_id = auth.uid())
$$;

-- Players see their own games; admin sees all. Every change goes through the functions below.
create policy games_read on public.games for select to authenticated
  using (public.in_game(id) or public.is_admin());
create policy game_players_read on public.game_players for select to authenticated
  using (public.in_game(game_id) or public.is_admin());

-- Break time is game time. Admins aren't on the clock, so they're always free.
create or replace function public.can_play(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select p.role = 'admin'
           or exists (select 1 from public.attendance_breaks b where b.profile_id = p.id and b.ended_at is null)
      from public.profiles p
     where p.id = p_user and p.is_active and p.role in ('admin', 'sales', 'production')
  ), false)
$$;

-- Who's on a break right now, so you can see who's free to play.
create or replace function public.players_on_break()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select b.profile_id
    from public.attendance_breaks b
    join public.profiles p on p.id = b.profile_id and p.is_active
   where b.ended_at is null and public.is_staff()
$$;

create or replace function public.game_label(p_kind text)
returns text
language sql immutable
as $$
  select case p_kind when 'tictactoe' then 'Tic-Tac-Toe' when 'checkers' then 'Checkers'
                     when 'chess' then 'Chess' when 'ludo' then 'Ludo' else p_kind end
$$;

create or replace function public.first_name(p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'A teammate') from public.profiles where id = p_user
$$;

-- Start a game and invite teammates (one for two-player games, up to three for Ludo).
create or replace function public.game_create(p_kind text, p_invitees uuid[], p_state jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_n int := coalesce(array_length(p_invitees, 1), 0);
  v_max int := case p_kind when 'ludo' then 3 else 1 end;
  v_inv uuid;
  v_seat int := 0;
begin
  if not public.is_staff() then
    raise exception 'Games are for the team';
  end if;
  if p_kind not in ('tictactoe', 'checkers', 'chess', 'ludo') then
    raise exception 'Unknown game';
  end if;
  if not public.can_play(v_uid) then
    raise exception 'Games open on your break. Start a break first, then invite someone.';
  end if;
  if v_n < 1 or v_n > v_max then
    raise exception '%', case when v_max = 1 then 'Pick one teammate to play with' else 'Pick one to three teammates for Ludo' end;
  end if;
  if (select count(distinct u) from unnest(p_invitees) u) <> v_n then
    raise exception 'Each teammate can only be invited once';
  end if;
  if v_uid = any (p_invitees) then
    raise exception 'You can''t invite yourself';
  end if;
  if exists (select 1 from unnest(p_invitees) u
              where not exists (select 1 from public.profiles p
                                 where p.id = u and p.is_active and p.role in ('admin', 'sales', 'production'))) then
    raise exception 'You can only invite active teammates';
  end if;
  if (select count(*) from public.games g
        join public.game_players gp on gp.game_id = g.id and gp.user_id = v_uid and gp.status in ('invited', 'joined')
       where g.status in ('waiting', 'active')) >= 12 then
    raise exception 'You have a lot of games going. Finish or leave one first.';
  end if;

  insert into public.games (kind, host_id, state) values (p_kind, v_uid, coalesce(p_state, '{}'::jsonb))
  returning id into v_id;
  insert into public.game_players (game_id, user_id, seat, status, responded_at) values (v_id, v_uid, 0, 'joined', now());
  foreach v_inv in array p_invitees loop
    v_seat := v_seat + 1;
    insert into public.game_players (game_id, user_id, seat) values (v_id, v_inv, v_seat);
    perform public.notify(v_inv, 'game.invite',
      format('%s wants to play %s', public.first_name(v_uid), public.game_label(p_kind)),
      'Games open on your break. Join from Mini Games when you take one.',
      '/games?game=' || v_id, 'info', jsonb_build_object('game_id', v_id));
  end loop;
  return v_id;
end
$$;

-- Accept or decline an invite. Two-player games start the moment the guest joins.
create or replace function public.game_respond(p_game_id bigint, p_accept boolean)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_me public.game_players;
  v_joined int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'waiting' then
    raise exception 'This invite has expired';
  end if;
  select * into v_me from public.game_players where game_id = p_game_id and user_id = v_uid;
  if not found or v_me.status <> 'invited' then
    raise exception 'There''s no invite to answer here';
  end if;

  if p_accept then
    if not public.can_play(v_uid) then
      raise exception 'Games open on your break. Start a break, then join.';
    end if;
    update public.game_players set status = 'joined', responded_at = now() where game_id = p_game_id and user_id = v_uid;
    perform public.notify(v_game.host_id, 'game.joined',
      format('%s joined your %s game', public.first_name(v_uid), public.game_label(v_game.kind)),
      case when v_game.kind = 'ludo' then 'Start the game when everyone''s in.' else 'You go first.' end,
      '/games?game=' || p_game_id, 'success', jsonb_build_object('game_id', p_game_id));
    if v_game.kind <> 'ludo' then
      update public.games set status = 'active', started_at = now(), turn_user = host_id,
                              version = version + 1, updated_at = now()
       where id = p_game_id returning * into v_game;
    end if;
  else
    update public.game_players set status = 'declined', responded_at = now() where game_id = p_game_id and user_id = v_uid;
    perform public.notify(v_game.host_id, 'game.declined',
      format('%s can''t play %s right now', public.first_name(v_uid), public.game_label(v_game.kind)),
      null, '/games', 'info', jsonb_build_object('game_id', p_game_id));
    select count(*) into v_joined from public.game_players where game_id = p_game_id and status = 'joined';
    if v_game.kind <> 'ludo'
       or (v_joined < 2 and not exists (select 1 from public.game_players where game_id = p_game_id and status = 'invited')) then
      update public.games set status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1
       where id = p_game_id returning * into v_game;
    end if;
  end if;
  return v_game;
end
$$;

-- Ludo: the host starts once at least one teammate has joined. Anyone still
-- deciding is dropped from this round.
create or replace function public.game_start(p_game_id bigint, p_state jsonb)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  r record;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.host_id <> v_uid then
    raise exception 'Only the person who set up the game can start it';
  end if;
  if v_game.status <> 'waiting' then
    raise exception 'This game has already started';
  end if;
  if not public.can_play(v_uid) then
    raise exception 'Games open on your break. Start a break first.';
  end if;
  if (select count(*) from public.game_players where game_id = p_game_id and status = 'joined') < 2 then
    raise exception 'Wait for at least one teammate to join';
  end if;
  update public.game_players set status = 'declined', responded_at = now()
   where game_id = p_game_id and status = 'invited';
  update public.games set status = 'active', state = coalesce(p_state, state), started_at = now(), turn_user = host_id,
                          version = version + 1, updated_at = now()
   where id = p_game_id returning * into v_game;
  for r in select user_id from public.game_players where game_id = p_game_id and status = 'joined' and user_id <> v_uid loop
    perform public.notify(r.user_id, 'game.started', format('%s started %s', public.first_name(v_uid), public.game_label(v_game.kind)),
      'Your colour is on the board. Play on your break.', '/games?game=' || p_game_id, 'info', jsonb_build_object('game_id', p_game_id));
  end loop;
  return v_game;
end
$$;

-- Ludo dice, rolled here so nobody can pick their own number.
create or replace function public.game_roll(p_game_id bigint)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.kind <> 'ludo' then
    raise exception 'There are no dice in this game';
  end if;
  if v_game.status <> 'active' then
    raise exception 'This game is over';
  end if;
  if v_game.turn_user is distinct from v_uid then
    raise exception 'It''s not your turn';
  end if;
  if not public.can_play(v_uid) then
    raise exception 'Moves only on your break. The game will wait for you.';
  end if;
  if v_game.last_roll is not null then
    return v_game;
  end if;
  update public.games set last_roll = 1 + floor(random() * 6)::int, version = version + 1, updated_at = now()
   where id = p_game_id returning * into v_game;
  return v_game;
end
$$;

-- Make a move. The browser works out the new board; the database checks it's
-- your turn, you're on a break, and nobody moved in between.
create or replace function public.game_move(
  p_game_id bigint, p_version int, p_state jsonb, p_next_user uuid,
  p_result text default null, p_winner uuid default null
) returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  r record;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or not public.in_game(p_game_id) then
    raise exception 'Game not found';
  end if;
  if v_game.status <> 'active' then
    raise exception 'This game is over';
  end if;
  if v_game.turn_user is distinct from v_uid then
    raise exception 'It''s not your turn';
  end if;
  if not public.can_play(v_uid) then
    raise exception 'Moves only on your break. The game will wait for you.';
  end if;
  if v_game.version <> p_version then
    raise exception 'The board changed. It''s been refreshed, try again.';
  end if;
  if v_game.kind = 'ludo' and v_game.last_roll is null then
    raise exception 'Roll the dice first';
  end if;

  if p_result is not null then
    if p_result not in ('win', 'draw') then
      raise exception 'Unknown result';
    end if;
    if p_result = 'win' and not exists (select 1 from public.game_players
                                         where game_id = p_game_id and user_id = p_winner and status = 'joined') then
      raise exception 'The winner has to be one of the players';
    end if;
    update public.games
       set state = p_state, version = version + 1, last_roll = null, turn_user = null,
           status = 'finished', result = p_result, winner_id = case when p_result = 'win' then p_winner end,
           finished_at = now(), updated_at = now()
     where id = p_game_id returning * into v_game;
    for r in select user_id from public.game_players where game_id = p_game_id and status = 'joined' and user_id <> v_uid loop
      perform public.notify(r.user_id, 'game.over',
        case when p_result = 'draw' then format('%s ended in a draw', public.game_label(v_game.kind))
             when p_winner = r.user_id then format('You won %s!', public.game_label(v_game.kind))
             else format('%s won %s', public.first_name(p_winner), public.game_label(v_game.kind)) end,
        null, '/games?game=' || p_game_id, case when p_winner = r.user_id then 'celebrate' else 'info' end,
        jsonb_build_object('game_id', p_game_id));
    end loop;
  else
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_next_user and status = 'joined') then
      raise exception 'The next turn has to go to a player in this game';
    end if;
    update public.games
       set state = p_state, version = version + 1, last_roll = null, turn_user = p_next_user, updated_at = now()
     where id = p_game_id returning * into v_game;
  end if;
  return v_game;
end
$$;

-- Leave: cancel your own invite, decline one, or resign a game in progress.
-- Doesn't need a break, so nobody is stuck in a game.
create or replace function public.game_leave(p_game_id bigint)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_me public.game_players;
  v_left uuid[];
  v_next uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Game not found';
  end if;
  select * into v_me from public.game_players where game_id = p_game_id and user_id = v_uid;
  if not found or v_me.status not in ('invited', 'joined') then
    raise exception 'You''re not in this game';
  end if;
  if v_game.status in ('finished', 'cancelled') then
    return v_game;
  end if;

  if v_game.status = 'waiting' then
    if v_uid = v_game.host_id then
      update public.games set status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1
       where id = p_game_id returning * into v_game;
      return v_game;
    end if;
    if v_me.status = 'invited' then
      return public.game_respond(p_game_id, false);
    end if;
    -- joined a Ludo lobby, then changed their mind
    update public.game_players set status = 'left', responded_at = now() where game_id = p_game_id and user_id = v_uid;
    update public.games set version = version + 1, updated_at = now() where id = p_game_id returning * into v_game;
    return v_game;
  end if;

  update public.game_players set status = 'left', responded_at = now() where game_id = p_game_id and user_id = v_uid;
  select array_agg(user_id order by seat) into v_left from public.game_players where game_id = p_game_id and status = 'joined';
  if coalesce(array_length(v_left, 1), 0) <= 1 then
    update public.games
       set status = 'finished', result = 'resigned', winner_id = v_left[1], turn_user = null, last_roll = null,
           finished_at = now(), updated_at = now(), version = version + 1
     where id = p_game_id returning * into v_game;
    if v_left[1] is not null then
      perform public.notify(v_left[1], 'game.over', format('%s resigned. You won %s!', public.first_name(v_uid), public.game_label(v_game.kind)),
        null, '/games?game=' || p_game_id, 'celebrate', jsonb_build_object('game_id', p_game_id));
    end if;
  else
    -- Ludo carries on without them; if it was their turn, it passes to the next seat
    if v_game.turn_user = v_uid then
      select user_id into v_next from public.game_players
       where game_id = p_game_id and status = 'joined'
       order by (seat - v_me.seat + 4) % 4
       limit 1;
      update public.games set turn_user = v_next, last_roll = null, version = version + 1, updated_at = now()
       where id = p_game_id returning * into v_game;
    else
      update public.games set version = version + 1, updated_at = now() where id = p_game_id returning * into v_game;
    end if;
  end if;
  return v_game;
end
$$;

-- Tidy-up: invites nobody answered in 3 hours lapse; games nobody touched for 7 days end.
create or replace function public.game_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.games set status = 'cancelled', finished_at = now(), updated_at = now(), version = version + 1
   where status = 'waiting' and updated_at < now() - interval '3 hours';
  update public.games set status = 'finished', result = 'abandoned', turn_user = null, last_roll = null,
                          finished_at = now(), updated_at = now(), version = version + 1
   where status = 'active' and updated_at < now() - interval '7 days';
end
$$;
revoke execute on function public.game_sweep() from public, anon, authenticated;

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
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

-- Live boards in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.games;
  end if;
exception when duplicate_object then
  null;
end
$$;
