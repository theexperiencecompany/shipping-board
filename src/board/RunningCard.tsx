import { cn } from "./cn";
import { Icon } from "./Icon";
import { Lanes } from "./Lanes";
import { MACHINES } from "./machines";
import { duration } from "./time";
import type { PullRequest, Timing } from "./types";

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
  const lanes = pr.lanes.filter((lane) => lane.state !== "skip");
  const machine = pr.machine === "github" ? null : MACHINES[pr.machine];

  return (
    <article
      data-item
      className="rise flex shrink-0 flex-col gap-[0.35rem] rounded-[0.8rem] bg-card px-[0.9rem] py-[0.7rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex items-start gap-3">
        <h3 className="line-clamp-2 min-w-0 text-[1.05rem] leading-[1.25] font-semibold tracking-[-0.012em]">
          {pr.title}
        </h3>
        <span className="ml-auto shrink-0 text-[1.05rem] font-semibold whitespace-nowrap">
          {duration(pr.minutes)}
        </span>
      </div>

      {pr.waiting ? (
        <div className="flex items-center gap-2 text-[0.85rem] text-warn">
          <Icon name="i-clock" className="size-[0.85rem]" />
          Waiting for a runner
          <span className="ml-auto text-ink-3">{pr.number}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-[0.3rem] flex-1 overflow-hidden rounded-full bg-[#0b1018]">
              <div
                className={cn("h-full rounded-full", slow ? "bg-warn" : "bg-accent")}
                style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
              />
            </div>
            <span className="text-[0.8rem] whitespace-nowrap text-ink-3">
              {pr.jobs.done}/{pr.jobs.total} jobs
            </span>
          </div>
          <div className="flex items-center gap-3 text-[0.85rem]">
            <Lanes lanes={lanes} />
            <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-ink-3">
              {slow && <b className="font-semibold text-warn">slow</b>}
              {ci && `usually ${duration(ci.typical)}`}
              {machine && (
                <span className="flex items-center gap-1 text-ink-2">
                  <Icon name={machine.icon} className="size-[0.8rem] text-accent" />
                  {machine.short}
                </span>
              )}
              <span>{pr.number}</span>
            </span>
          </div>
        </>
      )}
    </article>
  );
}
