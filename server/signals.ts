import type {
  Attention,
  AttentionKind,
  Deployment,
  HostedLoad,
  MainBranch,
  PullRequest,
  RedLane,
  RunnerPool,
  Timing,
} from "../src/board/types";
import { isControlJob, laneOf } from "./config";
import type { Run } from "./github";

const MINUTE = 60_000;

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export function runMinutes(run: Run): number {
  const start = new Date(run.run_started_at ?? run.created_at).getTime();
  return Math.max(1, Math.round((new Date(run.updated_at).getTime() - start) / MINUTE));
}

/** Typical and slow durations, from green pull request runs only. */
export function ciTiming(runs: Run[]): Timing | null {
  const green = runs
    .filter((run) => run.event === "pull_request" && run.conclusion === "success")
    .map(runMinutes);
  if (green.length < 5) return null;
  return {
    typical: percentile(green, 0.5),
    slow: percentile(green, 0.9),
    samples: green.length,
  };
}

/** State of the main branch, and when it last changed. Runs arrive newest first. */
export function mainState(name: string, runs: Run[]): MainBranch {
  const pushes = runs.filter((run) => run.event === "push" && run.head_branch === name);
  // Only a pass or a fail says anything about main. Cancelled, skipped and in-flight runs do not.
  const decided = pushes.filter(
    (run) =>
      run.status === "completed" &&
      !["cancelled", "skipped", "neutral"].includes(run.conclusion ?? ""),
  );
  const head = decided[0];
  if (!head) {
    const running = pushes.find((run) => run.status !== "completed");
    return running
      ? { name, state: "run", since: running.created_at }
      : { name, state: "unknown", since: null };
  }

  const verdict = (run: Run) => (run.conclusion === "success" ? "pass" : "fail");
  const state = verdict(head);
  let since = head.updated_at;
  for (const run of decided) {
    if (verdict(run) !== state) break;
    since = run.updated_at;
  }
  return { name, state, since };
}

const ERROR = /##\[error\](.*)$/;
// Lines that only say "something failed, look elsewhere" carry no information of their own.
const NOISE = [
  /^Process completed with exit code/,
  /: FAIL — \d+ of \d+ /,
  /\b(above|below|attached)\W*$/,
  // A bare count ("2 finding(s) (exit 1)") names nothing; the lines after it do.
  /\b\d+ (finding|error|failure|problem|issue)\(?s?\)?( \(exit \d+\))?\.?$/,
];

/** The first error line in a GitHub Actions log that actually says what broke. */
export function errorLine(log: string): string | null {
  for (const raw of log.split("\n")) {
    const match = raw.match(ERROR);
    if (!match) continue;
    const said = match[1].replace(/^[^\p{L}\p{N}]+/u, "").trim();
    if (!said || NOISE.some((pattern) => pattern.test(said))) continue;
    const line = said
      .replace(/\s+—\s+the suite would not notice.*$/, "")
      .replace(/:?\s+FAIL(ED)?\s+—\s+/, ": ");
    return line.length > 300 ? `${line.slice(0, 299)}…` : line;
  }
  return null;
}

/**
 * The part of a log worth reading: the lines leading up to the first real error, or
 * the end of the log when nothing is marked as an error.
 */
export function logExcerpt(log: string, size: number): string {
  const lines = log.split("\n");
  const first = lines.findIndex((line) => {
    const match = line.match(ERROR);
    if (!match) return false;
    const said = match[1].replace(/^[^\p{L}\p{N}]+/u, "").trim();
    return said !== "" && !NOISE.some((pattern) => pattern.test(said));
  });
  if (first === -1) return lines.slice(Math.max(0, lines.length - size)).join("\n");
  const start = Math.max(0, first - Math.floor(size * 0.75));
  return lines.slice(start, start + size).join("\n");
}

/** "mutation (shard 2/6 (4 modules))" and "mutation (app/x.py)" are the same check. */
export function jobFamily(name: string): string {
  return name.replace(/\s*\(.*$/, "").trim();
}

const SEVERITY: Record<AttentionKind, number> = {
  main: 0,
  deploy: 1,
  failing: 2,
  stuck: 3,
  conflict: 4,
  changes: 5,
};

export interface AttentionInput {
  main: MainBranch;
  failing: PullRequest[];
  open: PullRequest[];
  /** PRs whose CI run exists but no runner has started, past the backlog threshold. */
  notStarted: PullRequest[];
  runners: RunnerPool[] | null;
  hosted: HostedLoad | null;
  latestDeploy: Deployment | null;
  now: number;
  /** Check names known to fail and then pass on a rerun. */
  flaky: Set<string>;
  /** A failure with no push for this long reads as abandoned. */
  idleMinutes: number;
}

/** Why a PR's CI has not started, in a few words, from what the runners are doing now. */
export function backlogCause(runners: RunnerPool[] | null, hosted: HostedLoad | null): string {
  const self = (runners ?? []).filter((pool) => pool.kind === "home" || pool.kind === "m4");
  const offline = self.filter((pool) => pool.online === 0);
  const idle = self.length > 0 && self.every((pool) => pool.online > 0 && pool.busy < pool.online);

  if (offline.length > 0) {
    return `${offline.map((pool) => (pool.kind === "home" ? "Home server" : "M4")).join(" and ")} offline`;
  }
  if (hosted && hosted.running >= hosted.limit)
    return `GitHub limit full, ${hosted.limit} of ${hosted.limit}`;
  if (idle) return "Runners are idle. Re-run it";
  return "Every runner is busy";
}

/**
 * The lanes a failing PR is red in, which is what you tell an agent to fix. A lane is
 * marked flaky when every job that failed in it is a check known to fail-then-pass.
 */
export function failingLanes(pr: PullRequest, flaky: Set<string> = new Set()): RedLane[] {
  const jobs = pr.failure?.jobs ?? [];
  const byLane = new Map<string, string[]>();
  for (const job of jobs) {
    const lane = laneOf(job.name) ?? jobFamily(job.name);
    byLane.set(lane, [...(byLane.get(lane) ?? []), jobFamily(job.name)]);
  }
  const names = pr.lanes.filter((lane) => lane.state === "fail").map((lane) => lane.name);
  const order = [...names, ...[...byLane.keys()].filter((lane) => !names.includes(lane))];
  return order.map((name) => {
    const families = byLane.get(name) ?? [];
    return { name, flaky: families.length > 0 && families.every((family) => flaky.has(family)) };
  });
}

/** Checks that failed on the first attempt and passed on a rerun of the same commit. */
export function flakyChecks(
  reruns: { failedFirst: string[]; passedLast: string[] }[],
  minimum = 2,
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const rerun of reruns) {
    const passed = new Set(rerun.passedLast.map(jobFamily));
    // Summary jobs like quality-gate fail because something else did; they say nothing.
    const failed = rerun.failedFirst.filter((name) => !isControlJob(name));
    for (const family of new Set(failed.map(jobFamily))) {
      if (passed.has(family)) counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  }
  // One pass on a rerun can be bad luck on a runner; twice is a pattern.
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Median green-run minutes per day for the last `days` days, oldest first. */
export function dailyMedians(runs: Run[], now: number, days = 7): (number | null)[] {
  const buckets: number[][] = Array.from({ length: days }, () => []);
  for (const run of runs) {
    if (run.conclusion !== "success" || run.event !== "pull_request") continue;
    const age = now - new Date(run.created_at).getTime();
    const day = Math.floor(age / (24 * 60 * MINUTE));
    if (day < 0 || day >= days) continue;
    buckets[days - 1 - day].push(runMinutes(run));
  }
  return buckets.map((values) => (values.length >= 3 ? percentile(values, 0.5) : null));
}

function idleSince(pr: PullRequest, now: number, idleMinutes: number): boolean {
  const touched = pr.lastCommitAt ? new Date(pr.lastCommitAt).getTime() : 0;
  const failedAt = new Date(pr.updatedAt).getTime();
  return touched < failedAt && now - failedAt >= idleMinutes * MINUTE;
}

/** Everything that needs you: the branch and deploy first, then one card per pull request. */
export function attention(input: AttentionInput): Attention[] {
  const items: Attention[] = [];
  const { now } = input;

  if (input.main.state === "fail" && input.main.since) {
    items.push({
      kind: "main",
      key: "main",
      title: `${input.main.name} is failing`,
      note: "Everything merged now lands on a broken base",
      since: input.main.since,
    });
  }

  if (input.latestDeploy?.status === "failed") {
    const deploy = input.latestDeploy;
    items.push({
      kind: "deploy",
      key: `deploy:${deploy.createdAt}`,
      title: deploy.pr?.title ?? `${deploy.environment} deploy`,
      note: `Deploy to ${deploy.environment} failed`,
      since: deploy.createdAt,
    });
  }

  for (const pr of input.failing) {
    items.push({
      kind: "failing",
      key: `failing:${pr.number}`,
      title: pr.title,
      lanes: failingLanes(pr, input.flaky),
      note: idleSince(pr, now, input.idleMinutes) ? "no push since" : undefined,
      since: pr.updatedAt,
      pr,
    });
  }

  const cause = backlogCause(input.runners, input.hosted);
  for (const pr of input.notStarted) {
    items.push({
      kind: "stuck",
      key: `stuck:${pr.number}`,
      title: pr.title,
      note: cause,
      since: new Date(now - pr.minutes * MINUTE).toISOString(),
      pr,
    });
  }

  const seen = new Set([...input.failing, ...input.notStarted].map((pr) => pr.number));
  for (const pr of input.open) {
    if (seen.has(pr.number)) continue;
    if (pr.conflict) {
      items.push({
        kind: "conflict",
        key: `conflict:${pr.number}`,
        title: pr.title,
        note: "Rebase it",
        since: pr.lastCommitAt ?? pr.updatedAt,
        pr,
      });
    } else if (pr.changesRequested) {
      items.push({
        kind: "changes",
        key: `changes:${pr.number}`,
        title: pr.title,
        since: pr.updatedAt,
        pr,
      });
    }
  }

  // Newest first within a kind: a failure from ten minutes ago is the one an agent can still fix.
  return items.sort(
    (a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || b.since.localeCompare(a.since),
  );
}

/** One card per environment: whatever is running there now. Input is newest first. */
export function livePerEnvironment(history: Deployment[]): Deployment[] {
  const seen = new Map<string, Deployment>();
  for (const deployment of history) {
    if (!seen.has(deployment.environment)) seen.set(deployment.environment, deployment);
  }
  return [...seen.values()];
}

export interface Merged {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  mergedAt: string;
}

/** Merges in the last 24 hours, against the daily average of the six days before. */
export function mergeStats(merged: Merged[], now: number): { day: number; weekAverage: number } {
  const day = now - 24 * 60 * MINUTE;
  const week = now - 7 * 24 * 60 * MINUTE;
  let recent = 0;
  let before = 0;
  for (const pull of merged) {
    const at = new Date(pull.mergedAt).getTime();
    if (at >= day) recent += 1;
    else if (at >= week) before += 1;
  }
  return { day: recent, weekAverage: Math.round(before / 6) };
}
