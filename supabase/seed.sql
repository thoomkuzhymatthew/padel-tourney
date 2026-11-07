-- LOCAL DEVELOPMENT ONLY. Never use --include-seed when pushing hosted migrations.
-- Uses the real creation RPC; the random admin credential is discarded, not logged.
-- This fixture is for viewing. Create a fresh tournament in the UI for admin actions.
do $$
declare ps jsonb; snapshot jsonb;
begin
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', name) order by ord) into ps
    from unnest(array['Alex','Blair','Casey','Devon','Ellis','Frankie','Georgie','Harper']) with ordinality as names(name,ord);
  select jsonb_build_object('number',1,'target',24,'sitOuts','[]'::jsonb,
    'matches', jsonb_agg(jsonb_build_object('court',i+1,
      'teamA',jsonb_build_array(ps->(i*4)->>'id',ps->(i*4+1)->>'id'),
      'teamB',jsonb_build_array(ps->(i*4+2)->>'id',ps->(i*4+3)->>'id'),
      'result',jsonb_build_object('status','unscored')) order by i)) into snapshot from generate_series(0,1) i;
  perform public.create_tournament('Courtside demo',ps,2,24,snapshot);
end $$;
