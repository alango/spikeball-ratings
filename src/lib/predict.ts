// Matchup predictor (SPEC §11.3) — PURE and DB-agnostic.
//
// Given four players, enumerate the three possible 2v2 splits and report each side's
// win probability. The probability itself comes from openskill's `predictWin` — no
// hand-rolled math, same rule as rating.ts/display.ts (CLAUDE.md).
//
// This is NOT matchmaking (SPEC §1, §11.3): it never picks who plays, schedules
// anything, or writes a row. Four people are already on the court; this reports what
// the existing ratings imply about a split they were going to make anyway.

import { predictWin, rating } from "openskill";
import type { Pair, PlayerId, Rating } from "./types";

/** Exactly four players, the predictor's input. */
export type Foursome = [PlayerId, PlayerId, PlayerId, PlayerId];

export interface Pairing {
  teamA: Pair;
  teamB: Pair;
}

/**
 * The three distinct 2v2 splits of four players. Choosing team A's pair determines
 * team B's, and A/B are interchangeable, so there are C(4,2)/2 = 3 — not 6. Each
 * split is emitted with the lower player id leading, so the output is stable
 * regardless of the order the four came in.
 */
export function pairings(four: Foursome): Pairing[] {
  const [p, q, r, s] = four;
  const pair = (x: PlayerId, y: PlayerId): Pair => (x < y ? [x, y] : [y, x]);
  return [
    { teamA: pair(p, q), teamB: pair(r, s) },
    { teamA: pair(p, r), teamB: pair(q, s) },
    { teamA: pair(p, s), teamB: pair(q, r) },
  ];
}

export interface PairingPrediction extends Pairing {
  /** Probability team A wins, 0–1. */
  probA: number;
  /** Probability team B wins, 0–1. `probA + probB === 1`. */
  probB: number;
  /**
   * How lopsided this split is: |probA − 0.5| × 2, so 0 is a perfect coin-flip and 1
   * is a certainty. The page highlights the smallest — the fairest game of the three.
   */
  imbalance: number;
}

/** True when the four ids are four DIFFERENT players. */
export function isValidFoursome(ids: PlayerId[]): ids is Foursome {
  return ids.length === 4 && new Set(ids).size === 4;
}

/**
 * Win probabilities for all three splits of `four`, most balanced first.
 *
 * `ratings` must be the drift-to-today (μ, σ) the board shows — see
 * `stats.ratingsAsOf`. A player with no entry falls back to the openskill default,
 * which is the right answer for someone who has never played (SPEC §11.3).
 */
export function predictPairings(
  four: Foursome,
  ratings: Record<PlayerId, Rating>,
): PairingPrediction[] {
  const ratingOf = (id: PlayerId) => {
    const r = ratings[id];
    return r ? rating({ mu: r.mu, sigma: r.sigma }) : rating();
  };
  return pairings(four)
    .map(({ teamA, teamB }) => {
      const [probA, probB] = predictWin([
        [ratingOf(teamA[0]), ratingOf(teamA[1])],
        [ratingOf(teamB[0]), ratingOf(teamB[1])],
      ]);
      return {
        teamA,
        teamB,
        probA,
        probB,
        imbalance: Math.abs(probA - 0.5) * 2,
      };
    })
    .sort((a, b) => a.imbalance - b.imbalance);
}
