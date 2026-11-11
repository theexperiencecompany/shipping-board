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

export const config = {
  repo: process.env.BOARD_REPO ?? "theexperiencecompany/gaia",
  branch: process.env.BOARD_BRANCH ?? "master",
  workflow: process.env.BOARD_WORKFLOW ?? "ci.yml",
  controlJobs,
  lanes: [
    { name: "lint", match: [/^lint-/, /repo-policy/, /audit/, /mypy/, /type-check/] },
    { name: "build", match: [/build/, /docker/, /desktop/] },
    { name: "e2e", match: [/engine/, /browser/, /obscura/, /scan/] },
    { name: "test", match: [/^test-/, /mutation/, /coverage/] },
  ] as LaneRule[],
  readyLimit: 4,
  pollMs: 15_000,
  cacheMs: 20_000,
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
