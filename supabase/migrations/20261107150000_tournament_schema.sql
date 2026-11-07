-- Application data is readable only with the tournament's share capability.
-- Admin credentials live outside the API-exposed schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  name text not null check (length(btrim(name)) between 1 and 100),
  courts integer not null check (courts between 1 and 10),
  default_target integer not null check (default_target > 0),
  status text not null default 'active' check (status in ('active', 'finished')),
  created_at timestamptz not null default now()
);
create table private.tournament_secrets (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  admin_token_hash bytea not null check (octet_length(admin_token_hash) = 32)
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  joined_round integer not null check (joined_round > 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, id)
);
create unique index players_unique_name on public.players(tournament_id, lower(btrim(name)));
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  number integer not null check (number > 0),
  target integer not null check (target > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  created_at timestamptz not null default now(),
  unique (tournament_id, number),
  unique (tournament_id, id)
);
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid not null,
  court integer not null check (court > 0),
  team_a uuid[] not null check (cardinality(team_a) = 2 and array_position(team_a, null) is null),
  team_b uuid[] not null check (cardinality(team_b) = 2 and array_position(team_b, null) is null),
  result_status text not null default 'unscored' check (result_status in ('unscored','scored','forfeited')),
  score_a integer,
  score_b integer,
  entered_by text check (entered_by in ('admin', 'player')),
  updated_at timestamptz not null default now(),
  foreign key (tournament_id, round_id) references public.rounds(tournament_id, id) on delete cascade,
  unique (round_id, court),
  check ((result_status = 'unscored' and score_a is null and score_b is null and entered_by is null)
    or (result_status = 'scored' and score_a >= 0 and score_b >= 0 and score_a is not null and score_b is not null and entered_by is not null)
    or (result_status = 'forfeited' and score_a = 0 and score_b = 0 and score_a is not null and score_b is not null and entered_by = 'admin'))
);
create index matches_tournament on public.matches(tournament_id);
create table public.sit_outs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid not null,
  player_id uuid not null,
  foreign key (tournament_id, round_id) references public.rounds(tournament_id, id) on delete cascade,
  foreign key (tournament_id, player_id) references public.players(tournament_id, id),
  unique (round_id, player_id)
);
create index sit_outs_tournament on public.sit_outs(tournament_id);

create function public.request_share_id() returns text
language sql stable security invoker set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-tournament-share-id'
$$;
-- This helper exposes only the caller-supplied share ID, never credentials.
revoke all on function public.request_share_id() from public, anon, authenticated;
grant execute on function public.request_share_id() to anon, authenticated;

alter table private.tournament_secrets enable row level security;
revoke all on private.tournament_secrets from public, anon, authenticated;

alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.sit_outs enable row level security;
revoke all on public.tournaments, public.players, public.rounds, public.matches, public.sit_outs from public, anon, authenticated;
grant select on public.tournaments, public.players, public.rounds, public.matches, public.sit_outs to anon, authenticated;
create policy tournament_read on public.tournaments for select to anon, authenticated
  using (share_id = (select public.request_share_id()));
create policy player_read on public.players for select to anon, authenticated
  using (tournament_id in (select id from public.tournaments));
create policy round_read on public.rounds for select to anon, authenticated
  using (tournament_id in (select id from public.tournaments));
create policy match_read on public.matches for select to anon, authenticated
  using (tournament_id in (select id from public.tournaments));
create policy sit_out_read on public.sit_outs for select to anon, authenticated
  using (tournament_id in (select id from public.tournaments));
