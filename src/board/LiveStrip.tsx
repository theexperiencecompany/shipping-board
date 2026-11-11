import { cn } from "./cn";
import { Icon } from "./Icon";
import { PrTitle } from "./PrTitle";
import { duration, lasted } from "./time";
import type { BoardData } from "./types";

/** What is running in each environment right now. History lives on GitHub. */
export function LiveStrip({ data, now }: { data: BoardData; now: number }) {
  if (data.live.length === 0) return null;

  return (
    <footer className="quiet flex h-[3.4rem] shrink-0 items-center gap-[2.2rem] px-[1.2rem]">
      {data.live.map((deployment) => {
        const failed = deployment.status === "failed";
        return (
          <span
            key={deployment.environment}
            className="flex min-w-0 items-center gap-2.5 text-[0.9rem] whitespace-nowrap"
          >
            <Icon
              name={failed ? "i-alert" : "i-ship"}
              className={cn("size-[1rem] shrink-0", failed ? "text-err" : "text-ok")}
            />
            <span className="font-semibold text-ink">{deployment.environment}</span>
            <span className={failed ? "text-err" : "text-ink-2"}>
              {failed ? "failed" : "live"} {lasted(deployment.createdAt, now)}
            </span>
            {deployment.pr && (
              <span className="min-w-0 truncate text-ink-3">
                <PrTitle title={deployment.pr.title} />
              </span>
            )}
            <span className="shrink-0 text-ink-3">
              · deployed in {duration(deployment.durationMinutes)}
              {data.deployTypical && ` (usually ${duration(data.deployTypical)})`}
            </span>
          </span>
        );
      })}
    </footer>
  );
}
