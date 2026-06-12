// Shared domain types for the league. Player ids are plain numbers.
//
// These types are intentionally minimal and DB-agnostic: the two pure rating
// modules (rating, display) operate only on these shapes, so they can be
// unit-tested on synthetic data with no database in sight (SPEC §10).

export type PlayerId = number;

export type Pair = [PlayerId, PlayerId];

export interface Player {
  id: PlayerId;
  name: string;
}

/** Which team won. The rating consumes ONLY this, never the score (SPEC §2). */
export type Winner = "a" | "b";

/**
 * A single 2v2 game as the rating module sees it. `winner` is authoritative; the
 * scores are optional and, when both present, make the update margin-aware (a
 * blowout moves μ more than a squeaker — SPEC §2). `playedDate` is a day-granularity
 * calendar date as an ISO `YYYY-MM-DD` string; `id` is the stable intra-day
 * tiebreaker for replay ordering (SPEC §6).
 */
export interface Game {
  id: number;
  playedDate: string; // YYYY-MM-DD
  teamA: Pair;
  teamB: Pair;
  winner: Winner;
  scoreA?: number | null;
  scoreB?: number | null;
}

/** An openskill rating belief: skill estimate μ and uncertainty σ. */
export interface Rating {
  mu: number;
  sigma: number;
}

/**
 * A player's rebuilt rating as of their last game. `lastPlayedDate` is null for a
 * rostered player who has never played. This is exactly what the ratings cache
 * stores; the display layer adds drift-to-today on read (SPEC §5).
 */
export interface RatingResult {
  mu: number;
  sigma: number;
  lastPlayedDate: string | null;
}

export type RatingResults = Record<PlayerId, RatingResult>;
