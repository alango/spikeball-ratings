import { describe, it, expect } from "vitest";
import {
  boardView,
  formMap,
  historyView,
  recordMap,
  FORM_GAMES,
  PROVISIONAL_MIN_GAMES,
  nameMap,
} from "./views";
import { eloScore } from "./display";
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

describe("formMap — last-5 results per player", () => {
  const game = (id: number, playedDate: string, winner: "a" | "b"): GameRow => ({
    id,
    playedDate,
    teamA: [1, 2],
    teamB: [3, 4],
    winner,
    scoreA: null,
    scoreB: null,
  });

  it("keeps only the most recent FORM_GAMES, oldest first (newest last)", () => {
    // 7 games, player 1 on the winning side only on the last one.
    const games = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      game(n, `2026-06-0${n}`, n === 7 ? "a" : "b"),
    );
    const form = formMap(games);
    expect(form[1]).toHaveLength(FORM_GAMES);
    expect(form[1].map((r) => r.gameId)).toEqual([3, 4, 5, 6, 7]);
    expect(form[1].at(-1)).toMatchObject({ won: true, playedDate: "2026-06-07" });
    expect(form[1].at(-2)!.won).toBe(false);
    // The losing side of game 7 mirrors it.
    expect(form[3].at(-1)).toMatchObject({ gameId: 7, won: false });
  });

  it("orders by played-date then id, not insertion order (SPEC §6)", () => {
    // A back-dated game entered last must NOT land in the newest (last) slot.
    const games = [game(1, "2026-06-05", "a"), game(2, "2026-06-01", "b")];
    expect(formMap(games)[1].map((r) => r.gameId)).toEqual([2, 1]);
  });

  it("breaks a same-day tie by row id", () => {
    const games = [game(2, "2026-06-01", "a"), game(1, "2026-06-01", "b")];
    expect(formMap(games)[1].map((r) => r.gameId)).toEqual([1, 2]);
  });

  it("threads the Elo delta when supplied, null otherwise", () => {
    const deltas: GameDeltas = {
      1: { 1: { muBefore: 25, sigmaBefore: 8, muAfter: 27, sigmaAfter: 7 } },
    };
    const form = formMap([game(1, "2026-06-01", "a")], deltas);
    expect(form[1][0].ratingDelta).toBeGreaterThan(0);
    expect(form[2][0].ratingDelta).toBeNull();
    expect(formMap([game(1, "2026-06-01", "a")])[1][0].ratingDelta).toBeNull();
  });

  it("gives a player with no games no entry (boardView fills in an empty list)", () => {
    expect(formMap([])[1]).toBeUndefined();
    expect(boardView([entry(1, 1500)], nameMap(players), {}, formMap([]))[0].form).toEqual([]);
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

  it("carries the rating breakdown threaded from each entry's μ/σ", () => {
    // entry() uses μ=25, σ=5; ceiling − uncertainty reconciles to that pair's shown score.
    const board = boardView([entry(1, 1600)], nameMap(players), { 1: { wins: 6, losses: 0 } });
    const s = board[0];
    expect(s.mu).toBe(25);
    expect(s.sigma).toBe(5);
    expect(s.uncertainty).toBeGreaterThan(0);
    expect(s.ceiling - s.uncertainty).toBe(Math.round(eloScore(25, 5)));
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
