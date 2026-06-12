// GET /api/players — the roster (public; names already appear on the board). Used
// by the admin UI to populate the four player dropdowns (SPEC §7: pick, never type).
import { getPlayers } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ players: await getPlayers() });
  } catch (e) {
    return errorResponse(e);
  }
}
