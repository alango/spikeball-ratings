"use client";
// Matchup predictor (SPEC §11.3). Pick four players, see all three 2v2 splits with
// their win probabilities, fairest first.
//
// Runs entirely in the browser off the drift-to-today ratings /api/stats already
// returns: openskill is ~15 KB gzipped, and a round-trip per selection change would
// make it feel worse for no benefit. The math itself is openskill's `predictWin`,
// never hand-rolled (CLAUDE.md).
//
// This is NOT matchmaking (SPEC §1): it never picks who plays or writes anything.
// Four people are already on the court; this evaluates a split they hand it.

import { useMemo, useState } from "react";
import { isValidFoursome, predictPairings } from "@/lib/predict";
import type { Player } from "../_lib/api";

const FOUR = 4;

export function Predictor({
  players,
  ratings,
}: {
  players: Player[];
  ratings: Record<number, { mu: number; sigma: number }>;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const nameOf = (id: number) => players.find((p) => p.id === id)?.name ?? `#${id}`;

  const options = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const toggle = (id: number) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= FOUR
          ? prev
          : [...prev, id],
    );

  const predictions = useMemo(() => {
    if (!isValidFoursome(picked)) return null;
    return predictPairings(picked, ratings);
  }, [picked, ratings]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => {
          const on = picked.includes(p.id);
          const disabled = !on && picked.length >= FOUR;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(p.id)}
              title={disabled ? "Deselect someone first — four players" : undefined}
              className={`rounded-full border px-2.5 py-1 text-sm ${
                on
                  ? "border-slate-900 bg-slate-900 font-medium text-white"
                  : disabled
                    ? "border-slate-200 bg-slate-50 text-slate-300"
                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {predictions === null ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">
          Pick {FOUR - picked.length} more player{FOUR - picked.length === 1 ? "" : "s"}.
        </p>
      ) : (
        // Sorted fairest-first by `predictPairings`, which is enough to point at the
        // even split without labelling one.
        <div className="space-y-2">
          {predictions.map((p) => (
            <Pairing
              key={`${p.teamA.join()}-${p.teamB.join()}`}
              teamA={p.teamA.map(nameOf)}
              teamB={p.teamB.map(nameOf)}
              probA={p.probA}
            />
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <button
          type="button"
          onClick={() => setPicked([])}
          className="text-xs text-slate-400 hover:text-slate-900"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * The model's own figure, for the hover behind a clamped headline. Two decimals, and
 * never rounded up into a bare "100%" — the point of showing it is that it ISN'T
 * certain, so a value that rounds to the ends gets an inequality instead.
 */
function precise(p: number): string {
  const v = p * 100;
  if (v >= 99.995) return ">99.99%";
  if (v <= 0.005) return "<0.01%";
  return `${v.toFixed(2)}%`;
}

function Pairing({
  teamA,
  teamB,
  probA,
}: {
  teamA: string[];
  teamB: string[];
  probA: number;
}) {
  // Team B's number is derived from A's rounding rather than rounded separately, so
  // the pair always reads as 100 instead of occasionally 49–52.
  //
  // Clamped to 1–99: the league's μ spread is far wider than the model's beta, so a
  // lopsided four returns 99.97% and would print as a flat "100–0". Nothing in a
  // casual league is certain, and printing certainty is the fastest way to make the
  // whole page look silly. The exact figure stays available on hover.
  const a = Math.min(99, Math.max(1, Math.round(probA * 100)));
  const b = 100 - a;
  const exact = `${precise(probA)} / ${precise(1 - probA)}`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={a >= b ? "font-semibold" : "text-slate-500"}>
          {teamA.join(" & ")}
        </span>
        <span className="text-slate-400">vs</span>
        <span className={b > a ? "font-semibold" : "text-slate-500"}>
          {teamB.join(" & ")}
        </span>
        <span className="ml-auto tabular-nums font-semibold" title={exact}>
          {a}–{b}
        </span>
      </div>
      {/* The split as a bar: two segments with a surface gap between them, so the
          balance is readable without doing arithmetic on the percentages. */}
      <div className="mt-1.5 flex h-1.5 gap-0.5" aria-hidden>
        <div className="rounded-l-full bg-slate-900" style={{ width: `${a}%` }} />
        <div className="flex-1 rounded-r-full bg-slate-300" />
      </div>
    </div>
  );
}
