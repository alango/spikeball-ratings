// Presenters: turn DB rows + rebuilt ratings into name-resolved JSON for the public
// reads. Kept here so the route handlers stay thin and the shapes are defined once.

import { eloDelta, eloBreakdown } from "./display";
import type { BoardEntry } from "./display";
import type { GameRow } from "./db";
import type { GameDeltas } from "./rating";
import type { Player, PlayerId } from "./types";

/**
 * A player is "provisional" until they've played this many games (SPEC §2). A game
 * count is used rather than a σ threshold because openskill's σ barely shrinks under
 * repeated play (see display.ts) — a count is intuitive and stable against drift.
 */
export const PROVISIONAL_MIN_GAMES = 5;

export type NameMap = Record<PlayerId, string>;

export function nameMap(players: Player[]): NameMap {
  const m: NameMap = {};
  for (const p of players) m[p.id] = p.name;
  return m;
}

const playerRef = (id: PlayerId, names: NameMap, ratingDelta: number | null = null) => ({
  id,
  name: names[id] ?? `#${id}`,
  ratingDelta,
});

// ---- Win/loss record (from history, win/loss only — SPEC §2) ----------------

export interface PlayerRecord {
  wins: number;
  losses: number;
}

export function recordMap(games: GameRow[]): Record<PlayerId, PlayerRecord> {
  const rec: Record<PlayerId, PlayerRecord> = {};
  const bump = (id: PlayerId, won: boolean) => {
    const r = (rec[id] ??= { wins: 0, losses: 0 });
    if (won) r.wins += 1;
    else r.losses += 1;
  };
  for (const g of games) {
    const winners = g.winner === "a" ? g.teamA : g.teamB;
    const losers = g.winner === "a" ? g.teamB : g.teamA;
    for (const id of winners) bump(id, true);
    for (const id of losers) bump(id, false);
  }
  return rec;
}

// ---- Recent form (the board's "Last 5" column) ------------------------------

/** How many recent results the board's form column shows. */
export const FORM_GAMES = 5;

export interface FormResult {
  gameId: number;
  playedDate: string;
  won: boolean;
  /** Elo-scale change this game gave the player — same number the history hover shows. */
  ratingDelta: number | null;
}

export type FormMap = Record<PlayerId, FormResult[]>;

/**
 * Each player's most recent {@link FORM_GAMES} results in chronological order — the
 * order they're read left-to-right on the board, so the LAST entry is the newest.
 * Recency follows the replay order (played-date, then row-id — SPEC §6) and NOT
 * insertion time, so a back-dated game lands in its true chronological slot here too.
 * Deltas come from `rebuildWithDeltas`; without them the results still show, just
 * without the hover.
 */
export function formMap(games: GameRow[], deltas?: GameDeltas): FormMap {
  const form: FormMap = {};
  const ordered = [...games].sort((a, b) =>
    a.playedDate < b.playedDate ? -1 : a.playedDate > b.playedDate ? 1 : a.id - b.id,
  );
  for (const g of ordered) {
    const push = (id: PlayerId, won: boolean) => {
      const d = deltas?.[g.id]?.[id];
      const list = (form[id] ??= []);
      list.push({
        gameId: g.id,
        playedDate: g.playedDate,
        won,
        ratingDelta: d ? eloDelta(d) : null,
      });
      if (list.length > FORM_GAMES) list.shift();
    };
    const winners = g.winner === "a" ? g.teamA : g.teamB;
    const losers = g.winner === "a" ? g.teamB : g.teamA;
    for (const id of winners) push(id, true);
    for (const id of losers) push(id, false);
  }
  return form;
}

// ---- Board view -------------------------------------------------------------

export interface Standing {
  rank: number;
  id: PlayerId;
  name: string;
  /** Conservative score on an Elo-like scale (~1500 center), drift-adjusted to today. */
  rating: number;
  /** Raw openskill μ (drift-adjusted, one decimal) — for the rating-breakdown hover. */
  mu: number;
  /** Raw openskill σ (drift-adjusted, one decimal) — for the rating-breakdown hover. */
  sigma: number;
  /** Rating if fully certain (σ→0), Elo scale. `ceiling − uncertainty === rating`. */
  ceiling: number;
  /** Elo points currently docked for uncertainty (`ceiling − rating`). */
  uncertainty: number;
  provisional: boolean;
  wins: number;
  losses: number;
  /** Up to {@link FORM_GAMES} most recent results, oldest first (newest last). */
  form: FormResult[];
  lastPlayedDate: string | null;
}

export function boardView(
  entries: BoardEntry[],
  names: NameMap,
  records: Record<PlayerId, PlayerRecord>,
  form: FormMap = {},
): Standing[] {
  return entries.map((e, i) => {
    const wins = records[e.id]?.wins ?? 0;
    const losses = records[e.id]?.losses ?? 0;
    const breakdown = eloBreakdown(e.mu, e.sigma);
    return {
      rank: i + 1,
      id: e.id,
      name: names[e.id] ?? `#${e.id}`,
      rating: Math.round(e.conservative),
      ...breakdown,
      provisional: wins + losses < PROVISIONAL_MIN_GAMES,
      wins,
      losses,
      form: form[e.id] ?? [],
      lastPlayedDate: e.lastPlayedDate,
    };
  });
}

// ---- History view -----------------------------------------------------------

export interface GameView {
  id: number;
  playedDate: string;
  teamA: ReturnType<typeof playerRef>[];
  teamB: ReturnType<typeof playerRef>[];
  winner: "a" | "b";
  scoreA: number | null;
  scoreB: number | null;
}

/**
 * Games newest-first for the public history (by played_date desc, id desc). When
 * `deltas` is supplied (from `rebuildWithDeltas`), each player carries the rating
 * gain/loss that game produced (`ratingDelta`) for the history hover; otherwise null.
 */
export function historyView(
  games: GameRow[],
  names: NameMap,
  deltas?: GameDeltas,
): GameView[] {
  const deltaFor = (gameId: number, id: PlayerId): number | null => {
    const d = deltas?.[gameId]?.[id];
    return d ? eloDelta(d) : null;
  };
  return [...games]
    .sort((a, b) =>
      a.playedDate > b.playedDate ? -1 : a.playedDate < b.playedDate ? 1 : b.id - a.id,
    )
    .map((g) => ({
      id: g.id,
      playedDate: g.playedDate,
      teamA: g.teamA.map((id) => playerRef(id, names, deltaFor(g.id, id))),
      teamB: g.teamB.map((id) => playerRef(id, names, deltaFor(g.id, id))),
      winner: g.winner,
      scoreA: g.scoreA,
      scoreB: g.scoreB,
    }));
}
