// Seed the database with a small demo league for local development.
//
// Run with:  npm run seed   (needs the dev server running and .env filled in)
//
// This seeds THROUGH the HTTP API rather than writing rows directly, so it goes
// down the real log/rebuild code path (SPEC §3) — the seeded board is exactly
// what the app would produce. It wipes existing data first for a clean demo.
//
// The fixture is chosen to exercise the interesting behaviours:
//   • a clear skill spread (Alice/Bob strong, Frank weak),
//   • a back-dated game (logged out of chronological order),
//   • a same-day pair (best-of-3 style — zero inactivity drift between them),
//   • an inactive player (Erin stops in January) who should drift DOWN the board
//     by today even with no new game (SPEC §5.2).

import { neon } from "@neondatabase/serverless";

const BASE = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const PIN = process.env.ADMIN_PIN;
const DB = process.env.DATABASE_URL;

if (!DB) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
if (!PIN) throw new Error("ADMIN_PIN is not set (copy .env.example to .env).");

// --- preflight: the dev server must be up -----------------------------------
try {
  const ping = await fetch(`${BASE}/api/players`);
  if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
} catch {
  console.error(
    `Cannot reach the app at ${BASE}. Start it first:\n  npm run dev\n` +
      `(or set SEED_BASE_URL to point elsewhere).`,
  );
  process.exit(1);
}

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-admin-pin": PIN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status} on ${method} ${path}`);
  return json;
};

// --- wipe existing data for a clean, repeatable demo ------------------------
console.log("Clearing existing data ...");
const sql = neon(DB);
await sql.query("truncate table ratings_cache, games, players restart identity cascade");

// --- roster -----------------------------------------------------------------
const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"];
console.log(`Adding ${NAMES.length} players ...`);
const id = {};
for (const name of NAMES) {
  const { player } = await api("POST", "/api/admin/players", { name });
  id[name] = player.id;
}

// --- games (logged deliberately out of order to exercise replay ordering) ---
const g = (date, a, b, winner, scoreA, scoreB) => ({
  playedDate: date,
  teamA: [id[a[0]], id[a[1]]],
  teamB: [id[b[0]], id[b[1]]],
  winner,
  scoreA: scoreA ?? null,
  scoreB: scoreB ?? null,
});

const GAMES = [
  // January — Erin is active here, then never plays again (will drift down).
  g("2026-01-04", ["Alice", "Erin"], ["Carol", "Frank"], "a", 21, 14),
  g("2026-01-04", ["Alice", "Carol"], ["Erin", "Frank"], "a", 21, 9), // same-day pair
  g("2026-01-11", ["Bob", "Erin"], ["Dave", "Frank"], "a", 15, 12),
  // February
  g("2026-02-08", ["Alice", "Bob"], ["Carol", "Dave"], "a", 21, 17),
  g("2026-02-08", ["Alice", "Dave"], ["Bob", "Carol"], "b", 18, 21),
  g("2026-02-22", ["Bob", "Carol"], ["Dave", "Frank"], "a", 21, 8),
  // March
  g("2026-03-15", ["Alice", "Carol"], ["Bob", "Dave"], "a", 21, 19),
  g("2026-03-15", ["Alice", "Bob"], ["Carol", "Dave"], "a", 21, 11),
];

// Log February before January to prove replay is by played-date, not entry order.
const order = [3, 4, 5, 0, 1, 2, 6, 7];
console.log(`Logging ${GAMES.length} games (out of order on purpose) ...`);
for (const i of order) await api("POST", "/api/admin/games", GAMES[i]);

// --- show the resulting board -----------------------------------------------
const { standings, asOf } = await api("GET", "/api/board");
console.log(`\nLeaderboard as of ${asOf}:`);
for (const s of standings) {
  const tag = s.provisional ? " (provisional)" : "";
  console.log(
    `  ${s.rank}. ${s.name.padEnd(6)} ${s.rating.toFixed(1).padStart(5)}  ` +
      `${s.wins}-${s.losses}${tag}`,
  );
}
console.log("\nSeed complete ✓  Open", BASE, "to explore.");
