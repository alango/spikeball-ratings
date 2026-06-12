import { describe, it, expect } from "vitest";
import { displayBoard, PROVISIONAL_SIGMA, DISPLAY_Z } from "./display";
import { DEFAULT_MU, DEFAULT_SIGMA } from "./rating";
import type { RatingResults } from "./types";

describe("displayBoard — conservative score & sorting", () => {
  it("sorts by μ − 3σ desc, ties broken by id", () => {
    const results: RatingResults = {
      1: { mu: 30, sigma: 2, lastPlayedDate: "2026-06-01" }, // 24
      2: { mu: 28, sigma: 2, lastPlayedDate: "2026-06-01" }, // 22
      3: { mu: 40, sigma: 6, lastPlayedDate: "2026-06-01" }, // 22 -> tie with 2, lower id first
    };
    const board = displayBoard(results, "2026-06-01");
    expect(board.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(board[0].conservative).toBeCloseTo(30 - DISPLAY_Z * 2, 6);
  });

  it("never-played players sit at the default and rank last", () => {
    const results: RatingResults = {
      1: { mu: 28, sigma: 2, lastPlayedDate: "2026-06-01" },
      2: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, lastPlayedDate: null },
    };
    const board = displayBoard(results, "2026-06-01");
    expect(board[1].id).toBe(2);
    expect(board[1].sigma).toBeCloseTo(DEFAULT_SIGMA, 10); // no drift applied
    expect(board[1].provisional).toBe(true);
  });
});

describe("displayBoard — inactive players sink over time with no new game (SPEC §5.2)", () => {
  it("the same stored rating yields a lower conservative score later", () => {
    const results: RatingResults = {
      1: { mu: 30, sigma: 3, lastPlayedDate: "2026-01-01" },
    };
    const soon = displayBoard(results, "2026-01-08")[0]; // ~1 week later
    const later = displayBoard(results, "2026-06-01")[0]; // ~5 months later
    expect(later.sigma).toBeGreaterThan(soon.sigma); // σ inflated more by today
    expect(later.conservative).toBeLessThan(soon.conservative); // μ−3σ sinks
    expect(later.mu).toBe(soon.mu); // μ unchanged — drift touches σ only
  });
});

describe("displayBoard — provisional flag flips as σ falls (SPEC §2)", () => {
  it("settled player below the threshold is not provisional", () => {
    const results: RatingResults = {
      1: { mu: 30, sigma: PROVISIONAL_SIGMA - 0.5, lastPlayedDate: "2026-06-01" },
    };
    expect(displayBoard(results, "2026-06-01")[0].provisional).toBe(false);
  });

  it("a settled player who drifts back up becomes provisional again", () => {
    const results: RatingResults = {
      1: { mu: 30, sigma: PROVISIONAL_SIGMA - 0.5, lastPlayedDate: "2026-01-01" },
    };
    // Right after their last game: not provisional. Long after: drifted past the
    // threshold, provisional again.
    expect(displayBoard(results, "2026-01-01")[0].provisional).toBe(false);
    expect(displayBoard(results, "2027-01-01")[0].provisional).toBe(true);
  });
});
