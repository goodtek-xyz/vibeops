/**
 * GitHub Actions part of the merge gate: which workflow runs a PR head commit
 * is still owed, and whether the runs that exist for it are finished and green.
 *
 * Why: `statusCheckRollup` lists every check on the head commit, including
 * checks from other events (e.g. a `push` workflow on the same commit). Right
 * after a PR is opened or pushed, GitHub has not created the `pull_request`
 * workflow run — or its jobs — yet, so a rollup made only of earlier, finished
 * checks looks green although the PR's own CI has not started. The gate
 * therefore also asks the Actions API:
 *
 * 1. Expected runs: workflows in `.github/workflows` at the head commit whose
 *    `on:` triggers `pull_request` for this PR (base branch, changed paths,
 *    activity types — GitHub's documented filter rules) and that are active.
 *    Each must have a `pull_request` run for the head SHA.
 * 2. Every workflow run for the head SHA (any event) must be completed with
 *    `success`, `neutral` or `skipped` (latest run per workflow + event).
 *
 * Docs: https://docs.github.com/actions/writing-workflows/workflow-syntax-for-github-actions#onpull_requestpull_request_targetbranchesbranches-ignore
 *       https://docs.github.com/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Filter patterns (GitHub "Filter pattern cheat sheet")
// ---------------------------------------------------------------------------

/**
 * GitHub filter pattern → anchored RegExp. `*` = any chars except `/`,
 * `**` = any chars, `?` / `+` = zero-or-one / one-or-more of the preceding
 * char, `[…]` = character class, `\` escapes the next char.
 */
export function filterPatternToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) {
      out += escapeRegExp(pattern[++i]!);
    } else if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?" || ch === "+") {
      out += ch;
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        out += "\\[";
      } else {
        out += pattern.slice(i, end + 1);
        i = end;
      }
    } else {
      out += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${out}$`);
}

function escapeRegExp(ch: string): string {
  return ch.replace(/[.^$(){}|[\]\\*+?/]/g, "\\$&");
}

/**
 * Ordered include list with `!` negations (`branches`, `paths`): the last
 * matching pattern decides; no match → not included.
 */
export function includedByFilter(patterns: readonly string[], value: string): boolean {
  let included = false;
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const pattern = negated ? raw.slice(1) : raw;
    if (filterPatternToRegExp(pattern).test(value)) included = !negated;
  }
  return included;
}

/** Ignore list (`branches-ignore`, `paths-ignore`): any match ignores. */
export function ignoredByFilter(patterns: readonly string[], value: string): boolean {
  return patterns.some((p) => filterPatternToRegExp(p).test(value));
}

// ---------------------------------------------------------------------------
// Workflow triggers
// ---------------------------------------------------------------------------

/** GitHub evaluates path filters against at most this many changed files. */
export const PATH_FILTER_FILE_LIMIT = 300;

export interface PullRequestTriggerContext {
  /** PR base branch (`baseRefName`); `null` = unknown → branch filters assumed to match. */
  readonly baseBranch: string | null;
  /** Lazily loaded changed file paths (only called when a path filter exists). */
  readonly changedFiles: () => Promise<readonly string[]>;
}

export type TriggerVerdict =
  | { readonly expected: true }
  | { readonly expected: false; readonly reason: string };

function stringList(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  return [];
}

/**
 * Does this workflow start a `pull_request` run for the PR's head commit?
 *
 * - `on: pull_request` in string, list or map form (no other key counts;
 *   `pull_request_target` runs on the base commit and is not awaited).
 * - `types`: the head commit is reported by `opened` (new PR) or
 *   `synchronize` (push); a custom list must contain both, otherwise the
 *   workflow is not awaited (configure `merge.requiredChecks` for it).
 * - `branches` / `branches-ignore` against the base branch;
 *   `paths` / `paths-ignore` against the PR's changed files (first 300).
 * - YAML GitHub cannot parse still produces a failed run → expected.
 */
export async function workflowExpectedForPullRequest(
  yamlText: string,
  ctx: PullRequestTriggerContext,
): Promise<TriggerVerdict> {
  let doc: unknown;
  try {
    doc = parseYaml(yamlText);
  } catch {
    return { expected: true };
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { expected: true };
  }
  const on = (doc as Record<string, unknown>)["on"] ?? (doc as Record<string, unknown>)["true"];
  if (typeof on === "string") {
    return on === "pull_request"
      ? { expected: true }
      : { expected: false, reason: "not triggered by pull_request" };
  }
  if (Array.isArray(on)) {
    return on.includes("pull_request")
      ? { expected: true }
      : { expected: false, reason: "not triggered by pull_request" };
  }
  if (on === null || typeof on !== "object" || !("pull_request" in on)) {
    return { expected: false, reason: "not triggered by pull_request" };
  }
  const cfg = (on as Record<string, unknown>)["pull_request"];
  if (cfg === null || cfg === undefined || typeof cfg !== "object" || Array.isArray(cfg)) {
    return { expected: true };
  }
  const c = cfg as Record<string, unknown>;

  const types = stringList(c["types"]);
  if (types !== null && !(types.includes("opened") && types.includes("synchronize"))) {
    return { expected: false, reason: `pull_request types [${types.join(", ")}]` };
  }

  if (ctx.baseBranch !== null) {
    const branches = stringList(c["branches"]);
    const branchesIgnore = stringList(c["branches-ignore"]);
    if (branches !== null && !includedByFilter(branches, ctx.baseBranch)) {
      return { expected: false, reason: `branches filter excludes ${ctx.baseBranch}` };
    }
    if (branchesIgnore !== null && ignoredByFilter(branchesIgnore, ctx.baseBranch)) {
      return { expected: false, reason: `branches-ignore matches ${ctx.baseBranch}` };
    }
  }

  const paths = stringList(c["paths"]);
  const pathsIgnore = stringList(c["paths-ignore"]);
  if (paths !== null || pathsIgnore !== null) {
    const files = (await ctx.changedFiles()).slice(0, PATH_FILTER_FILE_LIMIT);
    if (paths !== null && !files.some((f) => includedByFilter(paths, f))) {
      return { expected: false, reason: "paths filter matches no changed file" };
    }
    if (pathsIgnore !== null && files.every((f) => ignoredByFilter(pathsIgnore, f))) {
      return { expected: false, reason: "paths-ignore matches every changed file" };
    }
  }
  return { expected: true };
}

// ---------------------------------------------------------------------------
// Runs → verdict (pure)
// ---------------------------------------------------------------------------

export interface WorkflowRunInfo {
  readonly id: number;
  readonly name: string;
  /** `.github/workflows/<file>` (any `@ref` suffix is ignored). */
  readonly path: string;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
}

export interface ActionsGateResult {
  readonly failed: readonly string[];
  readonly pending: readonly string[];
  /** Expected workflow paths with no `pull_request` run for the head SHA yet. */
  readonly missing: readonly string[];
}

const RUN_PASS = new Set(["success", "neutral", "skipped"]);

/**
 * GitHub-generated runs that are not the commit's CI: "dynamic workflows are generated for a
 * specific run and are not stored in your repository's `.github/workflows` directory" — e.g.
 * the jobs that generate Dependabot pull requests, `dynamic/dependabot/dependabot-updates`
 * (docs.github.com/code-security/dependabot/working-with-dependabot/about-dependabot-on-github-actions-runners).
 * Their result says nothing about the head commit, and a failed one cannot be re-run, so the
 * gate ignores them (required checks named in `.vibeops.json` are still judged by name).
 */
export function isDynamicRun(run: Pick<WorkflowRunInfo, "event" | "path">): boolean {
  return run.event === "dynamic" || run.path.startsWith("dynamic/");
}

function runPath(run: WorkflowRunInfo): string {
  return run.path.split("@")[0]!;
}

function describeRun(run: WorkflowRunInfo, detail: string): string {
  return `workflow "${run.name}" (${run.event}) ${detail}`;
}

/**
 * Latest run per (workflow, event) must be completed and passing; every
 * expected workflow must have a `pull_request` run. Unknown statuses /
 * conclusions fail closed. Dynamic runs ({@link isDynamicRun}) are ignored.
 */
export function evaluateActionsRuns(
  runs: readonly WorkflowRunInfo[],
  expectedPaths: readonly string[],
): ActionsGateResult {
  const latest = new Map<string, WorkflowRunInfo>();
  for (const run of runs) {
    if (isDynamicRun(run)) continue;
    const key = `${runPath(run)}\u0000${run.event}`;
    const prev = latest.get(key);
    if (prev === undefined || run.id > prev.id) latest.set(key, run);
  }
  const failed: string[] = [];
  const pending: string[] = [];
  for (const run of latest.values()) {
    const status = run.status.toLowerCase();
    if (status !== "completed") {
      pending.push(describeRun(run, `is ${status || "missing status"}`));
      continue;
    }
    const conclusion = (run.conclusion ?? "").toLowerCase();
    if (RUN_PASS.has(conclusion)) continue;
    failed.push(
      describeRun(
        run,
        conclusion === "action_required"
          ? "needs approval (action_required)"
          : `concluded ${conclusion || "without a conclusion"}`,
      ),
    );
  }
  const missing = expectedPaths.filter(
    (p) => ![...latest.values()].some((r) => r.event === "pull_request" && runPath(r) === p),
  );
  return { failed, pending, missing };
}

// ---------------------------------------------------------------------------
// GitHub API access (gh api)
// ---------------------------------------------------------------------------

export interface GitHubPullRef {
  readonly hostname: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: string;
}

/** `https://<host>/<owner>/<repo>/pull/<n>` → parts, else `null`. */
export function parseGitHubPullUrl(url: string): GitHubPullRef | null {
  const m = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(url.trim());
  if (m === null) return null;
  return { hostname: m[1]!, owner: m[2]!, repo: m[3]!, number: m[4]! };
}

/** `gh api` failed with HTTP 404 (resource absent). */
export class GitHubNotFoundError extends Error {}

async function ghApi(
  cwd: string,
  pr: GitHubPullRef,
  path: string,
  accept?: string,
): Promise<string> {
  const args = ["api"];
  if (pr.hostname.toLowerCase() !== "github.com") args.push("--hostname", pr.hostname);
  if (accept !== undefined) args.push("-H", `Accept: ${accept}`);
  args.push(path);
  try {
    const { stdout } = await execFileAsync("gh", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    const text = `${e.stderr ?? ""} ${e.message ?? ""}`;
    if (/HTTP 404|Not Found/i.test(text)) throw new GitHubNotFoundError(path);
    throw new Error(`gh api ${path}: ${(e.stderr ?? e.message ?? "").trim().split("\n")[0]}`);
  }
}

function repoPath(pr: GitHubPullRef): string {
  return `repos/${encodeURIComponent(pr.owner)}/${encodeURIComponent(pr.repo)}`;
}

const RUNS_PAGE_SIZE = 100;
const RUNS_MAX_PAGES = 10;
const FILES_PAGE_SIZE = 100;

/** All workflow runs for `sha` (Actions disabled / absent → empty). */
export async function listWorkflowRunsForSha(
  cwd: string,
  pr: GitHubPullRef,
  sha: string,
): Promise<WorkflowRunInfo[]> {
  const runs: WorkflowRunInfo[] = [];
  for (let page = 1; page <= RUNS_MAX_PAGES; page++) {
    let text: string;
    try {
      text = await ghApi(
        cwd,
        pr,
        `${repoPath(pr)}/actions/runs?head_sha=${sha}&per_page=${RUNS_PAGE_SIZE}&page=${page}`,
      );
    } catch (error) {
      if (error instanceof GitHubNotFoundError) return runs;
      throw error;
    }
    const parsed = JSON.parse(text) as {
      total_count?: number;
      workflow_runs?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(parsed.workflow_runs)) {
      throw new Error("Actions API returned no workflow_runs list");
    }
    for (const r of parsed.workflow_runs) {
      if (typeof r["id"] !== "number" || typeof r["path"] !== "string") {
        throw new Error("Actions API returned a workflow run without id/path");
      }
      runs.push({
        id: r["id"],
        name: typeof r["name"] === "string" ? r["name"] : String(r["path"]),
        path: r["path"],
        event: typeof r["event"] === "string" ? r["event"] : "",
        status: typeof r["status"] === "string" ? r["status"] : "",
        conclusion: typeof r["conclusion"] === "string" ? r["conclusion"] : null,
      });
    }
    if (parsed.workflow_runs.length < RUNS_PAGE_SIZE) return runs;
  }
  throw new Error(`more than ${RUNS_PAGE_SIZE * RUNS_MAX_PAGES} workflow runs for ${sha}`);
}

/** Paths of workflows GitHub will not run (`disabled_*`). */
async function listDisabledWorkflowPaths(cwd: string, pr: GitHubPullRef): Promise<Set<string>> {
  let text: string;
  try {
    text = await ghApi(cwd, pr, `${repoPath(pr)}/actions/workflows?per_page=100`);
  } catch (error) {
    if (error instanceof GitHubNotFoundError) return new Set();
    throw error;
  }
  const parsed = JSON.parse(text) as { workflows?: Array<{ path?: string; state?: string }> };
  const out = new Set<string>();
  for (const w of parsed.workflows ?? []) {
    if (typeof w.path === "string" && typeof w.state === "string" && w.state !== "active") {
      out.add(w.path);
    }
  }
  return out;
}

async function listChangedFiles(cwd: string, pr: GitHubPullRef): Promise<string[]> {
  const files: string[] = [];
  // GitHub path filters look at the first 300 changed files only.
  for (let page = 1; files.length < PATH_FILTER_FILE_LIMIT; page++) {
    const text = await ghApi(
      cwd,
      pr,
      `${repoPath(pr)}/pulls/${pr.number}/files?per_page=${FILES_PAGE_SIZE}&page=${page}`,
    );
    const rows = JSON.parse(text) as Array<{ filename?: string }>;
    if (!Array.isArray(rows)) throw new Error("pulls files API returned no list");
    for (const row of rows) if (typeof row.filename === "string") files.push(row.filename);
    if (rows.length < FILES_PAGE_SIZE) break;
  }
  return files;
}

export interface ExpectedWorkflow {
  readonly path: string;
}

/**
 * Workflows that will start a `pull_request` run for the head commit:
 * `.github/workflows/*.y{a,}ml` at `sha`, triggered for this PR, not disabled.
 */
export async function listExpectedPullRequestWorkflows(
  cwd: string,
  pr: GitHubPullRef,
  sha: string,
  baseBranch: string | null,
): Promise<ExpectedWorkflow[]> {
  let listing: string;
  try {
    listing = await ghApi(cwd, pr, `${repoPath(pr)}/contents/.github/workflows?ref=${sha}`);
  } catch (error) {
    if (error instanceof GitHubNotFoundError) return [];
    throw error;
  }
  const entries = JSON.parse(listing) as Array<{ path?: string; type?: string }>;
  if (!Array.isArray(entries)) return [];
  const candidates = entries
    .filter((e) => e.type === "file" && typeof e.path === "string")
    .map((e) => e.path!)
    .filter((p) => /\.ya?ml$/i.test(p));
  if (candidates.length === 0) return [];

  const disabled = await listDisabledWorkflowPaths(cwd, pr);
  let changed: Promise<string[]> | null = null;
  const ctx: PullRequestTriggerContext = {
    baseBranch,
    changedFiles: () => (changed ??= listChangedFiles(cwd, pr)),
  };
  const expected: ExpectedWorkflow[] = [];
  for (const path of candidates) {
    if (disabled.has(path)) continue;
    const text = await ghApi(
      cwd,
      pr,
      `${repoPath(pr)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
      "application/vnd.github.raw+json",
    );
    if ((await workflowExpectedForPullRequest(text, ctx)).expected) expected.push({ path });
  }
  return expected;
}
