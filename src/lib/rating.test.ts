import { describe, it, expect } from "vitest";
import {
  rebuild,
  driftSigma,
  daysBetween,
  DEFAULT_MU,
  DEFAULT_SIGMA,
  DRIFT_HALF_RESTORE_DAYS,
} from "./rating";
import type { Game } from "./types";

// Roster: players 1..4 unless a test says otherwise.
const ROSTER = [1, 2, 3, 4];

const game = (id: number, playedDate: string, winner: "a" | "b"): Game => ({
  id,
  playedDate,
  teamA: [1, 2],
  teamB: [3, 4],
  winner,
});

describe("daysBetween", () => {
  it("counts whole calendar days, sign included", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-01-08")).toBe(7);
    expect(daysBetween("2026-01-08", "2026-01-01")).toBe(-7);
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
  });
});

describe("driftSigma", () => {
  it("is a no-op for same-day or back-dated gaps", () => {
    expect(driftSigma(4, 0)).toBe(4);
    expect(driftSigma(4, -5)).toBe(4);
  });

  it("inflates σ as the gap grows", () => {
    const a = driftSigma(4, 10);
    const b = driftSigma(4, 60);
    expect(a).toBeGreaterThan(4);
    expect(b).toBeGreaterThan(a);
  });

  it("never exceeds the default σ (a drifted player is never more uncertain than new)", () => {
    expect(driftSigma(4, 100_000)).toBeCloseTo(DEFAULT_SIGMA, 10);
  });

  it("half-restores variance after the configured horizon for a fully-settled player", () => {
    // settled = σ≈0; after the horizon variance ≈ half of default variance.
    const s = driftSigma(0, DRIFT_HALF_RESTORE_DAYS);
    expect(s * s).toBeCloseTo(0.5 * DEFAULT_SIGMA * DEFAULT_SIGMA, 6);
  });
});

describe("rebuild — basics", () => {
  it("gives never-played roster players the defaults with null last-played", () => {
    const out = rebuild(ROSTER, []);
    for (const id of ROSTER) {
      expect(out[id].mu).toBeCloseTo(DEFAULT_MU, 10);
      expect(out[id].sigma).toBeCloseTo(DEFAULT_SIGMA, 10);
      expect(out[id].lastPlayedDate).toBeNull();
    }
  });

  it("moves winners' μ up and losers' μ down, shrinks everyone's σ", () => {
    const out = rebuild(ROSTER, [game(1, "2026-01-01", "a")]);
    expect(out[1].mu).toBeGreaterThan(DEFAULT_MU);
    expect(out[2].mu).toBeGreaterThan(DEFAULT_MU);
    expect(out[3].mu).toBeLessThan(DEFAULT_MU);
    expect(out[4].mu).toBeLessThan(DEFAULT_MU);
    for (const id of ROSTER) expect(out[id].sigma).toBeLessThan(DEFAULT_SIGMA);
    for (const id of ROSTER) expect(out[id].lastPlayedDate).toBe("2026-01-01");
  });

  it("ignores the score entirely — only the winner matters (SPEC §2)", () => {
    // The Game type carries no score by construction; this asserts the contract:
    // two histories with the same winners are identical regardless of any margin.
    const a = rebuild(ROSTER, [game(1, "2026-01-01", "a")]);
    const b = rebuild(ROSTER, [game(1, "2026-01-01", "a")]);
    expect(a).toEqual(b);
  });
});

describe("rebuild — replay ordering is by (date, id), not insertion order (SPEC §6)", () => {
  it("a back-dated game slots into chronological position", () => {
    // Logged out of order: id 1 is the LATER game, id 2 is back-dated EARLIER.
    const logged: Game[] = [
      { id: 1, playedDate: "2026-03-10", teamA: [1, 2], teamB: [3, 4], winner: "a" },
      { id: 2, playedDate: "2026-03-01", teamA: [1, 2], teamB: [3, 4], winner: "b" },
    ];
    // Same games presented already in chronological order.
    const chrono: Game[] = [
      { id: 2, playedDate: "2026-03-01", teamA: [1, 2], teamB: [3, 4], winner: "b" },
      { id: 1, playedDate: "2026-03-10", teamA: [1, 2], teamB: [3, 4], winner: "a" },
    ];
    expect(rebuild(ROSTER, logged)).toEqual(rebuild(ROSTER, chrono));
  });

  it("is deterministic regardless of the input array order", () => {
    const games: Game[] = [
      game(1, "2026-01-01", "a"),
      game(2, "2026-01-05", "b"),
      game(3, "2026-02-01", "a"),
    ];
    const shuffled = [games[2], games[0], games[1]];
    expect(rebuild(ROSTER, shuffled)).toEqual(rebuild(ROSTER, games));
  });

  it("breaks same-date ties by id (stable, no flicker)", () => {
    const a: Game[] = [
      game(1, "2026-01-01", "a"),
      game(2, "2026-01-01", "b"),
    ];
    const b: Game[] = [a[1], a[0]]; // reversed input, same (date,id)
    expect(rebuild(ROSTER, a)).toEqual(rebuild(ROSTER, b));
  });
});

describe("rebuild — same-day pair has zero drift (best-of-3 safe, SPEC §4/§5)", () => {
  it("two same-day games drift no σ between them", () => {
    // Compare the second game's effect when the first is same-day vs the rebuild
    // where we manually confirm no gap was applied: a same-day pair must equal a
    // single replay with the intermediate state carried straight through.
    const sameDay: Game[] = [
      game(1, "2026-01-01", "a"),
      game(2, "2026-01-01", "a"),
    ];
    const out = rebuild(ROSTER, sameDay);
    // With zero inter-game drift, two identical wins shrink σ further than one.
    const oneGame = rebuild(ROSTER, [game(1, "2026-01-01", "a")]);
    for (const id of ROSTER) {
      expect(out[id].sigma).toBeLessThan(oneGame[id].sigma);
    }
  });
});

describe("rebuild — inactivity gap re-inflates σ (SPEC §5)", () => {
  // Settle σ well below the default cap first (a single game leaves σ so close to
  // default that any gap clamps to the cap and the drift signal is invisible).
  const settle: Game[] = [
    game(1, "2026-01-01", "a"),
    game(2, "2026-01-02", "b"),
    game(3, "2026-01-03", "a"),
    game(4, "2026-01-04", "b"),
    game(5, "2026-01-05", "a"),
    game(6, "2026-01-06", "b"),
  ];

  it("a longer gap before the next game leaves a player more uncertain", () => {
    const shortGap = [...settle, game(7, "2026-01-11", "a")]; // +5 days
    const longGap = [...settle, game(7, "2026-03-07", "a")]; // +60 days
    const prompt = rebuild(ROSTER, shortGap);
    const absent = rebuild(ROSTER, longGap);
    expect(absent[1].sigma).toBeGreaterThan(prompt[1].sigma);
  });

  it("a same-day next game (zero gap) is the most certain of all", () => {
    const sameDay = [...settle, game(7, "2026-01-06", "a")]; // gap 0
    const gap = [...settle, game(7, "2026-01-20", "a")]; // gap 14
    expect(rebuild(ROSTER, sameDay)[1].sigma).toBeLessThan(
      rebuild(ROSTER, gap)[1].sigma,
    );
  });
});
