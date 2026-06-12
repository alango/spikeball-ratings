// Small shared presentational bits used across the public and admin pages.
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
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
      provisional
    </span>
  );
}

/** "Alice & Bob" from a two-player team. */
export function teamName(team: PlayerRef[]): string {
  return team.map((p) => p.name).join(" & ");
}
