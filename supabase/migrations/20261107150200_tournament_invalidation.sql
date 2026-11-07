-- Broadcast only an empty invalidation notice, never database rows or secrets.
-- Clients holding the share capability subscribe to tournament:<share_id> and
-- refetch via REST with x-tournament-share-id. REST RLS remains authoritative.
create function private.notify_tournament_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tid uuid; share text;
begin
  if tg_table_name = 'tournaments' then
    tid := coalesce(new.id, old.id);
  else
    tid := coalesce(new.tournament_id, old.tournament_id);
  end if;
  select share_id into share from public.tournaments where id = tid;
  if share is not null then
    perform realtime.send('{}'::jsonb, 'changed', 'tournament:' || share, false);
  end if;
  return null;
end $$;
revoke all on function private.notify_tournament_change() from public, anon, authenticated;
create trigger tournament_changed after insert or update or delete on public.tournaments
  for each row execute function private.notify_tournament_change();
create trigger player_changed after insert or update or delete on public.players
  for each row execute function private.notify_tournament_change();
create trigger round_changed after insert or update or delete on public.rounds
  for each row execute function private.notify_tournament_change();
create trigger match_changed after insert or update or delete on public.matches
  for each row execute function private.notify_tournament_change();
create trigger sit_out_changed after insert or update or delete on public.sit_outs
  for each row execute function private.notify_tournament_change();
