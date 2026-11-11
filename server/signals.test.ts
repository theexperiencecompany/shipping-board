import { describe, expect, it } from "vite-plus/test";
import type { Deployment, PullRequest } from "../src/board/types";
import type { Run } from "./github";
import {
  attention,
  ciTiming,
  jobFamily,
  livePerEnvironment,
  mainState,
  mergeStats,
  percentile,
} from "./signals";

const NOW = new Date("2026-11-12T12:00:00Z").getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function run(overrides: Partial<Run>): Run {
  return {
    id: 1,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    head_sha: "abc",
    head_branch: "feature",
    created_at: ago(30),
    run_started_at: ago(30),
    updated_at: ago(10),
    html_url: "",
    path: ".github/workflows/ci.yml",
    ...overrides,
  };
}

function pr(number: number, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: `#${number}`,
    title: `PR ${number}`,
    branch: "feature",
    author: "me",
    url: "",
    minutes: 10,
    updatedAt: ago(60),
    lastCommitAt: ago(90),
    machine: "github",
    lanes: [],
    jobs: { done: 0, total: 0 },
    waiting: false,
    conflict: false,
    changesRequested: false,
    openThreads: 0,
    ...overrides,
  };
}

function failing(number: number, jobs: string[], overrides: Partial<PullRequest> = {}) {
  return pr(number, {
    failure: {
      headline: "",
      meta: "",
      errors: jobs.length,
      jobs: jobs.map((name, id) => ({ id, name, conclusion: "failure", url: "" })),
    },
    ...overrides,
  });
}

const base = {
  failing: [] as PullRequest[],
  open: [] as PullRequest[],
  waitingRuns: [] as { createdAt: string }[],
  runners: null,
  latestDeploy: null,
  now: NOW,
  backlogMinutes: 15,
  systemicCount: 3,
  idleMinutes: 30,
};

describe("percentile", () => {
  it("picks the median and the slow tail", () => {
    const values = [5, 1, 4, 2, 3, 10, 6, 7, 8, 9];
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.9)).toBe(9);
  });
});

describe("ciTiming", () => {
  it("needs enough green runs to say what is typical", () => {
    expect(ciTiming([run({}), run({})])).toBeNull();
  });

  it("ignores failures and merge queue runs", () => {
    const green = Array.from({ length: 5 }, () => run({}));
    const noise = [
      run({ conclusion: "failure", updated_at: ago(-500) }),
      run({ event: "merge_group" }),
    ];
    expect(ciTiming([...green, ...noise])).toEqual({ typical: 20, slow: 20, samples: 5 });
  });
});

describe("mainState", () => {
  it("reports how long main has been green", () => {
    const runs = [
      run({ event: "push", head_branch: "master", updated_at: ago(5) }),
      run({ event: "push", head_branch: "master", updated_at: ago(60) }),
      run({ event: "push", head_branch: "master", conclusion: "cancelled" }),
      run({ event: "push", head_branch: "master", conclusion: "failure", updated_at: ago(200) }),
    ];
    expect(mainState("master", runs)).toEqual({ name: "master", state: "pass", since: ago(60) });
  });

  it("says checking while the newest push is still running", () => {
    const runs = [
      run({ event: "push", head_branch: "master", status: "in_progress", created_at: ago(3) }),
    ];
    expect(mainState("master", runs).state).toBe("run");
  });
});

describe("jobFamily", () => {
  it("groups shards and per-file variants", () => {
    expect(jobFamily("mutation (shard 2/6 (4 modules))")).toBe("mutation");
    expect(jobFamily("mutation (app/services/chat/stream.py)")).toBe("mutation");
    expect(jobFamily("ts-build-test")).toBe("ts-build-test");
  });
});

describe("attention", () => {
  it("flags CI runs no runner picked up, past the threshold only", () => {
    const items = attention({
      ...base,
      waitingRuns: [{ createdAt: ago(90) }, { createdAt: ago(20) }, { createdAt: ago(2) }],
      runners: [{ kind: "home", online: 10, busy: 0, total: 10 }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "backlog",
      title: "2 CI runs have not started",
      since: ago(90),
    });
    expect(items[0].detail).toContain("Home server 0 of 10 busy");
  });

  it("folds a check failing on many PRs into one card", () => {
    const items = attention({
      ...base,
      failing: [
        failing(1, ["mutation (shard 1/6)"]),
        failing(2, ["mutation (shard 2/6)"]),
        failing(3, ["mutation (a.py)", "lint-node"]),
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(["systemic", "failing"]);
    expect(items[0].title).toBe("mutation fails on 3 pull requests");
    expect(items[1]).toMatchObject({
      key: "failing:#3",
      detail: "lint-node failed. Nothing pushed since.",
    });
  });

  it("only calls a failure abandoned after the idle window", () => {
    const fresh = failing(1, ["lint-node"], { updatedAt: ago(10), lastCommitAt: ago(40) });
    const fixed = failing(2, ["lint-node"], { updatedAt: ago(60), lastCommitAt: ago(5) });
    const [first, second] = attention({ ...base, failing: [fresh, fixed] });
    expect(first.detail).toBe("lint-node failed.");
    expect(second.detail).toBe("lint-node failed.");
  });

  it("puts a failed deploy first", () => {
    const deploy: Deployment = {
      createdAt: ago(5),
      environment: "production",
      status: "failed",
      durationMinutes: 4,
    };
    const items = attention({
      ...base,
      latestDeploy: deploy,
      failing: [failing(1, ["lint-node"])],
      open: [pr(2, { conflict: true })],
    });
    expect(items.map((item) => item.kind)).toEqual(["deploy", "failing", "conflict"]);
  });
});

describe("livePerEnvironment", () => {
  it("keeps only the newest deployment of each environment", () => {
    const history: Deployment[] = [
      { createdAt: ago(10), environment: "production", status: "live", durationMinutes: 7 },
      { createdAt: ago(20), environment: "production", status: "live", durationMinutes: 6 },
      { createdAt: ago(30), environment: "staging", status: "failed", durationMinutes: 2 },
    ];
    expect(livePerEnvironment(history).map((d) => [d.environment, d.createdAt])).toEqual([
      ["production", ago(10)],
      ["staging", ago(30)],
    ]);
  });
});

describe("mergeStats", () => {
  it("counts the last day against the six days before", () => {
    const merged = [
      ago(60),
      ago(600),
      ...Array.from({ length: 12 }, (_, i) => ago(2000 + i * 600)),
    ].map((mergedAt, number) => ({ number, title: "", author: "", createdAt: mergedAt, mergedAt }));
    expect(mergeStats(merged, NOW)).toEqual({ day: 2, weekAverage: 2 });
  });
});
