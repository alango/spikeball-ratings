import { describe, it, expect } from "vitest";
import { isValidFoursome, pairings, predictPairings } from "./predict";
import { DEFAULT_MU, DEFAULT_SIGMA } from "./rating";
import type { Foursome } from "./predict";
import type { PlayerId, Rating } from "./types";

const FOUR: Foursome = [1, 2, 3, 4];

/** Equal, confident ratings unless a test says otherwise. */
const even: Record<PlayerId, Rating> = {
  1: { mu: 25, sigma: 2 },
  2: { mu: 25, sigma: 2 },
  3: { mu: 25, sigma: 2 },
  4: { mu: 25, sigma: 2 },
};

describe("pairings — the three distinct 2v2 splits", () => {
  it("returns exactly three, not six: A/B are interchangeable", () => {
    expect(pairings(FOUR)).toHaveLength(3);
  });

  it("covers every way to split the four, each player appearing once per split", () => {
    for (const { teamA, teamB } of pairings(FOUR)) {
      expect(new Set([...teamA, ...teamB])).toEqual(new Set(FOUR));
    }
    const keys = pairings(FOUR).map((p) => `${p.teamA.join(",")}|${p.teamB.join(",")}`);
    expect(new Set(keys).size).toBe(3);
  });

  it("is stable however the four are ordered", () => {
    const norm = (four: Foursome) =>
      pairings(four)
        .map((p) => [p.teamA.join(","), p.teamB.join(",")].sort().join("|"))
        .sort();
    expect(norm([4, 3, 2, 1])).toEqual(norm(FOUR));
    expect(norm([2, 4, 1, 3])).toEqual(norm(FOUR));
  });
});

describe("isValidFoursome", () => {
  it("requires four distinct players", () => {
    expect(isValidFoursome([1, 2, 3, 4])).toBe(true);
    expect(isValidFoursome([1, 2, 3])).toBe(false);
    expect(isValidFoursome([1, 2, 3, 4, 5])).toBe(false);
    expect(isValidFoursome([1, 2, 3, 3])).toBe(false);
  });
});

describe("predictPairings", () => {
  it("gives every split two probabilities that sum to 1", () => {
    for (const p of predictPairings(FOUR, even)) {
      expect(p.probA + p.probB).toBeCloseTo(1, 10);
    }
  });

  it("calls four equal players a coin flip whichever way they split", () => {
    for (const p of predictPairings(FOUR, even)) {
      expect(p.probA).toBeCloseTo(0.5, 6);
      expect(p.imbalance).toBeCloseTo(0, 6);
    }
  });

  it("favours the stronger pairing", () => {
    const skewed: Record<PlayerId, Rating> = {
      1: { mu: 35, sigma: 2 },
      2: { mu: 35, sigma: 2 },
      3: { mu: 15, sigma: 2 },
      4: { mu: 15, sigma: 2 },
    };
    const stacked = predictPairings(FOUR, skewed).find(
      (p) => p.teamA.join() === "1,2" || p.teamB.join() === "1,2",
    )!;
    const strongIsA = stacked.teamA.join() === "1,2";
    expect(strongIsA ? stacked.probA : stacked.probB).toBeGreaterThan(0.9);
  });

  it("sorts most balanced first, so the fairest split leads", () => {
    const skewed: Record<PlayerId, Rating> = {
      1: { mu: 35, sigma: 2 },
      2: { mu: 30, sigma: 2 },
      3: { mu: 20, sigma: 2 },
      4: { mu: 15, sigma: 2 },
    };
    const out = predictPairings(FOUR, skewed);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].imbalance).toBeGreaterThanOrEqual(out[i - 1].imbalance);
    }
    // Strongest with weakest is the fair one; the two stacked splits are worse.
    expect(new Set([...out[0].teamA])).toEqual(new Set([1, 4]));
  });

  it("pulls an uncertain player's matchups toward a coin flip", () => {
    // Same μ gap, but player 3 is freshly uncertain: less predictable, closer to 50/50.
    const confident: Record<PlayerId, Rating> = {
      1: { mu: 30, sigma: 1 },
      2: { mu: 30, sigma: 1 },
      3: { mu: 20, sigma: 1 },
      4: { mu: 20, sigma: 1 },
    };
    const uncertain: Record<PlayerId, Rating> = {
      ...confident,
      3: { mu: 20, sigma: 8 },
      4: { mu: 20, sigma: 8 },
    };
    const split = (r: Record<PlayerId, Rating>) =>
      predictPairings(FOUR, r).find((p) => p.teamA.join() === "1,2")!;
    expect(split(uncertain).imbalance).toBeLessThan(split(confident).imbalance);
  });

  it("treats a player with no rating as brand new rather than throwing", () => {
    const partial: Record<PlayerId, Rating> = { 1: { mu: 25, sigma: 2 } };
    const out = predictPairings(FOUR, partial);
    expect(out).toHaveLength(3);
    for (const p of out) expect(Number.isFinite(p.probA)).toBe(true);

    // An unrated player is exactly the openskill default.
    const explicit: Record<PlayerId, Rating> = {
      1: { mu: 25, sigma: 2 },
      2: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
      3: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
      4: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA },
    };
    expect(predictPairings(FOUR, partial)).toEqual(predictPairings(FOUR, explicit));
  });
});
