-- Run inside BEGIN / ROLLBACK. Fixtures and credentials never persist.
create function pg_temp.check_that(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'TEST FAILED: %', message; end if;
end $$;
create function pg_temp.rejects(statement text, message text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if sqlstate not in ('P0001','P0002','42501','23514','23502','23505','22P02','22023','22003','40001') then raise; end if;
    return;
  end;
  raise exception 'TEST FAILED: accepted %', message;
end $$;
create function pg_temp.players(offset_id integer, n integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('id', lpad(to_hex(i),32,'0')::uuid, 'name', 'Player ' || i) order by i)
  from generate_series(offset_id+1, offset_id+n) i
$$;
create function pg_temp.snapshot(ps jsonb, num integer, target integer, courts integer) returns jsonb language sql as $$
  select jsonb_build_object('number', num, 'target', target,
    'matches', (select jsonb_agg(jsonb_build_object('court', c+1,
      'teamA', jsonb_build_array(ps->(c*4)->>'id', ps->(c*4+1)->>'id'),
      'teamB', jsonb_build_array(ps->(c*4+2)->>'id', ps->(c*4+3)->>'id'),
      'result', jsonb_build_object('status','unscored')) order by c)
      from generate_series(0, least(courts,jsonb_array_length(ps)/4)-1) c),
    'sitOuts', (select coalesce(jsonb_agg(p->>'id' order by ord), '[]'::jsonb)
      from jsonb_array_elements(ps) with ordinality as e(p,ord)
      where ord > least(courts,jsonb_array_length(ps)/4)*4))
$$;

-- Create via the same anon role used by a browser, not the table owner.
set local role anon;
do $$ declare credentials record; ps jsonb := pg_temp.players(0, 8); begin
  select * into credentials from public.create_tournament('Security test', ps, 2, 24, pg_temp.snapshot(ps,1,24,2));
  perform set_config('test.share', credentials.share_id, true);
  perform set_config('test.admin', credentials.admin_token, true);
  perform pg_temp.check_that(length(credentials.admin_token) = 64, '256-bit admin token');
  perform pg_temp.check_that(length(credentials.share_id) = 48, '192-bit share ID');
  ps := pg_temp.players(100,5);
  select * into credentials from public.create_tournament('Other test', ps, 2, 21, pg_temp.snapshot(ps,1,21,2));
  perform set_config('test.other_share', credentials.share_id, true);
  perform pg_temp.check_that(credentials.admin_token <> current_setting('test.admin'), 'unique tokens');
end $$;
select pg_temp.check_that((select count(*) from public.tournaments)=0, 'no header means no read access');
select pg_temp.check_that(public.get_tournament_snapshot(current_setting('test.share')) is null, 'snapshot denies unscoped reads');
select set_config('request.headers', jsonb_build_object('x-tournament-share-id', current_setting('test.share'))::text, true) is not null as header_set;
select pg_temp.check_that((select count(*) from public.tournaments)=1, 'share scope isolates tournaments');
select pg_temp.check_that((select count(*) from public.players)=8, 'share scope isolates players');
select pg_temp.check_that(public.get_tournament_snapshot(current_setting('test.other_share')) is null, 'snapshot share must match header');
select pg_temp.check_that(public.get_tournament_snapshot(current_setting('test.share'))::text not like '%admin_token%', 'snapshot exposes no admin credential fields');
select pg_temp.check_that((select count(*) from public.matches)=2, 'share scope isolates matches');
select pg_temp.check_that((select count(*) from public.rounds)=1, 'share scope isolates rounds');
select pg_temp.check_that((select count(*) from public.sit_outs)=0, 'share scope isolates sit-outs');
select pg_temp.check_that(not has_schema_privilege('anon','private','usage'), 'anon lacks private schema access');
select pg_temp.rejects('select * from private.tournament_secrets', 'private secrets read');
select pg_temp.rejects($q$select private.lock_tournament('x',null,false)$q$, 'internal helper execution');
select pg_temp.rejects($q$update public.tournaments set status='finished'$q$, 'direct update');
select pg_temp.rejects($q$insert into public.players(tournament_id,name,joined_round) select id,'Injected',1 from public.tournaments$q$, 'direct insert');
select pg_temp.rejects('delete from public.matches', 'direct delete');

do $$ declare s text := current_setting('test.share'); token text := current_setting('test.admin');
  match_id uuid; pid uuid; ps jsonb := pg_temp.players(0,8); next_round jsonb; begin
  select id into match_id from public.matches where court=1;
  select id into pid from public.players order by id limit 1;
  perform pg_temp.rejects(format('select public.end_tournament(%L,%L)', s, 'wrong'), 'invalid end token');
  perform pg_temp.rejects(format('select public.set_round_target(%L,null,21)', s), 'missing target token');
  perform pg_temp.rejects(format('select public.override_score(%L,%L,%L,12,12)', s,'wrong',match_id), 'invalid override token');
  perform pg_temp.rejects(format('select public.add_player(%L,%L,%L)',s,'wrong','Late'), 'invalid add token');
  perform pg_temp.rejects(format('select public.remove_player(%L,%L,%L)',s,'wrong',pid), 'invalid remove token');
  perform pg_temp.rejects(format('select public.start_next_round(%L,%L,24,%L::jsonb,true)',s,'wrong',pg_temp.snapshot(ps,2,24,2)), 'invalid next token');
  perform pg_temp.rejects(format('select public.set_round_target(%L,%L,21)',current_setting('test.other_share'),token), 'cross tournament token');
  perform pg_temp.rejects(format('select public.submit_score(%L,%L,12,12)',current_setting('test.other_share'),match_id), 'cross tournament match');
  perform pg_temp.rejects(format('select public.rename_player(%L,%L,%L)',current_setting('test.other_share'),pid,'Changed'), 'cross tournament player');
  perform pg_temp.rejects(format('select public.submit_score(%L,%L,15,8)',s,match_id), 'wrong score sum');
  perform pg_temp.rejects(format('select public.submit_score(%L,%L,-1,25)',s,match_id), 'negative score');
  declare pending_id uuid; begin
    pending_id := public.add_player(s,token,'Midround joiner');
    perform pg_temp.check_that((select joined_round=2 from public.players where id=pending_id), 'midround add joins next round');
    perform public.remove_player(s,token,pending_id);
  end;
  perform pg_temp.rejects(format('select public.rename_player(%L,%L,%L)',s,pid,'  '), 'empty name');
  perform pg_temp.rejects(format('select public.rename_player(%L,%L,%L)',s,pid,'Player 2'), 'duplicate name');
  perform pg_temp.rejects(format('select public.rename_player(%L,%L,%L)',s,pid,' PLAYER   2 '), 'duplicate with case and internal spacing');
  perform pg_temp.rejects(format('select public.add_player(%L,%L,%L)',s,token,' player  2 '), 'duplicate added name with spacing');
  perform public.rename_player(s,pid,'Renamed');
  perform pg_temp.check_that((select name='Player 1' and pending_name='Renamed' from public.players where id=pid), 'rename pending until next draw');
  perform pg_temp.check_that((public.get_tournament_snapshot(s)#>>'{rounds,0,names,00000000-0000-0000-0000-000000000001}')='Player 1', 'current round keeps original name');
  declare version timestamptz; begin
    select updated_at into version from public.matches where id=match_id;
    perform public.submit_score(s,match_id,15,9,version);
    perform pg_temp.rejects(format('select public.submit_score(%L,%L,12,12,%L::timestamptz)',s,match_id,version-interval '1 second'), 'stale score update');
  end;
  perform pg_temp.check_that((select entered_by='player' and score_a=15 and score_b=9 from public.matches where id=match_id), 'player score audit');
  next_round := pg_temp.snapshot(ps,2,21,2);
  perform pg_temp.rejects(format('select public.start_next_round(%L,%L,21,%L::jsonb)',s,token,next_round), 'early advance without confirmation');
  -- Duplicating a player must roll back early-advance forfeitures as well.
  perform pg_temp.rejects(format('select public.start_next_round(%L,%L,21,%L::jsonb,true)',s,token,
    jsonb_set(next_round,'{matches,1,teamA,0}',next_round#>'{matches,0,teamA,0}')), 'duplicate participant');
  perform pg_temp.check_that((select count(*) from public.rounds)=1, 'invalid snapshot creates no round');
  perform pg_temp.check_that((select count(*) from public.matches where result_status='unscored')=1, 'invalid snapshot leaves prior scores unchanged');
  perform public.set_round_target(s,token,21);
  perform pg_temp.check_that((select target from public.rounds where number=1)=24, 'past target stays immutable');
  perform public.start_next_round(s,token,21,next_round,true);
  perform pg_temp.check_that((select name='Renamed' and pending_name is null from public.players where id=pid), 'pending rename applied at draw');
  perform pg_temp.check_that((public.get_tournament_snapshot(s)#>>'{rounds,0,names,00000000-0000-0000-0000-000000000001}')='Player 1', 'past name preserved after rename');
  perform pg_temp.check_that((public.get_tournament_snapshot(s)#>>'{rounds,1,names,00000000-0000-0000-0000-000000000001}')='Renamed', 'new round uses renamed player');
  perform pg_temp.check_that((select count(*) from public.matches where result_status='forfeited' and score_a=0 and score_b=0)=1, 'confirmed zero-zero forfeiture');
  perform pg_temp.rejects(format('select public.start_next_round(%L,%L,21,%L::jsonb,true)',s,token,next_round), 'duplicate next round');
  perform pg_temp.rejects(format('select public.submit_score(%L,%L,12,12)',s,match_id), 'player past score');
  perform public.override_score(s,token,match_id,20,4);
  perform pg_temp.check_that((select entered_by='admin' and score_a=20 from public.matches where id=match_id), 'admin past override');
  for match_id in select id from public.matches where round_id=(select id from public.rounds where number=2) loop
    perform public.submit_score(s,match_id,10,11);
  end loop;
  perform pg_temp.check_that((select status from public.rounds where number=2)='complete', 'all scores complete round');
  pid := public.add_player(s,token,'Late joiner');
  perform pg_temp.check_that((select joined_round from public.players where id=pid)=3, 'late joiner starts next round');
  perform public.remove_player(s,token,(ps->0->>'id')::uuid);
  perform pg_temp.check_that((select active from public.players where id=(ps->0->>'id')::uuid)=false, 'removal is soft');
  select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) into ps from public.players where active;
  perform public.start_next_round(s,token,16,pg_temp.snapshot(ps,3,16,2));
  perform pg_temp.check_that(not exists(select 1 from public.matches m join public.players p on not p.active and (p.id=any(m.team_a) or p.id=any(m.team_b)) join public.rounds r on r.id=m.round_id where r.number=3), 'removed players excluded');
  perform public.end_tournament(s,token);
  perform pg_temp.rejects(format('select public.submit_score(%L,%L,10,11)',s,match_id), 'scores after ending');
  perform pg_temp.rejects(format('select public.rename_player(%L,%L,%L)',s,pid,'After end'), 'rename after ending');
  perform pg_temp.rejects(format('select public.add_player(%L,%L,%L)',s,token,'After end'), 'add after ending');
  perform pg_temp.rejects(format('select public.start_next_round(%L,%L,16,%L::jsonb,true)',s,token,pg_temp.snapshot(ps,4,16,2)), 'advance after ending');
end $$;

-- Wrong headers cannot enumerate data, even with the project's public role.
select set_config('request.headers','{"x-tournament-share-id":"wrong"}',true) is not null as header_set;
select pg_temp.check_that((select count(*) from public.players)=0, 'invalid share hides players');
select pg_temp.check_that((select count(*) from public.tournaments)=0, 'invalid share hides tournaments');
reset role;
select pg_temp.check_that(not has_table_privilege('anon','private.tournament_secrets','select'), 'anon cannot select token hashes');
select pg_temp.check_that(not has_table_privilege('authenticated','private.tournament_secrets','select'), 'authenticated cannot select token hashes');
select pg_temp.check_that((select bool_and(octet_length(admin_token_hash)=32) from private.tournament_secrets where tournament_id in (select id from public.tournaments where share_id in (current_setting('test.share'),current_setting('test.other_share')))), 'only SHA256 hashes persisted');
select pg_temp.check_that(not exists(select 1 from pg_attribute where attrelid='private.tournament_secrets'::regclass and attname='admin_token'), 'no plaintext token column');
select pg_temp.check_that(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and has_function_privilege('anon',p.oid,'execute')), 'all helpers inaccessible');
select pg_temp.check_that((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and c.relname in ('tournaments','players','rounds','matches','sit_outs')) or (n.nspname='private' and c.relname='tournament_secrets')), 'RLS enabled everywhere');
select pg_temp.check_that(exists(select 1 from realtime.messages where topic='tournament:'||current_setting('test.share') and event='changed'), 'Realtime invalidation emitted');
select pg_temp.check_that(not exists(select 1 from realtime.messages where topic='tournament:'||current_setting('test.share') and payload::text like '%'||current_setting('test.admin')||'%'), 'Realtime never contains admin token');
select 'Database security and lifecycle checks passed' as result;
