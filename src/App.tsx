import { useEffect, useMemo, useState } from "react";
import { Board } from "./board/Board";
import { Icon } from "./board/Icon";
import { MACHINES } from "./board/MachineChip";
import { QueueBand } from "./board/QueueBand";
import type { BoardData } from "./board/types";

type Payload = { board: BoardData; rate: { remaining: number } };

function onlyMine(data: BoardData): BoardData {
  const mine = (author: string) => author === data.viewer;
  return {
    ...data,
    needs: data.needs.filter((pr) => mine(pr.author)),
    running: data.running.filter((pr) => mine(pr.author)),
    ready: data.ready.filter((pr) => mine(pr.author)),
    queue: data.queue.filter((entry) => mine(entry.author)),
  };
}

const POLL = 15_000;

export default function App() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [filtered, setFiltered] = useState(false);

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
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  const view = useMemo(() => (data && filtered ? onlyMine(data) : data), [data, filtered]);
  const age = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center text-[12.5px] text-ink-3">
        {error ? `Cannot reach GitHub. ${error}` : "Reading GitHub…"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-3 px-[22px]">
        <div className="flex size-[26px] items-center justify-center rounded-full bg-card-hi text-xs font-semibold text-ink-2">
          {view.viewer.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-[13px] font-semibold tracking-[-0.01em]">{view.viewer}</span>

        <button
          type="button"
          onClick={() => setFiltered((value) => !value)}
          aria-pressed={filtered}
          className={`inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2.5 text-[11.5px] transition-colors ${
            filtered ? "bg-accent/15 text-accent" : "bg-card text-ink-2 hover:bg-card-hi"
          }`}
        >
          <Icon name="i-user" className={`size-[11px] ${filtered ? "" : "text-ink-3"}`} />
          {filtered ? "Only mine" : "Everyone"}
        </button>

        <div className="flex-1" />

        {error && <span className="text-[11.5px] text-err">stale · {error.slice(0, 60)}</span>}
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <Icon name="i-timer" className="size-3" />
          {age === null ? "syncing" : `updated ${age}s ago`}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <span className="beat size-1.5 rounded-full bg-ok" />
          live · {view.clock}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <QueueBand
          entries={view.queue}
          batch={view.batch}
          averageWaitMinutes={view.averageWaitMinutes}
          mergedToday={view.mergedToday}
        />

        <div className="min-h-0 flex-1">
          <Board data={view} viewer={view.viewer} />
        </div>
      </main>

      <footer className="flex h-[40px] shrink-0 items-center gap-5 px-[22px] text-[11.5px] text-ink-3">
        {view.runners.map((runner) => {
          const machine = MACHINES[runner.kind];
          return (
            <span key={runner.kind} className="flex items-center gap-1.5">
              <Icon name={machine.icon} className="size-3" />
              {machine.short} <b className="font-medium text-ink-2">{runner.jobs}</b>
            </span>
          );
        })}
        <span className="ml-auto">jobs started in the last hour</span>
      </footer>
    </div>
  );
}
