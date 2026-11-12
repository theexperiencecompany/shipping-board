import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { MACHINES } from "./machines";
import { clockTime, lasted } from "./time";
import type { BoardData } from "./types";

const MAIN = {
  pass: { dot: "bg-ok", text: "text-ok", word: "passing" },
  fail: { dot: "bg-err", text: "text-err", word: "failing" },
  run: { dot: "bg-accent", text: "text-accent", word: "checking" },
  unknown: { dot: "bg-ink-3", text: "text-ink-2", word: "no recent runs" },
};

const DOT = { ok: "bg-ok", warn: "bg-warn", err: "bg-err" };
const WORD = { ok: "text-ink-2", warn: "text-warn", err: "text-err" };

/** A runner pool: whether it is up, and how much of it is in use. */
function Capacity({
  icon,
  label,
  tone,
  status,
  load,
}: {
  icon: IconName;
  label: string;
  tone: "ok" | "warn" | "err";
  status: string | null;
  load: string | null;
}) {
  return (
    <span className="flex items-center gap-2 text-[0.85rem] whitespace-nowrap text-ink-2">
      <span className={cn("size-[0.5rem] rounded-full", DOT[tone])} />
      <Icon name={icon} className="size-[0.9rem] text-ink-3" />
      <span className="text-ink">{label}</span>
      {status && <span className={cn("font-semibold", WORD[tone])}>{status}</span>}
      {load && <span className="text-ink-3">{load}</span>}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <b className="text-[1.45rem] font-semibold tracking-[-0.02em] text-ink">{value}</b>
      <span className="text-[0.85rem] text-ink-3">{label}</span>
    </span>
  );
}

export function StatusStrip({
  data,
  stale,
  error,
  now,
}: {
  data: BoardData;
  stale: number | null;
  error: string | null;
  now: number;
}) {
  const main = MAIN[data.main.state];
  const self = (data.runners ?? []).filter((pool) => pool.kind === "home" || pool.kind === "m4");

  if (stale) {
    return (
      <header className="flex h-[4.2rem] shrink-0 items-center gap-3 bg-warn/12 px-[1.2rem] text-warn">
        <Icon name="i-alert" className="size-[1.2rem]" />
        <span className="text-[1.2rem] font-semibold">
          Not updated since {clockTime(new Date(stale).toISOString())}
        </span>
        <span className="truncate text-[0.9rem] text-warn/80">
          Everything below may be out of date. {error}
        </span>
      </header>
    );
  }

  return (
    <header className="quiet flex h-[4.2rem] shrink-0 items-center gap-[1.8rem] px-[1.2rem]">
      <span className="flex items-center gap-2.5 whitespace-nowrap">
        <span
          className={cn(
            "size-[0.7rem] rounded-full",
            main.dot,
            data.main.state === "pass" && "beat",
          )}
        />
        <span className="text-[1.2rem] font-semibold tracking-[-0.015em]">
          {data.main.name} <span className={main.text}>{main.word}</span>
        </span>
        {data.main.since && (
          <span className="text-[0.85rem] text-ink-3">for {lasted(data.main.since, now)}</span>
        )}
      </span>

      <Stat
        value={String(data.mergedDay)}
        label={`merged in 24h · usually ${data.mergedWeekAverage} a day`}
      />

      <div className="flex-1" />

      {self.map((pool) => {
        const state =
          pool.online === 0 ? "offline" : pool.online < pool.total ? "partial" : "online";
        return (
          <Capacity
            key={pool.kind}
            icon={MACHINES[pool.kind].icon}
            label={MACHINES[pool.kind].short}
            tone={state === "offline" ? "err" : state === "partial" ? "warn" : "ok"}
            status={
              state === "offline"
                ? "offline"
                : state === "partial"
                  ? `${pool.online} of ${pool.total} up`
                  : null
            }
            load={state === "offline" ? null : `${pool.busy}/${pool.online} busy`}
          />
        );
      })}

      {data.hosted && (
        <Capacity
          icon="i-github"
          label="GitHub"
          tone={
            data.hosted.running >= data.hosted.limit
              ? "err"
              : data.hosted.running >= data.hosted.limit * 0.8
                ? "warn"
                : "ok"
          }
          status={data.hosted.running >= data.hosted.limit ? "at limit" : null}
          load={`${data.hosted.running}/${data.hosted.limit} jobs`}
        />
      )}

      <span className="text-[1.45rem] font-semibold tracking-[-0.02em] text-ink">{data.clock}</span>
    </header>
  );
}
