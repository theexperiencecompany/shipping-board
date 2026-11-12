import { useEffect, useState } from "react";
import { agentBrief } from "./brief";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { PrTitle } from "./PrTitle";
import type { Attention, FailureJob } from "./types";

/** navigator.clipboard needs https; the tailnet URL is plain http, so fall back. */
async function copy(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

const BUTTON =
  "inline-flex h-[2rem] shrink-0 items-center gap-1.5 rounded-[0.5rem] px-3 text-[0.85rem] font-semibold whitespace-nowrap";

function CopyButton({ text, label, primary }: { text: string; label: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        await copy(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={cn(
        BUTTON,
        primary
          ? "bg-accent text-canvas hover:brightness-110"
          : "bg-card-hi text-ink-2 hover:text-ink",
        !text && "opacity-50",
      )}
    >
      <Icon name={done ? "i-tick" : "i-copy"} className="size-[0.8rem]" />
      {done ? "Copied" : label}
    </button>
  );
}

function JobLog({ job, log }: { job: FailureJob; log: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-err">
          <Icon name="i-x" className="size-[0.75rem]" />
          {job.name}
        </span>
        <span className="ml-auto flex gap-1.5">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className={cn(BUTTON, "bg-card-hi text-ink-2 hover:text-ink")}
          >
            Open
          </a>
          <CopyButton text={log} label="Copy log" />
        </span>
      </div>
      <pre className="max-h-[11rem] overflow-auto rounded-[0.6rem] bg-[#0b0f17] px-3 py-2.5 font-mono text-[0.75rem] leading-[1.5] whitespace-pre-wrap text-ink-2">
        {log || "Loading log…"}
      </pre>
    </div>
  );
}

/** Everything you can do about one PR from the board: brief an agent, re-run, read logs. */
export function PrDialog({
  item,
  flaky,
  onClose,
}: {
  item: Attention | null;
  flaky: { name: string; count: number }[];
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string | null> | null>(null);
  const [rerun, setRerun] = useState<{ busy: boolean; message?: string }>({ busy: false });
  const jobs = item?.pr?.failure?.jobs ?? [];

  useEffect(() => {
    setLogs({});
    setErrors(null);
    setRerun({ busy: false });
    if (!item) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    let alive = true;
    const failed = item.pr?.failure?.jobs ?? [];
    if (failed.length > 0) {
      const query = failed.map((job) => `job=${job.id}`).join("&");
      fetch(`/api/errors?${query}`)
        .then((response) => response.json())
        .then((result) => alive && setErrors(result))
        .catch(() => alive && setErrors({}));
      for (const job of failed) {
        fetch(`/api/failure?job=${job.id}`)
          .then((response) => response.text())
          .then((text) => alive && setLogs((current) => ({ ...current, [job.id]: text })))
          .catch(() => {});
      }
    }
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  if (!item?.pr) return null;
  const pr = item.pr;
  const failing = item.kind === "failing";
  const brief = errors ? agentBrief(item, errors, flaky) : "";

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-canvas/80"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-title"
        className="max-h-[90vh] w-[min(46rem,92vw)] overflow-auto rounded-[1rem] bg-card px-6 pt-5 pb-5"
      >
        <div className="flex items-start gap-3">
          <h2
            id="pr-title"
            className="min-w-0 flex-1 text-[1.2rem] leading-[1.3] font-semibold tracking-[-0.015em]"
          >
            <PrTitle title={pr.title} />
            <span className="ml-2 text-[0.9rem] font-normal text-ink-3">{pr.number}</span>
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-[2rem] items-center justify-center rounded-[0.5rem] text-ink-3 hover:bg-card-hi hover:text-ink"
          >
            <Icon name="i-x" className="size-[0.9rem]" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {failing && (
            <CopyButton text={brief} label={errors ? "Copy for agent" : "Reading logs…"} primary />
          )}
          {pr.runId && (
            <button
              type="button"
              disabled={rerun.busy || rerun.message !== undefined}
              onClick={async () => {
                setRerun({ busy: true });
                try {
                  const response = await fetch(`/api/rerun?run=${pr.runId}`, { method: "POST" });
                  const result = (await response.json()) as { message?: string; error?: string };
                  setRerun({ busy: false, message: result.message ?? result.error });
                } catch (error) {
                  setRerun({ busy: false, message: String(error) });
                }
              }}
              className={cn(BUTTON, "bg-card-hi text-ink hover:brightness-125")}
            >
              <Icon name="i-spin" className={cn("size-[0.8rem]", rerun.busy && "spin")} />
              {rerun.busy ? "Re-running…" : failing ? "Re-run failed jobs" : "Re-run CI"}
            </button>
          )}
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className={cn(BUTTON, "bg-card-hi text-ink-2 hover:text-ink")}
          >
            <Icon name="i-github" className="size-[0.8rem]" />
            Open on GitHub
          </a>
        </div>
        {rerun.message && <p className="mt-2 text-[0.85rem] text-ink-2">{rerun.message}</p>}

        {brief && (
          <pre className="mt-4 rounded-[0.6rem] bg-[#0b0f17] px-3 py-2.5 font-sans text-[0.85rem] leading-[1.5] whitespace-pre-wrap text-ink-2">
            {brief}
          </pre>
        )}

        {jobs.map((job) => (
          <JobLog key={job.id} job={job} log={logs[job.id] ?? ""} />
        ))}
      </div>
    </div>
  );
}
