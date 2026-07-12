// GET /api/history — public game history, newest first (SPEC §7 read-only view).
// Also computes each game's per-player rating gain/loss on the fly (a replay over
// history, cheap at league scale) for the leaderboard-style hover in the UI.
import { getPlayers, getGames, toRatingGames } from "@/lib/db";
import { rebuildWithDeltas } from "@/lib/rating";
import { historyView, nameMap } from "@/lib/views";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [players, gameRows] = await Promise.all([getPlayers(), getGames()]);
    const { deltas } = rebuildWithDeltas(
      players.map((p) => p.id),
      toRatingGames(gameRows),
    );
    return Response.json({ games: historyView(gameRows, nameMap(players), deltas) });
  } catch (e) {
    return errorResponse(e);
  }
}
