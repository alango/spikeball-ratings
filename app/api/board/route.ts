// GET /api/board — public leaderboard. Reads the cached ratings (SPEC §3), applies
// read-path drift to today (SPEC §5.2), and returns standings sorted by μ−3σ.
// The "Last 5" column also needs each recent game's rating change, so — as
// /api/history does — we replay history for the deltas (cheap at league scale).
// The ratings shown still come from the cache; the replay only feeds the hover.
import { getPlayers, getGames, getRatingsCache, toRatingGames } from "@/lib/db";
import { displayBoard } from "@/lib/display";
import { rebuildWithDeltas } from "@/lib/rating";
import { boardView, formMap, nameMap, recordMap } from "@/lib/views";
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
    const { deltas } = rebuildWithDeltas(
      players.map((p) => p.id),
      toRatingGames(gameRows),
    );
    const standings = boardView(
      entries,
      nameMap(players),
      recordMap(gameRows),
      formMap(gameRows, deltas),
    );
    return Response.json({ standings, asOf: today });
  } catch (e) {
    return errorResponse(e);
  }
}
