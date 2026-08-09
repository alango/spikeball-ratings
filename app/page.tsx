"use client";

import { useState } from "react";
import { usePoll } from "./_lib/usePoll";
import { getBoard, getHistory } from "./_lib/api";
import {
  FormSquares,
  Notice,
  ProvisionalBadge,
  RECENT_GAMES,
  RatingBreakdown,
  ShowAllGames,
  TeamNames,
  formatDate,
  groupByDate,
} from "./_components/ui";

export default function HomePage() {
  const board = usePoll(getBoard);
  const history = usePoll(getHistory, 8000);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Leaderboard</h1>
        {board.error && <Notice kind="error">{board.error}</Notice>}
        <Leaderboard data={board.data} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Game history</h2>
        {history.error && <Notice kind="error">{history.error}</Notice>}
        <History data={history.data} />
      </section>
    </div>
  );
}

function Leaderboard({ data }: { data: Awaited<ReturnType<typeof getBoard>> | null }) {
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  if (data.standings.length === 0)
    return <p className="text-sm text-slate-400">No players yet.</p>;

  return (
    // The stat columns carry fixed widths so the slack lands in the (flexible) Player
    // column instead of pooling on one side of "Last 5"; centring the two trailing
    // columns then leaves even gutters either side of the squares. Below `sm` the
    // widths tighten, and the wrapper scrolls rather than clipping if a long name
    // still pushes the table past a narrow viewport.
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-8 px-2 py-2 sm:w-10 sm:px-3">#</th>
            <th className="px-2 py-2 sm:px-3">Player</th>
            <th
              className="w-16 px-2 py-2 text-center sm:w-20 sm:px-3"
              title="Elo-like skill score (~1500 = a new player)"
            >
              Rating
            </th>
            <th
              className="w-32 px-2 py-2 text-center sm:w-40 sm:px-3"
              title="Last 5 results, oldest to newest — most recent after the bar"
            >
              Last 5
            </th>
            <th className="w-16 whitespace-nowrap px-2 py-2 text-center sm:w-20 sm:px-3">
              W–L
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.standings.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-2 text-slate-400 sm:px-3">{s.rank}</td>
              <td className="px-2 py-2 sm:px-3">
                <span className="font-medium">{s.name}</span>{" "}
                {s.provisional && <ProvisionalBadge />}
              </td>
              <td className="px-2 py-2 text-center tabular-nums sm:px-3">
                <RatingBreakdown standing={s} />
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-center sm:px-3">
                <FormSquares form={s.form} />
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-slate-500 sm:px-3">
                {s.wins}–{s.losses}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function History({ data }: { data: Awaited<ReturnType<typeof getHistory>> | null }) {
  const [showAll, setShowAll] = useState(false);

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  if (data.games.length === 0)
    return <p className="text-sm text-slate-400">No games logged yet.</p>;

  const shown = showAll ? data.games : data.games.slice(0, RECENT_GAMES);

  // One date heading per session rather than a date on every row: a session is usually
  // several games, so this drops repeated text AND frees the width that used to push
  // the teams into wrapping on a phone.
  return (
    <div className="space-y-4">
      {groupByDate(shown).map(([date, games]) => (
        <div key={date}>
          <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            {formatDate(date)}
          </h3>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {games.map((g) => {
              const aWon = g.winner === "a";
              const winTeam = aWon ? g.teamA : g.teamB;
              const loseTeam = aWon ? g.teamB : g.teamA;
              const winScore = aWon ? g.scoreA : g.scoreB;
              const loseScore = aWon ? g.scoreB : g.scoreA;
              return (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"
                >
                  {/* A floor (not a fixed width) on the winning team lines up every
                      "vs" and every losing team. The widest current pairing is ~124px,
                      so 9rem has headroom; a longer name later shifts just its own row
                      rather than wrapping inside a rigid column. Only from `sm`: on a
                      phone the reserved column pushes the score off the line, and a
                      quarter of the rows grow to two lines to buy alignment nobody can
                      see at that width. */}
                  <span className="font-semibold sm:min-w-36">
                    <TeamNames team={winTeam} />
                  </span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-slate-500">
                    <TeamNames team={loseTeam} />
                  </span>
                  {winScore !== null && loseScore !== null && (
                    <span className="ml-auto tabular-nums text-slate-500">
                      {winScore}–{loseScore}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ShowAllGames
        total={data.games.length}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />
    </div>
  );
}
