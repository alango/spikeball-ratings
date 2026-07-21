import { describe, it, expect } from "vitest";
import { displayBoard, eloBreakdown, eloScore, DISPLAY_Z, ELO_ALPHA, ELO_TARGET } from "./display";
import { DEFAULT_MU, DEFAULT_SIGMA } from "./rating";
import type { RatingResults } from "./types";

describe("eloBreakdown — ceiling/uncertainty reconcile to the shown rating", () => {
  it("ceiling − uncertainty equals the shown (conservative) rating", () => {
    const { ceiling, uncertainty } = eloBreakdown(27, 4.5);
    const shown = Math.round(eloScore(27, 4.5));
    expect(ceiling - uncertainty).toBe(shown);
  });

  it("ceiling is the σ→0 rating and uncertainty grows with σ", () => {
    const { ceiling } = eloBreakdown(27, 4.5);
    expect(ceiling).toBe(Math.round(eloScore(27, 0)));
    expect(eloBreakdown(27, 6).uncertainty).toBeGreaterThan(eloBreakdown(27, 4).uncertainty);
  });

  it("a brand-new player: ceiling above 1500, docked back down to ~1500", () => {
    const { ceiling, uncertainty } = eloBreakdown(DEFAULT_MU, DEFAULT_SIGMA);
    expect(ceiling).toBeGreaterThan(ELO_TARGET);
    expect(ceiling - uncertainty).toBe(ELO_TARGET);
  });
});

describe("displayBoard — conservative score & sorting", () => {
  it("sorts by μ − 3σ desc, ties broken by id", () => {
    const results: RatingResults = {
      1: { mu: 30, sigma: 2, lastPlayedDate: "2026-06-01" }, // 24
      2: { mu: 28, sigma: 2, lastPlayedDate: "2026-06-01" }, // 22
      3: { mu: 40, sigma: 6, lastPlayedDate: "2026-06-01" }, // 22 -> tie with 2, lower id first
    };
    const board = displayBoard(results, "2026-06-01");
    expect(board.map((e) => e.id)).toEqual([1, 2, 3]);
    // Elo-scaled conservative: alpha·(μ − 3σ) + 1500.
    expect(board[0].conservative).toBeCloseTo(ELO_ALPHA * (30 - DISPLAY_Z * 2) + ELO_TARGET, 6);
  });

  it("a brand-new player sits exactly at the Elo baseline (μ − 3σ = 0 → 1500)", () => {
    const results: RatingResults = {
      1: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, lastPlayedDate: null },
    };
    expect(displayBoard(results, "2026-06-01")[0].conservative).toBeCloseTo(ELO_TARGET, 6);
  });

  it("never-played players sit at the default and rank last among the listed", () => {
    const results: RatingResults = {
      1: { mu: 28, sigma: 2, lastPlayedDate: "2026-06-01" },
      2: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, lastPlayedDate: null },
    };
    const board = displayBoard(results, "2026-06-01");
    expect(board[1].id).toBe(2);
    expect(board[1].sigma).toBeCloseTo(DEFAULT_SIGMA, 10); // no drift applied
    expect(board[1].conservative).toBeCloseTo(ELO_TARGET, 6);
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
