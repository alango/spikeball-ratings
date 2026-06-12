# Spikeball Ongoing League — Rating System Spec

Source of truth for *what* to build and *why*. Read fully before planning. The
"why" notes exist so settled decisions don't get relitigated mid-build.

This is a **separate project from the one-day tournament app.** It shares the
underlying additive 2v2 idea but is a deliberately different system (different
rating model, different storage philosophy). Some code duplication with the
tournament app is fine and expected — do not try to share a codebase.

---

## 1. What this is

A web app for an **ongoing, ad-hoc 2v2 spikeball (roundnet) league.** Games happen
whenever people organize them; results are logged after the fact. It:

- maintains a **per-individual skill rating** that updates as games are logged,
- shows the public a **read-only** leaderboard and full game history,
- lets **admins** log / edit / delete games behind a shared password.

There is **no matchmaking** — the app rates results, it does not suggest games.
There is **no player-facing input** — players report results to an admin (e.g. via
WhatsApp) and an admin logs them.

Small stakes, for fun. Simplicity strongly preferred over accuracy.

---

## 2. The rating model

Use **`openskill`** (the Python/JS library — MIT licensed, no patent fuzz, which
matters for something left running indefinitely). Do NOT hand-roll the rating math.

- Each player has a rating belief **(μ, σ)** — μ is the skill estimate, σ the
  uncertainty. New players start at the library defaults.
- A logged game produces one update: the winning team is ranked above the losing
  team and the library's `rate()` adjusts all four players' (μ, σ) at once —
  winners' μ up, losers' down, everyone's σ shrinks toward certainty.
- Team strength is the library's default additive composition of the two members.
- Use openskill's **default model (Plackett-Luce)** — fine for 2v2 win/loss.

> **Implementer note:** verify openskill's current API (constructor, `rate()`
> signature, how the dynamics/tau term is set, default μ/σ) against the **installed
> version** — do not trust pseudocode in this spec over the real library. The
> behaviors described here are the intent; map them onto the actual API.

### Win/loss first, with margin-of-victory awareness when scores are known
The **winner is authoritative** — that is always what the update is built on. When
both scores are recorded, the update is additionally **margin-aware**: a blowout
moves μ more than a squeaker. openskill amplifies the μ change by
`1 + ln(1 + max(0, |Δscore| − MARGIN))` (`MARGIN` tuned to 10); σ and the drift are
untouched. A game logged **without scores falls back to a pure win/loss update**, so
scores stay genuinely optional.

**Format-independence is preserved by normalization, not by ignoring margin.** We
model only single games, so the winner's score *is* the target (to-15, to-21, …).
Before computing the margin we scale every game onto a common reference
(winner = 21), which makes margins comparable across formats automatically — no
format field, no game-type detection (see §4). With `MARGIN = 10` on that reference,
amplification only begins once the loser falls under ~52% of the winner's score, so
competitive games behave exactly like the old binary update and only blowouts move
more (up to ~3.5×).

> Historical note: v1 was *strictly* win/loss (margin deliberately discarded for
> simplicity). Margin awareness was added later once score normalization made it
> format-safe; the win/loss outcome remains the backbone and the sole signal when
> scores are absent.

### Display
- Sort the board by the **conservative score μ − 3σ** (players only rise once the
  system is confident, not just lucky), shown on an Elo-like scale (~1500 center,
  ~200 points per σ; a brand-new player reads 1500).
- Show a **"provisional" tag** until a player has played a **minimum number of games**
  (tuned to 5). Provisional players are still shown but visually marked.
  - *Why games, not σ:* the original plan keyed provisional off σ (~60% of initial σ),
    but openskill's σ shrinks so slowly under repeated play that that threshold is
    effectively unreachable (~400 games) and any reachable σ-fraction is hypersensitive
    to inactivity drift. A game count is intuitive and stable. Drift still does its job
    on the *rating* (μ−3σ sinks for the inactive); it just no longer drives the tag.
- Show μ−3σ (Elo-scaled) as the number; a readable history is the other public view.

---

## 3. Storage philosophy — history is authoritative, ratings are a cached projection

This is the **opposite** of the tournament app's "derive ratings on read" rule, and
the reason is order-dependence (see §5). Here:

- **Game history is the source of truth.** Every game is a row.
- **Ratings are a stored, cached projection** of that history — persisted, not
  recomputed-from-scratch on every read (that would mean replaying all history each
  read, which grows forever).
- **Any change to history triggers a full rebuild**: replay all games in order,
  recomputing every (μ, σ) from scratch. (At league scale this is cheap; do it on
  every edit/delete and on demand.)

Why this split: logging by hand from WhatsApp **will** produce mistakes. Because
history is authoritative, a correction is "fix/delete the game row, replay" — never
manual surgery on someone's μ. This property is the whole reason for the split;
protect it.

---

## 4. Match formats & best-of-3 — every game is one row

Matches may be different formats (to 15, to 21, best-of-3). **We do not model any of
this with a format field.** The win/loss outcome is format-independent on its own,
and the margin-of-victory term (§2) stays comparable across formats because every
game is normalized to a common reference (winner = 21) before the margin is computed
— the winner's score *is* the target, so the format is inferred, not stored.

**Decision: every game is ONE row.** A best-of-3 is simply logged as 2–3 ordinary
game rows between the same teams on the same date. There is **no "series" concept**
in the schema or UI — building one would be machinery for a format we rarely play.
Logging a best-of-3 as separate rows is identical to logging three pickup games
back-to-back, which is the natural thing anyway.

- Rate each row on its winner; use the margin when both scores are present (§2).
- **Store the score when it's handy** (makes the public history more interesting and
  feeds the margin term). Score is **optional** on a row — a row with no score is
  rated on win/loss alone. Best-of-3 rows are independent single games like any other.

> Mental asterisk (not a v1 task): the games of a real best-of-3 aren't statistically
> independent, so logging them separately makes σ shrink very slightly faster than
> the information justifies. This is negligible *because long-format games are rare*.
> If long-format ever becomes a large share of play, revisit. Cheap to note, unlikely
> to fire.

---

## 5. Time-based inactivity drift — the one piece unique to ad-hoc play

openskill nudges σ up by a dynamics term each update so ratings stay responsive.
**Apply this drift by elapsed wall-clock time, NOT per game.** Reason: ad-hoc games
arrive at wildly uneven spacing (8 games one weekend, then nothing for two months).
The long-absent player is exactly the one whose rating is most stale and should be
*least* trusted on return — per-game drift would never touch them, which is backwards.
Time-based drift re-inflates their σ so they return appropriately uncertain.

This drift is **designed in from day one** (so the timestamps exist), tuned **mild**
to start.

### Drift is applied in TWO places — both required
1. **At rebuild (write path):** when replaying history, before applying each game's
   update, inflate each of the four players' σ by the time elapsed **since that
   player's previous game** (by game date). Same-day games → zero gap → zero drift
   (this is what makes best-of-3 / same-session rows safe — see §4).
2. **At display (read path):** the board must reflect drift up to **today**, not just
   up to each player's last game. A player inactive for 3 months should look *more*
   uncertain on the board *now* than they did right after their last game, even with
   no new game logged. So display σ = stored σ inflated by time since their last game
   **until the current date**. (Drift inflates σ only; μ is unchanged — so an inactive
   player's μ−3σ sinks over time, which is the desired behavior.)

> So "days since last played" is computed relative to **the next game's date** for
> updates, and relative to **now** for display. Both fall out of storing game dates.

---

## 6. Dates, ordering, and back-dating

- Games are logged with a **played-date at day granularity** (calendar dropdown in
  admin). Day resolution is plenty — the drift timescale is weeks-to-months, so
  sub-day precision carries no meaningful information.
- Admins log after the fact and **out of order** (Tuesday's game entered after
  Thursday's, games entered days late). This just works because of the replay design:
  **replay orders by played-date, then by row-id as a tiebreaker — NOT by entry/
  insertion time.** A back-dated game slots into its correct chronological position
  and everything downstream recomputes on the next rebuild.
- **Same-day ordering:** when two games share a date *and* a player, replay needs a
  deterministic order. Use **(played-date ASC, row-id ASC)**. The row-id is the stable
  intra-day tiebreaker; the order-dependence across two same-day games is tiny, but
  the rule must be deterministic so the board doesn't flicker between rebuilds.

---

## 7. Roster & admin

- **Admin-managed roster.** Admins add players (name → row). When logging a game,
  pick the four players **from the roster list** — never free-type names. (Free-typing
  produces "Dave" / "dave" / "Dave M." as three players and silently corrupts ratings.)
- **Admin writes only.** Logging, editing, deleting games and managing the roster all
  sit behind a **single shared admin password** (or secret admin URL). No per-admin
  logins, no attribution of who logged what — not needed at these stakes.
- **Editable / deletable game logs**, each change triggering a ratings rebuild (§3).
  This is a v1 feature, not optional — it's what makes "history authoritative" pay off.
- **Public UI is strictly read-only**: leaderboard + game history. No player identity,
  no login, no input. (Nothing like the tournament's soft-identity / open-reporting —
  removed entirely here.)

### Admin diagnostic (small, nice-to-have)
Flag any player whose **partners are too concentrated** (e.g. plays almost always with
one person). Two players who *only* ever partner each other are mathematically
confounded — their individual skills can't be separated, so their μ is less
trustworthy than its σ implies. Don't auto-correct anything; just surface it so the
admin knows. Low priority; can be a later pass.

---

## 8. Data model

Postgres (see §9). Suggested tables:

- **players**: id, name, created_at. (Stored rating cache lives here or in a sibling
  table: current μ, current σ, last_played_date.)
- **games**: id (serves as intra-day tiebreaker), played_date (day granularity),
  team_a (2 player ids), team_b (2 player ids), winner (a / b), score_a, score_b
  (both optional/nullable), created_at.
- **ratings cache**: per player — μ, σ, last_played_date — as of their last game.
  (Display layer adds drift-to-today on read; see §5.)

Notes:
- No "series" table (§4). No "season" table now (§ below) — but **don't model the
  schema in a way that forbids adding a `season` column later**; one continuous
  ranking is the v1 behavior, seasons are a possible future, retrofitting is annoying
  so just leave the door open at zero cost.
- The ratings cache is rebuildable from `games` at any time; treat it as disposable.

### Seasons / decay: NOT in v1
One continuous ranking forever. No periodic reset. Just don't actively preclude a
season concept later (see schema note above).

---

## 9. Stack & platform

- **Next.js + TypeScript on Vercel** (parity with the tournament app; organizer is
  comfortable with Vercel). Serverless — no long-lived process.
- **Persistent Postgres via the Vercel Marketplace.** Either provider works:
  - **Neon** — simplest pure-Postgres, free tier, one-click, parity with tournament.
    Recommended default, since admin-only writes + shared password mean we don't need
    managed auth.
  - **Supabase** — pick this instead only if you later want real accounts / managed
    auth / realtime. Not needed for v1.
  - (Old first-party "Vercel Postgres" no longer exists — install a Marketplace
    Postgres integration; it injects env vars.)
- **Reads:** public board and history are plain `SELECT`s of the cached ratings +
  games, with the read-time drift adjustment (§5) applied for display. Polling is
  fine; no websockets needed (ad-hoc updates are rare).
- Use openskill's JS package so the whole app is one TypeScript runtime (verify it
  exists / its API; if only the Python package is viable, isolate it behind one
  serverless function rather than splitting the whole app). Keep the rating logic in
  an isolated module regardless.

---

## 10. Build order (suggested)

1. **Rating module** (pure, isolated, well-tested): a function that takes the ordered
   game history and produces every player's (μ, σ, last_played_date), including the
   rebuild-path time drift (§5.1). Test against a synthetic history — including an
   inactivity gap, a back-dated game, and a same-day pair — before any DB/UI. This is
   the highest-risk logic.
2. **Display drift** (pure): stored (μ, σ, last_played) + today → drifted σ → μ−3σ +
   provisional flag. Test the "inactive player sinks over time" behavior.
3. **Schema + admin write path**: roster CRUD, log/edit/delete game, each triggering
   a rebuild.
4. **Public read views**: leaderboard (sorted μ−3σ, provisional tags, drift-to-today)
   and game history.
5. **Deploy to Vercel + Postgres**; smoke-test: log a batch, edit one, delete one,
   confirm rebuild + board are correct; confirm an inactive player drifts down.

Test modules 1 and 2 hard and independently — everything else is plumbing.
