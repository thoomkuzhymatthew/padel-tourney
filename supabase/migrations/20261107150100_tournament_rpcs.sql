-- All mutation paths lock the tournament first, keeping authorization and state
-- checks in the same transaction as the write.
create function private.lock_tournament(p_share_id text, p_admin_token text default null, p_admin boolean default false)
returns public.tournaments language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  select * into t from public.tournaments where share_id = p_share_id for update;
  if t.id is null then raise exception 'Tournament not found' using errcode = 'P0002'; end if;
  if p_admin and (p_admin_token is null or not exists (
    select 1 from private.tournament_secrets s where s.tournament_id = t.id
      and s.admin_token_hash = extensions.digest(p_admin_token, 'sha256')
  )) then raise exception 'Invalid admin token' using errcode = '42501'; end if;
  return t;
end $$;

create function private.assert_active(t public.tournaments) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if t.status <> 'active' then raise exception 'Tournament has ended'; end if;
end $$;

create function private.assert_between_rounds(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.rounds r where r.tournament_id = p_tournament_id
    and r.number = (select max(number) from public.rounds where tournament_id = p_tournament_id)
    and r.status <> 'complete') then raise exception 'Finish the current round before changing players'; end if;
end $$;

-- Accepts the exact snapshot shape produced by the pure TypeScript generator.
-- Every eligible player must occur exactly once, either on a court or sitting out.
create function private.insert_round(p_tournament_id uuid, p_number integer, p_target integer, p_courts integer, p_round jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid; m jsonb; a uuid[]; b uuid[]; sitting uuid[]; participants uuid[] := '{}';
  eligible uuid[]; expected_courts integer; court_number integer := 0;
begin
  if p_target is null or p_target < 1 then raise exception 'Invalid target'; end if;
  if jsonb_typeof(p_round) is distinct from 'object'
    or (p_round->>'number')::integer is distinct from p_number
    or (p_round->>'target')::integer is distinct from p_target
    or jsonb_typeof(p_round->'matches') is distinct from 'array'
    or jsonb_typeof(p_round->'sitOuts') is distinct from 'array'
    then raise exception 'Invalid round snapshot'; end if;
  select array_agg(id order by id) into eligible from public.players
    where tournament_id = p_tournament_id and active and joined_round <= p_number;
  if coalesce(cardinality(eligible), 0) < 4 then raise exception 'At least four active players are needed'; end if;
  expected_courts := least(p_courts, cardinality(eligible) / 4);
  if jsonb_array_length(p_round->'matches') <> expected_courts then raise exception 'Incorrect court count'; end if;
  select coalesce(array_agg(value::uuid), '{}') into sitting from jsonb_array_elements_text(p_round->'sitOuts');
  participants := sitting;
  insert into public.rounds(tournament_id, number, target) values (p_tournament_id, p_number, p_target) returning id into rid;
  for m in select value from jsonb_array_elements(p_round->'matches') loop
    court_number := court_number + 1;
    if (m->>'court')::integer is distinct from court_number
      or jsonb_typeof(m->'teamA') is distinct from 'array'
      or jsonb_typeof(m->'teamB') is distinct from 'array'
      or m->'result' is distinct from '{"status":"unscored"}'::jsonb then raise exception 'Invalid match'; end if;
    select array_agg(value::uuid) into a from jsonb_array_elements_text(m->'teamA');
    select array_agg(value::uuid) into b from jsonb_array_elements_text(m->'teamB');
    if cardinality(a) is distinct from 2 or cardinality(b) is distinct from 2 then raise exception 'Teams need two players'; end if;
    participants := participants || a || b;
    insert into public.matches(tournament_id, round_id, court, team_a, team_b)
      values (p_tournament_id, rid, court_number, a, b);
  end loop;
  if cardinality(participants) <> cardinality(eligible)
    or (select array_agg(id order by id) from unnest(participants) id) is distinct from eligible
    then raise exception 'Each eligible player must appear exactly once'; end if;
  insert into public.sit_outs(tournament_id, round_id, player_id)
    select p_tournament_id, rid, id from unnest(sitting) id;
  return rid;
end $$;

create function public.create_tournament(p_name text, p_players jsonb, p_courts integer, p_target integer, p_round jsonb)
returns table(share_id text, admin_token text) language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; token text; p jsonb;
begin
  if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) not between 4 and 40
    then raise exception 'Enter between 4 and 40 players'; end if;
  insert into public.tournaments(name, courts, default_target)
    values (coalesce(nullif(btrim(p_name), ''), 'Saturday Americano'), p_courts, p_target) returning * into t;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.tournament_secrets(tournament_id, admin_token_hash)
    values (t.id, extensions.digest(token, 'sha256'));
  for p in select value from jsonb_array_elements(p_players) loop
    insert into public.players(id, tournament_id, name, joined_round)
      values ((p->>'id')::uuid, t.id, btrim(p->>'name'), 1);
  end loop;
  perform private.insert_round(t.id, 1, p_target, p_courts, p_round);
  return query select t.share_id, token;
end $$;

create function public.start_next_round(p_share_id text, p_admin_token text, p_target integer, p_round jsonb, p_confirm_unscored boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; previous public.rounds; next_number integer;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  select * into previous from public.rounds where tournament_id = t.id order by number desc limit 1;
  next_number := coalesce(previous.number, 0) + 1;
  if exists(select 1 from public.matches where round_id = previous.id and result_status = 'unscored') then
    if p_confirm_unscored is distinct from true then raise exception 'Confirm unscored matches before advancing'; end if;
    update public.matches set result_status = 'forfeited', score_a = 0, score_b = 0, entered_by = 'admin', updated_at = now()
      where round_id = previous.id and result_status = 'unscored';
  end if;
  update public.rounds set status = 'complete' where id = previous.id;
  update public.tournaments set default_target = p_target where id = t.id;
  return private.insert_round(t.id, next_number, p_target, t.courts, p_round);
end $$;

-- This sets the NEXT round's target. Existing round targets are immutable,
-- preserving past scores and sit-out compensation.
create function public.set_round_target(p_share_id text, p_admin_token text, p_target integer)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  if p_target is null or p_target < 1 then raise exception 'Invalid target'; end if;
  update public.tournaments set default_target = p_target where id = t.id;
end $$;

create function private.save_score(p_tournament_id uuid, p_match_id uuid, p_score_a integer, p_score_b integer, p_actor text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; r public.rounds;
begin
  select * into m from public.matches where id = p_match_id and tournament_id = p_tournament_id;
  if m.id is null then raise exception 'Match not found'; end if;
  select * into r from public.rounds where id = m.round_id;
  if p_actor = 'player' and r.number <> (select max(number) from public.rounds where tournament_id = p_tournament_id)
    then raise exception 'Players may only score the current round' using errcode = '42501'; end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0
    or p_score_a::bigint + p_score_b::bigint <> r.target then raise exception 'Scores must sum to the round target'; end if;
  update public.matches set score_a = p_score_a, score_b = p_score_b, result_status = 'scored', entered_by = p_actor, updated_at = now()
    where id = m.id;
  if not exists (select 1 from public.matches where round_id = r.id and result_status = 'unscored')
    then update public.rounds set status = 'complete' where id = r.id; end if;
end $$;

create function public.submit_score(p_share_id text, p_match_id uuid, p_score_a integer, p_score_b integer)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id);
  perform private.assert_active(t);
  perform private.save_score(t.id, p_match_id, p_score_a, p_score_b, 'player');
end $$;

create function public.override_score(p_share_id text, p_admin_token text, p_match_id uuid, p_score_a integer, p_score_b integer)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  -- Trusted organisers may correct past results even after ending a tournament.
  perform private.save_score(t.id, p_match_id, p_score_a, p_score_b, 'admin');
end $$;

create function public.rename_player(p_share_id text, p_player_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id);
  perform private.assert_active(t);
  update public.players set name = btrim(p_name) where id = p_player_id and tournament_id = t.id;
  if not found then raise exception 'Player not found'; end if;
end $$;

create function public.add_player(p_share_id text, p_admin_token text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; pid uuid; next_number integer;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  perform private.assert_between_rounds(t.id);
  if (select count(*) from public.players where tournament_id = t.id and active) >= 40 then raise exception 'Maximum 40 active players'; end if;
  select coalesce(max(number), 0) + 1 into next_number from public.rounds where tournament_id = t.id;
  insert into public.players(tournament_id, name, joined_round) values (t.id, btrim(p_name), next_number) returning id into pid;
  return pid;
end $$;

create function public.remove_player(p_share_id text, p_admin_token text, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  perform private.assert_between_rounds(t.id);
  if (select count(*) from public.players where tournament_id = t.id and active) <= 4 then raise exception 'Keep at least four active players'; end if;
  update public.players set active = false where id = p_player_id and tournament_id = t.id and active;
  if not found then raise exception 'Active player not found'; end if;
end $$;

create function public.end_tournament(p_share_id text, p_admin_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  update public.tournaments set status = 'finished' where id = t.id;
end $$;

-- Revoke implicit EXECUTE (including Supabase defaults) from every helper and
-- application RPC, then allow only the explicitly supported API functions.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_tournament(text,jsonb,integer,integer,jsonb),
  public.start_next_round(text,text,integer,jsonb,boolean), public.set_round_target(text,text,integer),
  public.submit_score(text,uuid,integer,integer), public.override_score(text,text,uuid,integer,integer),
  public.rename_player(text,uuid,text), public.add_player(text,text,text),
  public.remove_player(text,text,uuid), public.end_tournament(text,text) from public, anon, authenticated;
grant execute on function public.create_tournament(text,jsonb,integer,integer,jsonb),
  public.start_next_round(text,text,integer,jsonb,boolean), public.set_round_target(text,text,integer),
  public.submit_score(text,uuid,integer,integer), public.override_score(text,text,uuid,integer,integer),
  public.rename_player(text,uuid,text), public.add_player(text,text,text),
  public.remove_player(text,text,uuid), public.end_tournament(text,text) to anon, authenticated;
