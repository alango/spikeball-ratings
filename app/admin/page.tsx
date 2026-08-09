"use client";

import { useEffect, useState } from "react";
import { usePoll } from "../_lib/usePoll";
import {
  getHistory,
  getPlayers,
  adminVerify,
  adminAddPlayer,
  adminRenamePlayer,
  adminLogGame,
  adminEditGame,
  adminDeleteGame,
  type GamePayload,
  type GameView,
  type Player,
} from "../_lib/api";
import {
  Notice,
  RECENT_GAMES,
  ShowAllGames,
  TeamNames,
  formatDate,
} from "../_components/ui";

const today = () => new Date().toISOString().slice(0, 10);

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Try a stored PIN on load; reveal controls only if it verifies.
  useEffect(() => {
    const stored = localStorage.getItem("adminPin") ?? "";
    if (!stored) {
      setChecking(false);
      return;
    }
    setPin(stored);
    adminVerify(stored)
      .then(() => setAuthed(true))
      .catch(() => localStorage.removeItem("adminPin"))
      .finally(() => setChecking(false));
  }, []);

  // Hooks run unconditionally; these poll public reads regardless of auth.
  const playersPoll = usePoll(getPlayers, 8000);
  const historyPoll = usePoll(getHistory, 8000);
  const players = playersPoll.data?.players ?? [];
  const games = historyPoll.data?.games ?? [];
  const refresh = () => {
    playersPoll.refresh();
    historyPoll.refresh();
  };

  // The game being edited, owned here because the form and the list it's picked from
  // are now separated by the roster. Passing it as `key` to GameForm resets the form's
  // fields on every switch, so there's no stale state to clear by hand.
  const [editing, setEditing] = useState<GameView | null>(null);
  const startEdit = (g: GameView) => {
    setEditing(g);
    document.getElementById("game-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setErr(null);
  };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Failed");

  async function login() {
    setErr(null);
    try {
      await adminVerify(pin);
      localStorage.setItem("adminPin", pin);
      setAuthed(true);
    } catch (e) {
      fail(e);
    }
  }

  function lock() {
    localStorage.removeItem("adminPin");
    setPin("");
    setAuthed(false);
    setMsg(null);
    setErr(null);
  }

  if (checking) return <p className="text-sm text-slate-400">Checking…</p>;

  if (!authed) {
    return (
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">Admin</h1>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          placeholder="Admin PIN"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {err && <Notice kind="error">{err}</Notice>}
        <button
          onClick={login}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Enter
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <button onClick={lock} className="text-sm text-slate-500 hover:text-slate-900">
          Lock
        </button>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      {msg && <Notice kind="info">{msg}</Notice>}

      {/* Roster sits above the game list: the list is long and grows forever, and
          having it in between put "add a player" three screens down the page. */}
      <GameForm
        key={editing?.id ?? "new"}
        pin={pin}
        players={players}
        editing={editing}
        onDone={(m) => {
          flash(m);
          setEditing(null);
          refresh();
        }}
        onCancel={() => setEditing(null)}
        onError={fail}
      />

      <Roster
        pin={pin}
        players={players}
        onDone={(m) => {
          flash(m);
          refresh();
        }}
        onError={fail}
      />

      <GameList
        pin={pin}
        games={games}
        editingId={editing?.id ?? null}
        onEdit={startEdit}
        onDone={(m) => {
          flash(m);
          refresh();
        }}
        onError={fail}
      />
    </div>
  );
}

// ---- Game log / edit / delete ----------------------------------------------

function GameForm({
  pin,
  players,
  editing,
  onDone,
  onCancel,
  onError,
}: {
  pin: string;
  players: Player[];
  editing: GameView | null;
  onDone: (m: string) => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  // Seeded from `editing` on mount; the parent remounts this via `key` when the game
  // being edited changes, so these initialisers are the only place fields are set.
  const editingId = editing?.id ?? null;
  const [date, setDate] = useState(editing?.playedDate ?? today());
  const [slots, setSlots] = useState<(number | "")[]>(
    editing
      ? [editing.teamA[0].id, editing.teamA[1].id, editing.teamB[0].id, editing.teamB[1].id]
      : ["", "", "", ""], // a1,a2,b1,b2
  );
  const [winner, setWinner] = useState<"a" | "b">(editing?.winner ?? "a");
  const [scoreA, setScoreA] = useState(editing?.scoreA?.toString() ?? "");
  const [scoreB, setScoreB] = useState(editing?.scoreB?.toString() ?? "");

  const reset = () => {
    setDate(today());
    setSlots(["", "", "", ""]);
    setWinner("a");
    setScoreA("");
    setScoreB("");
  };

  const setSlot = (i: number, v: string) =>
    setSlots((s) => s.map((x, j) => (j === i ? (v === "" ? "" : Number(v)) : x)));

  async function submit() {
    if (slots.some((s) => s === "")) return onError(new Error("Pick all four players"));
    const payload: GamePayload = {
      playedDate: date,
      teamA: [slots[0] as number, slots[1] as number],
      teamB: [slots[2] as number, slots[3] as number],
      winner,
      scoreA: scoreA === "" ? null : Number(scoreA),
      scoreB: scoreB === "" ? null : Number(scoreB),
    };
    try {
      if (editingId === null) {
        await adminLogGame(pin, payload);
        onDone("Game logged.");
        reset(); // no remount when logging back-to-back games, so clear by hand
      } else {
        await adminEditGame(pin, editingId, payload);
        onDone("Game updated."); // parent clears `editing`, which remounts and resets
      }
    } catch (e) {
      onError(e);
    }
  }

  // Disable already-picked players in the other dropdowns.
  const chosen = new Set(slots.filter((s) => s !== "") as number[]);
  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

  // Flag a score that contradicts the winner radio (both present, winner not ahead).
  const nA = scoreA === "" ? null : Number(scoreA);
  const nB = scoreB === "" ? null : Number(scoreB);
  const scoreMismatch =
    nA !== null &&
    nB !== null &&
    !Number.isNaN(nA) &&
    !Number.isNaN(nB) &&
    (winner === "a" ? nA <= nB : nB <= nA);
  const picker = (i: number) => (
    <select
      value={slots[i]}
      onChange={(e) => setSlot(i, e.target.value)}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    >
      <option value="">— player —</option>
      {sortedPlayers.map((p) => (
        <option key={p.id} value={p.id} disabled={chosen.has(p.id) && slots[i] !== p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  /**
   * The winner picker for one team's row. This is the most consequential control on
   * the page — the winner is what the rating is built on (SPEC §2), and a mis-set one
   * is only caught later by a rebuild — so it reads as a filled button with the whole
   * row tinted, not a bare radio. The input stays a real radio (visually hidden) to
   * keep the group keyboard- and screen-reader-navigable.
   */
  const wonToggle = (team: "a" | "b") => {
    const isWinner = winner === team;
    return (
      <label
        className={`ml-auto cursor-pointer rounded-md border px-3 py-1 text-xs font-semibold focus-within:ring-2 focus-within:ring-emerald-400 ${
          isWinner
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
        }`}
      >
        <input
          type="radio"
          name="winner"
          className="sr-only"
          checked={isWinner}
          onChange={() => setWinner(team)}
        />
        {isWinner ? "Won" : "Won?"}
      </label>
    );
  };

  const teamRow = (team: "a" | "b", label: string, first: number) => (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm ${
        winner === team ? "border-emerald-200 bg-emerald-50" : "border-transparent"
      }`}
    >
      <span className="w-14 text-slate-500">{label}</span>
      {picker(first)}
      {picker(first + 1)}
      {wonToggle(team)}
    </div>
  );

  return (
    <section id="game-form" className="scroll-mt-4 space-y-4">
      <h2 className="text-lg font-semibold">
        {editingId === null ? "Log a game" : `Edit game #${editingId}`}
      </h2>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16 text-slate-500">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>

        {teamRow("a", "Team A", 0)}
        {teamRow("b", "Team B", 2)}

        <div className="flex items-center gap-2 text-sm">
          <span className="w-16 text-slate-500">Score</span>
          <input
            inputMode="numeric"
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            placeholder="A"
            className={`w-16 rounded-md border px-2 py-1.5 ${
              scoreMismatch ? "border-red-400 bg-red-50" : "border-slate-300"
            }`}
          />
          <span className="text-slate-400">–</span>
          <input
            inputMode="numeric"
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            placeholder="B"
            className={`w-16 rounded-md border px-2 py-1.5 ${
              scoreMismatch ? "border-red-400 bg-red-50" : "border-slate-300"
            }`}
          />
          {scoreMismatch ? (
            <span className="text-xs text-red-600">
              winner’s score must be higher
            </span>
          ) : (
            <span className="text-xs text-slate-400">(optional)</span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={scoreMismatch}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editingId === null ? "Log game" : "Save changes"}
          </button>
          {editingId !== null && (
            <button
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Logged games (edit / delete) ------------------------------------------

function GameList({
  pin,
  games,
  editingId,
  onEdit,
  onDone,
  onError,
}: {
  pin: string;
  games: GameView[];
  editingId: number | null;
  onEdit: (g: GameView) => void;
  onDone: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  async function remove(id: number) {
    if (!confirm("Delete this game? Ratings will be rebuilt.")) return;
    try {
      await adminDeleteGame(pin, id);
      onDone("Game deleted.");
    } catch (e) {
      onError(e);
    }
  }

  const shown = showAll ? games : games.slice(0, RECENT_GAMES);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Logged games</h2>
      <ul className="space-y-2">
        {shown.map((g) => {
          const aWon = g.winner === "a";
          const winTeam = aWon ? g.teamA : g.teamB;
          const loseTeam = aWon ? g.teamB : g.teamA;
          const winScore = aWon ? g.scoreA : g.scoreB;
          const loseScore = aWon ? g.scoreB : g.scoreA;
          return (
            <li
              key={g.id}
              className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm ${
                g.id === editingId ? "border-slate-900" : "border-slate-200"
              }`}
            >
              <span className="w-24 shrink-0 whitespace-nowrap text-xs text-slate-400">
                {formatDate(g.playedDate)}
              </span>
              <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  <TeamNames team={winTeam} />
                </span>
                <span className="text-slate-400">vs</span>
                <span className="text-slate-500">
                  <TeamNames team={loseTeam} />
                </span>
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-slate-500">
                {winScore !== null && loseScore !== null
                  ? `${winScore}–${loseScore}`
                  : ""}
              </span>
              {/* Delete is kept clear of edit — it's destructive and they sat adjacent. */}
              <span className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => onEdit(g)}
                  className="text-slate-500 hover:text-slate-900"
                >
                  edit
                </button>
                <button
                  onClick={() => remove(g.id)}
                  className="text-rose-500 hover:text-rose-700"
                >
                  delete
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <ShowAllGames
        total={games.length}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />
    </section>
  );
}

// ---- Roster ----------------------------------------------------------------

function Roster({
  pin,
  players,
  onDone,
  onError,
}: {
  pin: string;
  players: Player[];
  onDone: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [newName, setNewName] = useState("");

  async function add() {
    const name = newName.trim();
    if (!name) return;
    try {
      await adminAddPlayer(pin, name);
      setNewName("");
      onDone(`Added ${name}.`);
    } catch (e) {
      onError(e);
    }
  }

  async function rename(p: Player) {
    const name = prompt("Rename player", p.name)?.trim();
    if (!name || name === p.name) return;
    try {
      await adminRenamePlayer(pin, p.id, name);
      onDone("Renamed.");
    } catch (e) {
      onError(e);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Roster</h2>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New player name"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Add
        </button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {players.map((p) => (
          <li key={p.id} className="flex items-center px-3 py-2 text-sm">
            {p.name}
            <button
              onClick={() => rename(p)}
              className="ml-auto text-slate-400 hover:text-slate-900"
            >
              rename
            </button>
          </li>
        ))}
        {players.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-400">No players yet.</li>
        )}
      </ul>
    </section>
  );
}
