import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";
import type { Lane, LaneState } from "./types";

const STATE: Record<LaneState, { tone: string; icon?: IconName; spin?: boolean }> = {
  pass: { tone: "text-ok", icon: "i-tick" },
  run: { tone: "text-accent", icon: "i-spin", spin: true },
  fail: { tone: "text-err", icon: "i-x" },
  wait: { tone: "text-ink-3" },
  skip: { tone: "text-ink-3" },
};

export function Lanes({ lanes }: { lanes: Lane[] }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-[0.9rem] gap-y-1">
      {lanes.map((lane) => {
        const state = STATE[lane.state];
        return (
          <span
            key={lane.name}
            className={cn("inline-flex items-center gap-1 font-medium", state.tone)}
          >
            {state.icon ? (
              <Icon name={state.icon} className={cn("size-[0.8rem]", state.spin && "spin")} />
            ) : (
              <span className="size-[0.7rem] rounded-full border-[1.5px] border-current" />
            )}
            {lane.name}
          </span>
        );
      })}
    </div>
  );
}
