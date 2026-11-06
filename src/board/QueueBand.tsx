import { AuthorAvatar } from "./AuthorAvatar";
import { Icon } from "./Icon";
import { cn } from "./cn";
import type { QueueEntry } from "./types";

export function QueueBand({
  entries,
  averageWaitMinutes,
  mergedToday,
}: {
  entries: QueueEntry[];
  averageWaitMinutes: number;
  mergedToday: number;
}) {
  return (
    <section className="shrink-0 px-[22px] pb-3">
      <div className="rounded-2xl bg-lane px-4 pt-2.5 pb-1.5">
        <header className="flex items-center gap-2 px-0.5 pb-1">
          <Icon name="i-queue" className="size-3 text-ink-3" />
          <span className="text-[12.5px] font-medium text-ink-2">Merge queue</span>
          <span className="text-[11.5px] text-ink-3">
            {entries.length === 0 ? "empty" : `${entries.length} waiting`}
          </span>

          <div className="ml-auto flex items-center gap-4 text-[11.5px] text-ink-3">
            <span>
              <b className="font-medium text-ink-2">{averageWaitMinutes} min</b> average wait
            </span>
            <span className="h-3 w-px bg-[#16202d]" />
            <span>
              <b className="font-medium text-ink-2">{mergedToday}</b> merged today
            </span>
          </div>
        </header>

        {entries.length === 0 ? (
          <p className="px-0.5 pb-2.5 text-[11.5px] text-ink-3">Nothing is waiting to merge.</p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col style={{ width: 180 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 108 }} />
            </colgroup>
            <thead>
              <tr className="text-[11px] text-ink-3">
                <th className="pb-1 text-left font-normal">#</th>
                <th className="pb-1 text-left font-normal">Pull request</th>
                <th className="pb-1 text-left font-normal">Author</th>
                <th className="pb-1 text-left font-normal">State</th>
                <th className="pb-1 pr-1 text-right font-normal">Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const testing = entry.state === "testing";
                const percent = entry.progress
                  ? Math.round((entry.progress.done / entry.progress.total) * 100)
                  : 0;

                return (
                  <tr
                    key={entry.number}
                    className="border-t border-[#101722] transition-colors hover:bg-card/40"
                  >
                    <td className="py-[7px] align-middle">
                      <span
                        className={cn(
                          "flex size-[17px] items-center justify-center rounded-full text-[10px] font-semibold",
                          testing ? "bg-accent/15 text-accent" : "bg-card-hi text-ink-2",
                        )}
                      >
                        {index + 1}
                      </span>
                    </td>

                    <td className="truncate py-[7px] pr-3 align-middle">
                      <span className="text-[11px] text-ink-3">{entry.number}</span>
                      <span className="ml-1.5 text-[12px] font-medium">{entry.title}</span>
                    </td>

                    <td className="py-[7px] align-middle">
                      <span className="flex items-center gap-1.5">
                        <AuthorAvatar name={entry.author} size={17} />
                        <span className="truncate text-[11.5px] text-ink-2">{entry.author}</span>
                      </span>
                    </td>

                    <td className="py-[7px] align-middle">
                      {testing ? (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-flex h-[18px] items-center rounded-[5px] bg-warn/10 px-1.5 text-[10.5px] font-medium text-warn">
                            Testing
                          </span>
                          {entry.progress && (
                            <span className="text-[11px] text-ink-3">
                              {entry.progress.done}/{entry.progress.total}
                            </span>
                          )}
                          {entry.progress && (
                            <span className="h-[3px] w-10 overflow-hidden rounded-sm bg-[#0b1018]">
                              <span
                                className="block h-full rounded-sm bg-warn"
                                style={{ width: `${percent}%` }}
                              />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-ink-3">Queued</span>
                      )}
                    </td>

                    <td className="py-[7px] pr-1 text-right align-middle">
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                        <Icon name={testing ? "i-timer" : "i-clock"} className="size-2.5" />
                        {testing && entry.ejectsInMinutes
                          ? `${entry.ejectsInMinutes} min`
                          : `${entry.waitMinutes} min`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
