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
import { Notice, teamName, formatDate } from "../_components/ui";

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

      <GameForm
        pin={pin}
        players={players}
        games={games}
        onDone={(m) => {
          flash(m);
          refresh();
        }}
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
    </div>
  );
}

// ---- Game log / edit / delete ----------------------------------------------

function GameForm({
  pin,
  players,
  games,
  onDone,
  onError,
}: {
  pin: string;
  players: Player[];
  games: GameView[];
  onDone: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<(number | "")[]>(["", "", "", ""]); // a1,a2,b1,b2
  const [winner, setWinner] = useState<"a" | "b">("a");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");

  const reset = () => {
    setEditingId(null);
    setDate(today());
    setSlots(["", "", "", ""]);
    setWinner("a");
    setScoreA("");
    setScoreB("");
  };

  function loadForEdit(g: GameView) {
    setEditingId(g.id);
    setDate(g.playedDate);
    setSlots([g.teamA[0].id, g.teamA[1].id, g.teamB[0].id, g.teamB[1].id]);
    setWinner(g.winner);
    setScoreA(g.scoreA?.toString() ?? "");
    setScoreB(g.scoreB?.toString() ?? "");
  }

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
      } else {
        await adminEditGame(pin, editingId, payload);
        onDone("Game updated.");
      }
      reset();
    } catch (e) {
      onError(e);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this game? Ratings will be rebuilt.")) return;
    try {
      await adminDeleteGame(pin, id);
      onDone("Game deleted.");
      if (editingId === id) reset();
    } catch (e) {
      onError(e);
    }
  }

  // Disable already-picked players in the other dropdowns.
  const chosen = new Set(slots.filter((s) => s !== "") as number[]);
  const picker = (i: number) => (
    <select
      value={slots[i]}
      onChange={(e) => setSlot(i, e.target.value)}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    >
      <option value="">— player —</option>
      {players.map((p) => (
        <option key={p.id} value={p.id} disabled={chosen.has(p.id) && slots[i] !== p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <section className="space-y-4">
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

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-16 text-slate-500">Team A</span>
          {picker(0)}
          {picker(1)}
          <label className="ml-2 flex items-center gap-1">
            <input
              type="radio"
              checked={winner === "a"}
              onChange={() => setWinner("a")}
            />
            won
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-16 text-slate-500">Team B</span>
          {picker(2)}
          {picker(3)}
          <label className="ml-2 flex items-center gap-1">
            <input
              type="radio"
              checked={winner === "b"}
              onChange={() => setWinner("b")}
            />
            won
          </label>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="w-16 text-slate-500">Score</span>
          <input
            inputMode="numeric"
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            placeholder="A"
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5"
          />
          <span className="text-slate-400">–</span>
          <input
            inputMode="numeric"
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            placeholder="B"
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5"
          />
          <span className="text-xs text-slate-400">(optional — rating ignores it)</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={submit}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            {editingId === null ? "Log game" : "Save changes"}
          </button>
          {editingId !== null && (
            <button
              onClick={reset}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {games.map((g) => {
          const aWon = g.winner === "a";
          return (
            <li
              key={g.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="w-24 shrink-0 whitespace-nowrap text-xs text-slate-400">
                {formatDate(g.playedDate)}
              </span>
              <span className={aWon ? "font-semibold" : "text-slate-500"}>
                {teamName(g.teamA)}
              </span>
              <span className="text-slate-400">vs</span>
              <span className={!aWon ? "font-semibold" : "text-slate-500"}>
                {teamName(g.teamB)}
              </span>
              {g.scoreA !== null && g.scoreB !== null && (
                <span className="tabular-nums text-slate-500">
                  {g.scoreA}–{g.scoreB}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => loadForEdit(g)}
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
