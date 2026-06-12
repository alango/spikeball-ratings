// PATCH/DELETE /api/admin/games/[id] — edit or delete a logged game (SPEC §7).
// Each mutation rebuilds all ratings from history (SPEC §3) — a correction is
// "fix/delete the row, replay", never hand-editing a μ/σ.
import { getPlayers, updateGame, deleteGame } from "@/lib/db";
import { rebuildAndPersist } from "@/lib/rebuild";
import { validateGameInput } from "@/lib/validate";
import type { GameInputRaw } from "@/lib/validate";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { badRequest, errorResponse, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return badRequest("invalid game id");
    const raw = await readJson<GameInputRaw>(req);
    if (!raw) return badRequest("invalid JSON body");
    const players = await getPlayers();
    const result = validateGameInput(raw, players.map((p) => p.id));
    if (!result.ok) return badRequest(result.error);
    const game = await updateGame(id, result.value);
    if (!game) return badRequest("no such game");
    await rebuildAndPersist();
    return Response.json({ game });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return badRequest("invalid game id");
    const ok = await deleteGame(id);
    if (!ok) return badRequest("no such game");
    await rebuildAndPersist();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
