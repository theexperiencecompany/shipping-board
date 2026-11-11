export interface LaneRule {
  name: string;
  match: RegExp[];
}

const controlJobs = [
  /^select-runner/,
  /^detect$/,
  /^quality-gate$/,
  /^watchdog$/,
  /^runner-watchdog$/,
  /^probe$/,
  /^deploy-unwedge$/,
  /^changelog-sync$/,
  /^trigger-build$/,
  /^build-images$/,
  /^deploy-web$/,
];

function parseNight(value: string): { start: number; end: number } {
  const [start, end] = value.split("-").map(Number);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`BOARD_NIGHT must look like "22-7", got "${value}"`);
  }
  return { start, end };
}

export const config = {
  repo: process.env.BOARD_REPO ?? "theexperiencecompany/gaia",
  branch: process.env.BOARD_BRANCH ?? "master",
  timezone: process.env.BOARD_TZ ?? "Asia/Kolkata",
  workflow: process.env.BOARD_WORKFLOW ?? "ci.yml",
  controlJobs,
  lanes: [
    { name: "lint", match: [/^lint-/, /repo-policy/, /audit/, /mypy/, /type-check/] },
    { name: "build", match: [/build/, /docker/, /desktop/] },
    { name: "e2e", match: [/engine/, /browser/, /obscura/, /scan/] },
    { name: "test", match: [/^test-/, /mutation/, /coverage/] },
  ] as LaneRule[],
  readyLimit: 4,
  shippedLimit: 12,
  /** A CI run that no runner has picked up for this long counts as stuck. */
  backlogMinutes: 15,
  /** Quiet hours on the board's clock, as BOARD_NIGHT="22-7". Everything but Needs you dims. */
  night: parseNight(process.env.BOARD_NIGHT ?? "22-7"),
  /** A failing pull request with no push for this long is flagged as abandoned. */
  idleMinutes: 30,
  logTailLines: 120,
  pollMs: 15_000,
  cacheMs: 20_000,
  machines: [
    { kind: "home", runner: [/^gaia-home-/, /^gaia-home$/] },
    { kind: "m4", runner: [/^gaia-m4-/, /^gaia-m4$/] },
    { kind: "blacksmith", runner: [/^blacksmith/] },
  ],
} as const;

export function laneOf(jobName: string): string | null {
  const name = jobName.toLowerCase();
  for (const rule of config.lanes) {
    if (rule.match.some((pattern) => pattern.test(name))) return rule.name;
  }
  return null;
}

export function isControlJob(jobName: string): boolean {
  const name = jobName.toLowerCase();
  return config.controlJobs.some((pattern) => pattern.test(name));
}
