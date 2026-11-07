-- Approved changes: roster edits at any time affect the next draw;
-- historical round names remain snapshots. No admin credential is exposed.
alter table public.players add column pending_name text check (pending_name is null or length(btrim(pending_name)) between 1 and 60);
alter table public.rounds add column player_names jsonb not null default '{}'::jsonb;
update public.rounds r set player_names = coalesce((select jsonb_object_agg(p.id::text,p.name)
  from public.players p where p.tournament_id=r.tournament_id and p.joined_round<=r.number), '{}'::jsonb);

create function private.assert_name_available(tid uuid, proposed text, except_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$ begin
  if proposed is null or length(btrim(proposed)) not between 1 and 60 then raise exception 'Use a name between 1 and 60 characters'; end if;
  if exists(select 1 from public.players where tournament_id=tid and id is distinct from except_id
    and (lower(btrim(name))=lower(btrim(proposed)) or lower(btrim(pending_name))=lower(btrim(proposed))))
    then raise exception 'That name is already in use. Add an initial.' using errcode='23505'; end if;
end $$;

create or replace function public.rename_player(p_share_id text, p_player_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id);
  perform private.assert_active(t);
  perform private.assert_name_available(t.id, p_name, p_player_id);
  update public.players set pending_name = case when btrim(p_name)=name then null else btrim(p_name) end
    where id=p_player_id and tournament_id=t.id;
  if not found then raise exception 'Player not found'; end if;
end $$;

create or replace function private.insert_round(p_tournament_id uuid, p_number integer, p_target integer, p_courts integer, p_round jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid; m jsonb; a uuid[]; b uuid[]; sitting uuid[]; participants uuid[] := array[]::uuid[];
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
  insert into public.rounds(tournament_id, number, target, player_names)
    select p_tournament_id, p_number, p_target, jsonb_object_agg(id::text, name)
      from public.players where id = any(eligible)
    returning id into rid;
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


create or replace function public.add_player(p_share_id text, p_admin_token text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; pid uuid; next_number integer;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  if (select count(*) from public.players where tournament_id = t.id and active) >= 40 then raise exception 'Maximum 40 active players'; end if;
  select coalesce(max(number), 0) + 1 into next_number from public.rounds where tournament_id = t.id;
  perform private.assert_name_available(t.id, p_name);
  insert into public.players(tournament_id, name, joined_round) values (t.id, btrim(p_name), next_number) returning id into pid;
  return pid;
end $$;

create or replace function public.remove_player(p_share_id text, p_admin_token text, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  perform private.assert_active(t);
  if (select count(*) from public.players where tournament_id = t.id and active) <= 4 then raise exception 'Keep at least four active players'; end if;
  update public.players set active = false where id = p_player_id and tournament_id = t.id and active;
  if not found then raise exception 'Active player not found'; end if;
end $$;


create or replace function public.start_next_round(p_share_id text, p_admin_token text, p_target integer, p_round jsonb, p_confirm_unscored boolean default false)
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
  update public.players set name = pending_name, pending_name = null
    where tournament_id = t.id and pending_name is not null;
  return private.insert_round(t.id, next_number, p_target, t.courts, p_round);
end $$;


drop function public.submit_score(text,uuid,integer,integer);
drop function public.override_score(text,text,uuid,integer,integer);
drop function private.save_score(uuid,uuid,integer,integer,text);
create function private.save_score(p_tournament_id uuid, p_match_id uuid, p_score_a integer, p_score_b integer, p_actor text, p_expected_updated_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; r public.rounds;
begin
  select * into m from public.matches where id = p_match_id and tournament_id = p_tournament_id;
  if m.id is null then raise exception 'Match not found'; end if;
  if p_expected_updated_at is not null and m.updated_at <> p_expected_updated_at then
    raise exception 'This score changed on another device. Review the latest score before saving.' using errcode = '40001';
  end if;
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

create function public.submit_score(p_share_id text, p_match_id uuid, p_score_a integer, p_score_b integer, p_expected_updated_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id);
  perform private.assert_active(t);
  perform private.save_score(t.id, p_match_id, p_score_a, p_score_b, 'player', p_expected_updated_at);
end $$;

create function public.override_score(p_share_id text, p_admin_token text, p_match_id uuid, p_score_a integer, p_score_b integer, p_expected_updated_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments;
begin
  t := private.lock_tournament(p_share_id, p_admin_token, true);
  -- Trusted organisers may correct past results even after ending a tournament.
  perform private.save_score(t.id, p_match_id, p_score_a, p_score_b, 'admin', p_expected_updated_at);
end $$;


-- One consistent MVCC snapshot, still subject to share-header RLS. Explicit
-- public fields only; neither private tables nor admin credentials are read.
create function public.get_tournament_snapshot(p_share_id text) returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object('id',t.id,'name',t.name,'courts',t.courts,'defaultTarget',t.default_target,'status',t.status,
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'active',p.active,
    'joinedRound',p.joined_round,'pendingName',p.pending_name) order by p.created_at,p.id)
    from public.players p where p.tournament_id=t.id),'[]'::jsonb),
  'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'target',r.target,
    'status',r.status,'names',r.player_names,
    'sitOuts',coalesce((select jsonb_agg(s.player_id order by s.player_id) from public.sit_outs s where s.round_id=r.id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'court',m.court,'teamA',m.team_a,'teamB',m.team_b,
      'updatedAt',m.updated_at,'enteredBy',m.entered_by,
      'result',case m.result_status when 'scored' then jsonb_build_object('status','scored','scoreA',m.score_a,'scoreB',m.score_b)
      else jsonb_build_object('status',m.result_status) end) order by m.court)
      from public.matches m where m.round_id=r.id),'[]'::jsonb)) order by r.number)
    from public.rounds r where r.tournament_id=t.id),'[]'::jsonb))
from public.tournaments t where t.share_id=p_share_id
$$;
revoke all on function public.get_tournament_snapshot(text) from public,anon,authenticated;
grant execute on function public.get_tournament_snapshot(text) to anon,authenticated;
revoke all on function public.submit_score(text,uuid,integer,integer,timestamptz),
 public.override_score(text,text,uuid,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.submit_score(text,uuid,integer,integer,timestamptz),
 public.override_score(text,text,uuid,integer,integer,timestamptz) to anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst, 'reload schema';
