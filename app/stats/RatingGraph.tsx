"use client";
// Rating-over-time chart (SPEC §11.2). Hand-rolled SVG: ~13 points per line and one
// chart type don't justify a charting dependency (see SPEC for the measured numbers).
//
// The shape of the data is the point of the design: one point per SESSION, and a
// player's line keeps going through sessions they missed, sagging as inactivity
// drift inflates their σ. Markers are drawn only on sessions they actually played,
// so a dotless stretch reads as "away" rather than as missing data.

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameView, Player, PlayerSeries, SeriesPoint } from "../_lib/api";
import { TeamNames, formatDate } from "../_components/ui";

/**
 * Categorical series colors, light surface, in FIXED slot order — a 9th series is
 * never a generated hue, so the picker caps at eight. Colors follow the player, not
 * their position in the list: deselecting someone must not repaint the survivors,
 * which is why selection is stored as slots rather than as a list.
 */
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
export const MAX_SERIES = SERIES_COLORS.length;

const DAY = 86_400_000;
const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** Short axis label — the year is in the heading, not on every tick. */
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

/** Round tick values covering [min, max] — 1/2/5 × a power of ten. */
function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v));
  }
  return out;
}

/** Measure the container so the SVG is drawn at true pixel size (text included). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function RatingGraph({
  series,
  players,
  games,
}: {
  series: PlayerSeries[];
  players: Player[];
  games: GameView[];
}) {
  const nameOf = (id: number) => players.find((p) => p.id === id)?.name ?? `#${id}`;

  // Selection as fixed slots: slots[i] holds a player id or null, and slot i is
  // always color i. Removing a player frees their slot without moving anyone else.
  const [slots, setSlots] = useState<(number | null)[]>(() => {
    const top = [...series]
      .filter((s) => s.points.length > 0)
      .sort(
        (a, b) => b.points[b.points.length - 1].elo - a.points[a.points.length - 1].elo,
      )
      .slice(0, 5)
      .map((s) => s.playerId);
    return Array.from({ length: MAX_SERIES }, (_, i) => top[i] ?? null);
  });

  const colorOf = (id: number) => {
    const i = slots.indexOf(id);
    return i === -1 ? null : SERIES_COLORS[i];
  };

  const toggle = (id: number) => {
    setSlots((prev) => {
      const at = prev.indexOf(id);
      if (at !== -1) return prev.map((v, i) => (i === at ? null : v));
      const free = prev.indexOf(null);
      if (free === -1) return prev; // full — the picker disables the rest
      return prev.map((v, i) => (i === free ? id : v));
    });
  };

  const shown = useMemo(
    () =>
      slots
        .map((id, i) => {
          if (id === null) return null;
          const s = series.find((x) => x.playerId === id);
          return s ? { ...s, color: SERIES_COLORS[i], name: nameOf(id) } : null;
        })
        .filter((s): s is PlayerSeries & { color: string; name: string } => s !== null),
    [slots, series, players], // nameOf only closes over `players`
  );

  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <PlayerPicker
        players={players}
        series={series}
        slots={slots}
        colorOf={colorOf}
        onToggle={toggle}
      />
      {shown.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-400">
          Pick a player to plot.
        </p>
      ) : (
        <Chart
          shown={shown}
          hoverDate={hoverDate}
          openDate={openDate}
          onHover={setHoverDate}
          onPick={(d) => setOpenDate((cur) => (cur === d ? null : d))}
        />
      )}
      {openDate && (
        <SessionPanel
          date={openDate}
          games={games.filter((g) => g.playedDate === openDate)}
          shown={shown}
          onClose={() => setOpenDate(null)}
        />
      )}
    </div>
  );
}

// ---- Picker -----------------------------------------------------------------

function PlayerPicker({
  players,
  series,
  slots,
  colorOf,
  onToggle,
}: {
  players: Player[];
  series: PlayerSeries[];
  slots: (number | null)[];
  colorOf: (id: number) => string | null;
  onToggle: (id: number) => void;
}) {
  const plotted = new Set(series.map((s) => s.playerId));
  const options = players
    .filter((p) => plotted.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const full = slots.every((s) => s !== null);

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((p) => {
        const color = colorOf(p.id);
        const on = color !== null;
        const disabled = !on && full;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(p.id)}
            title={disabled ? `Deselect someone first — ${MAX_SERIES} lines maximum` : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
              on
                ? "border-slate-300 bg-white font-medium text-slate-900"
                : disabled
                  ? "border-slate-200 bg-slate-50 text-slate-300"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            }`}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: on ? color : "transparent", boxShadow: on ? undefined : "inset 0 0 0 1px #cbd5e1" }}
            />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

// ---- Chart ------------------------------------------------------------------

type Shown = PlayerSeries & { color: string; name: string };

function Chart({
  shown,
  hoverDate,
  openDate,
  onHover,
  onPick,
}: {
  shown: Shown[];
  hoverDate: string | null;
  openDate: string | null;
  onHover: (d: string | null) => void;
  onPick: (d: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 300;
  const w = Math.max(width, 260);
  // Right padding holds the endpoint labels. Three of the eight series colors sit
  // below 3:1 against white, so visible direct labels are required, not optional —
  // but on a phone 84px of it is a quarter of the chart, so it tightens.
  const pad = { top: 14, right: w < 420 ? 66 : 84, bottom: 26, left: 44 };
  const innerW = Math.max(w - pad.left - pad.right, 40);
  const innerH = height - pad.top - pad.bottom;

  const dates = useMemo(
    () => [...new Set(shown.flatMap((s) => s.points.map((p) => p.date)))].sort(),
    [shown],
  );

  const { yMin, yMax } = useMemo(() => {
    const vals = shown.flatMap((s) => s.points.map((p) => p.elo));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const padY = Math.max((hi - lo) * 0.08, 10);
    return { yMin: lo - padY, yMax: hi + padY };
  }, [shown]);

  if (dates.length === 0) return null;

  const x0 = days(dates[0]);
  const x1 = days(dates[dates.length - 1]);
  const xOf = (iso: string) =>
    pad.left + (x1 === x0 ? innerW / 2 : ((days(iso) - x0) / (x1 - x0)) * innerW);
  const yOf = (v: number) => pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const ticks = niceTicks(yMin, yMax, 5);
  // Label by PIXEL spacing, not by every-Nth-session: the axis is date-scaled and
  // sessions bunch up (three in one week, then a fortnight off), so an even index
  // stride overprints its labels. Walked from the right so the most recent session —
  // the one people look for — always keeps its label.
  const labelDates: string[] = [];
  for (let i = dates.length - 1; i >= 0; i--) {
    const last = labelDates[labelDates.length - 1];
    if (last === undefined || xOf(last) - xOf(dates[i]) >= 58) labelDates.push(dates[i]);
  }
  labelDates.reverse();

  // Endpoint labels, nudged apart so eight series don't overprint at the right edge.
  const ends = shown
    .map((s) => ({ s, p: s.points[s.points.length - 1] }))
    .filter((e) => e.p)
    .sort((a, b) => yOf(a.p.elo) - yOf(b.p.elo));
  let prevY = -Infinity;
  const placed = ends.map((e) => {
    const y = Math.max(yOf(e.p.elo), prevY + 13);
    prevY = y;
    return { ...e, y };
  });

  const active = hoverDate ?? openDate;

  return (
    <div ref={ref} className="relative rounded-lg border border-slate-200 bg-white">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`Rating over time for ${shown.map((s) => s.name).join(", ")}`}
        onMouseLeave={() => onHover(null)}
      >
        {/* Gridlines: solid hairlines one step off the surface, never dashed. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
            <text
              x={pad.left - 8}
              y={yOf(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400 text-[11px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}

        {labelDates.map((d) => (
          <text
            key={d}
            x={xOf(d)}
            y={height - 8}
            textAnchor="middle"
            className="fill-slate-400 text-[11px]"
          >
            {shortDate(d)}
          </text>
        ))}

        {active && (
          <line
            x1={xOf(active)}
            x2={xOf(active)}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke={openDate === active ? "#94a3b8" : "#cbd5e1"}
            strokeWidth={1}
          />
        )}

        {shown.map((s) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.date)},${yOf(p.elo)}`)
            .join(" ");
          return (
            <g key={s.playerId}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Markers only where they played: a dotless stretch is an absence,
                  not a gap in the data. */}
              {s.points
                .filter((p) => p.played)
                .map((p) => (
                  <circle
                    key={p.date}
                    cx={xOf(p.date)}
                    cy={yOf(p.elo)}
                    r={active === p.date ? 5 : 3.5}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={active === p.date ? 2 : 1.5}
                  />
                ))}
            </g>
          );
        })}

        {/* Direct labels in text ink with a colored key beside them — a light hue is
            illegible as text, and identity must not rest on color alone. */}
        {placed.map(({ s, p, y }) => (
          <g key={s.playerId}>
            <line
              x1={xOf(p.date) + 6}
              x2={xOf(p.date) + 14}
              y1={y}
              y2={y}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <text
              x={xOf(p.date) + 18}
              y={y}
              dominantBaseline="middle"
              className="fill-slate-600 text-[11px]"
            >
              {s.name}
            </text>
          </g>
        ))}

        {/* Hit bands: the reader aims at a session, never at a 2px line. */}
        {dates.map((d, i) => {
          const left = i === 0 ? pad.left : (xOf(dates[i - 1]) + xOf(d)) / 2;
          const right =
            i === dates.length - 1 ? pad.left + innerW : (xOf(d) + xOf(dates[i + 1])) / 2;
          return (
            <rect
              key={d}
              x={left}
              y={pad.top}
              width={Math.max(right - left, 1)}
              height={innerH}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => onHover(d)}
              onClick={() => onPick(d)}
            />
          );
        })}
      </svg>

      {active && (
        <Readout
          date={active}
          shown={shown}
          x={xOf(active)}
          chartWidth={w}
          pinned={openDate === active}
        />
      )}
    </div>
  );
}

/**
 * One tooltip listing every plotted series at the hovered session — the pointer never
 * has to land on a line to get a value. Flips to the left of the crosshair near the
 * right edge, and the card is positioned, never clipped, by its container.
 */
function Readout({
  date,
  shown,
  x,
  chartWidth,
  pinned,
}: {
  date: string;
  shown: Shown[];
  x: number;
  chartWidth: number;
  pinned: boolean;
}) {
  const rows = shown
    .map((s) => ({ s, p: s.points.find((q) => q.date === date) }))
    .filter((r): r is { s: Shown; p: SeriesPoint } => Boolean(r.p))
    .sort((a, b) => b.p.elo - a.p.elo);
  if (rows.length === 0) return null;

  const flip = x > chartWidth - 190;
  return (
    <div
      className="pointer-events-none absolute top-3 z-10 w-44 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs shadow-sm"
      style={flip ? { right: chartWidth - x + 10 } : { left: x + 10 }}
    >
      <div className="mb-1 font-medium text-slate-500">{formatDate(date)}</div>
      {rows.map(({ s, p }) => (
        <div key={s.playerId} className="flex items-center gap-1.5 py-0.5">
          <span
            aria-hidden
            className="h-0.5 w-3 shrink-0 rounded"
            style={{ backgroundColor: s.color }}
          />
          <span className="truncate text-slate-500">{s.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-900">{p.elo}</span>
          <span
            className={`w-9 shrink-0 text-right tabular-nums ${
              !p.played
                ? "text-slate-400" // drift, not a result — recessive but still legible
                : (p.delta ?? 0) > 0
                  ? "text-emerald-600"
                  : (p.delta ?? 0) < 0
                    ? "text-rose-600"
                    : "text-slate-400"
            }`}
            title={p.played ? `${p.games} game${p.games === 1 ? "" : "s"}` : "did not play"}
          >
            {p.delta === null ? "" : `${p.delta > 0 ? "+" : ""}${p.delta}`}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-400">
        {pinned ? "Click again to close" : "Click for the games"}
      </div>
    </div>
  );
}

// ---- Session panel ----------------------------------------------------------

/**
 * The clicked session's games, below the chart rather than inside a tooltip: a
 * session runs to a dozen games, and the public UI has to work on a phone, where
 * there is no hover at all (SPEC §11.2).
 */
function SessionPanel({
  date,
  games,
  shown,
  onClose,
}: {
  date: string;
  games: GameView[];
  shown: Shown[];
  onClose: () => void;
}) {
  const plotted = new Set(shown.map((s) => s.playerId));
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold">{formatDate(date)}</h4>
        <span className="text-xs text-slate-400">
          {games.length} game{games.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-slate-400 hover:text-slate-900"
        >
          Close
        </button>
      </div>
      {games.length === 0 ? (
        <p className="px-3 py-3 text-sm text-slate-400">No games logged on this date.</p>
      ) : (
        // No `overflow-hidden`: the name tooltips sit above their row and would be
        // clipped on the first one.
        <ul className="divide-y divide-slate-100">
          {games.map((g) => {
            const aWon = g.winner === "a";
            const winTeam = aWon ? g.teamA : g.teamB;
            const loseTeam = aWon ? g.teamB : g.teamA;
            const winScore = aWon ? g.scoreA : g.scoreB;
            const loseScore = aWon ? g.scoreB : g.scoreA;
            // A plotted player's own change is what the reader came for, so it's
            // spelled out rather than left to a hover.
            const mine = [...g.teamA, ...g.teamB].filter((p) => plotted.has(p.id));
            return (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"
              >
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
                {mine.length > 0 && (
                  <span className="flex w-full flex-wrap gap-x-3 text-xs text-slate-400">
                    {mine.map((p) => (
                      <span key={p.id}>
                        {p.name}{" "}
                        <span
                          className={
                            (p.ratingDelta ?? 0) > 0 ? "text-emerald-600" : "text-rose-600"
                          }
                        >
                          {p.ratingDelta === null
                            ? "—"
                            : `${p.ratingDelta > 0 ? "+" : ""}${p.ratingDelta}`}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
