import { describe, it, expect } from "vitest";
import { boardView, recordMap, PROVISIONAL_MIN_GAMES, nameMap } from "./views";
import type { BoardEntry } from "./display";
import type { GameRow } from "./db";
import type { Player } from "./types";

const entry = (id: number, conservative: number): BoardEntry => ({
  id,
  mu: 25,
  sigma: 5,
  conservative,
  lastPlayedDate: "2026-06-01",
});

const players: Player[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

describe("recordMap", () => {
  it("tallies wins/losses by winner (win/loss only)", () => {
    const games: GameRow[] = [
      { id: 1, playedDate: "2026-06-01", teamA: [1, 2], teamB: [3, 4], winner: "a", scoreA: 21, scoreB: 5 },
      { id: 2, playedDate: "2026-06-02", teamA: [1, 3], teamB: [2, 4], winner: "b", scoreA: null, scoreB: null },
    ];
    const rec = recordMap(games);
    expect(rec[1]).toEqual({ wins: 1, losses: 1 });
    expect(rec[2]).toEqual({ wins: 2, losses: 0 });
    expect(rec[4]).toEqual({ wins: 1, losses: 1 });
  });
});

describe("boardView — provisional by games played (SPEC §2)", () => {
  const entries = [entry(1, 1600), entry(2, 1400)];

  it(`flags players with fewer than ${PROVISIONAL_MIN_GAMES} games as provisional`, () => {
    const records = {
      1: { wins: 3, losses: 1 }, // 4 games  -> provisional
      2: { wins: 3, losses: 2 }, // 5 games  -> established
    };
    const board = boardView(entries, nameMap(players), records);
    expect(board[0]).toMatchObject({ rank: 1, name: "Alice", rating: 1600, provisional: true });
    expect(board[1]).toMatchObject({ rank: 2, name: "Bob", rating: 1400, provisional: false });
  });

  it("a player with no games is provisional", () => {
    const board = boardView([entry(1, 1500)], nameMap(players), {});
    expect(board[0].provisional).toBe(true);
    expect(board[0].wins).toBe(0);
  });

  it("exactly the threshold count is established", () => {
    const records = { 1: { wins: PROVISIONAL_MIN_GAMES, losses: 0 } };
    expect(boardView([entry(1, 1700)], nameMap(players), records)[0].provisional).toBe(false);
  });
});
