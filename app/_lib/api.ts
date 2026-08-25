// Typed client for the API routes. Shapes mirror the route handlers' JSON.

export interface Player {
  id: number;
  name: string;
}

export interface PlayerRef {
  id: number;
  name: string;
  /** Elo-scale rating change this player got from this game (null if unavailable). */
  ratingDelta: number | null;
}

/**
 * One of a player's recent results, for the leaderboard's "Last 5" column. Oriented to
 * that player: their partner, their opponents, their score first.
 */
export interface FormResult {
  gameId: number;
  playedDate: string;
  won: boolean;
  /** Elo-scale rating change this game gave the player (null if unavailable). */
  ratingDelta: number | null;
  teammate: string;
  opponents: [string, string];
  /** Their team's score, then the other team's; both null when the game was unscored. */
  scoreFor: number | null;
  scoreAgainst: number | null;
}

export interface Standing {
  rank: number;
  id: number;
  name: string;
  rating: number;
  /** Raw openskill μ (drift-adjusted) — shown in the rating-breakdown hover. */
  mu: number;
  /** Raw openskill σ (drift-adjusted) — shown in the rating-breakdown hover. */
  sigma: number;
  /** Rating if fully certain (σ→0). `ceiling − uncertainty === rating`. */
  ceiling: number;
  /** Elo points currently docked for uncertainty (`ceiling − rating`). */
  uncertainty: number;
  provisional: boolean;
  wins: number;
  losses: number;
  /** Up to 5 most recent results, oldest first — the left-to-right display order. */
  form: FormResult[];
  lastPlayedDate: string | null;
}

export interface BoardResp {
  standings: Standing[];
  asOf: string;
}

export interface GameView {
  id: number;
  playedDate: string;
  teamA: PlayerRef[];
  teamB: PlayerRef[];
  winner: "a" | "b";
  scoreA: number | null;
  scoreB: number | null;
}

export interface GamePayload {
  playedDate: string;
  teamA: [number, number];
  teamB: [number, number];
  winner: "a" | "b";
  scoreA: number | null;
  scoreB: number | null;
}

// ---- Stats page (SPEC §11) — shapes mirror src/lib/stats.ts ----

export interface Streak {
  type: "W" | "L";
  length: number;
}

export interface PartnerRecord {
  playerId: number;
  games: number;
  wins: number;
  losses: number;
  /** Win rate in games played WITH this partner, 0–1. */
  winPctWith: number;
  /** The same player's win rate in their other games, 0–1; null if they have none. */
  winPctWithout: number | null;
}

export interface OpponentRecord {
  playerId: number;
  games: number;
  wins: number;
  losses: number;
  winPct: number;
}

export interface ScoredGameRef {
  gameId: number;
  playedDate: string;
  margin: number;
  scoreFor: number;
  scoreAgainst: number;
}

export interface ScoreStats {
  /** Denominator for every score stat — scores are optional, so this is not `games`. */
  scoredGames: number;
  avgMargin: number | null;
  biggestWin: ScoredGameRef | null;
  biggestLoss: ScoredGameRef | null;
  deuceGames: number;
}

export interface RatingSwing {
  gameId: number;
  playedDate: string;
  delta: number;
}

export interface RatingStats {
  /** Rating after their most recent game — no drift past that date. */
  current: number | null;
  peak: { elo: number; playedDate: string } | null;
  biggestGain: RatingSwing | null;
  biggestLoss: RatingSwing | null;
}

export interface PlayerStats {
  id: number;
  games: number;
  wins: number;
  losses: number;
  winPct: number | null;
  sessions: number;
  firstPlayed: string | null;
  lastPlayed: string | null;
  currentStreak: Streak | null;
  longestWinStreak: number;
  longestLossStreak: number;
  partners: PartnerRecord[];
  opponents: OpponentRecord[];
  scores: ScoreStats;
  rating: RatingStats;
}

export interface SeriesPoint {
  date: string;
  elo: number;
  /** False on a session the player sat out — the point is inactivity drift only. */
  played: boolean;
  games: number;
  delta: number | null;
}

export interface PlayerSeries {
  playerId: number;
  points: SeriesPoint[];
}

export interface LeagueStats {
  games: number;
  sessions: number;
  players: number;
  activePlayers: number;
  firstSession: string | null;
  lastSession: string | null;
  scoredGames: number;
  distinctPartnerships: number;
}

export interface StatsResp {
  players: Player[];
  stats: Record<number, PlayerStats>;
  series: PlayerSeries[];
  league: LeagueStats;
  /** Drift-to-today (μ, σ) per player — the predictor's inputs, matching the board. */
  ratings: Record<number, { mu: number; sigma: number }>;
  games: GameView[];
  /** Games a pairing needs before a superlative ("best partner") is claimed. */
  superlativeMinGames: number;
  asOf: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

async function send<T>(
  method: string,
  url: string,
  body?: unknown,
  pin?: string,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(pin ? { "x-admin-pin": pin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

// ---- Public reads ----
export const getBoard = () => getJson<BoardResp>("/api/board");
export const getHistory = () => getJson<{ games: GameView[] }>("/api/history");
export const getPlayers = () => getJson<{ players: Player[] }>("/api/players");
export const getStats = () => getJson<StatsResp>("/api/stats");

// ---- Admin (PIN-gated) ----
export const adminVerify = (pin: string) =>
  send<{ ok: true }>("POST", "/api/admin/verify", {}, pin);
export const adminAddPlayer = (pin: string, name: string) =>
  send<{ player: Player }>("POST", "/api/admin/players", { name }, pin);
export const adminRenamePlayer = (pin: string, id: number, name: string) =>
  send<{ player: Player }>("PATCH", "/api/admin/players", { id, name }, pin);
export const adminLogGame = (pin: string, game: GamePayload) =>
  send<{ game: GameView }>("POST", "/api/admin/games", game, pin);
export const adminEditGame = (pin: string, id: number, game: GamePayload) =>
  send<{ game: GameView }>("PATCH", `/api/admin/games/${id}`, game, pin);
export const adminDeleteGame = (pin: string, id: number) =>
  send<{ ok: true }>("DELETE", `/api/admin/games/${id}`, undefined, pin);
