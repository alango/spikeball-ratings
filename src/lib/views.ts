// Presenters: turn DB rows + rebuilt ratings into name-resolved JSON for the public
// reads. Kept here so the route handlers stay thin and the shapes are defined once.

import type { BoardEntry } from "./display";
import type { GameRow } from "./db";
import type { Player, PlayerId } from "./types";

export type NameMap = Record<PlayerId, string>;

export function nameMap(players: Player[]): NameMap {
  const m: NameMap = {};
  for (const p of players) m[p.id] = p.name;
  return m;
}

const playerRef = (id: PlayerId, names: NameMap) => ({ id, name: names[id] ?? `#${id}` });

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

// ---- Board view -------------------------------------------------------------

export interface Standing {
  rank: number;
  id: PlayerId;
  name: string;
  /** Conservative score μ − 3σ, drift-adjusted to today (the public number). */
  rating: number;
  provisional: boolean;
  wins: number;
  losses: number;
  lastPlayedDate: string | null;
}

export function boardView(
  entries: BoardEntry[],
  names: NameMap,
  records: Record<PlayerId, PlayerRecord>,
): Standing[] {
  return entries.map((e, i) => ({
    rank: i + 1,
    id: e.id,
    name: names[e.id] ?? `#${e.id}`,
    rating: Math.round(e.conservative * 10) / 10,
    provisional: e.provisional,
    wins: records[e.id]?.wins ?? 0,
    losses: records[e.id]?.losses ?? 0,
    lastPlayedDate: e.lastPlayedDate,
  }));
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

/** Games newest-first for the public history (by played_date desc, id desc). */
export function historyView(games: GameRow[], names: NameMap): GameView[] {
  return [...games]
    .sort((a, b) =>
      a.playedDate > b.playedDate ? -1 : a.playedDate < b.playedDate ? 1 : b.id - a.id,
    )
    .map((g) => ({
      id: g.id,
      playedDate: g.playedDate,
      teamA: g.teamA.map((id) => playerRef(id, names)),
      teamB: g.teamB.map((id) => playerRef(id, names)),
      winner: g.winner,
      scoreA: g.scoreA,
      scoreB: g.scoreB,
    }));
}
