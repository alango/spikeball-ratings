"use client";

import { usePoll } from "./_lib/usePoll";
import { getBoard, getHistory } from "./_lib/api";
import { Notice, ProvisionalBadge, TeamNames, formatDate } from "./_components/ui";

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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 w-10">#</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2 text-right" title="Elo-like skill score (~1500 = a new player)">
              Rating
            </th>
            <th className="px-3 py-2 text-right">W–L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.standings.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 text-slate-400">{s.rank}</td>
              <td className="px-3 py-2">
                <span className="font-medium">{s.name}</span>{" "}
                {s.provisional && <ProvisionalBadge />}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{s.rating}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">
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
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  if (data.games.length === 0)
    return <p className="text-sm text-slate-400">No games logged yet.</p>;

  return (
    <ul className="space-y-2">
      {data.games.map((g) => {
        const aWon = g.winner === "a";
        const winTeam = aWon ? g.teamA : g.teamB;
        const loseTeam = aWon ? g.teamB : g.teamA;
        const winScore = aWon ? g.scoreA : g.scoreB;
        const loseScore = aWon ? g.scoreB : g.scoreA;
        return (
          <li
            key={g.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="w-24 shrink-0 whitespace-nowrap text-xs text-slate-400">
              {formatDate(g.playedDate)}
            </span>
            <span className="font-semibold">
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
  );
}
