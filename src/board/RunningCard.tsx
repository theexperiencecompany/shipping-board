import { cn } from "./cn";
import { Icon } from "./Icon";
import { PrTitle } from "./PrTitle";
import { duration } from "./time";
import type { IconName } from "../icons";
import type { Lane, LaneState, PullRequest, Timing } from "./types";

const LANE: Record<LaneState, { icon?: IconName; tone: string; spin?: boolean }> = {
  pass: { icon: "i-tick", tone: "text-ok" },
  run: { icon: "i-spin", tone: "text-accent", spin: true },
  fail: { icon: "i-x", tone: "text-err" },
  wait: { tone: "text-ink-3" },
  skip: { tone: "text-ink-3" },
};

/** Where the run is: each lane passed, running, failed or not started yet. */
function LaneStates({ lanes }: { lanes: Lane[] }) {
  return (
    <span className="flex shrink-0 gap-[0.7rem] text-[0.85rem] font-medium">
      {lanes
        .filter((lane) => lane.state === "run" || lane.state === "fail")
        .map((lane) => {
          const state = LANE[lane.state];
          return (
            <span key={lane.name} className={cn("flex items-center gap-1", state.tone)}>
              {state.icon ? (
                <Icon name={state.icon} className={cn("size-[0.75rem]", state.spin && "spin")} />
              ) : (
                <span className="size-[0.65rem] rounded-full border-[1.5px] border-current" />
              )}
              {lane.name}
            </span>
          );
        })}
    </span>
  );
}

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
      {!pr.waiting && <LaneStates lanes={pr.lanes} />}
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
          "w-[7.5rem] shrink-0 text-right text-[1.05rem] font-semibold whitespace-nowrap",
          slow ? "text-warn" : "text-ink",
        )}
      >
        <span className="text-[0.8rem] font-normal text-ink-3">
          {pr.waiting ? "queued " : "running "}
        </span>
        {duration(pr.minutes)}
      </span>
    </article>
  );
}
