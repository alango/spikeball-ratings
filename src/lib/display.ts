// Display-drift module (SPEC §2 display, §5 read path) — PURE and DB-agnostic.
// The board must reflect inactivity drift up to TODAY, not just up to each player's
// last game: a player idle for months should look more uncertain now than they did
// right after their last game, even with no new game logged (SPEC §5.2).
//
// So display σ = stored σ inflated from last-played → today (drift inflates σ only;
// μ is unchanged). The board sorts by the conservative score μ − 3σ, so an inactive
// player's standing sinks over time on its own.

import { ordinal } from "openskill";
import {
  DEFAULT_SIGMA,
  daysBetween,
  driftSigma,
} from "./rating";
import type { GameDelta } from "./rating";
import type { PlayerId, RatingResults } from "./types";

/** Conservative score is μ − Zσ; Z=3 ≈ 99.7% confidence (SPEC §2). */
export const DISPLAY_Z = 3;

/**
 * Display the conservative score on a familiar Elo-like scale, per the openskill
 * FAQ: `ordinal()` computes `alpha·(μ − z·σ) + target`, so with one σ worth ~200
 * points (alpha = 200/σ) and target 1500 the number reads like an Elo rating.
 * This is a positive affine rescale of μ − 3σ — it changes the numbers shown, not
 * the ordering. A brand-new player (μ − 3σ = 0) sits exactly at 1500.
 * https://openskill.me/en/stable/faq.html#how-do-i-scale-rating-ordinal-score-to-reflect-elo
 */
export const ELO_PER_SIGMA = 200;
export const ELO_TARGET = 1500;
export const ELO_ALPHA = ELO_PER_SIGMA / DEFAULT_SIGMA;

/** Conservative score (μ − 3σ) on the Elo-like scale — the number shown to users. */
export function eloScore(mu: number, sigma: number): number {
  return ordinal(
    { mu, sigma },
    { z: DISPLAY_Z, alpha: ELO_ALPHA, target: ELO_TARGET },
  );
}

/**
 * The shown rating decomposed for the leaderboard hover, for players who want the
 * "why is my number this" detail. On the Elo scale the shown (conservative) rating is
 *
 *     shown = alpha·(μ − 3σ) + target  =  (alpha·μ + target) − (alpha·z)·σ
 *             \___ eloScore(μ, σ) ___/     \___ ceiling ___/   \_ penalty _/
 *
 * so `ceiling` is the rating a player would have if we were fully certain (σ→0) and
 * `uncertainty` is the points currently docked for uncertainty (alpha·z·σ = 72σ here).
 * By construction `ceiling − uncertainty === shown` after rounding — the tooltip adds up.
 */
export interface EloBreakdown {
  /** Raw openskill μ (drift-adjusted), one decimal. */
  mu: number;
  /** Raw openskill σ (drift-adjusted), one decimal. */
  sigma: number;
  /** Rating if fully certain (σ→0), on the Elo scale. */
  ceiling: number;
  /** Elo points docked for uncertainty (`ceiling − shown`). */
  uncertainty: number;
}

export function eloBreakdown(mu: number, sigma: number): EloBreakdown {
  const ceiling = Math.round(eloScore(mu, 0));
  const shown = Math.round(eloScore(mu, sigma));
  return {
    mu: Math.round(mu * 10) / 10,
    sigma: Math.round(sigma * 10) / 10,
    ceiling,
    uncertainty: ceiling - shown,
  };
}

/**
 * A single game's effect on a player's displayed rating: the change in Elo-scale
 * conservative score across that game's update (μ moves, σ shrinks — both count),
 * rounded to whole points to match the board. Positive for the winners.
 *
 * NOTE: these are point-in-time snapshots and do NOT sum to a player's current board
 * rating — the board keeps drifting toward today after the last game, and the score
 * is non-linear in σ. It answers "what did this game do", not "how did I get here".
 */
export function eloDelta(d: GameDelta): number {
  return Math.round(
    eloScore(d.muAfter, d.sigmaAfter) - eloScore(d.muBefore, d.sigmaBefore),
  );
}

// NOTE: "provisional" is decided by games played, not σ — see views.ts. openskill's
// σ shrinks so slowly under repeated play that any σ-fraction threshold is either
// unreachable (~400 games for 0.6·σ₀) or hypersensitive to drift, so a game count
// is the robust knob (SPEC §2).

export interface BoardEntry {
  id: PlayerId;
  mu: number;
  /** σ after drift-to-today (>= stored σ). */
  sigma: number;
  /** Conservative score (μ − 3σ) on an Elo-like scale (~1500 center). Sort key. */
  conservative: number;
  lastPlayedDate: string | null;
}

/**
 * Project stored ratings onto the board as of `today` (a `YYYY-MM-DD` string).
 * Applies the SAME drift curve as the rebuild write path (`rating.driftSigma`),
 * here measured from each player's last game until today. Never-played players
 * (lastPlayedDate null) get no drift — they already sit at the default σ. Returns
 * entries sorted by conservative score desc, ties broken by id asc (deterministic).
 */
export function displayBoard(
  results: RatingResults,
  today: string,
): BoardEntry[] {
  const entries: BoardEntry[] = Object.entries(results).map(([key, r]) => {
    const id = Number(key);
    const sigma = r.lastPlayedDate
      ? driftSigma(r.sigma, daysBetween(r.lastPlayedDate, today))
      : r.sigma;
    return {
      id,
      mu: r.mu,
      sigma,
      conservative: eloScore(r.mu, sigma),
      lastPlayedDate: r.lastPlayedDate,
    };
  });

  entries.sort((a, b) =>
    b.conservative !== a.conservative
      ? b.conservative - a.conservative
      : a.id - b.id,
  );
  return entries;
}
