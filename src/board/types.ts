export type MachineKind = "home" | "github" | "blacksmith" | "m4";

export const LANES = ["lint", "build", "test", "e2e"] as const;

export type LaneName = (typeof LANES)[number];

export type LaneState = "pass" | "run" | "fail" | "wait" | "skip";

export interface Lane {
  name: LaneName;
  state: LaneState;
}

export interface FailureReport {
  headline: string;
  meta: string;
  errors: number;
  log: string;
}

export interface PullRequest {
  number: string;
  title: string;
  branch: string;
  author: string;
  minutes: number;
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
  at: string;
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

export interface BoardData {
  viewer: string;
  clock: string;
  updatedSeconds: number;
  averageWaitMinutes: number;
  mergedToday: number;
  batchDurations: number[];
  needs: PullRequest[];
  running: PullRequest[];
  queue: QueueEntry[];
  deploy: Deploy | null;
  deployments: Deployment[];
  runners: RunnerLoad[];
}
