import { execFileSync } from "node:child_process";

const API = "https://api.github.com";
const GRAPHQL = "https://api.github.com/graphql";

let cached: string | null = null;

export const rate = { remaining: 5000, reset: 0 };

export function token(): string {
  if (cached) return cached;
  const fromEnv = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }
  try {
    cached = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No GitHub token. Set GH_TOKEN or run `gh auth login`.");
  }
  if (!cached) throw new Error("gh returned an empty token");
  return cached;
}

export function lowBudget(): boolean {
  return rate.remaining < 800;
}

async function request<T>(url: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
      ...init?.headers,
    },
  });

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining) rate.remaining = Number(remaining);
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset) rate.reset = Number(reset);

  const limited =
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
  if (limited && attempt < 2) {
    const wait = Number(response.headers.get("retry-after") ?? 0) * 1000 || 1500 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return request<T>(url, init, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} ${url} :: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

export const rest = <T>(path: string) => request<T>(`${API}${path}`);

/** A POST that answers with no body, like GitHub's re-run and cancel endpoints. */
export async function post(path: string): Promise<void> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} ${path} :: ${body.slice(0, 200)}`);
  }
}

export async function restText(path: string): Promise<string> {
  const response = await fetch(`${API}${path}`, {
    redirect: "follow",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${path}`);
  return response.text();
}

export const graphql = <T>(query: string, variables: Record<string, unknown>) =>
  request<{ data: T; errors?: { message: string }[] }>(GRAPHQL, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: { "content-type": "application/json" },
  });

export interface Run {
  id: number;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  created_at: string;
  run_started_at: string | null;
  run_attempt: number;
  updated_at: string;
  html_url: string;
  path: string;
}

export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  runner_name: string | null;
  labels: string[];
  html_url: string;
}

export interface Deployment {
  id: number;
  environment: string;
  created_at: string;
  ref: string;
  sha: string;
}

export interface DeploymentStatus {
  state: string;
  created_at: string;
  description: string | null;
}
