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
  HostedLoad,
  QueueEntry,
  RunnerPool,
} from "../src/board/types";
import { config, isControlJob, laneOf } from "./config";
import {
  attention,
  ciTiming,
  livePerEnvironment,
  mainState,
  type Merged,
  errorLine,
  mergeStats,
  percentile,
  runMinutes,
} from "./signals";
import { zoneParts, zonedClock } from "./time";
import {
  graphql,
  lowBudget,
  rate,
  rest,
  restText,
  type Deployment as ApiDeployment,
  type DeploymentStatus,
  type Job,
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

function isQuietHour(hour: number): boolean {
  const { start, end } = config.night;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

function minutesBetween(from: string, to: string): number {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function machineOfName(name: string): MachineKind {
  for (const rule of config.machines) {
    if (rule.runner.some((pattern) => pattern.test(name))) return rule.kind;
  }
  return "github";
}

function machineOf(job: Job): MachineKind {
  const kind = machineOfName(job.runner_name ?? "");
  if (kind === "github" && job.labels.some((label) => /blacksmith/i.test(label))) {
    return "blacksmith";
  }
  return kind;
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
  const all = jobs.filter((job) => job.status === "completed" && stateOf(job) === "fail");
  // quality-gate and friends fail because something else failed. Name the cause, not the echo.
  const real = all.filter((job) => !isControlJob(job.name));
  const failed = real.length > 0 ? real : all;
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

function stepOf(job: Job): DeployStep {
  const state =
    job.status !== "completed"
      ? job.status === "queued"
        ? "wait"
        : "run"
      : job.conclusion === "success"
        ? "done"
        : "wait";
  return { label: job.name, state };
}

async function deploySteps(statuses: DeploymentStatus[], sha: string): Promise<DeployStep[]> {
  const runId = statuses
    .map((status) => status.description ?? "")
    .join(" ")
    .match(/runs\/(\d+)/)?.[1];

  try {
    if (runId) {
      const jobs = await cached(`deploy-jobs:${runId}`, 20_000, async () => {
        const data = await rest<{ jobs: Job[] }>(
          `/repos/${REPO}/actions/runs/${runId}/jobs?per_page=30`,
        );
        return data.jobs;
      });
      return jobs.slice(0, 6).map(stepOf);
    }
    const runs = await cached(`depruns:${sha}`, 60_000, () =>
      rest<{ workflow_runs: Run[] }>(`/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=10`),
    );
    const run = runs.workflow_runs.find((entry) => /deploy|build/i.test(entry.name));
    return run ? (await jobsFor(run)).slice(0, 6).map(stepOf) : [];
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
    rest<ApiDeployment[]>(`/repos/${REPO}/deployments?per_page=10`),
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

    if (active) {
      if (!deploying) {
        const steps = await deploySteps(statuses, deployment.sha);
        const done = steps.filter((step) => step.state === "done").length;
        deploying = {
          environment: deployment.environment,
          minutes: durationMinutes,
          progress: steps.length ? Math.round((done / steps.length) * 100) : 15,
          steps,
          pr,
        };
      }
      continue;
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

interface PullNode {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  isInMergeQueue: boolean;
  headRefName: string;
  headRefOid: string;
  updatedAt: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  author: { login: string } | null;
  reviewThreads: { nodes: { isResolved: boolean }[] };
  commits: { nodes: { commit: { committedDate: string } }[] };
}

async function openPulls(): Promise<PullNode[]> {
  return cached("pulls", 30_000, async () => {
    const [owner, name] = REPO.split("/");
    const result = await graphql<{ repository: { pullRequests: { nodes: PullNode[] } } }>(
      `
        query ($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes {
                number
                title
                url
                isDraft
                isInMergeQueue
                headRefName
                headRefOid
                updatedAt
                mergeable
                reviewDecision
                author {
                  login
                }
                reviewThreads(first: 50) {
                  nodes {
                    isResolved
                  }
                }
                commits(last: 1) {
                  nodes {
                    commit {
                      committedDate
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { owner, name },
    );
    if (result.errors?.length) throw new Error(result.errors[0].message);
    return result.data.repository.pullRequests.nodes;
  });
}

async function mergedSince(since: number): Promise<Merged[]> {
  return cached("merged", 120_000, async () => {
    const day = new Date(since).toISOString().slice(0, 10);
    const result = await graphql<{
      search: {
        nodes: {
          number?: number;
          title: string;
          createdAt: string;
          mergedAt: string | null;
          author: { login: string } | null;
        }[];
      };
    }>(
      `
        query ($q: String!) {
          search(query: $q, type: ISSUE, first: 100) {
            nodes {
              ... on PullRequest {
                number
                title
                createdAt
                mergedAt
                author {
                  login
                }
              }
            }
          }
        }
      `,
      { q: `repo:${REPO} is:pr is:merged base:${BRANCH} merged:>=${day}` },
    );
    if (result.errors?.length) throw new Error(result.errors[0].message);
    return result.data.search.nodes
      .flatMap((node) =>
        node.number && node.mergedAt
          ? [
              {
                number: node.number,
                title: node.title,
                author: node.author?.login ?? "unknown",
                createdAt: node.createdAt,
                mergedAt: node.mergedAt,
              },
            ]
          : [],
      )
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
  });
}

interface ApiRunner {
  name: string;
  status: "online" | "offline";
  busy: boolean;
}

/** Self-hosted capacity. Needs admin on the repo; the board works without it. */
async function runnerPools(): Promise<RunnerPool[] | null> {
  try {
    const data = await cached("runners", 30_000, () =>
      rest<{ runners: ApiRunner[] }>(`/repos/${REPO}/actions/runners?per_page=100`),
    );
    const pools = new Map<MachineKind, RunnerPool>();
    for (const runner of data.runners) {
      const kind = machineOfName(runner.name);
      const pool = pools.get(kind) ?? { kind, online: 0, busy: 0, total: 0 };
      pool.total += 1;
      if (runner.status === "online") pool.online += 1;
      if (runner.busy) pool.busy += 1;
      pools.set(kind, pool);
    }
    return [...pools.values()];
  } catch {
    return null;
  }
}

/** Concurrent GitHub-hosted jobs per plan, from GitHub's usage limits page. */
const HOSTED_LIMIT: Record<string, number> = { free: 20, pro: 40, team: 60, enterprise: 500 };

async function hostedLoad(): Promise<HostedLoad | null> {
  try {
    const owner = REPO.split("/")[0];
    const plan = await cached("plan", 3_600_000, async () => {
      const org = await rest<{ plan?: { name: string } }>(`/orgs/${owner}`);
      return org.plan?.name ?? "free";
    });
    const active = await cached("active-runs", 20_000, () =>
      rest<{ workflow_runs: Run[] }>(`/repos/${REPO}/actions/runs?status=in_progress&per_page=30`),
    );
    const jobs = await mapLimit(active.workflow_runs, 4, (run) => jobsFor(run).catch(() => []));
    const running = jobs
      .flat()
      .filter((job) => job.status === "in_progress" && machineOf(job) === "github").length;
    return { running, limit: HOSTED_LIMIT[plan] ?? 20, plan };
  } catch {
    return null;
  }
}

/** One line saying what broke, read from the job's log. Finished logs never change. */
async function failureSummary(jobId: number): Promise<string | undefined> {
  const line = await cached(`summary:${jobId}`, Number.POSITIVE_INFINITY, async () => {
    try {
      return errorLine(await restText(`/repos/${REPO}/actions/jobs/${jobId}/logs`));
    } catch {
      return null;
    }
  });
  return line ?? undefined;
}

function baseCard(node: PullNode): PullRequest {
  return {
    number: `#${node.number}`,
    title: node.title,
    branch: node.headRefName,
    author: node.author?.login ?? "unknown",
    url: node.url,
    minutes: 0,
    updatedAt: node.updatedAt,
    lastCommitAt: node.commits.nodes[0]?.commit.committedDate ?? null,
    machine: "github",
    lanes: [],
    jobs: { done: 0, total: 0 },
    waiting: false,
    conflict: node.mergeable === "CONFLICTING",
    changesRequested: node.reviewDecision === "CHANGES_REQUESTED",
    openThreads: node.reviewThreads.nodes.filter((thread) => !thread.isResolved).length,
  };
}

function withRun(card: PullRequest, run: Run, jobs: Job[]): PullRequest {
  const finished = run.status === "completed";
  const started = jobs.filter((job) => job.status !== "queued");
  const waiting = !finished && started.length === 0;
  const since = waiting ? run.created_at : (run.run_started_at ?? run.created_at);
  return {
    ...card,
    minutes: finished ? runMinutes(run) : minutesSince(since),
    updatedAt: run.updated_at,
    machine: machineOfRun(jobs),
    lanes: waiting ? [] : lanesOf(jobs),
    jobs: { done: jobs.filter((job) => job.status === "completed").length, total: jobs.length },
    waiting,
    failure: failureOf(jobs),
  };
}

const RECENT = 7 * 24 * 3_600_000;

async function snapshot(): Promise<BoardData> {
  const [viewer, pulls, runs, mainRuns, queueNodes, deployInfo, merged, runners] =
    await Promise.all([
      cached("viewer", 3_600_000, () => rest<{ login: string }>("/user")),
      openPulls(),
      cached("runs", 20_000, () =>
        rest<{ workflow_runs: Run[] }>(
          `/repos/${REPO}/actions/workflows/${config.workflow}/runs?per_page=60`,
        ),
      ),
      cached("main-runs", 30_000, () =>
        rest<{ workflow_runs: Run[] }>(
          `/repos/${REPO}/actions/workflows/${config.workflow}/runs?branch=${BRANCH}&event=push&per_page=15`,
        ),
      ),
      mergeQueue(),
      deploys(),
      mergedSince(Date.now() - 7 * 24 * 3_600_000),
      runnerPools(),
    ]);
  const hosted = lowBudget() ? null : await hostedLoad();

  const queuedNumbers = new Set(queueNodes.map((node) => node.pullRequest.number));

  const runsBySha = new Map<string, Run[]>();
  for (const run of runs.workflow_runs) {
    if (run.event === "merge_group") continue;
    const list = runsBySha.get(run.head_sha) ?? [];
    list.push(run);
    runsBySha.set(run.head_sha, list);
  }

  // The newest run decides. A cancelled run was replaced by a newer one, so it says nothing.
  const newest = (list: Run[]) =>
    list.find((run) => run.event !== "merge_group" && run.conclusion !== "cancelled");

  // The shared page covers a few hours. Older PRs get a lookup by commit.
  const pickRun = async (sha: string): Promise<Run | undefined> => {
    const hit = newest(runsBySha.get(sha) ?? []);
    if (hit) return hit;
    const data = await cached(`runs:${sha}`, 300_000, () =>
      rest<{ workflow_runs: Run[] }>(
        `/repos/${REPO}/actions/workflows/${config.workflow}/runs?head_sha=${sha}&per_page=5`,
      ),
    );
    return newest(data.workflow_runs);
  };

  const testing = runs.workflow_runs.find(
    (run) => run.event === "merge_group" && run.status !== "completed",
  );

  const queue: QueueEntry[] = queueNodes.map((node) => ({
    number: `#${node.pullRequest.number}`,
    title: node.pullRequest.title,
    author: node.pullRequest.author?.login ?? "unknown",
    waitMinutes: minutesSince(node.enqueuedAt),
    state: node.state === "LOCKED" ? "testing" : "queued",
    ejectsInMinutes: node.estimatedTimeToMerge ?? undefined,
  }));

  let batch: BatchInfo | null = null;
  if (testing && queue.length > 0) {
    const jobs = await jobsFor(testing).catch(() => []);
    batch = {
      done: jobs.filter((job) => job.status === "completed").length,
      total: jobs.length,
    };
    queue[0] = { ...queue[0], state: "testing", progress: batch };
  }

  const active = pulls.filter(
    (node) => !node.isDraft && !node.isInMergeQueue && !queuedNumbers.has(node.number),
  );

  const cards = await mapLimit(active, 6, async (node) => {
    try {
      const run = await pickRun(node.headRefOid);
      if (!run) return { card: baseCard(node), run: undefined };
      return { card: withRun(baseCard(node), run, await jobsFor(run)), run };
    } catch {
      return { card: baseCard(node), run: undefined };
    }
  });

  const failing: PullRequest[] = [];
  const running: PullRequest[] = [];
  const ready: PullRequest[] = [];
  const open: PullRequest[] = [];

  for (const { card, run } of cards) {
    const recent = Date.now() - new Date(card.lastCommitAt ?? card.updatedAt).getTime() < RECENT;
    if (recent) open.push(card);
    // Conflicts and requested changes already have a card in Needs you.
    if (!run || card.conflict) continue;
    if (card.failure) failing.push(card);
    else if (card.changesRequested) continue;
    else if (run.status !== "completed") running.push(card);
    else if (run.conclusion === "success") ready.push(card);
  }

  if (!lowBudget()) {
    const jobs = failing.flatMap((card) => card.failure?.jobs ?? []);
    await mapLimit(jobs, 4, async (job) => {
      job.summary = await failureSummary(job.id);
    });
  }

  const waitingRuns = runs.workflow_runs
    // "waiting" means an environment approval, not a missing runner.
    .filter((run) => run.status === "queued" || run.status === "pending")
    .map((run) => ({ createdAt: run.created_at }));

  const greenDeploys = deployInfo.history
    .filter((deployment) => deployment.status === "live")
    .map((deployment) => deployment.durationMinutes);

  const mergeTimes = mergeStats(merged, Date.now());

  const main = mainState(BRANCH, mainRuns.workflow_runs);

  return {
    viewer: viewer.login,
    clock: zonedClock(config.timezone),
    main,
    mergedDay: mergeTimes.day,
    mergedWeekAverage: mergeTimes.weekAverage,
    shippedTypical:
      merged.length >= 3
        ? percentile(
            merged.map((pull) => minutesBetween(pull.createdAt, pull.mergedAt)),
            0.5,
          )
        : null,
    shipped: merged.slice(0, config.shippedLimit).map((pull) => ({
      number: `#${pull.number}`,
      title: pull.title,
      author: pull.author,
      mergedAt: pull.mergedAt,
      openMinutes: minutesBetween(pull.createdAt, pull.mergedAt),
    })),
    ci: ciTiming(runs.workflow_runs),
    deployTypical: greenDeploys.length >= 3 ? percentile(greenDeploys, 0.5) : null,
    attention: attention({
      main,
      failing,
      open,
      waitingRuns,
      runners,
      hosted,
      latestDeploy: deployInfo.history[0] ?? null,
      now: Date.now(),
      backlogMinutes: config.backlogMinutes,
      systemicCount: config.systemicCount,
      idleMinutes: config.idleMinutes,
    }),
    ready: ready.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, config.readyLimit),
    running: running.sort((a, b) => Number(a.waiting) - Number(b.waiting) || b.minutes - a.minutes),
    queue,
    batch,
    deploy: deployInfo.deploying,
    live: livePerEnvironment(deployInfo.history),
    runners,
    hosted,
    waitingRuns: waitingRuns.length,
    night: isQuietHour(zoneParts(config.timezone).hour),
  };
}

export const loadBoard = () => cached("board", config.cacheMs, snapshot);

export const rateStatus = () => rate;

export async function jobLog(jobId: number, full = false): Promise<string> {
  return cached(`log:${jobId}:${full ? "full" : "tail"}`, 600_000, async () => {
    let text: string;
    try {
      text = await restText(`/repos/${REPO}/actions/jobs/${jobId}/logs`);
    } catch (error) {
      return `GitHub did not return a log for this job. ${error instanceof Error ? error.message : ""}`.trim();
    }
    if (full) return text;
    const lines = text.split("\n");
    return lines.slice(Math.max(0, lines.length - config.logTailLines)).join("\n");
  });
}
