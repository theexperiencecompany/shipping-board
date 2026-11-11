import type {
  BatchInfo,
  BoardData,
  DeployStep,
  Deployment,
  FailureReport,
  Lane,
  LaneState,
  MachineKind,
  PullRequest,
  QueueEntry,
} from "../src/board/types";
import { config, isControlJob, laneOf } from "./config";
import {
  graphql,
  lowBudget,
  rate,
  rest,
  restText,
  type Deployment as ApiDeployment,
  type DeploymentStatus,
  type Job,
  type Pull,
  type Run,
} from "./github";

const REPO = config.repo;
const BRANCH = config.branch;

const store = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const promise = load()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (cursor < items.length) {
        const index = cursor++;
        out[index] = await fn(items[index], index);
      }
    })(),
  );
  await Promise.all(workers);
  return out;
}

function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function machineOf(job: Job): MachineKind {
  const name = job.runner_name ?? "";
  if (name.startsWith("gaia-home-")) return "home";
  if (name.startsWith("gaia-m4-")) return "m4";
  if (name.startsWith("blacksmith") || job.labels.some((label) => /blacksmith/i.test(label))) {
    return "blacksmith";
  }
  return "github";
}

function stateOf(job: Job): LaneState {
  if (job.status !== "completed") return job.status === "queued" ? "wait" : "run";
  if (job.conclusion === "skipped") return "skip";
  if (job.conclusion === "success" || job.conclusion === "neutral") return "pass";
  return "fail";
}

const RANK: Record<LaneState, number> = { skip: 0, pass: 1, wait: 2, run: 3, fail: 4 };

function rollUp(states: LaneState[]): LaneState {
  if (states.length === 0) return "skip";
  return states.reduce((worst, state) => (RANK[state] > RANK[worst] ? state : worst), "skip");
}

function lanesOf(jobs: Job[]): Lane[] {
  const buckets = new Map<string, LaneState[]>();
  for (const job of jobs) {
    const lane = laneOf(job.name);
    if (!lane) continue;
    const list = buckets.get(lane) ?? [];
    list.push(stateOf(job));
    buckets.set(lane, list);
  }
  return config.lanes.map((rule) => ({
    name: rule.name,
    state: rollUp(buckets.get(rule.name) ?? []),
  }));
}

function machineOfRun(jobs: Job[]): MachineKind {
  const lane = jobs.filter((job) => laneOf(job.name) !== null);
  const pool = lane.length > 0 ? lane : jobs.filter((job) => !isControlJob(job.name));
  const active = pool.find((job) => job.status === "in_progress");
  const failed = pool.find((job) => job.status === "completed" && stateOf(job) === "fail");
  const queued = pool.find((job) => job.status === "queued");
  const pick = active ?? failed ?? queued ?? pool[0] ?? jobs[0];
  return pick ? machineOf(pick) : "github";
}

async function jobsFor(run: Run): Promise<Job[]> {
  const settled = run.status === "completed";
  return cached(`jobs:${run.id}`, settled ? Number.POSITIVE_INFINITY : 20_000, async () => {
    const data = await rest<{ jobs: Job[] }>(
      `/repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    return data.jobs;
  });
}

function failureOf(jobs: Job[]): FailureReport | undefined {
  const failed = jobs.filter((job) => job.status === "completed" && stateOf(job) === "fail");
  if (failed.length === 0) return undefined;
  return {
    headline: failed.length === 1 ? `${failed[0].name} failed` : `${failed.length} jobs failed`,
    meta: failed.map((job) => job.name).join(", "),
    errors: failed.length,
    jobs: failed.map((job) => ({
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      url: job.html_url,
    })),
  };
}

interface QueueNode {
  position: number;
  state: string;
  enqueuedAt: string;
  estimatedTimeToMerge: number | null;
  pullRequest: { number: number; title: string; author: { login: string } | null };
}

async function mergeQueue(): Promise<QueueNode[]> {
  return cached("queue", 20_000, async () => {
    const [owner, name] = REPO.split("/");
    const result = await graphql<{
      repository: { mergeQueue: { entries: { nodes: QueueNode[] } } | null };
    }>(
      `
        query ($owner: String!, $name: String!, $branch: String!) {
          repository(owner: $owner, name: $name) {
            mergeQueue(branch: $branch) {
              entries(first: 20) {
                nodes {
                  position
                  state
                  enqueuedAt
                  estimatedTimeToMerge
                  pullRequest {
                    number
                    title
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { owner, name, branch: BRANCH },
    );
    if (result.errors?.length) throw new Error(result.errors[0].message);
    return result.data.repository.mergeQueue?.entries.nodes ?? [];
  });
}

async function deploySteps(statuses: DeploymentStatus[]): Promise<DeployStep[]> {
  const runId = statuses
    .map((status) => status.description ?? "")
    .join(" ")
    .match(/runs\/(\d+)/)?.[1];
  if (!runId) return [];

  try {
    const jobs = await cached(`deploy-jobs:${runId}`, 20_000, async () => {
      const data = await rest<{ jobs: Job[] }>(
        `/repos/${REPO}/actions/runs/${runId}/jobs?per_page=30`,
      );
      return data.jobs;
    });
    return jobs.slice(0, 6).map((job) => ({
      label: job.name,
      state:
        job.status !== "completed"
          ? job.status === "queued"
            ? "wait"
            : "run"
          : job.conclusion === "success"
            ? "done"
            : "wait",
    }));
  } catch {
    return [];
  }
}

async function prFor(sha: string) {
  return cached(`pr:${sha}`, 3_600_000, async () => {
    const pulls = await rest<
      { number: number; title: string; merged_at: string | null; user: { login: string } }[]
    >(`/repos/${REPO}/commits/${sha}/pulls`);
    const pull = pulls.find((entry) => entry.merged_at) ?? pulls[0];
    return pull
      ? { number: `#${pull.number}`, title: pull.title, author: pull.user.login }
      : undefined;
  }).catch(() => undefined);
}

async function deploys(): Promise<{ deploying: BoardData["deploy"]; history: Deployment[] }> {
  const list = await cached("deployments", 45_000, () =>
    rest<ApiDeployment[]>(`/repos/${REPO}/deployments?per_page=6`),
  );

  const history: Deployment[] = [];
  let deploying: BoardData["deploy"] = null;

  for (const deployment of list) {
    let statuses: DeploymentStatus[] = [];
    try {
      statuses = await cached(`status:${deployment.id}`, 60_000, () =>
        rest<DeploymentStatus[]>(
          `/repos/${REPO}/deployments/${deployment.id}/statuses?per_page=10`,
        ),
      );
    } catch {
      statuses = [];
    }

    const latest = statuses[0];
    const failed = latest?.state === "failure" || latest?.state === "error";
    const active = latest?.state === "in_progress" || latest?.state === "pending";
    const started = new Date(deployment.created_at).getTime();
    const ended = active
      ? Date.now()
      : new Date(latest?.created_at ?? deployment.created_at).getTime();
    const durationMinutes = Math.max(1, Math.round((ended - started) / 60_000));
    const pr = lowBudget() ? undefined : await prFor(deployment.sha);

    if (!deploying && active) {
      const steps = await deploySteps(statuses);
      const done = steps.filter((step) => step.state === "done").length;
      deploying = {
        environment: deployment.environment,
        minutes: durationMinutes,
        progress: steps.length ? Math.round((done / steps.length) * 100) : 15,
        steps,
        pr,
      };
    }

    history.push({
      createdAt: deployment.created_at,
      environment: deployment.environment,
      status: failed ? "failed" : "live",
      note: failed ? (latest?.description ?? "deployment failed") : undefined,
      durationMinutes,
      pr,
    });
  }

  return { deploying, history };
}

async function mergedToday(): Promise<number> {
  return cached("merged", 120_000, async () => {
    const pulls = await rest<Pull[]>(`/repos/${REPO}/pulls?state=closed&per_page=40&sort=updated`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return pulls.filter(
      (pull) => pull.merged_at && new Date(pull.merged_at).getTime() >= today.getTime(),
    ).length;
  });
}

function minutesBetween(from: string, to: string): number {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

function toCard(pull: Pull, run: Run, jobs: Job[], lanes: Lane[]): PullRequest {
  const started = run.run_started_at ?? run.created_at;
  const finished = run.status === "completed";
  return {
    number: `#${pull.number}`,
    title: pull.title,
    branch: pull.head.ref,
    author: pull.user.login,
    minutes: finished ? minutesBetween(started, run.updated_at) : minutesSince(started),
    updatedAt: run.updated_at,
    machine: machineOfRun(jobs),
    lanes,
    failure: failureOf(jobs),
  };
}

async function snapshot(): Promise<BoardData> {
  const [viewer, pulls, runs, queueNodes, deployInfo, merged] = await Promise.all([
    cached("viewer", 3_600_000, () => rest<{ login: string }>("/user")),
    cached("pulls", 30_000, () =>
      rest<Pull[]>(`/repos/${REPO}/pulls?state=open&per_page=50&sort=updated`),
    ),
    cached("runs", 20_000, () =>
      rest<{ workflow_runs: Run[] }>(
        `/repos/${REPO}/actions/workflows/${config.workflow}/runs?per_page=60`,
      ),
    ),
    mergeQueue(),
    deploys(),
    mergedToday(),
  ]);

  const queuedNumbers = new Set(queueNodes.map((node) => node.pullRequest.number));

  const runsBySha = new Map<string, Run[]>();
  for (const run of runs.workflow_runs) {
    if (run.event === "merge_group") continue;
    const list = runsBySha.get(run.head_sha) ?? [];
    list.push(run);
    runsBySha.set(run.head_sha, list);
  }

  const pickRun = (sha: string): Run | undefined => {
    const list = runsBySha.get(sha);
    if (!list) return undefined;
    return (
      list.find((run) => run.status !== "completed") ??
      list.find((run) => run.conclusion !== "success" && run.conclusion !== "skipped") ??
      list[0]
    );
  };

  const testing = runs.workflow_runs.find(
    (run) => run.event === "merge_group" && run.status !== "completed",
  );

  const batch: BatchInfo | null = testing ? { done: 0, total: 0 } : null;

  const queue: QueueEntry[] = queueNodes.map((node) => ({
    number: `#${node.pullRequest.number}`,
    title: node.pullRequest.title,
    author: node.pullRequest.author?.login ?? "unknown",
    waitMinutes: minutesSince(node.enqueuedAt),
    state: node.state === "LOCKED" ? "testing" : "queued",
    ejectsInMinutes: node.estimatedTimeToMerge ?? undefined,
  }));

  if (testing && queue.length > 0) {
    const jobs = await jobsFor(testing).catch(() => []);
    batch.done = jobs.filter((job) => job.status === "completed").length;
    batch.total = jobs.length;
    queue[0] = {
      ...queue[0],
      state: "testing",
      progress: { done: batch.done, total: batch.total },
    };
  }

  const candidates = pulls
    .filter((pull) => !pull.draft && !queuedNumbers.has(pull.number))
    .map((pull) => ({ pull, run: pickRun(pull.head.sha) }))
    .filter((entry): entry is { pull: Pull; run: Run } => entry.run !== undefined);

  const cards = await mapLimit(candidates, 6, async ({ pull, run }) => {
    try {
      const jobs = await jobsFor(run);
      return { card: toCard(pull, run, jobs, lanesOf(jobs)), run };
    } catch {
      return null;
    }
  });

  const needs: PullRequest[] = [];
  const running: PullRequest[] = [];
  const ready: PullRequest[] = [];

  for (const entry of cards) {
    if (!entry) continue;
    const { card, run } = entry;
    const finished = run.status === "completed";

    if (card.failure) {
      if (run.conclusion !== "cancelled") needs.push(card);
      continue;
    }

    if (!finished) {
      running.push(card);
      continue;
    }

    if (run.conclusion === "success" && ready.length < config.readyLimit) ready.push(card);
  }

  const runnerCounts: Record<MachineKind, number> = { github: 0, home: 0, m4: 0, blacksmith: 0 };
  if (!lowBudget()) {
    const recent = runs.workflow_runs
      .filter((run) => Date.now() - new Date(run.created_at).getTime() < 3_600_000)
      .slice(0, 8);
    await mapLimit(recent, 4, async (run) => {
      try {
        for (const job of await jobsFor(run)) {
          if (job.status === "queued") continue;
          runnerCounts[machineOf(job)] += 1;
        }
      } catch {
        // one unreadable run must not blank the board
      }
    });
  }

  return {
    viewer: viewer.login,
    clock: new Date().toTimeString().slice(0, 5),
    updatedSeconds: 0,
    averageWaitMinutes: queue.length
      ? Math.round(queue.reduce((sum, entry) => sum + entry.waitMinutes, 0) / queue.length)
      : 0,
    mergedToday: merged,
    laneNames: config.lanes.map((lane) => lane.name),
    needs: needs.slice(0, 5),
    running: running.slice(0, 6),
    ready,
    queue,
    batch,
    deploy: deployInfo.deploying,
    deployments: deployInfo.history,
    runners: (["github", "home", "m4", "blacksmith"] as MachineKind[]).map((kind) => ({
      kind,
      jobs: runnerCounts[kind],
    })),
  };
}

export const loadBoard = () => cached("board", config.cacheMs, snapshot);

export const rateStatus = () => rate;

export async function jobLog(jobId: number): Promise<string> {
  return cached(`log:${jobId}`, 600_000, async () => {
    const text = await restText(`/repos/${REPO}/actions/jobs/${jobId}/logs`);
    const lines = text.split("\n");
    return lines.slice(Math.max(0, lines.length - 120)).join("\n");
  });
}
