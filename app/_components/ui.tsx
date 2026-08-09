"use client";
// Small shared presentational bits used across the public and admin pages.
import { Fragment, useState } from "react";
import type { FormResult, PlayerRef, Standing } from "../_lib/api";

/**
 * A trigger that reveals a small tooltip above it, centred: on hover (desktop) OR on
 * tap (mobile, where there's no hover) — the trigger is a button that toggles the tip.
 * Click is a no-op on desktop (hover-only, per design). `triggerClass` sets how the
 * trigger itself flows — baseline-aligned inline text by default, overridable for
 * e.g. a flex row of boxes.
 */
function Tip({
  children,
  tip,
  ariaLabel,
  triggerClass = "align-baseline",
}: {
  children: React.ReactNode;
  tip: React.ReactNode;
  ariaLabel?: string;
  triggerClass?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (window.matchMedia("(hover: none)").matches) setOpen((o) => !o);
      }}
      onBlur={() => setOpen(false)}
      aria-label={ariaLabel}
      className={`group relative cursor-default bg-transparent ${triggerClass}`}
    >
      {children}
      <span
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white group-hover:block ${
          open ? "block" : "hidden"
        }`}
      >
        {tip}
      </span>
    </button>
  );
}

/**
 * How many games a history list shows before it has to be expanded (public board and
 * admin alike). Without a cap both lists render every game ever logged — the admin
 * page had already grown to three screens, pushing the roster below all of it.
 */
export const RECENT_GAMES = 20;

/** Expand/collapse control for a capped history list. Renders nothing if it all fits. */
export function ShowAllGames({
  total,
  showAll,
  onToggle,
}: {
  total: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  if (total <= RECENT_GAMES) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:text-slate-900"
    >
      {showAll ? `Show recent ${RECENT_GAMES}` : `Show all ${total} games`}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "info" | "error"; children: React.ReactNode }) {
  const cls =
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function ProvisionalBadge() {
  return (
    <span
      title="Provisional — fewer than 5 games played"
      className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
    >
      provisional
    </span>
  );
}

/**
 * A signed rating change as shown in a (dark) tooltip: green for a gain, red for a
 * loss. Shared by the history hover and the leaderboard's "Last 5" hover so the two
 * always read identically.
 */
function deltaTip(d: number): { label: string; tone: string } {
  return {
    label: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}`,
    tone: d > 0 ? "text-emerald-400" : d < 0 ? "text-rose-400" : "text-slate-300",
  };
}

/**
 * A player's name that reveals the rating gain/loss this game gave them (green for a
 * gain, red for a loss). Revealed on hover (desktop) OR on tap (mobile, where there
 * is no hover) — the name is a button that toggles the tooltip. Falls back to a plain
 * name when no delta is available (e.g. an older client shape).
 */
export function PlayerName({ player }: { player: PlayerRef }) {
  const d = player.ratingDelta;
  if (d === null || d === undefined) return <>{player.name}</>;
  const { label, tone } = deltaTip(d);
  return (
    <Tip
      tip={<span className={tone}>{label}</span>}
      ariaLabel={`${player.name}: ${label} from this game`}
    >
      {player.name}
    </Tip>
  );
}

/** Slots in the board's "Last 5" column — mirrors `FORM_GAMES` in `views.ts`. */
const FORM_SLOTS = 5;

/**
 * A player's last 5 results as W/L squares reading left-to-right in time, so the
 * RIGHTMOST square is the most recent game. Two cues keep that direction readable at
 * a glance: a rule separating the latest result from the four before it, and dashes
 * padding from the left when a player has played fewer than five games — which also
 * keeps every row's latest result in the same column. Each square reveals its date
 * and the rating change that game gave the player, the same hover as a name in the
 * game history.
 */
export function FormSquares({ form }: { form: FormResult[] }) {
  const results = form ?? [];
  const slots: (FormResult | null)[] = [
    ...Array<null>(Math.max(0, FORM_SLOTS - results.length)).fill(null),
    ...results.slice(-FORM_SLOTS),
  ];
  return (
    <span className="inline-flex items-center gap-0.5 align-middle sm:gap-1">
      {slots.map((r, i) => (
        <Fragment key={r ? `g${r.gameId}` : `pad${i}`}>
          {i === slots.length - 1 && (
            <span aria-hidden className="h-3.5 w-px bg-slate-300 sm:h-4" />
          )}
          {r ? <FormSquare result={r} /> : <FormBlank />}
        </Fragment>
      ))}
    </span>
  );
}

/** Squares shrink a little below `sm` so all five still fit a phone-width column. */
const FORM_BOX = "flex h-4.5 w-4.5 items-center justify-center text-[10px] sm:h-5 sm:w-5 sm:text-[11px]";

/** A not-yet-played slot: keeps the columns aligned and shows how new a player is. */
function FormBlank() {
  return (
    <span aria-hidden className={`${FORM_BOX} text-slate-300`}>
      –
    </span>
  );
}

function FormSquare({ result }: { result: FormResult }) {
  const box = `${FORM_BOX} rounded font-semibold ${
    result.won ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
  }`;
  const square = <span className={box}>{result.won ? "W" : "L"}</span>;
  const outcome = result.won ? "Win" : "Loss";
  const date = formatDate(result.playedDate);
  const d = result.ratingDelta;
  if (d === null) return <span title={`${outcome}, ${date}`}>{square}</span>;

  const { label, tone } = deltaTip(d);
  return (
    <Tip
      triggerClass="block"
      tip={
        <span className="block text-center leading-snug">
          <span className="block text-slate-300">{date}</span>
          <span className={`block ${tone}`}>{label}</span>
        </span>
      }
      ariaLabel={`${outcome} on ${date}: ${label}`}
    >
      {square}
    </Tip>
  );
}

/**
 * A leaderboard rating that reveals its make-up on hover/tap — for people who want to
 * dig into the number. The shown rating is `ceiling − uncertainty` (the raw μ/σ that
 * produced it, and the points currently docked for uncertainty). The tip centres on
 * the number: the rating column sits mid-table, so there is room either side.
 */
export function RatingBreakdown({ standing }: { standing: Standing }) {
  return (
    <Tip
      ariaLabel={`${standing.name} rating breakdown`}
      tip={
        <span className="block text-center leading-snug">
          <span className="block text-slate-300">
            μ {standing.mu} · σ {standing.sigma}
          </span>
          <span className="block">
            {standing.ceiling} − {standing.uncertainty} uncertainty
          </span>
        </span>
      }
    >
      {standing.rating}
    </Tip>
  );
}

/** A two-player team as hover-enabled names joined by "&". */
export function TeamNames({ team }: { team: PlayerRef[] }) {
  return (
    <>
      {team.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span className="font-normal text-slate-400"> & </span>}
          <PlayerName player={p} />
        </span>
      ))}
    </>
  );
}

/** ISO `YYYY-MM-DD` → "12 Jun 2026" (parsed as a local calendar day). */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
