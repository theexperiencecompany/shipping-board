import { describe, expect, it } from "vite-plus/test";
import type { Deployment, MainBranch, PullRequest } from "../src/board/types";
import type { Run } from "./github";
import {
  attention,
  backlogCause,
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
  notStarted: [] as PullRequest[],
  runners: null,
  hosted: null,
  latestDeploy: null,
  now: NOW,
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
  it("names the red lanes of a failing PR, by title", () => {
    const red = failing(1, ["test-python (unit)"], {
      title: "feat: invite page",
      lanes: [
        { name: "lint", state: "pass" },
        { name: "test", state: "fail" },
      ],
    });
    const [item] = attention({ ...base, failing: [red] });
    expect(item).toMatchObject({ kind: "failing", title: "feat: invite page", lanes: ["test"] });
  });

  it("falls back to the job name when no lane covers it", () => {
    const [item] = attention({ ...base, failing: [failing(1, ["smoke-web (prod)"])] });
    expect(item.lanes).toEqual(["smoke-web"]);
  });

  it("lists each PR whose CI has not started, with why", () => {
    const items = attention({
      ...base,
      notStarted: [pr(1, { waiting: true, minutes: 90, title: "feat: referrals" })],
      runners: [{ kind: "home", online: 10, busy: 0, total: 10 }],
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "stuck",
        title: "feat: referrals",
        note: "Runners are idle. Re-run it",
        since: ago(90),
      }),
    ]);
  });

  it("only calls a failure abandoned after the idle window", () => {
    const fresh = failing(1, ["lint-node"], { updatedAt: ago(10), lastCommitAt: ago(40) });
    const fixed = failing(2, ["lint-node"], { updatedAt: ago(60), lastCommitAt: ago(5) });
    const idle = failing(3, ["lint-node"], { updatedAt: ago(60), lastCommitAt: ago(90) });
    const notes = attention({ ...base, failing: [fresh, fixed, idle] }).map((item) => item.note);
    expect(notes).toEqual([undefined, undefined, "no push since"]);
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
    expect(backlogCause([home, { ...m4, online: 0 }], null)).toBe("M4 offline");
  });

  it("names the plan limit when GitHub is full", () => {
    expect(backlogCause([home, m4], { running: 20, limit: 20, plan: "free" })).toBe(
      "GitHub limit full, 20 of 20",
    );
  });

  it("rules out capacity when everything has room", () => {
    expect(backlogCause([home, m4], { running: 3, limit: 20, plan: "free" })).toBe(
      "Runners are idle. Re-run it",
    );
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
