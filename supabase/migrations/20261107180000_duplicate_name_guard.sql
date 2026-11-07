-- Guard future writes without rewriting existing names or round snapshots.
create function private.name_key(value text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(btrim(regexp_replace(value, '[[:space:] ]+', ' ', 'g')))
$$;
revoke all on function private.name_key(text) from public,anon,authenticated;

create or replace function private.assert_name_available(tid uuid, proposed text, except_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$ begin
  if proposed is null or length(btrim(proposed)) not between 1 and 60 then raise exception 'Use a name between 1 and 60 characters'; end if;
  if exists(select 1 from public.players where tournament_id=tid and id is distinct from except_id
    and (private.name_key(name)=private.name_key(proposed) or private.name_key(pending_name)=private.name_key(proposed)))
    then raise exception 'That name is already in use. Add an initial.' using errcode='23505'; end if;
end $$;

create function private.guard_player_name() returns trigger
language plpgsql security definer set search_path = '' as $$ begin
  perform private.assert_name_available(new.tournament_id,new.name,new.id);
  if new.pending_name is not null then
    perform private.assert_name_available(new.tournament_id,new.pending_name,new.id);
  end if;
  return new;
end $$;
revoke all on function private.guard_player_name() from public,anon,authenticated;
create trigger guard_player_name before insert or update of name,pending_name on public.players
  for each row execute function private.guard_player_name();
