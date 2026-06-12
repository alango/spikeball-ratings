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
import type { PlayerId, RatingResults } from "./types";

/** Conservative score is μ − Zσ; Z=3 ≈ 99.7% confidence (SPEC §2). */
export const DISPLAY_Z = 3;

/**
 * A player is "provisional" until σ falls below this fraction of the initial σ
 * (SPEC §2) — tunable. They can be shown but should be visually marked.
 */
export const PROVISIONAL_SIGMA_FRACTION = 0.6;
export const PROVISIONAL_SIGMA = PROVISIONAL_SIGMA_FRACTION * DEFAULT_SIGMA;

export interface BoardEntry {
  id: PlayerId;
  mu: number;
  /** σ after drift-to-today (>= stored σ). */
  sigma: number;
  /** μ − 3σ on the drifted σ — the sort key shown to the public. */
  conservative: number;
  provisional: boolean;
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
      conservative: ordinal({ mu: r.mu, sigma }, { z: DISPLAY_Z }),
      provisional: sigma >= PROVISIONAL_SIGMA,
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
