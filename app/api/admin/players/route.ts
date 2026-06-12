// Admin roster management (SPEC §7). Adding a player or renaming one changes the
// roster; both trigger a full ratings rebuild so a newly added player appears on
// the cached board (a rename doesn't change ratings, but rebuilding is cheap and
// keeps the cache authoritative).
import { insertPlayer, renamePlayer } from "@/lib/db";
import { rebuildAndPersist } from "@/lib/rebuild";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { badRequest, errorResponse, readJson } from "@/lib/http";

// POST — add a player.
export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const body = await readJson<{ name?: unknown }>(req);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return badRequest("name is required");
    const player = await insertPlayer(name);
    await rebuildAndPersist();
    return Response.json({ player });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH — rename a player.
export async function PATCH(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    const body = await readJson<{ id?: unknown; name?: unknown }>(req);
    const id = Number.isInteger(body?.id) ? (body!.id as number) : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (id === null || !name) return badRequest("id and name are required");
    const player = await renamePlayer(id, name);
    if (!player) return badRequest("no such player");
    return Response.json({ player });
  } catch (e) {
    return errorResponse(e);
  }
}
