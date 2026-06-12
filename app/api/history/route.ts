// GET /api/history — public game history, newest first (SPEC §7 read-only view).
import { getPlayers, getGames } from "@/lib/db";
import { historyView, nameMap } from "@/lib/views";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [players, gameRows] = await Promise.all([getPlayers(), getGames()]);
    return Response.json({ games: historyView(gameRows, nameMap(players)) });
  } catch (e) {
    return errorResponse(e);
  }
}
