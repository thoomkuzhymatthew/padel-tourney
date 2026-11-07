-- Make the empty UUID array explicit for the database linter.
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

revoke all on function private.insert_round(uuid,integer,integer,integer,jsonb) from public, anon, authenticated;
