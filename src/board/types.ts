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
  minutes: number;
  updatedAt: string;
  machine: MachineKind;
  lanes: Lane[];
  failure?: FailureReport;
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
  note?: string;
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

export interface RunnerLoad {
  kind: MachineKind;
  jobs: number;
}

export interface BatchInfo {
  done: number;
  total: number;
  members: string[];
}

export interface BoardData {
  viewer: string;
  clock: string;
  updatedSeconds: number;
  averageWaitMinutes: number;
  mergedToday: number;
  laneNames: string[];
  maxPerColumn: number;
  needs: PullRequest[];
  running: PullRequest[];
  ready: PullRequest[];
  queue: QueueEntry[];
  batch: BatchInfo | null;
  deploy: Deploy | null;
  deployments: Deployment[];
  runners: RunnerLoad[];
}
