/**
 * Classify GitHub `statusCheckRollup` items and evaluate the merge gate
 * (`task merge` / `task release` refuse to merge on red or missing checks).
 *
 * GitHub returns two item shapes:
 * - `CheckRun` (GitHub Actions, check apps): `status` + `conclusion`, no `state`.
 * - `StatusContext` (commit status API): `state`, no `status`/`conclusion`.
 *
 * The rollup keeps every run of a check: a re-run (new attempt or new workflow run on the
 * same head SHA) adds an item next to the old one. {@link latestPerCheck} keeps the latest
 * item per check identity, so a passed re-run supersedes an earlier failure and a later
 * failure supersedes an earlier pass.
 */

export type CheckVerdict = "passed" | "failed" | "pending";

export interface RawRollupItem {
  readonly __typename?: string | null;
  readonly name?: string | null;
  readonly context?: string | null;
  readonly workflowName?: string | null;
  readonly status?: string | null;
  readonly conclusion?: string | null;
  readonly state?: string | null;
  readonly detailsUrl?: string | null;
  readonly targetUrl?: string | null;
  /** RFC 3339. gh exports a StatusContext's `createdAt` as `startedAt`; Go's zero time = unset. */
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

export interface ClassifiedCheck {
  readonly name: string;
  readonly kind: "CheckRun" | "StatusContext";
  readonly verdict: CheckVerdict;
  /** Raw host value that drove the verdict (e.g. `FAILURE`, `IN_PROGRESS`). */
  readonly detail: string;
  /** CheckRun: its workflow (`workflowName`), part of the check identity. StatusContext: `null`. */
  readonly workflow?: string | null;
  /** Epoch ms of `startedAt` / `completedAt`; `null` when missing or unset. */
  readonly startedAt?: number | null;
  readonly completedAt?: number | null;
}

/** GitHub GraphQL `CheckStatusState` values other than COMPLETED. */
const CHECK_RUN_IN_FLIGHT = new Set(["REQUESTED", "QUEUED", "IN_PROGRESS", "WAITING", "PENDING"]);
/** GitHub GraphQL `CheckConclusionState`, split into pass / fail (exhaustive). */
const CHECK_RUN_PASS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const CHECK_RUN_FAIL = new Set([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);
/** GitHub GraphQL `StatusState` (exhaustive): SUCCESS | PENDING | EXPECTED | FAILURE | ERROR. */
const STATUS_CONTEXT_PENDING = new Set(["PENDING", "EXPECTED"]);
const STATUS_CONTEXT_FAIL = new Set(["FAILURE", "ERROR"]);

function upper(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function isCheckRun(item: RawRollupItem): boolean {
  if (item.__typename === "CheckRun") return true;
  if (item.__typename === "StatusContext") return false;
  // Unknown typename: infer from fields.
  return (item.status ?? null) !== null || (item.conclusion ?? null) !== null;
}

/** RFC 3339 → epoch ms; missing, unparseable or Go's zero time (`0001-01-01T00:00:00Z`) → `null`. */
function timestamp(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function classifyRollupItem(item: RawRollupItem): ClassifiedCheck {
  const base = classifyVerdict(item);
  return {
    ...base,
    workflow: base.kind === "CheckRun" ? (item.workflowName ?? "").trim() || null : null,
    startedAt: timestamp(item.startedAt),
    completedAt: timestamp(item.completedAt),
  };
}

function classifyVerdict(item: RawRollupItem): ClassifiedCheck {
  if (isCheckRun(item)) {
    const name = (item.name ?? "").trim() || "(unnamed check run)";
    const status = upper(item.status);
    const conclusion = upper(item.conclusion);
    if (CHECK_RUN_IN_FLIGHT.has(status)) {
      return { name, kind: "CheckRun", verdict: "pending", detail: status };
    }
    if (status !== "COMPLETED") {
      // Missing or undocumented status — fail closed.
      return { name, kind: "CheckRun", verdict: "failed", detail: status || "MISSING_STATUS" };
    }
    if (CHECK_RUN_PASS.has(conclusion)) {
      return { name, kind: "CheckRun", verdict: "passed", detail: conclusion };
    }
    if (CHECK_RUN_FAIL.has(conclusion)) {
      return { name, kind: "CheckRun", verdict: "failed", detail: conclusion };
    }
    // Completed with a missing or undocumented conclusion — fail closed.
    return {
      name,
      kind: "CheckRun",
      verdict: "failed",
      detail: conclusion || "MISSING_CONCLUSION",
    };
  }

  const name = (item.context ?? item.name ?? "").trim() || "(unnamed status)";
  const state = upper(item.state);
  if (state === "SUCCESS") {
    return { name, kind: "StatusContext", verdict: "passed", detail: state };
  }
  if (STATUS_CONTEXT_PENDING.has(state)) {
    return { name, kind: "StatusContext", verdict: "pending", detail: state };
  }
  if (STATUS_CONTEXT_FAIL.has(state)) {
    return { name, kind: "StatusContext", verdict: "failed", detail: state };
  }
  // Missing or undocumented state — fail closed.
  return { name, kind: "StatusContext", verdict: "failed", detail: state || "MISSING_STATE" };
}

/** Classified, latest item per check identity ({@link latestPerCheck}). */
export function classifyRollup(items: readonly RawRollupItem[] | null | undefined): ClassifiedCheck[] {
  return latestPerCheck((items ?? []).map(classifyRollupItem));
}

/**
 * Check identity: CheckRun = workflow + name (two workflows may both have a `test` job);
 * StatusContext = context. GitHub's `workflowName` carries no event, so runs of one workflow
 * from different events share an identity here; the Actions part of the gate
 * (`evaluateActionsRuns`) still judges the latest run per workflow + event.
 */
function checkIdentity(c: ClassifiedCheck): string {
  return c.kind === "CheckRun"
    ? `CheckRun\u0000${c.workflow ?? ""}\u0000${c.name}`
    : `StatusContext\u0000${c.name}`;
}

/**
 * Keep the latest item per check identity, like GitHub's merge box, which shows the latest
 * result of each check. "Latest" = the item that started last (`startedAt`; a re-run starts
 * after the run it repeats), ties broken by `completedAt` (an in-flight item with no
 * `completedAt` is newest). Its verdict stands: a newer pending item is pending, a newer
 * failure fails even after an earlier pass.
 *
 * Fail closed when the order is unknown: if any item of an identity lacks `startedAt`
 * (e.g. queued, or an older gh), or the latest items tie exactly, every item of that
 * identity is kept — so any failure among them still fails and any pending still waits.
 */
export function latestPerCheck(checks: readonly ClassifiedCheck[]): ClassifiedCheck[] {
  const groups = new Map<string, ClassifiedCheck[]>();
  for (const c of checks) {
    const key = checkIdentity(c);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [c]);
    else group.push(c);
  }
  const out: ClassifiedCheck[] = [];
  for (const group of groups.values()) {
    if (group.length === 1 || group.some((c) => (c.startedAt ?? null) === null)) {
      out.push(...group);
      continue;
    }
    const sorted = [...group].sort(compareRecency);
    const newest = sorted[sorted.length - 1]!;
    out.push(...sorted.filter((c) => compareRecency(c, newest) === 0));
  }
  return out;
}

/** Ascending recency: `startedAt`, then `completedAt` (missing = still running = newest). */
function compareRecency(a: ClassifiedCheck, b: ClassifiedCheck): number {
  const started = (a.startedAt ?? 0) - (b.startedAt ?? 0);
  if (started !== 0) return started;
  const ac = a.completedAt ?? Number.POSITIVE_INFINITY;
  const bc = b.completedAt ?? Number.POSITIVE_INFINITY;
  return ac === bc ? 0 : ac < bc ? -1 : 1;
}

/** Exact name, or a `*` glob (e.g. `lint*`, `* · linux`). */
export function checkNameMatches(name: string, pattern: string): boolean {
  const p = pattern.trim();
  if (p.length === 0) return false;
  if (!p.includes("*")) return name === p;
  const re = new RegExp(
    `^${p
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  return re.test(name);
}

export type CheckGateState = "green" | "pending" | "red";

export interface CheckGateResult {
  readonly state: CheckGateState;
  readonly failed: readonly ClassifiedCheck[];
  readonly pending: readonly ClassifiedCheck[];
  readonly passed: readonly ClassifiedCheck[];
  /** Required patterns with no matching check in the rollup. */
  readonly missingRequired: readonly string[];
}

/**
 * Evaluate classified checks against optional required patterns.
 * - any failed → red
 * - any pending, or a required check not (yet) present → pending
 * - otherwise green (including "no checks at all" when nothing is required)
 */
/**
 * Check runs GitHub suffixes with " (dynamic)" belong to dynamic workflows (see
 * `isDynamicRun` in github-actions-gate.ts), not to the commit's CI: dropped unless a required
 * check pattern names them.
 */
export function withoutDynamicChecks(
  checks: readonly ClassifiedCheck[],
  requiredChecks: readonly string[] = [],
): ClassifiedCheck[] {
  return checks.filter(
    (c) =>
      !(c.kind === "CheckRun" && c.name.endsWith(" (dynamic)")) ||
      requiredChecks.some((p) => checkNameMatches(c.name, p)),
  );
}

export function evaluateCheckGate(
  checks: readonly ClassifiedCheck[],
  requiredChecks: readonly string[] = [],
): CheckGateResult {
  const failed = checks.filter((c) => c.verdict === "failed");
  const pending = checks.filter((c) => c.verdict === "pending");
  const passed = checks.filter((c) => c.verdict === "passed");
  const missingRequired = requiredChecks
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !checks.some((c) => checkNameMatches(c.name, p)));

  let state: CheckGateState = "green";
  if (failed.length > 0) state = "red";
  else if (pending.length > 0 || missingRequired.length > 0) state = "pending";

  return { state, failed, pending, passed, missingRequired };
}

function describe(c: ClassifiedCheck): string {
  return `"${c.name}" (${c.detail})`;
}

/** Human-readable lines for a refused merge. */
export function formatCheckGateProblems(gate: CheckGateResult): string[] {
  const lines: string[] = [];
  if (gate.failed.length > 0) {
    lines.push(`failed checks: ${gate.failed.map(describe).join(", ")}`);
  }
  if (gate.pending.length > 0) {
    lines.push(`checks still pending: ${gate.pending.map(describe).join(", ")}`);
  }
  for (const p of gate.missingRequired) {
    lines.push(`required check "${p}" never ran`);
  }
  return lines;
}
