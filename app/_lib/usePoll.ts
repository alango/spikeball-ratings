"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Poll an async fetcher on an interval (SPEC §9: reads are polled, not socketed).
 * Returns the latest data, any error, and a manual `refresh` for after mutations.
 */
export function usePoll<T>(fn: () => Promise<T>, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (alive) await refresh();
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}
