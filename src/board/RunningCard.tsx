import { cn } from "./cn";
import { Icon } from "./Icon";
import { PrTitle } from "./PrTitle";
import { duration } from "./time";
import type { PullRequest, Timing } from "./types";

/** A PR whose CI is running: how far along, and whether it is slower than usual. */
export function RunningCard({
  pr,
  ci,
  index,
}: {
  pr: PullRequest;
  ci: Timing | null;
  index: number;
}) {
  const slow = !pr.waiting && ci !== null && pr.minutes > ci.slow;
  const progress = pr.jobs.total > 0 ? pr.jobs.done / pr.jobs.total : 0;

  return (
    <article
      data-item
      className="rise flex shrink-0 items-center gap-3 rounded-[0.7rem] bg-card px-[0.9rem] py-[0.55rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <h3 className="min-w-0 flex-1 truncate text-[1.05rem] leading-[1.3] font-semibold tracking-[-0.012em]">
        <PrTitle title={pr.title} />
      </h3>
      {pr.waiting ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[0.85rem] text-warn">
          <Icon name="i-clock" className="size-[0.8rem]" />
          queued
        </span>
      ) : (
        <span className="h-[0.3rem] w-[5rem] shrink-0 overflow-hidden rounded-full bg-[#0b1018]">
          <span
            className={cn("block h-full rounded-full", slow ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
          />
        </span>
      )}
      <span
        className={cn(
          "w-[3.8rem] shrink-0 text-right text-[1.05rem] font-semibold whitespace-nowrap",
          slow ? "text-warn" : "text-ink",
        )}
      >
        {duration(pr.minutes)}
      </span>
    </article>
  );
}
