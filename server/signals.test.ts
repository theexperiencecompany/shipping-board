import { describe, expect, it } from "vite-plus/test";
import type { Deployment, MainBranch, PullRequest } from "../src/board/types";
import type { Run } from "./github";
import {
  attention,
  backlogCause,
  errorLine,
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
  main: { name: "master", state: "pass", since: null } as MainBranch,
  failing: [] as PullRequest[],
  open: [] as PullRequest[],
  waitingRuns: [] as { createdAt: string }[],
  runners: null,
  hosted: null,
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

  it("says checking only when no push has finished yet", () => {
    const runs = [
      run({ event: "push", head_branch: "master", status: "in_progress", created_at: ago(3) }),
    ];
    expect(mainState("master", runs).state).toBe("run");
  });

  it("keeps main red while a fix is still running", () => {
    const runs = [
      run({ event: "push", head_branch: "master", status: "in_progress", conclusion: null }),
      run({ event: "push", head_branch: "master", conclusion: "failure", updated_at: ago(40) }),
      run({ event: "push", head_branch: "master", conclusion: "skipped", updated_at: ago(50) }),
      run({ event: "push", head_branch: "master", conclusion: "failure", updated_at: ago(70) }),
    ];
    expect(mainState("master", runs)).toEqual({ name: "master", state: "fail", since: ago(70) });
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
    expect(items[0].detail).toBe("Your runners are idle, so this is not a capacity problem.");
  });

  it("quotes the error a shared failure has in common", () => {
    const withSummary = (number: number) => {
      const card = failing(number, ["ts-build-test"]);
      card.failure!.jobs[0].summary = "Cannot find module '@heroui/react'";
      return card;
    };
    const items = attention({
      ...base,
      failing: [withSummary(1), withSummary(2), withSummary(3)],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "ts-build-test fails the same way on 3 pull requests",
      detail: "Cannot find module '@heroui/react'",
      refs: ["#1", "#2", "#3"],
    });
  });

  it("keeps failures apart when their logs disagree", () => {
    const withError = (number: number, summary: string) => {
      const card = failing(number, ["mutation (a)"], { updatedAt: ago(number) });
      card.failure!.jobs[0].summary = summary;
      return card;
    };
    const items = attention({
      ...base,
      failing: [
        withError(1, "a.py: 1 surviving mutant"),
        withError(2, "b.py: 1 surviving mutant"),
        withError(3, "c.py: 2 surviving mutants"),
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(["failing", "failing", "failing"]);
    expect(items.map((item) => item.detail)).toEqual([
      "a.py: 1 surviving mutant.",
      "b.py: 1 surviving mutant.",
      "c.py: 2 surviving mutants.",
    ]);
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
    expect(items[0].title).toBe("mutation fails the same way on 3 pull requests");
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

  it("gives a pull request one card even when it has several problems", () => {
    const both = failing(1, ["lint-node"], { changesRequested: true });
    const items = attention({ ...base, failing: [both], open: [both] });
    expect(items.map((item) => item.kind)).toEqual(["failing"]);
  });

  it("puts a red main branch above everything", () => {
    const items = attention({
      ...base,
      main: { name: "master", state: "fail", since: ago(25) },
      failing: [failing(1, ["lint-node"])],
    });
    expect(items[0]).toMatchObject({ kind: "main", title: "master is failing", since: ago(25) });
  });

  it("puts a failed deploy before pull requests", () => {
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

describe("backlogCause", () => {
  const home = { kind: "home" as const, online: 10, busy: 0, total: 10 };
  const m4 = { kind: "m4" as const, online: 12, busy: 0, total: 12 };

  it("blames an offline pool first", () => {
    expect(backlogCause([home, { ...m4, online: 0 }], null)).toBe(
      "M4 offline, so jobs meant for it cannot start.",
    );
  });

  it("names the plan limit when GitHub is full", () => {
    expect(backlogCause([home, m4], { running: 20, limit: 20, plan: "free" })).toBe(
      "GitHub's 20-job limit on the free plan is full. They start as jobs finish.",
    );
  });

  it("rules out capacity when everything has room", () => {
    expect(backlogCause([home, m4], { running: 3, limit: 20, plan: "free" })).toContain(
      "not capacity",
    );
  });
});

describe("errorLine", () => {
  const log = (lines: string[]) =>
    lines.map((line) => `2026-11-11T21:21:43.9217601Z ${line}`).join("\n");

  it("skips lines that only point elsewhere", () => {
    expect(
      errorLine(
        log([
          "Run pnpm lint",
          "##[error]lint-node/components-per-file: FAIL — its first error lines are attached",
          "##[error]❌ components-per-file gate FAILED — 1 file(s) export more than 2 React components:",
          "##[error]Process completed with exit code 1.",
        ]),
      ),
    ).toBe("components-per-file gate: 1 file(s) export more than 2 React components:");
  });

  it("drops roll-ups and trims the mutation boilerplate", () => {
    expect(
      errorLine(
        log([
          "##[error]mutation/shard-1: FAIL — 2 of 4 module(s) did not pass: a.py b.py",
          "##[error]mutation/a.py: FAIL — 1 surviving mutant(s) on 1 changed line(s) in a.py — the suite would not notice this code being wrong",
        ]),
      ),
    ).toBe("mutation/a.py: 1 surviving mutant(s) on 1 changed line(s) in a.py");
  });

  it("skips a bare count for the test it summarises", () => {
    expect(
      errorLine(
        log([
          "##[error]ts-build-test/test-typescript: FAIL — test-typescript: 2 finding(s) (exit 1)",
          "##[error]FAIL src/__tests__/a.test.tsx > settings > rolls back a refused change",
        ]),
      ),
    ).toBe("FAIL src/__tests__/a.test.tsx > settings > rolls back a refused change");
  });

  it("returns nothing when the log has no real error", () => {
    expect(errorLine(log(["##[error]Process completed with exit code 1."]))).toBeNull();
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
