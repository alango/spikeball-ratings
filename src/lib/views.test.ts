import { describe, it, expect } from "vitest";
import { boardView, historyView, recordMap, PROVISIONAL_MIN_GAMES, nameMap } from "./views";
import type { BoardEntry } from "./display";
import type { GameRow } from "./db";
import type { GameDeltas } from "./rating";
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

describe("historyView — rating deltas threaded onto each player", () => {
  const games: GameRow[] = [
    { id: 1, playedDate: "2026-06-01", teamA: [1, 2], teamB: [3, 4], winner: "a", scoreA: 21, scoreB: 5 },
  ];
  const names = nameMap([...players, { id: 3, name: "Cara" }, { id: 4, name: "Dan" }]);

  it("maps the Elo-scale delta onto the matching player, null when absent", () => {
    // muAfter > muBefore with σ shrinking -> a clear positive Elo delta for id 1.
    const deltas: GameDeltas = {
      1: {
        1: { muBefore: 25, sigmaBefore: 8, muAfter: 27, sigmaAfter: 7 },
      },
    };
    const [g] = historyView(games, names, deltas);
    expect(g.teamA[0]).toMatchObject({ id: 1, ratingDelta: expect.any(Number) });
    expect(g.teamA[0].ratingDelta).toBeGreaterThan(0);
    // No delta supplied for player 2 -> null.
    expect(g.teamA[1].ratingDelta).toBeNull();
  });

  it("leaves every ratingDelta null when no deltas are passed", () => {
    const [g] = historyView(games, names);
    for (const p of [...g.teamA, ...g.teamB]) expect(p.ratingDelta).toBeNull();
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
