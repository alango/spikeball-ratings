import { describe, it, expect } from "vitest";
import {
  chronological,
  leagueStats,
  playerStats,
  ratingSeries,
  ratingsAsOf,
  sessionDates,
} from "./stats";
import { rebuildWithDeltas, DEFAULT_MU, DEFAULT_SIGMA } from "./rating";
import type { Game, RatingResults } from "./types";

// Synthetic history in the shape SPEC §10 asks for: an inactivity gap (1 sits out
// the 2026-03-xx sessions), a back-dated game (id 6 predates ids 4/5), and a
// same-day pair (ids 1 and 2 share 2026-01-05).
const ROSTER = [1, 2, 3, 4, 5];

const g = (
  id: number,
  playedDate: string,
  teamA: [number, number],
  teamB: [number, number],
  winner: "a" | "b",
  scoreA: number | null = null,
  scoreB: number | null = null,
): Game => ({ id, playedDate, teamA, teamB, winner, scoreA, scoreB });

const HISTORY: Game[] = [
  g(1, "2026-01-05", [1, 2], [3, 4], "a", 21, 15),
  g(2, "2026-01-05", [1, 3], [2, 4], "a", 21, 19),
  g(3, "2026-01-12", [1, 2], [3, 4], "b", 12, 21),
  g(4, "2026-03-02", [2, 3], [4, 5], "a", 21, 10),
  g(5, "2026-03-09", [2, 4], [3, 5], "b", 19, 21),
  g(6, "2026-02-16", [2, 3], [4, 5], "b", 18, 21), // back-dated: sits before 4 and 5
];

const deltasFor = (games: Game[] = HISTORY) =>
  rebuildWithDeltas(ROSTER, games).deltas;

describe("ordering helpers", () => {
  it("orders by played-date then id, never by array/insertion order", () => {
    expect(chronological(HISTORY).map((x) => x.id)).toEqual([1, 2, 3, 6, 4, 5]);
  });

  it("collapses sessions to distinct dates, oldest first", () => {
    expect(sessionDates(HISTORY)).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-02-16",
      "2026-03-02",
      "2026-03-09",
    ]);
  });
});

describe("playerStats — record and streaks", () => {
  const stats = playerStats(ROSTER, HISTORY, deltasFor());

  it("counts every game from each player's own side", () => {
    // Player 1: games 1, 2 (both wins) and 3 (a loss).
    expect(stats[1].games).toBe(3);
    expect(stats[1].wins).toBe(2);
    expect(stats[1].losses).toBe(1);
    expect(stats[1].winPct).toBeCloseTo(2 / 3, 10);
  });

  it("counts distinct sessions, not games", () => {
    // Player 1 played twice on 2026-01-05 and once on 2026-01-12.
    expect(stats[1].sessions).toBe(2);
    expect(stats[1].firstPlayed).toBe("2026-01-05");
    expect(stats[1].lastPlayed).toBe("2026-01-12");
  });

  it("reads streaks in replay order, so a back-dated game lands in its true slot", () => {
    // Player 5 chronologically: game 6 (win), 4 (loss), 5 (win). Entry order would
    // have given 4, 5, 6 — a current streak of 1 loss instead of 1 win.
    expect(stats[5].currentStreak).toEqual({ type: "W", length: 1 });
    expect(stats[5].longestWinStreak).toBe(1);
  });

  it("tracks the longest run, not just the current one", () => {
    // Player 2 chronologically: 1 W, 2 L, 3 L, 6 L, 4 W, 5 L.
    expect(stats[2].longestLossStreak).toBe(3);
    expect(stats[2].currentStreak).toEqual({ type: "L", length: 1 });
  });

  it("gives a never-played roster member an empty, non-null shape", () => {
    const only = playerStats([1, 2, 3, 4, 9], HISTORY, deltasFor());
    expect(only[9].games).toBe(0);
    expect(only[9].winPct).toBeNull();
    expect(only[9].currentStreak).toBeNull();
    expect(only[9].partners).toEqual([]);
    expect(only[9].rating.current).toBeNull();
  });
});

describe("playerStats — partners and opponents", () => {
  const stats = playerStats(ROSTER, HISTORY, deltasFor());

  it("records a partner's shared games from the player's perspective", () => {
    // Player 1 partnered 2 in games 1 (W) and 3 (L).
    const p2 = stats[1].partners.find((p) => p.playerId === 2)!;
    expect(p2).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(p2.winPctWith).toBeCloseTo(0.5, 10);
  });

  it("compares with-partner against the player's OTHER games, not the league", () => {
    // Player 1: 3 games total, 2 wins. With 2: 2 games, 1 win. Without 2: 1 game
    // (game 2, a win) -> 1.0.
    const p2 = stats[1].partners.find((p) => p.playerId === 2)!;
    expect(p2.winPctWithout).toBeCloseTo(1, 10);
  });

  it("leaves winPctWithout null when every game was with that partner", () => {
    // Player 4 and 5 only ever meet as opponents; player 5's partners are 4 (game 6),
    // 3 (game 5) and 5's own... check a player whose games are all with one partner.
    const solo = playerStats([1, 2], [g(1, "2026-01-05", [1, 2], [3, 4], "a")], undefined);
    expect(solo[1].partners[0].winPctWithout).toBeNull();
  });

  it("counts both opponents in every game", () => {
    // Player 1's opponents: game 1 -> 3,4; game 2 -> 2,4; game 3 -> 3,4.
    const byId = Object.fromEntries(stats[1].opponents.map((o) => [o.playerId, o]));
    expect(byId[4].games).toBe(3);
    expect(byId[3].games).toBe(2);
    expect(byId[2].games).toBe(1);
  });

  it("sorts both tables by games played, ties by id", () => {
    expect(stats[1].opponents.map((o) => o.playerId)).toEqual([4, 3, 2]);
  });
});

describe("playerStats — score-derived stats", () => {
  it("uses the scored-games denominator, not total games", () => {
    const mixed: Game[] = [
      g(1, "2026-01-05", [1, 2], [3, 4], "a", 21, 15),
      g(2, "2026-01-06", [1, 2], [3, 4], "a"), // unscored
    ];
    const stats = playerStats(ROSTER, mixed);
    expect(stats[1].games).toBe(2);
    expect(stats[1].scores.scoredGames).toBe(1);
    expect(stats[1].scores.avgMargin).toBeCloseTo(6, 10);
  });

  it("orients the margin to the player, so the same game is +6 and −6", () => {
    const stats = playerStats(ROSTER, HISTORY, deltasFor());
    expect(stats[1].scores.biggestWin!.margin).toBe(6); // game 1: 21–15
    expect(stats[4].scores.biggestLoss!.margin).toBe(-11); // game 4: 10–21
  });

  it("counts deuce games by a margin of exactly 2", () => {
    const stats = playerStats(ROSTER, HISTORY, deltasFor());
    // Game 2 (21–19) and game 5 (19–21) are the two-point games.
    expect(stats[2].scores.deuceGames).toBe(2);
  });

  it("leaves score stats empty when nothing is scored", () => {
    const stats = playerStats(ROSTER, [g(1, "2026-01-05", [1, 2], [3, 4], "a")]);
    expect(stats[1].scores.scoredGames).toBe(0);
    expect(stats[1].scores.avgMargin).toBeNull();
    expect(stats[1].scores.biggestWin).toBeNull();
  });
});

describe("playerStats — rating-derived stats", () => {
  const stats = playerStats(ROSTER, HISTORY, deltasFor());

  it("signs swings: a win gains, a loss drops", () => {
    expect(stats[1].rating.biggestGain!.delta).toBeGreaterThan(0);
    expect(stats[1].rating.biggestLoss!.delta).toBeLessThan(0);
  });

  it("peak is at least the current rating", () => {
    expect(stats[1].rating.peak!.elo).toBeGreaterThanOrEqual(stats[1].rating.current!);
  });

  it("omits rating stats entirely when no deltas are supplied", () => {
    const noDeltas = playerStats(ROSTER, HISTORY);
    expect(noDeltas[1].rating.current).toBeNull();
    expect(noDeltas[1].rating.peak).toBeNull();
    expect(noDeltas[1].games).toBe(3); // counting stats still work
  });
});

describe("ratingSeries — one point per session (SPEC §11.2)", () => {
  const series = ratingSeries(ROSTER, HISTORY, deltasFor());
  const forPlayer = (id: number) => series.find((s) => s.playerId === id)!;

  it("emits a point for every session from the player's first onward", () => {
    // Player 2 played the first session and every one after: all 5 sessions.
    expect(forPlayer(2).points.map((p) => p.date)).toEqual(sessionDates(HISTORY));
  });

  it("emits nothing before a player's first game", () => {
    // Player 5 debuts on the back-dated 2026-02-16, so no Jan points.
    expect(forPlayer(5).points[0].date).toBe("2026-02-16");
    expect(forPlayer(5).points).toHaveLength(3);
  });

  it("draws no line at all for a rostered player who has never played", () => {
    expect(series.find((s) => s.playerId === 99)).toBeUndefined();
    const withGhost = ratingSeries([...ROSTER, 99], HISTORY, deltasFor());
    expect(withGhost.find((s) => s.playerId === 99)).toBeUndefined();
  });

  it("collapses a multi-game session to its final rating", () => {
    // Player 1 played twice on 2026-01-05; that's one point covering two games.
    const first = forPlayer(1).points[0];
    expect(first.date).toBe("2026-01-05");
    expect(first.games).toBe(2);
    expect(first.played).toBe(true);
  });

  it("decays through sessions a player sat out, instead of running flat", () => {
    // Player 1 last played 2026-01-12 and misses the next three sessions. Drift
    // inflates σ only, so the conservative rating sags rather than holding level.
    const pts = forPlayer(1).points;
    const absent = pts.filter((p) => !p.played);
    expect(absent).toHaveLength(3);
    for (const p of absent) expect(p.games).toBe(0);
    expect(absent[0].elo).toBeLessThan(pts.find((p) => p.date === "2026-01-12")!.elo);
    // Never recovers while absent — no game, no gain.
    for (let i = 1; i < absent.length; i++) {
      expect(absent[i].elo).toBeLessThanOrEqual(absent[i - 1].elo);
    }
  });

  it("bottoms out once σ hits the brand-new ceiling, rather than sinking forever", () => {
    // driftSigma caps σ at DEFAULT_SIGMA (rating.ts): nobody looks *more* uncertain
    // than a fresh player, so a long absence flattens instead of falling off a cliff.
    // Player 1 has few games, so their σ is near the cap already and saturates fast.
    const long = ratingSeries(
      ROSTER,
      [...HISTORY, g(7, "2030-01-01", [2, 3], [4, 5], "a")],
      deltasFor([...HISTORY, g(7, "2030-01-01", [2, 3], [4, 5], "a")]),
    );
    const pts = long.find((s) => s.playerId === 1)!.points;
    const last = pts[pts.length - 1];
    expect(last.played).toBe(false);
    // Four years idle lands at the same floor as the three-week absence before it.
    expect(last.elo).toBe(pts[pts.length - 2].elo);
    expect(last.elo).toBeGreaterThan(0);
  });

  it("reports the change from the previous point, null on the first", () => {
    const pts = forPlayer(2).points;
    expect(pts[0].delta).toBeNull();
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].delta).toBe(pts[i].elo - pts[i - 1].elo);
    }
  });

  it("places a back-dated game in its chronological slot, not at the end", () => {
    // Game 6 (2026-02-16) is last in the array but is player 5's debut, so their
    // first point is February and their line runs forward from there.
    expect(forPlayer(5).points.map((p) => p.date)).toEqual([
      "2026-02-16",
      "2026-03-02",
      "2026-03-09",
    ]);
  });
});

describe("leagueStats", () => {
  it("summarizes the history", () => {
    const l = leagueStats(ROSTER, HISTORY);
    expect(l.games).toBe(6);
    expect(l.sessions).toBe(5);
    expect(l.players).toBe(5);
    expect(l.activePlayers).toBe(5);
    expect(l.scoredGames).toBe(6);
    expect(l.firstSession).toBe("2026-01-05");
    expect(l.lastSession).toBe("2026-03-09");
  });

  it("counts a partnership once however often or whichever way round it plays", () => {
    const repeated: Game[] = [
      g(1, "2026-01-05", [1, 2], [3, 4], "a"),
      g(2, "2026-01-06", [2, 1], [4, 3], "b"), // same two pairings, sides swapped
    ];
    expect(leagueStats(ROSTER, repeated).distinctPartnerships).toBe(2);
  });

  it("separates rostered from active players", () => {
    const l = leagueStats([...ROSTER, 42], HISTORY);
    expect(l.players).toBe(6);
    expect(l.activePlayers).toBe(5);
  });
});

describe("ratingsAsOf — predictor inputs match the board", () => {
  const cache: RatingResults = {
    1: { mu: 30, sigma: 4, lastPlayedDate: "2026-01-01" },
    2: { mu: 30, sigma: 4, lastPlayedDate: "2026-06-01" },
    3: { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, lastPlayedDate: null },
  };

  it("inflates σ by each player's gap to today, leaving μ alone", () => {
    const r = ratingsAsOf(cache, "2026-06-01");
    expect(r[1].mu).toBe(30);
    expect(r[1].sigma).toBeGreaterThan(4); // five months idle
    expect(r[2].sigma).toBe(4); // played today
  });

  it("leaves a never-played player at the defaults", () => {
    const r = ratingsAsOf(cache, "2026-06-01");
    expect(r[3]).toEqual({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA });
  });
});
