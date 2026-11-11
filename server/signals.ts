import type {
  Attention,
  AttentionKind,
  Deployment,
  HostedLoad,
  MainBranch,
  PullRequest,
  RunnerPool,
  Timing,
} from "../src/board/types";
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

/** "mutation (shard 2/6 (4 modules))" and "mutation (app/x.py)" are the same check. */
export function jobFamily(name: string): string {
  return name.replace(/\s*\(.*$/, "").trim();
}

const SEVERITY: Record<AttentionKind, number> = {
  main: 0,
  deploy: 1,
  backlog: 2,
  systemic: 3,
  failing: 4,
  conflict: 5,
  changes: 6,
};

export interface AttentionInput {
  main: MainBranch;
  failing: PullRequest[];
  open: PullRequest[];
  waitingRuns: { createdAt: string }[];
  runners: RunnerPool[] | null;
  hosted: HostedLoad | null;
  latestDeploy: Deployment | null;
  now: number;
  backlogMinutes: number;
  systemicCount: number;
  /** A failure with no push for this long reads as abandoned. */
  idleMinutes: number;
}

/** Why queued runs are not starting, from what the runners are doing right now. */
export function backlogCause(runners: RunnerPool[] | null, hosted: HostedLoad | null): string {
  const self = (runners ?? []).filter((pool) => pool.kind === "home" || pool.kind === "m4");
  const offline = self.filter((pool) => pool.online === 0);
  const idle = self.length > 0 && self.every((pool) => pool.online > 0 && pool.busy < pool.online);
  const full = hosted !== null && hosted.running >= hosted.limit;

  if (offline.length > 0) {
    const names = offline
      .map((pool) => (pool.kind === "home" ? "Home server" : "M4"))
      .join(" and ");
    return `${names} offline, so jobs meant for ${offline.length === 1 ? "it" : "them"} cannot start.`;
  }
  if (full) {
    return `GitHub's ${hosted.limit}-job limit on the ${hosted.plan} plan is full. They start as jobs finish.`;
  }
  if (idle && hosted) {
    return `Your runners are idle and GitHub has room (${hosted.running} of ${hosted.limit} jobs), so this is not capacity. Re-run them.`;
  }
  if (idle) return "Your runners are idle, so this is not a capacity problem.";
  return "Every runner is busy. They start as jobs finish.";
}

export function attention(input: AttentionInput): Attention[] {
  const items: Attention[] = [];
  const { now } = input;

  if (input.main.state === "fail" && input.main.since) {
    items.push({
      kind: "main",
      key: "main",
      title: `${input.main.name} is failing`,
      detail: "Everything merged now lands on a broken base. Fix this first.",
      since: input.main.since,
    });
  }

  if (input.latestDeploy?.status === "failed") {
    const deploy = input.latestDeploy;
    items.push({
      kind: "deploy",
      key: `deploy:${deploy.createdAt}`,
      title: `${deploy.environment} deploy failed`,
      detail: deploy.pr ? `${deploy.pr.number} ${deploy.pr.title}` : (deploy.note ?? ""),
      since: deploy.createdAt,
    });
  }

  const stalled = input.waitingRuns.filter(
    (run) => now - new Date(run.createdAt).getTime() >= input.backlogMinutes * MINUTE,
  );
  if (stalled.length > 0) {
    const oldest = stalled.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    items.push({
      kind: "backlog",
      key: "backlog",
      title:
        stalled.length === 1
          ? "1 CI run has not started"
          : `${stalled.length} CI runs have not started`,
      detail: backlogCause(input.runners, input.hosted),
      since: oldest.createdAt,
    });
  }

  // Group failures by what broke. With logs, that is the error line itself, so two PRs
  // only share a card when they fail the same way. Without logs, fall back to the check.
  const keyOf = (job: { name: string; summary?: string }) => job.summary ?? jobFamily(job.name);
  const groups = new Map<string, { family: string; summary?: string; prs: PullRequest[] }>();
  for (const pr of input.failing) {
    for (const job of pr.failure?.jobs ?? []) {
      const key = keyOf(job);
      const group = groups.get(key) ?? {
        family: jobFamily(job.name),
        summary: job.summary,
        prs: [],
      };
      if (!group.prs.includes(pr)) group.prs.push(pr);
      groups.set(key, group);
    }
  }
  const shared = new Set<string>();
  for (const [key, group] of groups) {
    const needed = group.summary ? 2 : input.systemicCount;
    if (group.prs.length < needed) continue;
    shared.add(key);
    const earliest = group.prs.reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b));
    items.push({
      kind: "systemic",
      key: `systemic:${key}`,
      title: `${group.family} fails the same way on ${group.prs.length} pull requests`,
      detail: group.summary ?? "No error line in the logs. Open one run and compare it with main.",
      since: earliest.updatedAt,
      refs: group.prs.map((pr) => pr.number),
    });
  }

  for (const pr of input.failing) {
    const failure = pr.failure;
    if (!failure) continue;
    const own = failure.jobs.filter((job) => !shared.has(keyOf(job)));
    // Already named on a shared-failure card. A card of its own would only repeat it.
    if (own.length === 0) continue;
    const reason = own.find((job) => job.summary)?.summary;
    const families = [...new Set(own.map((job) => jobFamily(job.name)))];
    const label = (reason ?? `${families.join(", ")} failed`).replace(/[\s.:;,]+$/, "");
    const touched = pr.lastCommitAt ? new Date(pr.lastCommitAt).getTime() : 0;
    const failedAt = new Date(pr.updatedAt).getTime();
    const idle = touched < failedAt && now - failedAt >= input.idleMinutes * MINUTE;
    items.push({
      kind: "failing",
      key: `failing:${pr.number}`,
      title: pr.title,
      detail: idle ? `${label}. Nothing pushed since.` : `${label}.`,
      since: pr.updatedAt,
      pr,
    });
  }

  const failingNumbers = new Set(input.failing.map((pr) => pr.number));
  for (const pr of input.open) {
    if (failingNumbers.has(pr.number)) continue;
    if (pr.conflict) {
      items.push({
        kind: "conflict",
        key: `conflict:${pr.number}`,
        title: pr.title,
        detail: "Conflicts with main. Needs a rebase before CI means anything.",
        since: pr.lastCommitAt ?? pr.updatedAt,
        pr,
      });
    } else if (pr.changesRequested) {
      items.push({
        kind: "changes",
        key: `changes:${pr.number}`,
        title: pr.title,
        detail: "A reviewer asked for changes.",
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
