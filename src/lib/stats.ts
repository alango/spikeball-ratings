// Stats module (SPEC §11) — PURE and DB-agnostic, like rating/display.
//
// Two jobs:
//   1. Counting stats per player (record, streaks, partners, opponents, scores).
//   2. The rating-over-time series: one point per session, decaying through the
//      sessions a player missed (SPEC §11.2).
//
// This module computes NO rating math of its own. Where a rating is needed it calls
// `driftSigma`/`daysBetween` (rating.ts) and `eloScore` (display.ts) — the same
// arrangement views.ts uses for `eloDelta`, keeping the math in one place
// (CLAUDE.md load-bearing rule).

import { daysBetween, driftSigma } from "./rating";
import { eloScore } from "./display";
import type { GameDeltas } from "./rating";
import type { Game, Pair, PlayerId, RatingResults } from "./types";

/**
 * Games a pairing must share before the page will call it a player's "best" or
 * "worst" partner (SPEC §11.1). Rates below this are still SHOWN — with their raw
 * counts alongside — they just never win a title. 94 games spread over 91 possible
 * pairings means most partnerships sit at 1–3 games; without a floor the headline
 * stat is always a one-game fluke.
 */
export const SUPERLATIVE_MIN_GAMES = 3;

// ---- Ordering ---------------------------------------------------------------

/**
 * Replay order: played-date ASC, then row-id ASC (SPEC §6). Every walk in this
 * module uses it, so a back-dated game lands in its true chronological slot in
 * streaks and series alike — never in insertion order.
 */
export function chronological<T extends { id: number; playedDate: string }>(
  games: T[],
): T[] {
  return [...games].sort((a, b) =>
    a.playedDate < b.playedDate ? -1 : a.playedDate > b.playedDate ? 1 : a.id - b.id,
  );
}

/** Every distinct played-date in the history, oldest first. One per session. */
export function sessionDates(games: { playedDate: string }[]): string[] {
  return [...new Set(games.map((g) => g.playedDate))].sort();
}

/** The four players in a game, with each side's perspective already resolved. */
interface Side {
  playerId: PlayerId;
  partner: PlayerId;
  opponents: Pair;
  won: boolean;
  scoreFor: number | null;
  scoreAgainst: number | null;
}

function sides(g: Game): Side[] {
  const aWon = g.winner === "a";
  const scoreA = g.scoreA ?? null;
  const scoreB = g.scoreB ?? null;
  const out: Side[] = [];
  const add = (team: Pair, opponents: Pair, won: boolean, f: number | null, a: number | null) => {
    for (const playerId of team) {
      out.push({
        playerId,
        partner: team[0] === playerId ? team[1] : team[0],
        opponents,
        won,
        scoreFor: f,
        scoreAgainst: a,
      });
    }
  };
  add(g.teamA, g.teamB, aWon, scoreA, scoreB);
  add(g.teamB, g.teamA, !aWon, scoreB, scoreA);
  return out;
}

// ---- Head-to-head tables ----------------------------------------------------

export interface PartnerRecord {
  playerId: PlayerId;
  games: number;
  wins: number;
  losses: number;
  /** Win rate in games played WITH this partner, 0–1. */
  winPctWith: number;
  /**
   * The same player's win rate in all their OTHER games, 0–1 — null when they have
   * no other games to compare against. Raw "6–1 with Alex" can't separate "we are
   * good together" from "Alex is good"; the paired comparison can (SPEC §11.1).
   */
  winPctWithout: number | null;
}

export interface OpponentRecord {
  playerId: PlayerId;
  games: number;
  wins: number;
  losses: number;
  /** Win rate in games played AGAINST this opponent, 0–1. */
  winPct: number;
}

interface Tally {
  games: number;
  wins: number;
}

const bump = (m: Map<PlayerId, Tally>, id: PlayerId, won: boolean) => {
  const t = m.get(id) ?? { games: 0, wins: 0 };
  t.games += 1;
  if (won) t.wins += 1;
  m.set(id, t);
};

// ---- Streaks ----------------------------------------------------------------

export interface Streak {
  /** "W" for a run of wins, "L" for a run of losses. */
  type: "W" | "L";
  length: number;
}

/** Current streak from a chronological win/loss list; null when they've never played. */
function currentStreak(results: boolean[]): Streak | null {
  if (results.length === 0) return null;
  const type = results[results.length - 1];
  let length = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === type; i--) length += 1;
  return { type: type ? "W" : "L", length };
}

/** Longest run of `want` in a chronological win/loss list. */
function longestStreak(results: boolean[], want: boolean): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r === want ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

// ---- Score-derived stats ----------------------------------------------------

export interface ScoredGameRef {
  gameId: number;
  playedDate: string;
  margin: number;
  scoreFor: number;
  scoreAgainst: number;
}

export interface ScoreStats {
  /**
   * How many of the player's games carried both scores. Scores are nullable in the
   * schema (SPEC §8), so every rate below is over THIS denominator, not total games.
   */
  scoredGames: number;
  /** Mean signed margin (own score − opponents'), positive when winning big. */
  avgMargin: number | null;
  biggestWin: ScoredGameRef | null;
  biggestLoss: ScoredGameRef | null;
  /** Games decided by exactly 2 — the ones that went to deuce. */
  deuceGames: number;
}

// ---- Rating-derived stats ---------------------------------------------------

export interface RatingSwing {
  gameId: number;
  playedDate: string;
  /** Elo-scale change this game produced. */
  delta: number;
}

export interface RatingStats {
  /** Rating after their most recent game, Elo scale — no drift past that date. */
  current: number | null;
  peak: { elo: number; playedDate: string } | null;
  biggestGain: RatingSwing | null;
  biggestLoss: RatingSwing | null;
}

// ---- Per-player stats -------------------------------------------------------

export interface PlayerStats {
  id: PlayerId;
  games: number;
  wins: number;
  losses: number;
  /** Overall win rate, 0–1; null when they've never played. */
  winPct: number | null;
  /** Distinct dates they appeared on. */
  sessions: number;
  firstPlayed: string | null;
  lastPlayed: string | null;
  currentStreak: Streak | null;
  longestWinStreak: number;
  longestLossStreak: number;
  partners: PartnerRecord[];
  opponents: OpponentRecord[];
  scores: ScoreStats;
  rating: RatingStats;
}

/**
 * Every rostered player's stats, keyed by id. Computed for all players on each read
 * rather than just a selected one, so the page's dropdown switches with no refetch
 * (SPEC §11.4) — at league scale the whole thing is one pass over the games.
 *
 * `deltas` (from `rebuildWithDeltas`) supplies the rating-derived stats; without it
 * the counting stats still work and `rating` comes back empty.
 */
export function playerStats(
  roster: PlayerId[],
  games: Game[],
  deltas?: GameDeltas,
): Record<PlayerId, PlayerStats> {
  const ordered = chronological(games);

  // Per-player accumulators, all filled in one chronological pass.
  const results = new Map<PlayerId, boolean[]>();
  const dates = new Map<PlayerId, Set<string>>();
  const partners = new Map<PlayerId, Map<PlayerId, Tally>>();
  const opponents = new Map<PlayerId, Map<PlayerId, Tally>>();
  const scored = new Map<PlayerId, ScoredGameRef[]>();
  const swings = new Map<PlayerId, RatingSwing[]>();
  const ratingLine = new Map<PlayerId, { elo: number; playedDate: string }[]>();

  const seen = (id: PlayerId) => {
    if (!results.has(id)) {
      results.set(id, []);
      dates.set(id, new Set());
      partners.set(id, new Map());
      opponents.set(id, new Map());
      scored.set(id, []);
      swings.set(id, []);
      ratingLine.set(id, []);
    }
  };
  for (const id of roster) seen(id);

  for (const g of ordered) {
    for (const s of sides(g)) {
      const { playerId: id } = s;
      seen(id); // a game may reference a player not in the passed roster
      results.get(id)!.push(s.won);
      dates.get(id)!.add(g.playedDate);
      bump(partners.get(id)!, s.partner, s.won);
      for (const o of s.opponents) bump(opponents.get(id)!, o, s.won);

      if (s.scoreFor !== null && s.scoreAgainst !== null) {
        scored.get(id)!.push({
          gameId: g.id,
          playedDate: g.playedDate,
          margin: s.scoreFor - s.scoreAgainst,
          scoreFor: s.scoreFor,
          scoreAgainst: s.scoreAgainst,
        });
      }

      const d = deltas?.[g.id]?.[id];
      if (d) {
        const before = eloScore(d.muBefore, d.sigmaBefore);
        const after = eloScore(d.muAfter, d.sigmaAfter);
        swings.get(id)!.push({
          gameId: g.id,
          playedDate: g.playedDate,
          delta: Math.round(after - before),
        });
        ratingLine.get(id)!.push({ elo: Math.round(after), playedDate: g.playedDate });
      }
    }
  }

  const out: Record<PlayerId, PlayerStats> = {};
  for (const id of results.keys()) {
    const res = results.get(id)!;
    const wins = res.filter(Boolean).length;
    const games_ = res.length;
    const played = [...dates.get(id)!].sort();

    // "Without" is measured over the player's own other games, so the two rates are
    // directly comparable — same player, disjoint game sets.
    const partnerRows: PartnerRecord[] = [...partners.get(id)!.entries()]
      .map(([pid, t]) => {
        const otherGames = games_ - t.games;
        const otherWins = wins - t.wins;
        return {
          playerId: pid,
          games: t.games,
          wins: t.wins,
          losses: t.games - t.wins,
          winPctWith: t.wins / t.games,
          winPctWithout: otherGames > 0 ? otherWins / otherGames : null,
        };
      })
      .sort((a, b) => b.games - a.games || a.playerId - b.playerId);

    const opponentRows: OpponentRecord[] = [...opponents.get(id)!.entries()]
      .map(([pid, t]) => ({
        playerId: pid,
        games: t.games,
        wins: t.wins,
        losses: t.games - t.wins,
        winPct: t.wins / t.games,
      }))
      .sort((a, b) => b.games - a.games || a.playerId - b.playerId);

    const sc = scored.get(id)!;
    const wins_ = sc.filter((s) => s.margin > 0);
    const losses_ = sc.filter((s) => s.margin < 0);
    const scores: ScoreStats = {
      scoredGames: sc.length,
      avgMargin: sc.length > 0 ? sc.reduce((a, s) => a + s.margin, 0) / sc.length : null,
      biggestWin: wins_.reduce<ScoredGameRef | null>(
        (best, s) => (best === null || s.margin > best.margin ? s : best),
        null,
      ),
      biggestLoss: losses_.reduce<ScoredGameRef | null>(
        (worst, s) => (worst === null || s.margin < worst.margin ? s : worst),
        null,
      ),
      deuceGames: sc.filter((s) => Math.abs(s.margin) === 2).length,
    };

    const sw = swings.get(id)!;
    const line = ratingLine.get(id)!;
    const rating: RatingStats = {
      current: line.length > 0 ? line[line.length - 1].elo : null,
      peak: line.reduce<{ elo: number; playedDate: string } | null>(
        (best, p) => (best === null || p.elo > best.elo ? p : best),
        null,
      ),
      biggestGain: sw.reduce<RatingSwing | null>(
        (best, s) => (s.delta > 0 && (best === null || s.delta > best.delta) ? s : best),
        null,
      ),
      biggestLoss: sw.reduce<RatingSwing | null>(
        (worst, s) => (s.delta < 0 && (worst === null || s.delta < worst.delta) ? s : worst),
        null,
      ),
    };

    out[id] = {
      id,
      games: games_,
      wins,
      losses: games_ - wins,
      winPct: games_ > 0 ? wins / games_ : null,
      sessions: played.length,
      firstPlayed: played[0] ?? null,
      lastPlayed: played[played.length - 1] ?? null,
      currentStreak: currentStreak(res),
      longestWinStreak: longestStreak(res, true),
      longestLossStreak: longestStreak(res, false),
      partners: partnerRows,
      opponents: opponentRows,
      scores,
      rating,
    };
  }
  return out;
}

// ---- Rating-over-time series (SPEC §11.2) -----------------------------------

export interface SeriesPoint {
  /** The session's played-date. */
  date: string;
  /** Rating on the Elo scale at the end of that session. */
  elo: number;
  /** False on a session the player sat out — the point is drift only. */
  played: boolean;
  /** Games they played that session (0 when absent). */
  games: number;
  /** Change from the previous point; null on their first. */
  delta: number | null;
}

export interface PlayerSeries {
  playerId: PlayerId;
  points: SeriesPoint[];
}

/**
 * One point per session per player, from that player's FIRST session onward.
 *
 * On a session they played, the point is their rating after that session's last game
 * — write-path drift is already baked in there (SPEC §5.1), so it reads as "what you
 * were worth walking off the court".
 *
 * On a session they missed, μ is unchanged and σ is drifted from their last game to
 * that session's date — exactly what `displayBoard` does for today (SPEC §5.2). This
 * is why lines sag through gaps instead of running flat: an absent player really is
 * losing board rating, and a graph that hid it would contradict the leaderboard
 * (SPEC §11.2).
 *
 * Nothing is emitted before a player's first game: a flat default line for the weeks
 * before they joined is noise, not information.
 */
export function ratingSeries(
  roster: PlayerId[],
  games: Game[],
  deltas: GameDeltas,
): PlayerSeries[] {
  const ordered = chronological(games);
  const dates = sessionDates(ordered);

  // Walk the history once, recording each player's raw (μ, σ) after the last game
  // they played on each date, plus how many games that was.
  interface Snapshot {
    mu: number;
    sigma: number;
    games: number;
  }
  const byPlayer = new Map<PlayerId, Map<string, Snapshot>>();
  for (const g of ordered) {
    for (const id of [...g.teamA, ...g.teamB]) {
      const d = deltas[g.id]?.[id];
      if (!d) continue;
      const perDate = byPlayer.get(id) ?? new Map<string, Snapshot>();
      const prior = perDate.get(g.playedDate);
      perDate.set(g.playedDate, {
        mu: d.muAfter,
        sigma: d.sigmaAfter,
        games: (prior?.games ?? 0) + 1,
      });
      byPlayer.set(id, perDate);
    }
  }

  const ids = [...new Set([...roster, ...byPlayer.keys()])].sort((a, b) => a - b);
  const series: PlayerSeries[] = [];

  for (const playerId of ids) {
    const perDate = byPlayer.get(playerId);
    if (!perDate || perDate.size === 0) continue; // never played: no line to draw

    const firstDate = [...perDate.keys()].sort()[0];
    const points: SeriesPoint[] = [];
    let last: { mu: number; sigma: number; date: string } | null = null;

    for (const date of dates) {
      if (date < firstDate) continue;
      const snap = perDate.get(date);
      let elo: number;
      if (snap) {
        last = { mu: snap.mu, sigma: snap.sigma, date };
        elo = eloScore(snap.mu, snap.sigma);
      } else {
        // Absent this session: μ holds, σ drifts from their last game to this date.
        const l = last!;
        elo = eloScore(l.mu, driftSigma(l.sigma, daysBetween(l.date, date)));
      }
      const rounded = Math.round(elo);
      const prev = points[points.length - 1];
      points.push({
        date,
        elo: rounded,
        played: Boolean(snap),
        games: snap?.games ?? 0,
        delta: prev ? rounded - prev.elo : null,
      });
    }
    series.push({ playerId, points });
  }
  return series;
}

// ---- League-wide totals -----------------------------------------------------

export interface LeagueStats {
  games: number;
  sessions: number;
  players: number;
  /** Rostered players who have played at least one game. */
  activePlayers: number;
  firstSession: string | null;
  lastSession: string | null;
  scoredGames: number;
  /** Distinct pairings that have ever played together. */
  distinctPartnerships: number;
}

export function leagueStats(roster: PlayerId[], games: Game[]): LeagueStats {
  const dates = sessionDates(games);
  const active = new Set<PlayerId>();
  const pairs = new Set<string>();
  let scored = 0;
  for (const g of games) {
    for (const id of [...g.teamA, ...g.teamB]) active.add(id);
    for (const team of [g.teamA, g.teamB]) {
      const [x, y] = [...team].sort((a, b) => a - b);
      pairs.add(`${x}-${y}`);
    }
    if ((g.scoreA ?? null) !== null && (g.scoreB ?? null) !== null) scored += 1;
  }
  return {
    games: games.length,
    sessions: dates.length,
    players: roster.length,
    activePlayers: active.size,
    firstSession: dates[0] ?? null,
    lastSession: dates[dates.length - 1] ?? null,
    scoredGames: scored,
    distinctPartnerships: pairs.size,
  };
}

/**
 * Drift-to-today (μ, σ) per player, for the predictor's inputs — the same numbers
 * the board shows, so a prediction can never disagree with the leaderboard
 * (SPEC §11.3). Mirrors `displayBoard`'s drift, without the board's sort/shape.
 */
export function ratingsAsOf(
  results: RatingResults,
  today: string,
): Record<PlayerId, { mu: number; sigma: number }> {
  const out: Record<PlayerId, { mu: number; sigma: number }> = {};
  for (const [key, r] of Object.entries(results)) {
    out[Number(key)] = {
      mu: r.mu,
      sigma: r.lastPlayedDate
        ? driftSigma(r.sigma, daysBetween(r.lastPlayedDate, today))
        : r.sigma,
    };
  }
  return out;
}
