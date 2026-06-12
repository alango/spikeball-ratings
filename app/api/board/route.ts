// GET /api/board — public leaderboard. Reads the cached ratings (SPEC §3), applies
// read-path drift to today (SPEC §5.2), and returns standings sorted by μ−3σ.
import { getPlayers, getGames, getRatingsCache } from "@/lib/db";
import { displayBoard } from "@/lib/display";
import { boardView, nameMap, recordMap } from "@/lib/views";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [players, gameRows, cache] = await Promise.all([
      getPlayers(),
      getGames(),
      getRatingsCache(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const entries = displayBoard(cache, today);
    const standings = boardView(entries, nameMap(players), recordMap(gameRows));
    return Response.json({ standings, asOf: today });
  } catch (e) {
    return errorResponse(e);
  }
}
