// Rebuild orchestration (SPEC §3). History is authoritative; the ratings cache is
// a disposable projection. Any change to history — log/edit/delete a game, or a
// roster change — must trigger a FULL replay rebuild and overwrite the cache. At
// league scale a full replay on every write is cheap and keeps the cache honest;
// ratings are NEVER hand-edited (CLAUDE.md load-bearing rule).

import { getPlayers, getGames, replaceRatingsCache, toRatingGames } from "./db";
import { rebuild } from "./rating";

/** Replay all games over the full roster and persist the resulting ratings. */
export async function rebuildAndPersist(): Promise<void> {
  const [players, gameRows] = await Promise.all([getPlayers(), getGames()]);
  const roster = players.map((p) => p.id);
  const results = rebuild(roster, toRatingGames(gameRows));
  await replaceRatingsCache(results);
}
