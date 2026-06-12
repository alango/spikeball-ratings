// Pure validation for admin game input (SPEC §7: pick four DISTINCT players from
// the roster, never free-typed). Kept pure so it can be unit-tested and reused by
// the log and edit routes.

import type { GameInput } from "./db";
import type { PlayerId } from "./types";

export interface GameInputRaw {
  playedDate?: unknown;
  teamA?: unknown;
  teamB?: unknown;
  winner?: unknown;
  scoreA?: unknown;
  scoreB?: unknown;
}

export type ValidationResult =
  | { ok: true; value: GameInput }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  // Round-trips through UTC parsing iff it's a real calendar date.
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function asPair(v: unknown): [PlayerId, PlayerId] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  if (!v.every((x) => Number.isInteger(x))) return null;
  return [v[0], v[1]];
}

function asScore(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  if (Number.isInteger(v) && (v as number) >= 0) return v as number;
  return undefined; // sentinel: present but invalid
}

/** Validate raw client input against the current roster. */
export function validateGameInput(
  raw: GameInputRaw,
  rosterIds: PlayerId[],
): ValidationResult {
  if (typeof raw.playedDate !== "string" || !isValidDate(raw.playedDate)) {
    return { ok: false, error: "playedDate must be a valid YYYY-MM-DD date" };
  }
  const teamA = asPair(raw.teamA);
  const teamB = asPair(raw.teamB);
  if (!teamA || !teamB) {
    return { ok: false, error: "teamA and teamB must each be two player ids" };
  }
  const ids = [...teamA, ...teamB];
  if (new Set(ids).size !== 4) {
    return { ok: false, error: "the four players must be distinct" };
  }
  const roster = new Set(rosterIds);
  if (!ids.every((id) => roster.has(id))) {
    return { ok: false, error: "all players must be on the roster" };
  }
  if (raw.winner !== "a" && raw.winner !== "b") {
    return { ok: false, error: "winner must be 'a' or 'b'" };
  }
  const scoreA = asScore(raw.scoreA);
  const scoreB = asScore(raw.scoreB);
  if (scoreA === undefined || scoreB === undefined) {
    return { ok: false, error: "scores must be non-negative integers or omitted" };
  }
  // Scores are optional but should come as a pair if given (SPEC §4 — informational).
  if ((scoreA === null) !== (scoreB === null)) {
    return { ok: false, error: "provide both scores or neither" };
  }
  return {
    ok: true,
    value: { playedDate: raw.playedDate, teamA, teamB, winner: raw.winner, scoreA, scoreB },
  };
}
