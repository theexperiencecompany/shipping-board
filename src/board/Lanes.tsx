import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { LANES, type Lane, type LaneState } from "./types";

const STATE: Record<LaneState, { icon?: IconName; tone: string; spin?: boolean; dash?: boolean }> =
  {
    pass: { icon: "i-tick", tone: "text-ok" },
    run: { icon: "i-spin", tone: "text-warn", spin: true },
    fail: { icon: "i-x", tone: "text-err" },
    wait: { tone: "text-[#6b6b74]" },
    skip: { tone: "text-[#4d4d56]", dash: true },
  };

export function Lanes({ lanes }: { lanes: Lane[] }) {
  const byName = new Map(lanes.map((lane) => [lane.name, lane.state]));

  return (
    <div className="mt-0.5 grid grid-cols-4 gap-1.5">
      {LANES.map((name) => {
        const state = STATE[byName.get(name) ?? "wait"];
        return (
          <span
            key={name}
            className={cn("inline-flex items-center gap-1 text-[11px] font-medium", state.tone)}
          >
            {state.icon && (
              <Icon name={state.icon} className={cn("size-2.5 shrink-0", state.spin && "spin")} />
            )}
            {state.dash && <span className="h-px w-1.5 shrink-0 bg-current" />}
            {name}
          </span>
        );
      })}
    </div>
  );
}
