import type { IconName } from "../icons";
import type { MachineKind } from "./types";

export const MACHINES: Record<MachineKind, { icon: IconName; short: string }> = {
  home: { icon: "i-server", short: "Home server" },
  github: { icon: "i-github", short: "GitHub" },
  blacksmith: { icon: "i-blacksmith", short: "Blacksmith" },
  m4: { icon: "i-ai", short: "M4" },
};
