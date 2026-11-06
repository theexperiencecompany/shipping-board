import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import type { FailureReport } from "./types";

export function FailureDialog({
  report,
  onClose,
}: {
  report: FailureReport | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!report) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, onClose]);

  if (!report) return null;

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
        className="w-[620px] rounded-2xl bg-card px-6 pt-[22px] pb-5"
      >
        <div className="flex items-start gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="failure-title" className="text-base font-semibold tracking-[-0.015em]">
                {report.headline}
              </h2>
              <span className="inline-flex h-5 items-center gap-1 rounded-md bg-err/12 px-1.5 text-[10.5px] font-medium text-err">
                <Icon name="i-alert" className="size-2.5" />
                {report.errors} errors
              </span>
            </div>
            <p className="mt-[3px] text-xs text-ink-3">{report.meta}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto flex size-[26px] items-center justify-center rounded-[7px] text-ink-3 hover:bg-card-hi hover:text-ink"
          >
            <Icon name="i-x" className="size-3" />
          </button>
        </div>

        <div className="mt-[18px]">
          <h3 className="mb-1.5 text-[11.5px] font-medium text-ink-3">What broke</h3>
          <pre className="rounded-[9px] bg-[#0b0f17] px-[13px] py-3 font-sans text-xs leading-[1.6] whitespace-pre-wrap text-ink-2">
            {report.log}
          </pre>
        </div>

        <div className="mt-[18px] flex gap-2">
          <button
            type="button"
            className="h-[30px] rounded-lg bg-accent px-3 text-xs font-medium text-[#001018]"
          >
            Open the run
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] rounded-lg bg-card-hi px-3 text-xs font-medium text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
