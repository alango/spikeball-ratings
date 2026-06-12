// Admin gate (SPEC §7). The only access control: admin-only endpoints check a
// shared PIN sent as the `x-admin-pin` header against the ADMIN_PIN env var. No
// per-admin logins, no attribution. If no PIN is configured, admin actions are
// denied outright.

export function isAuthorized(req: Request): boolean {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return false;
  return req.headers.get("x-admin-pin") === pin;
}

/** Standard 401 response for unauthenticated admin calls. */
export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
