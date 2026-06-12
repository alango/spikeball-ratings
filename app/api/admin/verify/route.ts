// POST /api/admin/verify — confirm the shared admin PIN (SPEC §7). Lets the admin
// UI reveal its controls only after the stored PIN checks out.
import { isAuthorized, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  return Response.json({ ok: true });
}
