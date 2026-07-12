"use client";
// Small shared presentational bits used across the public and admin pages.
import { useState } from "react";
import type { PlayerRef } from "../_lib/api";

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
 * A player's name that reveals the rating gain/loss this game gave them (green for a
 * gain, red for a loss). Revealed on hover (desktop) OR on tap (mobile, where there
 * is no hover) — the name is a button that toggles the tooltip. Falls back to a plain
 * name when no delta is available (e.g. an older client shape).
 */
export function PlayerName({ player }: { player: PlayerRef }) {
  const [open, setOpen] = useState(false);
  const d = player.ratingDelta;
  if (d === null || d === undefined) return <>{player.name}</>;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  const label = `${sign}${Math.abs(d)}`;
  const tone = d > 0 ? "text-emerald-400" : d < 0 ? "text-rose-400" : "text-slate-300";
  return (
    <button
      type="button"
      // Tap-to-toggle only where there's no hover (touch). On desktop the click is a
      // no-op and the tooltip is hover-only, per design.
      onClick={() => {
        if (window.matchMedia("(hover: none)").matches) setOpen((o) => !o);
      }}
      onBlur={() => setOpen(false)}
      aria-label={`${player.name}: ${label} from this game`}
      className="group relative cursor-default bg-transparent align-baseline"
    >
      {player.name}
      <span
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white group-hover:block ${
          open ? "block" : "hidden"
        }`}
      >
        <span className={tone}>{label}</span>
      </span>
    </button>
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
