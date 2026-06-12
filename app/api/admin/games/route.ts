// POST /api/admin/games — log a game (SPEC §7). Validates four distinct rostered
// players + a winner, stores one row (SPEC §4), then rebuilds ratings (SPEC §3).
import { getPlayers, insertGame } from "@/lib/db";
import { rebuildAndPersist } from "@/lib/rebuild";
import { validateGameInput } from "@/lib/validate";
import type { GameInputRaw } from "@/lib/validate";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { badRequest, errorResponse, readJson } from "@/lib/http";

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const raw = await readJson<GameInputRaw>(req);
    if (!raw) return badRequest("invalid JSON body");
    const players = await getPlayers();
    const result = validateGameInput(raw, players.map((p) => p.id));
    if (!result.ok) return badRequest(result.error);
    const game = await insertGame(result.value);
    await rebuildAndPersist();
    return Response.json({ game });
  } catch (e) {
    return errorResponse(e);
  }
}
