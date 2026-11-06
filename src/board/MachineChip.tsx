import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";
import type { MachineKind } from "./types";

export const MACHINES: Record<
  MachineKind,
  { icon: IconName; label: string; short: string; accent?: boolean }
> = {
  home: { icon: "i-server", label: "Home server", short: "Home server", accent: true },
  github: { icon: "i-github", label: "GitHub-hosted", short: "GitHub" },
  blacksmith: { icon: "i-blacksmith", label: "Blacksmith", short: "Blacksmith" },
  m4: { icon: "i-ai", label: "M4", short: "M4" },
};

export function MachineChip({ kind }: { kind: MachineKind }) {
  const machine = MACHINES[kind];
  return (
    <span className="inline-flex h-[21px] min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-[#1b2130] px-[7px] text-[11px] whitespace-nowrap text-ink-2">
      <Icon
        name={machine.icon}
        className={cn("size-3 shrink-0", machine.accent && "text-accent")}
      />
      {machine.label}
    </span>
  );
}
