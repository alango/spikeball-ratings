import { describe, it, expect } from "vitest";
import { validateGameInput } from "./validate";

const ROSTER = [1, 2, 3, 4, 5];
const base = {
  playedDate: "2026-06-01",
  teamA: [1, 2],
  teamB: [3, 4],
  winner: "a",
  scoreA: 21,
  scoreB: 15,
};

describe("validateGameInput", () => {
  it("accepts a well-formed game", () => {
    const r = validateGameInput(base, ROSTER);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.teamA).toEqual([1, 2]);
  });

  it("accepts a game with no scores", () => {
    const r = validateGameInput({ ...base, scoreA: null, scoreB: null }, ROSTER);
    expect(r.ok).toBe(true);
  });

  it("accepts omitted scores as null", () => {
    const r = validateGameInput(
      { playedDate: "2026-06-01", teamA: [1, 2], teamB: [3, 4], winner: "b" },
      ROSTER,
    );
    expect(r.ok && r.value.scoreA).toBe(null);
  });

  it("rejects a bad date", () => {
    expect(validateGameInput({ ...base, playedDate: "2026-13-40" }, ROSTER).ok).toBe(false);
    expect(validateGameInput({ ...base, playedDate: "06/01/2026" }, ROSTER).ok).toBe(false);
  });

  it("rejects duplicate players", () => {
    expect(validateGameInput({ ...base, teamB: [1, 4] }, ROSTER).ok).toBe(false);
  });

  it("rejects an off-roster player", () => {
    expect(validateGameInput({ ...base, teamB: [3, 99] }, ROSTER).ok).toBe(false);
  });

  it("rejects a bad winner", () => {
    expect(validateGameInput({ ...base, winner: "x" }, ROSTER).ok).toBe(false);
  });

  it("rejects a lone score", () => {
    expect(validateGameInput({ ...base, scoreB: null }, ROSTER).ok).toBe(false);
  });

  it("rejects a negative or non-integer score", () => {
    expect(validateGameInput({ ...base, scoreA: -1 }, ROSTER).ok).toBe(false);
    expect(validateGameInput({ ...base, scoreA: 1.5 }, ROSTER).ok).toBe(false);
  });

  it("rejects malformed teams", () => {
    expect(validateGameInput({ ...base, teamA: [1] }, ROSTER).ok).toBe(false);
    expect(validateGameInput({ ...base, teamA: "1,2" }, ROSTER).ok).toBe(false);
  });
});
