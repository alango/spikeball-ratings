-- League schema (SPEC §8). History is the source of truth; ratings are a
-- rebuildable cache (SPEC §3). The `games` table is authoritative; `ratings_cache`
-- is a disposable projection rebuilt by replaying all games in (played_date, id)
-- order on every write.

create table if not exists players (
  id         serial primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id          serial primary key,            -- stable intra-day replay tiebreaker (SPEC §6)
  played_date date not null,                 -- day granularity; back-dating allowed (SPEC §6)
  team_a      int[] not null,                -- exactly 2 player ids
  team_b      int[] not null,                -- exactly 2 player ids
  winner      text not null check (winner in ('a', 'b')),
  score_a     int,                           -- optional; stored but rating ignores it (SPEC §4)
  score_b     int,
  created_at  timestamptz not null default now()
  -- NOTE: a `season int` column can be added later at zero cost (SPEC §8). Not now.
);

-- Replay walks games in this exact order (SPEC §6).
create index if not exists games_replay_idx on games (played_date, id);

-- Cached rating projection: one row per player, as of their last game. The display
-- layer adds drift-to-today on read (SPEC §5). Fully rebuildable from `games`.
create table if not exists ratings_cache (
  player_id        int primary key references players(id) on delete cascade,
  mu               double precision not null,
  sigma            double precision not null,
  last_played_date date                          -- null until the player's first game
);
