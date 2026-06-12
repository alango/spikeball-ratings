// Rating module (SPEC §2, §5, §6) — PURE and DB-agnostic. This and `display.ts`
// are the only non-trivial logic in the app (CLAUDE.md). Tested independently on
// synthetic history in `rating.test.ts` before any DB/UI exists.
//
// Two load-bearing rules live here:
//   • Rating is STRICTLY win/loss — the score is never read (SPEC §2).
//   • Replay orders by (played_date, id), NEVER insertion time (SPEC §6).
//
// We use `openskill` for the math and NEVER hand-roll it. openskill's own per-game
// dynamics term (`tau`) is disabled (tau: 0): the ONLY source of σ inflation is our
// time-based inactivity drift (SPEC §5), applied here on the write path by each
// player's gap since *their own previous game*.

import { rating, rate } from "openskill";
import type { Game, PlayerId, Rating, RatingResults } from "./types";

// openskill defaults, verified against the installed v5 (constants.ts: mu=25,
// sigma=25/3, beta=25/6, z=3). New players start here.
export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = 25 / 3;

/**
 * Inactivity drift tuning (SPEC §5), deliberately MILD to start. Variance grows
 * linearly with elapsed days; after `DRIFT_HALF_RESTORE_DAYS` of inactivity the
 * added variance equals half the default variance — i.e. ~3 months off roughly
 * half-restores a settled player's uncertainty toward a fresh player's. Tunable.
 */
export const DRIFT_HALF_RESTORE_DAYS = 90;
export const DRIFT_VARIANCE_PER_DAY =
  (0.5 * DEFAULT_SIGMA * DEFAULT_SIGMA) / DRIFT_HALF_RESTORE_DAYS;

/** Whole days between two `YYYY-MM-DD` dates (UTC midnight; negative if b < a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.round(ms / 86_400_000);
}

/**
 * Inflate σ for a player who has been idle `gapDays` days, capped at the default
 * (a drifted player never looks *more* uncertain than a brand-new one). Drift
 * touches σ only — μ is unchanged (SPEC §5). gapDays <= 0 (same day or back-dated
 * within a session) is a no-op, which is what keeps best-of-3 / same-day rows safe.
 */
export function driftSigma(sigma: number, gapDays: number): number {
  if (gapDays <= 0) return sigma;
  const variance = sigma * sigma + DRIFT_VARIANCE_PER_DAY * gapDays;
  const capped = Math.min(variance, DEFAULT_SIGMA * DEFAULT_SIGMA);
  return Math.sqrt(capped);
}

/**
 * Replay-rebuild every rating from scratch (SPEC §3). Given the roster and the
 * full game history, returns each player's (μ, σ, lastPlayedDate) as of their last
 * game. Every roster player appears in the result; one who has never played gets
 * the defaults with `lastPlayedDate: null`.
 */
export function rebuild(roster: PlayerId[], games: Game[]): RatingResults {
  // Mutable working state, keyed by player id.
  const cur = new Map<PlayerId, Rating>();
  const lastPlayed = new Map<PlayerId, string>();

  const get = (id: PlayerId): Rating => {
    let r = cur.get(id);
    if (!r) {
      r = rating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA });
      cur.set(id, r);
    }
    return r;
  };

  for (const id of roster) get(id); // ensure never-played roster players exist

  // Deterministic chronological replay: played_date ASC, then id ASC (SPEC §6).
  const ordered = [...games].sort((g1, g2) =>
    g1.playedDate < g2.playedDate
      ? -1
      : g1.playedDate > g2.playedDate
        ? 1
        : g1.id - g2.id,
  );

  for (const g of ordered) {
    const ids: PlayerId[] = [...g.teamA, ...g.teamB];

    // Write-path drift: inflate each player's σ by the gap since THEIR previous
    // game (by date), before this game's update. Same-day gap = 0 = no drift.
    for (const id of ids) {
      const prev = lastPlayed.get(id);
      if (prev !== undefined) {
        const r = get(id);
        r.sigma = driftSigma(r.sigma, daysBetween(prev, g.playedDate));
      }
    }

    // Rank winner team first; openskill adjusts all four at once. tau: 0 so the
    // library adds no σ inflation of its own (ours is the only drift).
    const teamA: Rating[] = [get(g.teamA[0]), get(g.teamA[1])];
    const teamB: Rating[] = [get(g.teamB[0]), get(g.teamB[1])];
    const [winId, loseId] =
      g.winner === "a" ? [g.teamA, g.teamB] : [g.teamB, g.teamA];
    const winTeam = g.winner === "a" ? teamA : teamB;
    const loseTeam = g.winner === "a" ? teamB : teamA;

    const [newWin, newLose] = rate([winTeam, loseTeam], { tau: 0 });

    cur.set(winId[0], newWin[0]);
    cur.set(winId[1], newWin[1]);
    cur.set(loseId[0], newLose[0]);
    cur.set(loseId[1], newLose[1]);

    for (const id of ids) lastPlayed.set(id, g.playedDate);
  }

  const out: RatingResults = {};
  for (const [id, r] of cur) {
    out[id] = {
      mu: r.mu,
      sigma: r.sigma,
      lastPlayedDate: lastPlayed.get(id) ?? null,
    };
  }
  return out;
}
