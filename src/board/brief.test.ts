import { describe, expect, it } from "vite-plus/test";
import { agentBrief } from "./brief";
import type { Attention, PullRequest } from "./types";

const NOW = new Date("2026-11-12T12:00:00Z").getTime();

const pr: PullRequest = {
  number: "#1370",
  title: "feat(referrals): workflow credit",
  branch: "feat/referrals-loops",
  author: "me",
  url: "https://github.com/o/r/pull/1370",
  minutes: 20,
  updatedAt: "2026-11-12T11:54:00Z",
  lastCommitAt: "2026-11-12T11:40:00Z",
  machine: "github",
  lanes: [],
  jobs: { done: 10, total: 10 },
  waiting: false,
  runId: 9,
  conflict: false,
  changesRequested: false,
  openThreads: 0,
  failure: {
    headline: "",
    meta: "",
    errors: 2,
    jobs: [
      { id: 1, name: "lint-node", conclusion: "failure", url: "" },
      { id: 2, name: "mutation (shard 2/6)", conclusion: "failure", url: "" },
    ],
  },
};

const item: Attention = {
  kind: "failing",
  key: "failing:#1370",
  title: pr.title,
  lanes: [
    { name: "lint", flaky: false },
    { name: "test", flaky: true },
  ],
  since: pr.updatedAt,
  pr,
};

describe("agentBrief", () => {
  it("says which PR, which lanes, what broke, and what may be flaky", () => {
    const text = agentBrief(
      item,
      { 1: "components-per-file gate: 1 file(s) export more than 2 React components:", 2: null },
      [{ name: "mutation", count: 3 }],
      NOW,
    );
    expect(text).toBe(
      [
        "PR #1370: feat(referrals): workflow credit",
        "https://github.com/o/r/pull/1370",
        "",
        "CI is red in lint, test (failed 6m ago, last push 20m ago).",
        "",
        "- lint-node: components-per-file gate: 1 file(s) export more than 2 React components:",
        "- mutation (shard 2/6): no error line in the log, open it",
        "- Note: mutation failed and then passed on a rerun 3 times this week. It may be flaky; rule that out before changing code.",
        "",
        "Fix the failing checks on this branch and push.",
      ].join("\n"),
    );
  });
});
