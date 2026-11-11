export type MachineKind = "home" | "github" | "blacksmith" | "m4";

export type LaneState = "pass" | "run" | "fail" | "wait" | "skip";

export interface Lane {
  name: string;
  state: LaneState;
}

export interface FailureJob {
  id: number;
  name: string;
  conclusion: string | null;
  url: string;
}

export interface FailureReport {
  headline: string;
  meta: string;
  errors: number;
  jobs: FailureJob[];
}

export interface PullRequest {
  number: string;
  title: string;
  branch: string;
  author: string;
  url: string;
  /** Minutes the latest run has been going, or took if finished. */
  minutes: number;
  /** When the latest run finished, or last changed if still going. */
  updatedAt: string;
  /** Last commit on the branch. Lets the board tell "being fixed" from "abandoned". */
  lastCommitAt: string | null;
  machine: MachineKind;
  lanes: Lane[];
  jobs: { done: number; total: number };
  /** Run exists but no job has been picked up by a runner yet. */
  waiting: boolean;
  conflict: boolean;
  changesRequested: boolean;
  openThreads: number;
  failure?: FailureReport;
}

/** Why something sits in the "Needs you" column. Ordered by severity. */
export type AttentionKind = "deploy" | "backlog" | "systemic" | "failing" | "conflict" | "changes";

export interface Attention {
  kind: AttentionKind;
  key: string;
  title: string;
  detail: string;
  /** ISO time the problem started, so the board can show how long it has lasted. */
  since: string;
  pr?: PullRequest;
}

export type QueueState = "testing" | "queued";

export interface QueueEntry {
  number: string;
  title: string;
  author: string;
  waitMinutes: number;
  state: QueueState;
  ejectsInMinutes?: number;
  progress?: { done: number; total: number };
}

export interface DeployStep {
  label: string;
  state: "done" | "run" | "wait";
}

export interface DeployPr {
  number: string;
  title: string;
  author: string;
}

export interface Deploy {
  environment: string;
  minutes: number;
  progress: number;
  steps: DeployStep[];
  pr?: DeployPr;
}

export type DeploymentStatus = "live" | "failed";

export interface Deployment {
  createdAt: string;
  environment: string;
  status: DeploymentStatus;
  note?: string;
  durationMinutes: number;
  pr?: DeployPr;
}

export interface RunnerPool {
  kind: MachineKind;
  online: number;
  busy: number;
  total: number;
}

export interface BatchInfo {
  done: number;
  total: number;
}

export interface Timing {
  /** Median minutes for a green CI run on a pull request. */
  typical: number;
  /** 90th percentile, the line past which a run counts as slow. */
  slow: number;
  samples: number;
}

export interface MainBranch {
  name: string;
  state: "pass" | "fail" | "run" | "unknown";
  /** When main entered its current state. */
  since: string | null;
}

export interface Shipped {
  number: string;
  title: string;
  author: string;
  mergedAt: string;
  /** Minutes from opening the pull request to merging it. */
  openMinutes: number;
}

export interface BoardData {
  viewer: string;
  clock: string;
  main: MainBranch;
  /** Merged in the last 24 hours. */
  mergedDay: number;
  mergedWeekAverage: number;
  shipped: Shipped[];
  /** Median minutes from opening a pull request to merging it, over the last week. */
  shippedTypical: number | null;
  ci: Timing | null;
  deployTypical: number | null;
  attention: Attention[];
  ready: PullRequest[];
  running: PullRequest[];
  queue: QueueEntry[];
  batch: BatchInfo | null;
  deploy: Deploy | null;
  /** Newest deployment per environment. */
  live: Deployment[];
  runners: RunnerPool[] | null;
  waitingRuns: number;
}
