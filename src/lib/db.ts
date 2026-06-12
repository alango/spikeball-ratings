// Postgres access layer (Neon serverless, SPEC §9). Thin typed wrappers over raw
// SQL — no ORM. Connection is lazy so importing this module never throws when
// DATABASE_URL is absent (e.g. during typecheck/build); only an actual query does.
//
// History (`games`) is authoritative; `ratings_cache` is a disposable projection
// rebuilt by `rebuild.ts` on every write (SPEC §3). `date` columns are selected as
// ::text so they arrive as `YYYY-MM-DD` strings — exactly what the rating modules
// expect — regardless of the driver's date parsing.

import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Game, Pair, Player, PlayerId, RatingResults, Winner } from "./types";

let cached: NeonQueryFunction<false, false> | null = null;

function sql(): NeonQueryFunction<false, false> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = neon(url);
  }
  return cached;
}

// ---- Row shapes ------------------------------------------------------------

export interface GameRow {
  id: number;
  playedDate: string; // YYYY-MM-DD
  teamA: Pair;
  teamB: Pair;
  winner: Winner;
  scoreA: number | null;
  scoreB: number | null;
}

type RawGame = {
  id: number;
  played_date: string;
  team_a: number[];
  team_b: number[];
  winner: Winner;
  score_a: number | null;
  score_b: number | null;
};

const toGameRow = (r: RawGame): GameRow => ({
  id: r.id,
  playedDate: r.played_date,
  teamA: [r.team_a[0], r.team_a[1]],
  teamB: [r.team_b[0], r.team_b[1]],
  winner: r.winner,
  scoreA: r.score_a,
  scoreB: r.score_b,
});

/** Map DB rows to the rating module's {@link Game} shape — scores included so the
 * update can be margin-aware when both are present (SPEC §2). */
export function toRatingGames(rows: GameRow[]): Game[] {
  return rows.map((r) => ({
    id: r.id,
    playedDate: r.playedDate,
    teamA: r.teamA,
    teamB: r.teamB,
    winner: r.winner,
    scoreA: r.scoreA,
    scoreB: r.scoreB,
  }));
}

// ---- Players ---------------------------------------------------------------

export async function getPlayers(): Promise<Player[]> {
  return (await sql()`select id, name from players order by id`) as Player[];
}

export async function insertPlayer(name: string): Promise<Player> {
  const rows = (await sql()`
    insert into players (name) values (${name}) returning id, name
  `) as Player[];
  return rows[0];
}

export async function renamePlayer(id: PlayerId, name: string): Promise<Player | null> {
  const rows = (await sql()`
    update players set name = ${name} where id = ${id} returning id, name
  `) as Player[];
  return rows.length ? rows[0] : null;
}

// ---- Games -----------------------------------------------------------------

const GAME_COLS = "id, played_date::text as played_date, team_a, team_b, winner, score_a, score_b";

/** All games in replay order: played_date ASC, id ASC (SPEC §6). */
export async function getGames(): Promise<GameRow[]> {
  const rows = (await sql()`
    select ${sql().unsafe(GAME_COLS)} from games order by played_date, id
  `) as RawGame[];
  return rows.map(toGameRow);
}

export async function getGame(id: number): Promise<GameRow | null> {
  const rows = (await sql()`
    select ${sql().unsafe(GAME_COLS)} from games where id = ${id}
  `) as RawGame[];
  return rows.length ? toGameRow(rows[0]) : null;
}

export interface GameInput {
  playedDate: string; // YYYY-MM-DD
  teamA: Pair;
  teamB: Pair;
  winner: Winner;
  scoreA: number | null;
  scoreB: number | null;
}

export async function insertGame(g: GameInput): Promise<GameRow> {
  const rows = (await sql()`
    insert into games (played_date, team_a, team_b, winner, score_a, score_b)
    values (${g.playedDate}, ${g.teamA}, ${g.teamB}, ${g.winner}, ${g.scoreA}, ${g.scoreB})
    returning ${sql().unsafe(GAME_COLS)}
  `) as RawGame[];
  return toGameRow(rows[0]);
}

export async function updateGame(id: number, g: GameInput): Promise<GameRow | null> {
  const rows = (await sql()`
    update games set
      played_date = ${g.playedDate}, team_a = ${g.teamA}, team_b = ${g.teamB},
      winner = ${g.winner}, score_a = ${g.scoreA}, score_b = ${g.scoreB}
    where id = ${id}
    returning ${sql().unsafe(GAME_COLS)}
  `) as RawGame[];
  return rows.length ? toGameRow(rows[0]) : null;
}

export async function deleteGame(id: number): Promise<boolean> {
  const rows = (await sql()`
    delete from games where id = ${id} returning id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

// ---- Ratings cache ---------------------------------------------------------

export async function getRatingsCache(): Promise<RatingResults> {
  const rows = (await sql()`
    select player_id, mu, sigma, last_played_date::text as last_played_date
    from ratings_cache
  `) as Array<{ player_id: number; mu: number; sigma: number; last_played_date: string | null }>;
  const out: RatingResults = {};
  for (const r of rows) {
    out[r.player_id] = { mu: r.mu, sigma: r.sigma, lastPlayedDate: r.last_played_date };
  }
  return out;
}

/** Replace the entire ratings cache with a freshly rebuilt projection (SPEC §3). */
export async function replaceRatingsCache(results: RatingResults): Promise<void> {
  await sql()`delete from ratings_cache`;
  for (const [id, r] of Object.entries(results)) {
    await sql()`
      insert into ratings_cache (player_id, mu, sigma, last_played_date)
      values (${Number(id)}, ${r.mu}, ${r.sigma}, ${r.lastPlayedDate})
    `;
  }
}
