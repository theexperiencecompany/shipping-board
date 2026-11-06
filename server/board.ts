import type {
  BoardData,
  DeployStep,
  Deployment,
  FailureReport,
  Lane,
  LaneName,
  LaneState,
  MachineKind,
  PullRequest,
  QueueEntry,
} from "../src/board/types";
import {
  graphql,
  lowBudget,
  rate,
  rest,
  type Deployment as ApiDeployment,
  type DeploymentStatus,
  type Job,
  type Pull,
  type Run,
} from "./github";

const REPO = process.env.BOARD_REPO ?? "theexperiencecompany/gaia";
const BRANCH = process.env.BOARD_BRANCH ?? "master";

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

function laneOf(jobName: string): LaneName | null {
  const name = jobName.toLowerCase();
  if (/engine|browser|obscura|scan/.test(name)) return "e2e";
  if (/lint|repo-policy|audit|mypy|type-check/.test(name)) return "lint";
  if (/build|docker|desktop|web-build/.test(name)) return "build";
  if (/test|mutation|coverage/.test(name)) return "test";
  return null;
}

function stateOf(job: Job): LaneState {
  if (job.status !== "completed") return job.status === "queued" ? "wait" : "run";
  if (job.conclusion === "skipped") return "skip";
  if (job.conclusion === "success" || job.conclusion === "neutral") return "pass";
  return "fail";
}

const RANK: Record<LaneState, number> = { skip: 0, pass: 1, wait: 2, run: 3, fail: 4 };

function rollUp(states: LaneState[]): LaneState {
  if (states.length === 0) return "wait";
  return states.reduce((worst, state) => (RANK[state] > RANK[worst] ? state : worst), "skip");
}

function lanesOf(jobs: Job[]): Lane[] {
  const buckets = new Map<LaneName, LaneState[]>();
  for (const job of jobs) {
    const lane = laneOf(job.name);
    if (!lane) continue;
    const list = buckets.get(lane) ?? [];
    list.push(stateOf(job));
    buckets.set(lane, list);
  }
  return (["lint", "build", "test", "e2e"] as LaneName[]).map((name) => ({
    name,
    state: rollUp(buckets.get(name) ?? []),
  }));
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
  const first = failed[0];
  return {
    headline: `${first.name} failed`,
    meta: `${failed.length} failing ${failed.length === 1 ? "job" : "jobs"}`,
    errors: failed.length,
    log: failed.map((job) => `${job.name} — ${job.conclusion ?? "failed"}`).join("\n"),
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
      at: new Date(deployment.created_at).toISOString().slice(11, 16),
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

async function snapshot(): Promise<BoardData> {
  const [viewer, pulls, runs, queueNodes, deployInfo, merged] = await Promise.all([
    cached("viewer", 3_600_000, () => rest<{ login: string }>("/user")),
    cached("pulls", 30_000, () =>
      rest<Pull[]>(`/repos/${REPO}/pulls?state=open&per_page=50&sort=updated`),
    ),
    cached("runs", 20_000, () =>
      rest<{ workflow_runs: Run[] }>(`/repos/${REPO}/actions/workflows/ci.yml/runs?per_page=60`),
    ),
    mergeQueue(),
    deploys(),
    mergedToday(),
  ]);

  const queuedNumbers = new Set(queueNodes.map((node) => node.pullRequest.number));

  const runsBySha = new Map<string, Run[]>();
  for (const run of runs.workflow_runs) {
    if (run.event === "merge_group") continue;
    if (!run.path.endsWith("/ci.yml")) continue;
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

  const queue: QueueEntry[] = [];
  for (const [index, node] of queueNodes.entries()) {
    const isTesting = node.state === "LOCKED" || (index === 0 && testing !== undefined);
    queue.push({
      number: `#${node.pullRequest.number}`,
      title: node.pullRequest.title,
      author: node.pullRequest.author?.login ?? "unknown",
      waitMinutes: minutesSince(node.enqueuedAt),
      state: isTesting ? "testing" : "queued",
      ejectsInMinutes:
        isTesting && node.estimatedTimeToMerge ? node.estimatedTimeToMerge : undefined,
      progress: isTesting && testing ? await progressOf(testing) : undefined,
    });
  }

  const needs: PullRequest[] = [];
  const running: PullRequest[] = [];

  for (const pull of pulls) {
    if (pull.draft || queuedNumbers.has(pull.number)) continue;
    const run = pickRun(pull.head.sha);
    if (!run) continue;
    if (run.status === "completed" && run.conclusion === "success") continue;

    let jobs: Job[] = [];
    try {
      jobs = await jobsFor(run);
    } catch {
      continue;
    }

    const machine = jobs.find((job) => stateOf(job) !== "skip") ?? jobs[0];
    const card: PullRequest = {
      number: `#${pull.number}`,
      title: pull.title,
      branch: pull.head.ref,
      author: pull.user.login,
      minutes: minutesSince(run.run_started_at ?? run.created_at),
      machine: machine ? machineOf(machine) : "github",
      lanes: lanesOf(jobs),
      failure: failureOf(jobs),
    };

    if (card.failure) needs.push(card);
    else running.push(card);
  }

  const runnerCounts: Record<MachineKind, number> = { github: 0, home: 0, m4: 0, blacksmith: 0 };
  if (!lowBudget()) {
    const recent = runs.workflow_runs
      .filter((run) => Date.now() - new Date(run.created_at).getTime() < 3_600_000)
      .slice(0, 8);
    for (const run of recent) {
      try {
        for (const job of await jobsFor(run)) {
          if (job.status === "queued") continue;
          runnerCounts[machineOf(job)] += 1;
        }
      } catch {
        // one unreadable run must not blank the board
      }
    }
  }

  return {
    viewer: viewer.login,
    clock: new Date().toTimeString().slice(0, 5),
    updatedSeconds: 0,
    averageWaitMinutes: queue.length
      ? Math.round(queue.reduce((sum, entry) => sum + entry.waitMinutes, 0) / queue.length)
      : 0,
    mergedToday: merged,
    batchDurations: [],
    needs: needs.slice(0, 5),
    running: running.slice(0, 6),
    queue,
    deploy: deployInfo.deploying,
    deployments: deployInfo.history,
    runners: (["github", "home", "m4", "blacksmith"] as MachineKind[]).map((kind) => ({
      kind,
      jobs: runnerCounts[kind],
    })),
  };
}

async function progressOf(run: Run): Promise<{ done: number; total: number }> {
  try {
    const jobs = await jobsFor(run);
    return {
      done: jobs.filter((job) => job.status === "completed").length,
      total: jobs.length,
    };
  } catch {
    return { done: 0, total: 0 };
  }
}

const LANE_SETS: LaneState[][] = [
  ["pass", "pass", "run", "wait"],
  ["pass", "run", "wait", "skip"],
  ["run", "wait", "wait", "skip"],
  ["pass", "pass", "pass", "run"],
];

function lanesFor(index: number): Lane[] {
  const states = LANE_SETS[index % LANE_SETS.length];
  return (["lint", "build", "test", "e2e"] as LaneName[]).map((name, i) => ({
    name,
    state: states[i],
  }));
}

async function demoBoard(): Promise<BoardData> {
  const pulls = await cached("demo-pulls", 120_000, () =>
    rest<Pull[]>(`/repos/${REPO}/pulls?state=all&per_page=40&sort=updated`),
  );

  const at = (index: number) => pulls[index % pulls.length];
  const card = (index: number, machine: MachineKind): PullRequest => {
    const pull = at(index);
    return {
      number: `#${pull.number}`,
      title: pull.title,
      branch: pull.head.ref,
      author: pull.user.login,
      minutes: 2 + index * 3,
      machine,
      lanes: lanesFor(index),
    };
  };

  const needs: PullRequest[] = [
    {
      ...card(0, "home"),
      lanes: [
        { name: "lint", state: "pass" },
        { name: "build", state: "pass" },
        { name: "test", state: "fail" },
        { name: "e2e", state: "skip" },
      ],
      failure: {
        headline: "test-python (unit-a) failed",
        meta: "ejected from the queue 22 min ago",
        errors: 2,
        log: "test-python (unit-a) — failure\ntest-python (unit-b) — failure",
      },
    },
    {
      ...card(1, "github"),
      lanes: [
        { name: "lint", state: "fail" },
        { name: "build", state: "wait" },
        { name: "test", state: "wait" },
        { name: "e2e", state: "wait" },
      ],
      failure: {
        headline: "lint-python failed",
        meta: "6 min ago",
        errors: 1,
        log: "lint-python — failure",
      },
    },
  ];

  const machines: MachineKind[] = ["home", "github", "home", "blacksmith", "github"];

  return {
    viewer: await cached("viewer", 3_600_000, () => rest<{ login: string }>("/user")).then(
      (user) => user.login,
    ),
    clock: new Date().toTimeString().slice(0, 5),
    updatedSeconds: 0,
    averageWaitMinutes: 9,
    mergedToday: 14,
    batchDurations: [],
    needs,
    running: machines.map((machine, index) => card(index + 2, machine)),
    queue: [0, 1, 2].map((index) => {
      const pull = at(index + 8);
      return {
        number: `#${pull.number}`,
        title: pull.title,
        author: pull.user.login,
        waitMinutes: index * 3 + 1,
        state: index === 0 ? "testing" : "queued",
        ejectsInMinutes: index === 0 ? 19 : undefined,
        progress: index === 0 ? { done: 4, total: 18 } : undefined,
      };
    }),
    deploy: {
      environment: "production",
      minutes: 2,
      progress: 44,
      pr: { number: `#${at(12).number}`, title: at(12).title, author: at(12).user.login },
      steps: [
        { label: "docker-release", state: "done" },
        { label: "build-images", state: "done" },
        { label: "deploy-swarm-prod", state: "run", note: "converging" },
        { label: "deploy-web", state: "wait" },
      ],
    },
    deployments: [0, 1, 2, 3, 4].map((index) => {
      const pull = at(index + 13);
      return {
        at: `${13 - index}:${String(41 - index * 7).padStart(2, "0")}`,
        environment: "production",
        status: index === 2 ? "failed" : "live",
        note: index === 2 ? "health check failed on gaia-backend" : undefined,
        durationMinutes: 4 + index * 2,
        pr: { number: `#${pull.number}`, title: pull.title, author: pull.user.login },
      };
    }),
    runners: [
      { kind: "github", jobs: 41 },
      { kind: "home", jobs: 12 },
      { kind: "m4", jobs: 0 },
      { kind: "blacksmith", jobs: 3 },
    ],
  };
}

export const loadBoard = (demo = false) =>
  cached(demo ? "board:demo" : "board", 8_000, () => (demo ? demoBoard() : snapshot()));

export const rateStatus = () => rate;
