# Spikeball League

Web app for an ongoing, ad-hoc 2v2 spikeball league. It keeps a per-player skill
rating that updates as games are logged, shows the public a read-only leaderboard
and full game history, and lets admins log/edit/delete games behind a shared
password.

For the design and the reasoning behind it, see **[SPEC.md](./SPEC.md)**. For
working conventions, see **[CLAUDE.md](./CLAUDE.md)**.

## How it works (the short version)

- **Rating is strictly win/loss** — the score is stored for interest but never
  affects the rating. Uses [`openskill`](https://github.com/philihp/openskill.js)
  (Plackett-Luce); the board sorts by the conservative estimate **μ − 3σ**.
- **History is the source of truth; ratings are a rebuildable cache.** Every game
  is one row. Any log/edit/delete replays the whole history to recompute ratings —
  ratings are never hand-edited.
- **Inactivity drift:** a player's uncertainty (σ) grows with time off, both when
  replaying history and on the live board up to *today*, so inactive players sink
  on their own with no new game logged.

## Stack

Next.js + TypeScript on Vercel (serverless) · Postgres via the Vercel Marketplace
(Neon) · polling for reads (no websockets).

## Local setup

Requires Node 18+ and a Postgres database (a free Neon database via the Vercel
Marketplace works well).

```bash
npm install

# Configure environment
cp .env.example .env
#   DATABASE_URL  – your Postgres connection string
#   ADMIN_PIN     – the shared password gating admin actions

npm run db:setup     # apply schema.sql to the database
npm run dev          # start the app at http://localhost:3000
```

The public leaderboard + history are at `/`; the admin tools are at `/admin`
(enter the `ADMIN_PIN` to unlock logging, editing, and roster management).

### Seed demo data (optional)

With the dev server running in one terminal, in another:

```bash
npm run seed
```

This wipes existing data and loads a small demo league (6 players, 8 games — with a
back-dated game, a same-day pair, and an inactive player) so you can see the board,
history, and inactivity drift immediately. Re-run any time for a clean demo.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run db:setup` | Apply `schema.sql` to `DATABASE_URL` |
| `npm run seed` | Load demo data via the API (server must be running) |
| `npm run test` | Run the unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

The non-trivial logic — replay-rebuild + inactivity drift (`src/lib/rating.ts`) and
the display-drift calculation (`src/lib/display.ts`) — is covered by unit tests
against synthetic history (an inactivity gap, a back-dated game, a same-day pair).

## Deploying

1. Create the project on Vercel and add a Marketplace Postgres integration (Neon),
   which injects `DATABASE_URL`. Set `ADMIN_PIN` as an environment variable.
2. Apply the schema once against the production database: `npm run db:setup`
   (with the production `DATABASE_URL` in your `.env`).
3. Deploy. Reads are plain `SELECT`s with a read-time drift adjustment; admin
   writes replay history and rewrite the ratings cache.

## Project layout

```
src/lib/        pure, tested modules + the DB access layer
  rating.ts     replay-rebuild + write-path inactivity drift (openskill)
  display.ts    read-path drift to today, μ−3σ, provisional flag
  rebuild.ts    replay all games → overwrite the ratings cache
  db.ts         Neon access (the only module that touches Postgres)
  validate.ts   admin game-input validation
  views.ts      presenters for the public board + history
app/            Next.js App Router
  api/          route handlers (public reads; PIN-gated admin writes)
  _lib/         client-side typed API wrappers + polling hook
  _components/  shared UI
schema.sql      tables (players, games, ratings_cache)
scripts/        migrate.mjs (apply schema), seed.mjs (demo data)
```
