import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { FailureJob, FailureReport } from "./types";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] bg-card-hi px-2 text-[11px] font-medium whitespace-nowrap text-ink-2 hover:text-ink"
    >
      <Icon name={done ? "i-tick" : "i-copy"} className={`size-2.5 ${done ? "text-ok" : ""}`} />
      {done ? "Copied" : label}
    </button>
  );
}

function JobBlock({ job, log }: { job: FailureJob; log: string }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-err">
          <Icon name="i-x" className="size-2.5" />
          {job.name}
        </span>
        <span className="text-[11px] text-ink-3">{job.conclusion ?? "failed"}</span>
        <span className="ml-auto flex gap-1.5">
          <CopyButton text={log} label="Copy log" />
        </span>
      </div>
      <pre className="max-h-[190px] overflow-auto rounded-[9px] bg-[#0b0f17] px-[13px] py-3 font-sans text-[11.5px] leading-[1.55] whitespace-pre-wrap text-ink-2">
        {log || "Loading log…"}
      </pre>
    </div>
  );
}

export function FailureDialog({
  report,
  onClose,
}: {
  report: FailureReport | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!report) {
      setLogs({});
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, onClose]);

  useEffect(() => {
    if (!report) return;
    let alive = true;
    for (const job of report.jobs) {
      fetch(`/api/failure?job=${job.id}`)
        .then((response) => response.text())
        .then((text) => {
          if (alive) setLogs((current) => ({ ...current, [job.id]: text }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [report]);

  if (!report) return null;

  const all = report.jobs.map((job) => `${job.name}\n${logs[job.id] ?? ""}`).join("\n\n");

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
        aria-labelledby="failure-title"
        className="w-[720px] rounded-2xl bg-card px-6 pt-[22px] pb-5"
      >
        <div className="flex items-start gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="failure-title" className="text-base font-semibold tracking-[-0.015em]">
                {report.headline}
              </h2>
              <span className="inline-flex h-5 items-center gap-1 rounded-md bg-err/12 px-1.5 text-[10.5px] font-medium text-err">
                <Icon name="i-alert" className="size-2.5" />
                {report.errors} failed
              </span>
            </div>
            <p className="mt-[3px] text-xs text-ink-3">{report.meta}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <CopyButton text={all} label="Copy all" />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex size-[26px] items-center justify-center rounded-[7px] text-ink-3 hover:bg-card-hi hover:text-ink"
            >
              <Icon name="i-x" className="size-3" />
            </button>
          </div>
        </div>

        {report.jobs.map((job) => (
          <JobBlock key={job.id} job={job} log={logs[job.id] ?? ""} />
        ))}
      </div>
    </div>
  );
}
