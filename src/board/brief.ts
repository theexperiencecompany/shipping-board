import { timeAgo } from "./time";
import type { Attention } from "./types";

/**
 * What to paste into an agent's chat for a failing PR: which PR, which lanes are red,
 * the first real error of each failed job, and which of them are known to be flaky.
 */
export function agentBrief(
  item: Attention,
  errors: Record<number, string | null>,
  flaky: { name: string; count: number }[],
  now = Date.now(),
): string {
  const pr = item.pr;
  if (!pr) return item.title;

  const lanes = (item.lanes ?? []).map((lane) => lane.name).join(", ");
  const pushed = pr.lastCommitAt ? `, last push ${timeAgo(pr.lastCommitAt, now)}` : "";
  const lines = [
    `PR ${pr.number}: ${pr.title}`,
    pr.url,
    "",
    `CI is red in ${lanes || "some checks"} (failed ${timeAgo(item.since, now)}${pushed}).`,
    "",
  ];

  for (const job of pr.failure?.jobs ?? []) {
    lines.push(`- ${job.name}: ${errors[job.id] ?? "no error line in the log, open it"}`);
  }

  const family = (name: string) => name.replace(/\s*\(.*$/, "").trim();
  const known = flaky.filter((check) =>
    (pr.failure?.jobs ?? []).some((job) => family(job.name) === check.name),
  );
  for (const check of known) {
    lines.push(
      `- Note: ${check.name} failed and then passed on a rerun ${check.count} time${check.count === 1 ? "" : "s"} this week. It may be flaky; rule that out before changing code.`,
    );
  }

  lines.push("", "Fix the failing checks on this branch and push.");
  return lines.join("\n");
}
