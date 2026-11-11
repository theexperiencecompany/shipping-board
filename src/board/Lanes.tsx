import { cn } from "./cn";
import { Icon } from "./Icon";
import type { Lane, LaneState } from "./types";

const STATE: Record<
  LaneState,
  { tone: string; icon?: string; spin?: boolean; dash?: boolean; ring?: boolean }
> = {
  pass: { tone: "text-ok", icon: "i-tick" },
  run: { tone: "text-warn", icon: "i-spin", spin: true },
  fail: { tone: "text-err", icon: "i-x" },
  wait: { tone: "text-[#6b6b74]", ring: true },
  skip: { tone: "text-[#4d4d56]", dash: true },
};

export function Lanes({ lanes }: { lanes: Lane[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1">
      {lanes.map((lane) => {
        const state = STATE[lane.state];
        return (
          <span
            key={lane.name}
            className={cn("inline-flex items-center gap-1 text-[11px] font-medium", state.tone)}
          >
            {state.icon && (
              <Icon name={state.icon as never} className={cn("size-2.5", state.spin && "spin")} />
            )}
            {state.ring && <span className="size-2.5 rounded-full border border-current" />}
            {state.dash && <span className="h-px w-1.5 bg-current" />}
            {lane.name}
          </span>
        );
      })}
    </div>
  );
}
