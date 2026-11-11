import type {
  Attention,
  AttentionKind,
  Deployment,
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
  const pushes = runs.filter(
    (run) => run.event === "push" && run.head_branch === name && run.conclusion !== "cancelled",
  );
  const head = pushes[0];
  if (!head) return { name, state: "unknown", since: null };
  if (head.status !== "completed") return { name, state: "run", since: head.created_at };

  const state = head.conclusion === "success" ? "pass" : "fail";
  let since = head.updated_at;
  for (const run of pushes) {
    if (run.status !== "completed") continue;
    const same = (run.conclusion === "success" ? "pass" : "fail") === state;
    if (!same) break;
    since = run.updated_at;
  }
  return { name, state, since };
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
  latestDeploy: Deployment | null;
  now: number;
  backlogMinutes: number;
  systemicCount: number;
  /** A failure with no push for this long reads as abandoned. */
  idleMinutes: number;
}

function poolText(runners: RunnerPool[] | null): string {
  if (!runners) return "";
  const self = runners.filter((pool) => pool.kind === "home" || pool.kind === "m4");
  if (self.length === 0) return "";
  const parts = self.map((pool) => {
    const label = pool.kind === "home" ? "Home server" : "M4";
    if (pool.online === 0) return `${label} offline`;
    return `${label} ${pool.busy} of ${pool.online} busy`;
  });
  return ` ${parts.join(", ")}.`;
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
      detail: `No runner has picked them up.${poolText(input.runners)}`,
      since: oldest.createdAt,
    });
  }

  const families = new Map<string, Set<string>>();
  for (const pr of input.failing) {
    for (const job of pr.failure?.jobs ?? []) {
      const family = jobFamily(job.name);
      const set = families.get(family) ?? new Set<string>();
      set.add(pr.number);
      families.set(family, set);
    }
  }
  const systemic = new Set<string>();
  for (const [family, prs] of families) {
    if (prs.size < input.systemicCount) continue;
    systemic.add(family);
    const earliest = input.failing
      .filter((pr) => prs.has(pr.number))
      .reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b));
    items.push({
      kind: "systemic",
      key: `systemic:${family}`,
      title: `${family} fails on ${prs.size} pull requests`,
      detail: `${[...prs].join(" ")}. Likely one cause, so check main or the job itself first.`,
      since: earliest.updatedAt,
    });
  }

  for (const pr of input.failing) {
    const failure = pr.failure;
    if (!failure) continue;
    const names = [...new Set(failure.jobs.map((job) => jobFamily(job.name)))];
    const own = names.filter((name) => !systemic.has(name));
    // Already named on a shared-failure card. A card of its own would only repeat it.
    if (own.length === 0) continue;
    const label = `${own.join(", ")} failed`;
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

  for (const pr of input.open) {
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

  return items.sort(
    (a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || a.since.localeCompare(b.since),
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
