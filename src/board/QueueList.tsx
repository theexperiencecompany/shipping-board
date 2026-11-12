import { cn } from "./cn";
import { duration } from "./time";
import type { QueueEntry } from "./types";

export function QueueList({ entries }: { entries: QueueEntry[] }) {
  return (
    <div
      data-item
      className="flex shrink-0 flex-col rounded-[0.8rem] bg-card px-[0.9rem] py-[0.4rem]"
    >
      {entries.map((entry, index) => {
        const testing = entry.state === "testing";
        const percent = entry.progress?.total
          ? Math.round((entry.progress.done / entry.progress.total) * 100)
          : 0;
        return (
          <div
            key={entry.number}
            className={cn(
              "flex items-center gap-3 py-[0.4rem] text-[0.95rem]",
              index > 0 && "border-t border-rule",
            )}
          >
            <span
              className={cn(
                "flex size-[1.3rem] shrink-0 items-center justify-center rounded-full text-[0.75rem] font-semibold",
                testing ? "bg-accent/15 text-accent" : "bg-card-hi text-ink-2",
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
            {testing && entry.progress ? (
              <span className="flex shrink-0 items-center gap-2 text-[0.85rem] text-accent">
                testing {entry.progress.done}/{entry.progress.total}
                <span className="h-[0.25rem] w-[3rem] overflow-hidden rounded-full bg-[#0b1018]">
                  <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
                </span>
              </span>
            ) : (
              <span className="shrink-0 text-[0.85rem] text-ink-3">
                {testing ? "testing" : "waiting"}
              </span>
            )}
            <span className="w-[3.6rem] shrink-0 text-right text-[0.85rem] text-ink-2">
              {duration(entry.waitMinutes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
