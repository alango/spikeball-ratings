# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
Web app for an ongoing, ad-hoc 2v2 spikeball **league**. Maintains a per-player
skill rating that updates as games are logged; shows the public a read-only
leaderboard + game history; admins log/edit/delete games behind a shared password.
No matchmaking. No player input. For fun; favor simplicity over accuracy.

**Read `SPEC.md` in full before planning or writing code.** It contains the design
decisions and the reasoning behind them — don't relitigate them.

This is a separate app from the one-day tournament project. A little code
duplication between them is fine — do not try to share a codebase.

## Stack
- Next.js + TypeScript on Vercel (serverless)
- Postgres via Vercel Marketplace (Neon by default)
- `openskill` for the rating math (MIT) — do NOT hand-roll it. Verify its current
  API against the installed version; this spec's pseudocode is intent, not gospel.
- Polling for reads (no websockets)

## Commands
- Dev: `npm run dev`
- Test: `npm run test` (single file: `npm run test -- src/lib/rating.test.ts`; watch: `npm run test:watch`)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Apply schema to DB in `.env`'s `DATABASE_URL`: `npm run db:setup`

## Layout
- `src/lib/` — pure, DB-agnostic modules + the Neon access layer. The two high-risk
  pure modules are `rating.ts` (replay-rebuild + write-path drift) and `display.ts`
  (read-path drift to today). Both are unit-tested (`*.test.ts`, Vitest) on synthetic
  history with no DB. `db.ts` is the only module that touches Postgres (lazy Neon
  `sql()`); `rebuild.ts` orchestrates replay→cache persist; `views.ts` presents rows.
- `app/` — Next.js App Router. `app/api/**` route handlers; `app/_lib/` client
  (`api.ts` typed fetch wrappers, `usePoll.ts`); `app/_components/` shared UI.
- `schema.sql` + `scripts/migrate.mjs` — schema is applied by the migrate script.
- Path alias: `@/lib/*` → `src/lib/*`.

## Conventions
- Rating math lives ONLY in `rating.ts`/`display.ts` via `openskill` (tau=0; our drift
  is time-based, not per-game). Routes/DB never compute ratings inline.
- Admin writes are gated by the `x-admin-pin` header vs `ADMIN_PIN` (see `auth.ts`).
- Public reads are polled (`usePoll`); route handlers set `dynamic = "force-dynamic"`.

## Load-bearing rules (see SPEC for why)
- **Rating is STRICTLY win/loss — never margin.** Score may be stored but the rating
  ignores it. This is why mixed formats (to 15/to 21/best-of-3) need no handling.
- **History is the source of truth; ratings are a rebuildable cache.** Any edit or
  delete of a game triggers a full replay-rebuild of all ratings. Never hand-edit a
  stored μ/σ.
- **Every game is one row.** A best-of-3 is just 2–3 ordinary rows on the same date.
  No "series" concept anywhere.
- **Time-based inactivity drift, applied in two places:** at rebuild (σ inflated by a
  player's gap since their previous game) AND at display (σ inflated up to *today*, so
  inactive players sink on the board with no new game logged). Drift inflates σ only.
- **Replay orders by (played-date, row-id) — never by entry/insertion time.** Supports
  back-dated and out-of-order logging.

## Where the real risk is
The rating module (replay + drift) and the display-drift calc are the only
non-trivial code. Build them as pure, independently-tested modules first, against a
synthetic history that includes an inactivity gap, a back-dated game, and a same-day
pair — before any DB or UI. Everything else is plumbing.

## Don't build
Matchmaking, player logins/identity, open score reporting, conflict resolution, a
series concept, seasons/decay, per-admin attribution. All deliberately out of scope
— see SPEC. (Leave the schema able to add a `season` column later, but don't build
seasons now.)
