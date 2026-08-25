// GET /api/stats — everything the public stats page needs, in one read (SPEC §11).
//
// Like /api/board and /api/history this replays the whole history for per-game rating
// deltas (cheap at league scale). Stats are computed for EVERY player, not just a
// selected one, so the page's player dropdown switches with no refetch (SPEC §11.4).
//
// The `games` payload is the same shape /api/history returns: the graph's click-a-
// session panel lists that session's games and rating changes, and reusing the one
// shape keeps the two pages consistent instead of inventing a second game view.
import { getPlayers, getGames, getRatingsCache, toRatingGames } from "@/lib/db";
import { rebuildWithDeltas } from "@/lib/rating";
import {
  leagueStats,
  playerStats,
  ratingSeries,
  ratingsAsOf,
  SUPERLATIVE_MIN_GAMES,
} from "@/lib/stats";
import { historyView, nameMap } from "@/lib/views";
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
    const roster = players.map((p) => p.id);
    const games = toRatingGames(gameRows);
    const { deltas } = rebuildWithDeltas(roster, games);

    return Response.json({
      players,
      stats: playerStats(roster, games, deltas),
      series: ratingSeries(roster, games, deltas),
      league: leagueStats(roster, games),
      // Drift-to-today ratings feed the predictor, so its numbers agree with the
      // board rather than with each player's stale last-game rating (SPEC §11.3).
      ratings: ratingsAsOf(cache, today),
      games: historyView(gameRows, nameMap(players), deltas),
      superlativeMinGames: SUPERLATIVE_MIN_GAMES,
      asOf: today,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
