"use client";
// Public stats page (SPEC §11). Three sections off one /api/stats read: per-player
// detail, the rating graph, and the matchup predictor. This pass builds the first.

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePoll } from "../_lib/usePoll";
import { getStats } from "../_lib/api";
import type { PartnerRecord, PlayerStats, StatsResp } from "../_lib/api";
import { Notice, formatDate } from "../_components/ui";
import { RatingGraph } from "./RatingGraph";
import { Predictor } from "./Predictor";

export default function StatsPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
      <Stats />
    </Suspense>
  );
}

function Stats() {
  const { data, error } = usePoll(getStats, 10000);
  const router = useRouter();
  const params = useSearchParams();

  // The selected player lives in the URL so a page can be linked ("look at mine").
  const urlPlayer = Number(params.get("player")) || null;
  const [fallback, setFallback] = useState<number | null>(null);
  const selectedId = urlPlayer ?? fallback;

  const select = (id: number) => {
    setFallback(id);
    router.replace(`/stats?player=${id}`, { scroll: false });
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Player stats</h1>
        {error && <Notice kind="error">{error}</Notice>}
        <PlayerSection data={data} selectedId={selectedId} onSelect={select} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Rating over time</h2>
        <p className="mb-3 text-xs text-slate-500">
          One point per session. A line keeps sinking while a player is away — being
          inactive costs rating on the board, so it costs it here too.
        </p>
        {data && (
          <RatingGraph series={data.series} players={data.players} games={data.games} />
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Matchup predictor</h2>
        <p className="mb-3 text-xs text-slate-500">
          Pick four players and see all three ways to split them. It rates a matchup
          you hand it — it won&apos;t tell you who should be playing.
        </p>
        {data && <Predictor players={data.players} ratings={data.ratings} />}
      </section>
    </div>
  );
}

// ---- Player section ---------------------------------------------------------

function PlayerSection({
  data,
  selectedId,
  onSelect,
}: {
  data: StatsResp | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  // Players who have actually played, by name — the roster order is insertion order,
  // which is meaningless to someone hunting for their own name in a dropdown.
  const options = useMemo(() => {
    if (!data) return [];
    return data.players
      .filter((p) => (data.stats[p.id]?.games ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Landing on nobody in particular, show the most-played player: alphabetical-first
  // is usually whoever has played four games, whose tables are all "1 game, 100%".
  const busiest = useMemo(() => {
    if (!data) return null;
    return options.reduce<number | null>(
      (best, p) =>
        best === null || data.stats[p.id].games > data.stats[best].games ? p.id : best,
      null,
    );
  }, [data, options]);

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  if (options.length === 0)
    return <p className="text-sm text-slate-400">No games logged yet.</p>;

  const current = selectedId ?? busiest ?? options[0].id;
  const stats = data.stats[current];
  const nameOf = (id: number) => data.players.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Player</span>
        <select
          value={current}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium"
        >
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {stats && (
        <>
          <Summary stats={stats} />
          <ScoreAndRating stats={stats} />
          <PartnerTable
            stats={stats}
            nameOf={nameOf}
            minGames={data.superlativeMinGames}
          />
          <OpponentTable stats={stats} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}

/** A labelled figure. The building block of both stat rows. */
function Tile({
  label,
  value,
  sub,
  title,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" title={title}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function Summary({ stats }: { stats: PlayerStats }) {
  const streak = stats.currentStreak;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Record" value={`${stats.wins}–${stats.losses}`} sub={`${pct(stats.winPct)} win rate`} />
      <Tile
        label="Sessions"
        value={stats.sessions}
        sub={`${stats.games} game${stats.games === 1 ? "" : "s"}`}
      />
      <Tile
        label="Streak"
        value={streak ? `${streak.length}${streak.type}` : "—"}
        sub={`best ${stats.longestWinStreak}W / ${stats.longestLossStreak}L`}
      />
      <Tile
        label="Last played"
        value={stats.lastPlayed ? formatDate(stats.lastPlayed) : "—"}
        sub={stats.firstPlayed ? `since ${formatDate(stats.firstPlayed)}` : undefined}
      />
    </div>
  );
}

function ScoreAndRating({ stats }: { stats: PlayerStats }) {
  const { scores, rating } = stats;
  const margin =
    scores.avgMargin === null
      ? "—"
      : `${scores.avgMargin > 0 ? "+" : ""}${scores.avgMargin.toFixed(1)}`;
  const game = (g: { scoreFor: number; scoreAgainst: number; playedDate: string } | null) =>
    g ? `${g.scoreFor}–${g.scoreAgainst}` : "—";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile
        label="Rating"
        value={rating.current ?? "—"}
        sub={rating.peak ? `peak ${rating.peak.elo} on ${formatDate(rating.peak.playedDate)}` : undefined}
        // Their rating as of their last game. The leaderboard's number drifts on
        // toward today (SPEC §5.2), so for an inactive player the two differ — say
        // so here rather than letting it read as a bug.
        title="Rating after their last game. The leaderboard drifts this toward today, so an inactive player's board rating will be lower."
      />
      <Tile
        label="Best game"
        value={rating.biggestGain ? `+${rating.biggestGain.delta}` : "—"}
        sub={rating.biggestGain ? formatDate(rating.biggestGain.playedDate) : undefined}
      />
      <Tile
        label="Avg margin"
        // Scores are optional in the schema, so this rate carries its own
        // denominator rather than implying it covers every game (SPEC §11.1).
        value={margin}
        sub={`over ${scores.scoredGames} scored`}
      />
      <Tile
        label="Biggest win"
        value={game(scores.biggestWin)}
        sub={`worst ${game(scores.biggestLoss)} · ${scores.deuceGames} deuce`}
      />
    </div>
  );
}

/** Shared table chrome. No `overflow-hidden` — it would clip the tooltips. */
function StatTable({
  head,
  children,
  caption,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div>
      {caption && (
        <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          {caption}
        </h3>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {head}
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Partners, most-played first. The load-bearing column is the last one: win rate
 * WITH this partner against the same player's rate WITHOUT them. "6–1 with Alex"
 * alone can't separate "we're good together" from "Alex is good" (SPEC §11.1).
 *
 * A "best"/"worst" badge is only awarded at `minGames` shared games — every rate is
 * still shown, with its raw count, but a single game never wins a title.
 */
function PartnerTable({
  stats,
  nameOf,
  minGames,
}: {
  stats: PlayerStats;
  nameOf: (id: number) => string;
  minGames: number;
}) {
  const eligible = stats.partners.filter((p) => p.games >= minGames);
  const best = eligible.reduce<PartnerRecord | null>(
    (b, p) => (b === null || p.winPctWith > b.winPctWith ? p : b),
    null,
  );
  const worst = eligible.reduce<PartnerRecord | null>(
    (w, p) => (w === null || p.winPctWith < w.winPctWith ? p : w),
    null,
  );

  if (stats.partners.length === 0) return null;

  return (
    <StatTable
      caption="Partners"
      head={
        <tr>
          <th className="px-3 py-2">With</th>
          <th className="w-14 px-2 py-2 text-center">Gms</th>
          <th className="w-16 px-2 py-2 text-center">W–L</th>
          <th className="w-20 px-2 py-2 text-center" title="Win rate playing with them">
            Win %
          </th>
          {/* Not "vs solo" — nobody plays alone in 2v2. The comparison is this
              partner against every OTHER partner the player has had. */}
          <th
            className="w-20 px-2 py-2 text-center sm:px-3"
            title="Percentage points better (or worse) with this partner than in all their other games"
          >
            vs others
          </th>
        </tr>
      }
    >
      {stats.partners.map((p) => {
        const diff = p.winPctWithout === null ? null : p.winPctWith - p.winPctWithout;
        const badge =
          best && p.playerId === best.playerId && best.winPctWith > 0.5
            ? "best"
            : worst && p.playerId === worst.playerId && worst.winPctWith < 0.5
              ? "worst"
              : null;
        return (
          <tr key={p.playerId}>
            <td className="px-3 py-2">
              <span className="font-medium">{nameOf(p.playerId)}</span>
              {badge && (
                <span
                  className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-medium uppercase ${
                    badge === "best"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                  title={`Their ${badge} partner, over at least ${minGames} games together`}
                >
                  {badge}
                </span>
              )}
            </td>
            <td className="px-2 py-2 text-center tabular-nums text-slate-500">{p.games}</td>
            <td className="px-2 py-2 text-center tabular-nums">
              {p.wins}–{p.losses}
            </td>
            <td className="px-2 py-2 text-center tabular-nums">{pct(p.winPctWith)}</td>
            <td className="px-2 py-2 text-center tabular-nums sm:px-3">
              {diff === null ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-400"}>
                  {diff > 0 ? "+" : ""}
                  {Math.round(diff * 100)}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </StatTable>
  );
}

function OpponentTable({
  stats,
  nameOf,
}: {
  stats: PlayerStats;
  nameOf: (id: number) => string;
}) {
  if (stats.opponents.length === 0) return null;
  return (
    <StatTable
      caption="Opponents"
      head={
        <tr>
          <th className="px-3 py-2">Against</th>
          <th className="w-14 px-2 py-2 text-center">Gms</th>
          <th className="w-16 px-2 py-2 text-center">W–L</th>
          <th className="w-20 px-2 py-2 text-center sm:px-3">Win %</th>
        </tr>
      }
    >
      {stats.opponents.map((o) => (
        <tr key={o.playerId}>
          <td className="px-3 py-2 font-medium">{nameOf(o.playerId)}</td>
          <td className="px-2 py-2 text-center tabular-nums text-slate-500">{o.games}</td>
          <td className="px-2 py-2 text-center tabular-nums">
            {o.wins}–{o.losses}
          </td>
          <td className="px-2 py-2 text-center tabular-nums sm:px-3">{pct(o.winPct)}</td>
        </tr>
      ))}
    </StatTable>
  );
}
