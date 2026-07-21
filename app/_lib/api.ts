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
