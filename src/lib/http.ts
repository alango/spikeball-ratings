// Small shared helpers for the route handlers.

/** Uniform error JSON from a thrown value (or an explicit message). */
export function errorResponse(e: unknown, status = 500): Response {
  const message = e instanceof Error ? e.message : "Unexpected error";
  return Response.json({ error: message }, { status });
}

/** A 400 with a specific validation message. */
export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** Parse a JSON body, returning null on malformed input instead of throwing. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
