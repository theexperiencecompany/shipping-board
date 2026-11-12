import { useEffect, useMemo, useState } from "react";
import { Board } from "./board/Board";
import { cn } from "./board/cn";
import { LiveStrip } from "./board/LiveStrip";
import { StatusStrip } from "./board/StatusStrip";
import type { BoardData } from "./board/types";

type Payload = { board: BoardData; rate: { remaining: number } };

const POLL = 15_000;
/** After this long without a good sync the board says so instead of looking healthy. */
const STALE = 60_000;
/** Pixel nudge so a static layout does not burn into the panel. */
const SHIFT_EVERY = 10 * 60_000;

function onlyMine(data: BoardData): BoardData {
  const mine = (author: string) => author === data.viewer;
  return {
    ...data,
    attention: data.attention.filter((item) => !item.pr || mine(item.pr.author)),
    running: data.running.filter((pr) => mine(pr.author)),
    ready: data.ready.filter((pr) => mine(pr.author)),
    queue: data.queue.filter((entry) => mine(entry.author)),
  };
}

export default function App() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const mine = params.has("mine");

  useEffect(() => {
    let alive = true;
    let ready = false;
    let timer = 0;

    const load = async () => {
      try {
        const response = await fetch("/api/board");
        const payload = (await response.json()) as Payload & { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? response.statusText);
        if (!alive) return;
        setData(payload.board);
        setSyncedAt(Date.now());
        setError(null);
        ready = true;
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (alive) timer = window.setTimeout(load, ready ? POLL : 3000);
      }
    };

    void load();
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  const view = useMemo(() => (data && mine ? onlyMine(data) : data), [data, mine]);

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center text-lg text-ink-3">
        {error ? `Cannot reach GitHub. ${error}` : "Reading GitHub…"}
      </div>
    );
  }

  const stale = syncedAt > 0 && now - syncedAt > STALE;
  const step = Math.floor(now / SHIFT_EVERY) % 4;
  const shift = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ][step];

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        (params.get("night") === "on" || (view.night && params.get("night") !== "off")) && "night",
      )}
      style={{ transform: `translate(${shift[0]}px, ${shift[1]}px)` }}
    >
      <StatusStrip data={view} stale={stale ? syncedAt : null} error={error} now={now} />
      <main className={cn("min-h-0 flex-1 transition-opacity", stale && "opacity-40")}>
        <Board data={view} now={now} />
      </main>
      <div className={cn("transition-opacity", stale && "opacity-40")}>
        <LiveStrip data={view} now={now} />
      </div>
    </div>
  );
}
