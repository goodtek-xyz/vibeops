import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, test } from "node:test";

import {
  checkNameMatches,
  classifyRollupItem,
  evaluateCheckGate,
} from "../dist/lib/check-rollup.js";
import { buildConfig, readConfig } from "../dist/lib/config.js";
import {
  MERGE_GATE_DEFAULTS,
  MergeConfigError,
  parseMergeConfig,
} from "../dist/lib/merge-config.js";
import { pipelineGateState, pipelineStatusFromHost } from "../dist/lib/merge-request-readiness.js";
import { errorBackoffMs, MergeGateError, mergeMergeRequest } from "../dist/lib/pr-create.js";
import {
  evaluateActionsRuns,
  ignoredByFilter,
  includedByFilter,
  workflowExpectedForPullRequest,
} from "../dist/lib/github-actions-gate.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Fake `gh` / `glab` on PATH: `pr view` / `mr view` return the next queued
// response (last one repeats); `pr merge` / `mr merge` append argv to a log.
// If `<state>/merge-fail` holds N > 0, the merge fails with HTTP 405 and N--.
// `gh api <path>`: first route in `<state>/api.json` whose regex matches the
// path answers with its next queued response (last repeats); `{ "status": 404 }`
// → HTTP 404, `{ "raw": "…" }` → raw text, anything else → JSON. Defaults: no
// `.github/workflows`, no workflow runs. Every call is appended to `events.log`.
// ---------------------------------------------------------------------------

const binDir = mkdtempSync(join(tmpdir(), "vibeops-fake-host-"));
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.FAKE_HOST_DIR;
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake 1.0"); process.exit(0); }
const event = (line) => fs.appendFileSync(dir + "/events.log", line + "\\n");
if (args[0] === "api") {
  const path = args[args.length - 1];
  const routesPath = dir + "/api.json";
  const routes = fs.existsSync(routesPath) ? JSON.parse(fs.readFileSync(routesPath, "utf8")) : [];
  const defaults = [
    ["/actions/runs[?]", [{ total_count: 0, workflow_runs: [] }]],
    ["/actions/workflows[?]", [{ total_count: 0, workflows: [] }]],
  ];
  let answer = { status: 404 };
  for (const [i, [re, responses]] of [...routes, ...defaults].entries()) {
    if (!new RegExp(re).test(path)) continue;
    const cPath = dir + "/api-counter-" + i;
    const n = fs.existsSync(cPath) ? Number(fs.readFileSync(cPath, "utf8")) : 0;
    fs.writeFileSync(cPath, String(n + 1));
    answer = responses[Math.min(n, responses.length - 1)];
    break;
  }
  event("api " + path);
  if (answer && answer.status === 404) {
    process.stderr.write("gh: Not Found (HTTP 404)");
    process.exit(1);
  }
  process.stdout.write(answer && typeof answer.raw === "string" ? answer.raw : JSON.stringify(answer));
  process.exit(0);
}
if (args[1] === "view") {
  const views = JSON.parse(fs.readFileSync(dir + "/views.json", "utf8"));
  const counterPath = dir + "/counter";
  const i = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
  fs.writeFileSync(counterPath, String(i + 1));
  event("view " + i);
  process.stdout.write(JSON.stringify(views[Math.min(i, views.length - 1)]));
  process.exit(0);
}
if (args[1] === "merge") {
  event("merge");
  fs.appendFileSync(dir + "/merge.log", JSON.stringify(args) + "\\n");
  const failPath = dir + "/merge-fail";
  const left = fs.existsSync(failPath) ? Number(fs.readFileSync(failPath, "utf8")) : 0;
  if (left > 0) {
    fs.writeFileSync(failPath, String(left - 1));
    process.stderr.write("PUT merge: 405 Method Not Allowed");
    process.exit(1);
  }
  process.exit(0);
}
process.stderr.write("fake host: unsupported " + args.join(" "));
process.exit(2);
`;
for (const name of ["gh", "glab"]) {
  const p = join(binDir, name);
  writeFileSync(p, FAKE);
  chmodSync(p, 0o755);
}
process.env.PATH = `${binDir}:${process.env.PATH}`;

let stateDir;
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "vibeops-fake-state-"));
  process.env.FAKE_HOST_DIR = stateDir;
});

function queueViews(views) {
  writeFileSync(join(stateDir, "views.json"), JSON.stringify(views));
}

function failNextMerges(n) {
  writeFileSync(join(stateDir, "merge-fail"), String(n));
}

function mergeCalls() {
  const p = join(stateDir, "merge.log");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

function viewCount() {
  const p = join(stateDir, "counter");
  return existsSync(p) ? Number(readFileSync(p, "utf8")) : 0;
}

// Shapes match `gh pr view --json state,mergeable,headRefOid,statusCheckRollup`.
const checkRun = (name, status, conclusion) => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  workflowName: "wf",
  detailsUrl: "https://example.invalid",
});
const statusContext = (context, state) => ({
  __typename: "StatusContext",
  context,
  state,
  targetUrl: "https://example.invalid",
});
const ghPr = (rollup, extra = {}) => ({
  state: "OPEN",
  mergedAt: null,
  mergeCommit: null,
  mergeable: "MERGEABLE",
  headRefOid: "abc123",
  statusCheckRollup: rollup,
  ...extra,
});

// Success paths end as soon as the fake host reports green (event-driven); the timeout only
// bounds a broken run. Tests that exercise the timeout set a small `timeoutMs` explicitly.
const FAST = { timeoutMs: 30_000, intervalMs: 10, emptyRollupGraceMs: 0 };
const URL = "https://github.com/o/r/pull/7";

async function merge(extra = {}) {
  return mergeMergeRequest({
    cwd: process.cwd(),
    host: "github",
    url: URL,
    method: "squash",
    waitForCi: true,
    ...extra,
    gate: { ...FAST, ...(extra.gate ?? {}) },
  });
}

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

test("classifyRollupItem: CheckRun uses status/conclusion (no state field)", () => {
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "SUCCESS")).verdict, "passed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "NEUTRAL")).verdict, "passed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "SKIPPED")).verdict, "passed");
  for (const c of [
    "FAILURE",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
    "STALE",
  ]) {
    assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", c)).verdict, "failed", c);
  }
  for (const s of ["QUEUED", "IN_PROGRESS", "WAITING", "PENDING", "REQUESTED"]) {
    assert.equal(classifyRollupItem(checkRun("a", s, null)).verdict, "pending", s);
  }
  // Missing / undocumented values fail closed.
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", null)).verdict, "failed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "BRAND_NEW")).verdict, "failed");
  assert.equal(classifyRollupItem(checkRun("a", "SOMETHING_ELSE", null)).verdict, "failed");
  assert.equal(classifyRollupItem({ __typename: "CheckRun", name: "a" }).verdict, "failed");
});

test("classifyRollupItem: StatusContext uses state", () => {
  assert.equal(classifyRollupItem(statusContext("ci", "SUCCESS")).verdict, "passed");
  assert.equal(classifyRollupItem(statusContext("ci", "PENDING")).verdict, "pending");
  assert.equal(classifyRollupItem(statusContext("ci", "EXPECTED")).verdict, "pending");
  assert.equal(classifyRollupItem(statusContext("ci", "FAILURE")).verdict, "failed");
  assert.equal(classifyRollupItem(statusContext("ci", "ERROR")).verdict, "failed");
  assert.equal(classifyRollupItem(statusContext("ci", "SUCCESS")).name, "ci");
  assert.equal(classifyRollupItem(statusContext("ci", "WEIRD")).verdict, "failed");
  assert.equal(classifyRollupItem({ __typename: "StatusContext", context: "ci" }).verdict, "failed");
});

test("checkNameMatches: exact and * glob", () => {
  assert.equal(checkNameMatches("lint · unit", "lint · unit"), true);
  assert.equal(checkNameMatches("lint · unit", "lint"), false);
  assert.equal(checkNameMatches("lint · e2e", "lint*"), true);
  assert.equal(checkNameMatches("build · linux", "* · linux"), true);
  assert.equal(checkNameMatches("a.b (x)", "a.b (x)"), true);
  assert.equal(checkNameMatches("aXb", "a.b"), false);
});

test("evaluateCheckGate: red beats pending; missing required is pending", () => {
  const ok = classifyRollupItem(checkRun("A", "COMPLETED", "SUCCESS"));
  const bad = classifyRollupItem(checkRun("B", "COMPLETED", "FAILURE"));
  const wait = classifyRollupItem(checkRun("C", "IN_PROGRESS", null));
  assert.equal(evaluateCheckGate([ok, bad, wait]).state, "red");
  assert.equal(evaluateCheckGate([ok, wait]).state, "pending");
  assert.equal(evaluateCheckGate([ok]).state, "green");
  assert.equal(evaluateCheckGate([]).state, "green");
  const missing = evaluateCheckGate([ok], ["A", "Z*"]);
  assert.equal(missing.state, "pending");
  assert.deepEqual(missing.missingRequired, ["Z*"]);
});

test("evaluateCheckGate: duplicate check names — any failure fails", () => {
  const pass = classifyRollupItem(checkRun("build", "COMPLETED", "SUCCESS"));
  const fail = classifyRollupItem(checkRun("build", "COMPLETED", "FAILURE"));
  assert.equal(evaluateCheckGate([pass, fail], ["build"]).state, "red");
  assert.equal(evaluateCheckGate([fail, pass], ["build"]).state, "red");
});

test("GitLab pipeline mapping: manual / unknown are red, scheduled is pending", () => {
  assert.equal(pipelineGateState(pipelineStatusFromHost("success")), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost("skipped")), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost(null)), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost("running")), "pending");
  assert.equal(pipelineGateState(pipelineStatusFromHost("scheduled")), "pending");
  assert.equal(pipelineGateState(pipelineStatusFromHost("failed")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("canceled")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("manual")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("something_new")), "red");
});

// ---------------------------------------------------------------------------
// merge config validation (fail closed)
// ---------------------------------------------------------------------------

test("parseMergeConfig: absent block → documented defaults", () => {
  assert.deepEqual(parseMergeConfig(undefined), MERGE_GATE_DEFAULTS);
  // GitHub-hosted job limit (6 h); no empty-rollup grace (external CI → requiredChecks).
  assert.equal(MERGE_GATE_DEFAULTS.waitTimeoutSeconds, 21_600);
  assert.equal(MERGE_GATE_DEFAULTS.pollIntervalSeconds, 10);
  assert.equal(MERGE_GATE_DEFAULTS.emptyRollupGraceSeconds, 0);
  assert.equal(MERGE_GATE_DEFAULTS.allowNoChecks, false);
});

test("parseMergeConfig: valid block", () => {
  const cfg = parseMergeConfig({
    requiredChecks: [" build ", "lint*"],
    releaseRequiredChecks: ["release smoke"],
    waitTimeoutSeconds: 120,
    pollIntervalSeconds: 3,
    emptyRollupGraceSeconds: 0,
    allowNoChecks: true,
  });
  assert.deepEqual(cfg, {
    requiredChecks: ["build", "lint*"],
    releaseRequiredChecks: ["release smoke"],
    waitTimeoutSeconds: 120,
    pollIntervalSeconds: 3,
    emptyRollupGraceSeconds: 0,
    allowNoChecks: true,
  });
});

test("parseMergeConfig: malformed blocks throw MergeConfigError naming the key", () => {
  const bad = [
    [null, /must be an object/],
    ["build", /must be an object/],
    [["build"], /must be an object/],
    [{ requiredChecks: "build" }, /`requiredChecks` must be an array/],
    [{ requiredChecks: ["build", 3] }, /`requiredChecks\[1\]` must be a non-empty string/],
    [{ requiredChecks: ["build", "  "] }, /`requiredChecks\[1\]` must be a non-empty string/],
    [{ releaseRequiredChecks: {} }, /`releaseRequiredChecks` must be an array/],
    [{ requiredCheck: ["build"] }, /unknown key `requiredCheck`/],
    [{ waitTimeoutSeconds: 0 }, /`waitTimeoutSeconds` must be an integer between 1 and 432000/],
    [{ waitTimeoutSeconds: 1.5 }, /`waitTimeoutSeconds`/],
    [{ waitTimeoutSeconds: "60" }, /`waitTimeoutSeconds`/],
    [{ waitTimeoutSeconds: 432_001 }, /`waitTimeoutSeconds`/],
    [{ pollIntervalSeconds: 0 }, /`pollIntervalSeconds` must be an integer between 1 and 432000/],
    [{ emptyRollupGraceSeconds: -1 }, /`emptyRollupGraceSeconds` must be an integer between 0 and 432000/],
    [{ waitTimeoutSeconds: 10, emptyRollupGraceSeconds: 20 }, /`emptyRollupGraceSeconds` must not exceed `waitTimeoutSeconds`/],
    [{ waitTimeoutSeconds: 10, pollIntervalSeconds: 20 }, /must not exceed `waitTimeoutSeconds`/],
    [{ allowNoChecks: "yes" }, /`allowNoChecks` must be true or false/],
  ];
  for (const [raw, re] of bad) {
    assert.throws(
      () => parseMergeConfig(raw),
      (e) => e instanceof MergeConfigError && re.test(e.message),
      JSON.stringify(raw),
    );
  }
});

test("re-init preserves the raw merge block verbatim", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-cfg-"));
  const merge = { requiredChecks: ["build"], allowNoChecks: false };
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "2.6.0",
      schemaVersion: 1,
      createdAt: "2026-10-03T00:00:00Z",
      clients: ["cursor"],
      merge,
    }),
  );
  const existing = await readConfig(dir);
  const rebuilt = buildConfig(
    "x",
    ["cursor"],
    { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    existing,
  );
  assert.deepEqual(rebuilt.merge, merge);
});

// ---------------------------------------------------------------------------
// mergeMergeRequest with fake gh
// ---------------------------------------------------------------------------

test("merge: CheckRun FAILURE refuses (no merge call), names the check", async () => {
  queueViews([
    ghPr([checkRun("lint", "COMPLETED", "SUCCESS"), checkRun("build", "COMPLETED", "FAILURE")]),
  ]);
  await assert.rejects(merge(), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /failed checks: "build" \(FAILURE\)/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
  // Fail fast: no waiting on a red check.
  assert.equal(viewCount(), 1);
});

test("merge: CheckRun SUCCESS + StatusContext SUCCESS merges pinned to head sha", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "SUCCESS")]),
  ]);
  await merge();
  assert.deepEqual(mergeCalls(), [
    ["pr", "merge", "7", "--squash", "--match-head-commit", "abc123"],
  ]);
});

test("merge: duplicate check name with one failure refuses", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), checkRun("build", "COMPLETED", "FAILURE")]),
  ]);
  await assert.rejects(merge({ requiredChecks: ["build"] }), /"build" \(FAILURE\)/);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: pending then success merges after waiting", async () => {
  queueViews([
    ghPr([checkRun("build", "QUEUED", null), statusContext("ext/ci", "PENDING")]),
    ghPr([checkRun("build", "IN_PROGRESS", null), statusContext("ext/ci", "SUCCESS")]),
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "SUCCESS")]),
  ]);
  await merge();
  // 3 polls + 1 head re-read right before merging.
  assert.equal(viewCount(), 4);
  assert.equal(mergeCalls().length, 1);
});

test("merge: pending that never finishes refuses after timeout", async () => {
  queueViews([ghPr([checkRun("build", "IN_PROGRESS", null)])]);
  await assert.rejects(merge({ gate: { timeoutMs: 60 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /checks still pending: "build" \(IN_PROGRESS\)/);
    assert.match(e.message, /gave up after/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("merge: pending without waitForCi refuses immediately", async () => {
  queueViews([ghPr([checkRun("build", "IN_PROGRESS", null)])]);
  await assert.rejects(merge({ waitForCi: false }), MergeGateError);
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: missing required check refuses with 'never ran'", async () => {
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await assert.rejects(
    merge({ requiredChecks: ["build", "lint*"], gate: { timeoutMs: 60 } }),
    (e) => {
      assert.ok(e instanceof MergeGateError);
      assert.match(e.message, /required check "lint\*" never ran/);
      return true;
    },
  );
  assert.deepEqual(mergeCalls(), []);
});

test("merge: required check that appears later merges", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS")]),
    ghPr([
      checkRun("build", "COMPLETED", "SUCCESS"),
      checkRun("lint · unit", "COMPLETED", "SUCCESS"),
    ]),
  ]);
  await merge({ requiredChecks: ["build", "lint*"] });
  assert.equal(mergeCalls().length, 1);
});

test("merge: NEUTRAL and SKIPPED pass", async () => {
  queueViews([
    ghPr([
      checkRun("lint", "COMPLETED", "NEUTRAL"),
      checkRun("preview", "COMPLETED", "SKIPPED"),
      checkRun("build", "COMPLETED", "SUCCESS"),
    ]),
  ]);
  await merge();
  assert.equal(mergeCalls().length, 1);
});

test("merge: mixed — green CheckRuns but StatusContext ERROR refuses", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "ERROR")]),
  ]);
  await assert.rejects(merge(), /"ext\/ci" \(ERROR\)/);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: mixed — CANCELLED + still running refuses immediately (red beats pending)", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "CANCELLED"), checkRun("e2e", "IN_PROGRESS", null)]),
  ]);
  await assert.rejects(merge(), (e) => {
    assert.match(e.message, /failed checks: "build" \(CANCELLED\)/);
    assert.match(e.message, /checks still pending: "e2e" \(IN_PROGRESS\)/);
    return true;
  });
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: empty rollup waits through the grace window, then merges once checks appear", async () => {
  queueViews([ghPr([]), ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await merge({ gate: { emptyRollupGraceMs: 5_000 } });
  assert.equal(viewCount(), 3);
  assert.equal(mergeCalls().length, 1);
});

test("merge: no checks after grace refuses by default (fail closed)", async () => {
  queueViews([ghPr([])]);
  await assert.rejects(merge({ gate: { emptyRollupGraceMs: 30 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /reports no checks/);
    assert.match(e.message, /merge\.allowNoChecks/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("merge: no checks with allowNoChecks merges and warns exactly once", async () => {
  // Several polls before the host reports mergeable: the warning must not repeat.
  queueViews([
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([]),
  ]);
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    // Event-driven: the gate returns as soon as the 4th view reports MERGEABLE; the
    // generous timeout only bounds a broken run (each poll spawns a fake gh process).
    await merge({ gate: { allowNoChecks: true, timeoutMs: 60_000 } });
  } finally {
    console.warn = original;
  }
  assert.equal(viewCount(), 5);
  assert.equal(mergeCalls().length, 1);
  assert.equal(warnings.filter((w) => w.includes("with NO checks")).length, 1);
});

test("merge: no checks + requiredChecks refuses with 'never ran' even if allowNoChecks", async () => {
  queueViews([ghPr([])]);
  await assert.rejects(
    merge({ requiredChecks: ["build"], gate: { allowNoChecks: true, timeoutMs: 60 } }),
    /required check "build" never ran/,
  );
  assert.deepEqual(mergeCalls(), []);
});

test("merge: already merged PR does not call gh pr merge", async () => {
  queueViews([
    ghPr([], { state: "MERGED", mergedAt: "2026-10-03T00:00:00Z", mergeable: "UNKNOWN" }),
  ]);
  await merge();
  assert.deepEqual(mergeCalls(), []);
});

test("merge: conflicting PR refuses", async () => {
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { mergeable: "CONFLICTING" })]);
  await assert.rejects(merge(), /merge conflicts/);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: gh output missing statusCheckRollup fails closed immediately", async () => {
  const pr = ghPr([]);
  delete pr.statusCheckRollup;
  queueViews([pr]);
  await assert.rejects(merge(), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /`statusCheckRollup` is missing or not a list/);
    return true;
  });
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

for (const [label, value] of [
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
]) {
  test(`merge: gh headRefOid ${label} fails closed (never merges unpinned)`, async () => {
    const pr = ghPr([checkRun("build", "COMPLETED", "SUCCESS")]);
    if (value === undefined) delete pr.headRefOid;
    else pr.headRefOid = value;
    queueViews([pr]);
    await assert.rejects(merge(), /`headRefOid` is missing or empty/);
    assert.deepEqual(mergeCalls(), []);
  });
}

test("merge: gh mergeable null fails closed", async () => {
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { mergeable: null })]);
  await assert.rejects(merge(), /`mergeable` is missing or empty/);
  assert.deepEqual(mergeCalls(), []);
});

// ---------------------------------------------------------------------------
// GitLab path (fake glab)
// ---------------------------------------------------------------------------

const glMr = (pipelineStatus, extra = {}) => ({
  state: "opened",
  merged_at: null,
  merge_status: "can_be_merged",
  detailed_merge_status: "mergeable",
  has_conflicts: false,
  head_pipeline: pipelineStatus === null ? null : { status: pipelineStatus },
  sha: "def456",
  ...extra,
});

async function mergeGitLab(extra = {}) {
  return mergeMergeRequest({
    cwd: process.cwd(),
    host: "gitlab",
    url: "https://gitlab.com/o/r/-/merge_requests/9",
    method: "squash",
    waitForCi: true,
    ...extra,
    gate: { ...FAST, ...(extra.gate ?? {}) },
  });
}

const GL_MERGE = ["mr", "merge", "9", "--auto-merge=false", "--sha", "def456", "--squash"];

test("gitlab: failed pipeline refuses", async () => {
  queueViews([glMr("failed")]);
  await assert.rejects(mergeGitLab(), /head pipeline is failed/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: manual pipeline refuses (previously treated as mergeable)", async () => {
  queueViews([glMr("manual")]);
  await assert.rejects(mergeGitLab(), /head pipeline is manual/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: running then success merges immediately, pinned with --sha", async () => {
  queueViews([
    glMr("running", { detailed_merge_status: "ci_still_running" }),
    glMr("success"),
  ]);
  await mergeGitLab();
  assert.deepEqual(mergeCalls(), [GL_MERGE]);
});

test("gitlab: 405 re-runs the gate and retries with the same flags (still --auto-merge=false)", async () => {
  queueViews([glMr("success")]);
  failNextMerges(1);
  await mergeGitLab();
  assert.deepEqual(mergeCalls(), [GL_MERGE, GL_MERGE]);
  // Each gate run: one poll + one head re-read.
  assert.equal(viewCount(), 4);
});

test("gitlab: 405 twice propagates the error (no auto-merge fallback)", async () => {
  queueViews([glMr("success")]);
  failNextMerges(2);
  await assert.rejects(mergeGitLab(), /405/);
  assert.deepEqual(mergeCalls(), [GL_MERGE, GL_MERGE]);
});

test("gitlab: missing sha fails closed", async () => {
  queueViews([glMr("success", { sha: null })]);
  await assert.rejects(mergeGitLab(), /`sha` is missing or empty/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: no pipeline refuses by default, merges with allowNoChecks", async () => {
  queueViews([glMr(null)]);
  await assert.rejects(mergeGitLab(), /reports no checks/);
  assert.deepEqual(mergeCalls(), []);
  await mergeGitLab({ gate: { allowNoChecks: true } });
  assert.deepEqual(mergeCalls(), [GL_MERGE]);
});

// ---------------------------------------------------------------------------
// CLI: config errors and release dry-run
// ---------------------------------------------------------------------------

function projectWithMerge(merge) {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-cli-"));
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "2.6.0",
      schemaVersion: 1,
      createdAt: "2026-10-03T00:00:00Z",
      clients: ["cursor"],
      git: {
        remote: "origin",
        host: "github",
        integrationBranch: "develop",
        productionBranch: "main",
      },
      ...(merge === undefined ? {} : { merge }),
    }),
  );
  return dir;
}

function runCli(args) {
  try {
    const stdout = execFileSync("node", [join(repoRoot, "dist/cli.js"), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("cli: task release --dry-run shows releaseRequiredChecks", () => {
  const dir = projectWithMerge({ releaseRequiredChecks: ["release smoke", "lint*"] });
  const r = runCli(["task", "release", "--dry-run", "--cwd", dir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /required checks \(by name, in addition\): release smoke, lint\*/);
});

test("cli: invalid merge config makes task merge / release exit 1 naming the key", () => {
  const dir = projectWithMerge({ requiredCheck: ["build"] });
  for (const cmd of [
    ["task", "merge"],
    ["task", "release"],
  ]) {
    const r = runCli([...cmd, "--dry-run", "--cwd", dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /unknown key `requiredCheck`/);
  }
});

// ---------------------------------------------------------------------------
// GitHub Actions: checks from other events must not stand in for the PR's CI
// (observed: release PR merged 5 s after opening on the green checks of an
// earlier `push` workflow, before its own `pull_request` run had any job).
// ---------------------------------------------------------------------------

function routeApi(routes) {
  writeFileSync(join(stateDir, "api.json"), JSON.stringify(routes));
}

function events() {
  const p = join(stateDir, "events.log");
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n") : [];
}

const CI_YML = "name: CI\non:\n  pull_request:\n  push:\n    branches: [main]\njobs: {}\n";
const workflowsDir = (files) => [
  "/contents/\\.github/workflows[?]ref=",
  [files.map((f) => ({ type: "file", path: `.github/workflows/${f}` }))],
];
const workflowFile = (file, yml) => [`/contents/\\.github/workflows/${file}[?]`, [{ raw: yml }]];
const run = (id, event, status, conclusion, path = ".github/workflows/ci.yml") => ({
  id,
  name: path.endsWith("cd.yml") ? "CD" : "CI",
  path,
  event,
  status,
  conclusion,
});
const runs = (...lists) => ["/actions/runs[?]head_sha=abc123", lists.map((l) => ({
  total_count: l.length,
  workflow_runs: l,
}))];
// Rollup made only of the finished checks of an earlier push workflow.
const PUSH_CHECKS = [checkRun("Gate · lint & build", "COMPLETED", "SUCCESS")];
const PUSH_RUN = run(1, "push", "completed", "success", ".github/workflows/cd.yml");

test("actions: green push checks do not merge before the PR's pull_request run exists and passes", async () => {
  routeApi([
    workflowsDir(["ci.yml", "cd.yml"]),
    workflowFile("ci.yml", CI_YML),
    workflowFile("cd.yml", "on:\n  push:\n    branches: [develop]\njobs: {}\n"),
    runs(
      [PUSH_RUN],
      [PUSH_RUN, run(2, "pull_request", "queued", null)],
      [PUSH_RUN, run(2, "pull_request", "in_progress", null)],
      [PUSH_RUN, run(2, "pull_request", "completed", "success")],
    ),
  ]);
  queueViews([ghPr(PUSH_CHECKS)]);
  await merge();
  const ev = events();
  const runReads = ev.filter((e) => e.includes("/actions/runs?"));
  assert.equal(runReads.length, 4, ev.join("\n"));
  // Merge only after the 4th runs read (pull_request run completed/success).
  assert.ok(ev.indexOf("merge") > ev.lastIndexOf(runReads[3]), ev.join("\n"));
  assert.deepEqual(mergeCalls(), [
    ["pr", "merge", "7", "--squash", "--match-head-commit", "abc123"],
  ]);
});

test("actions: required check satisfied only by a push-event check still waits for the PR run", async () => {
  routeApi([
    workflowsDir(["ci.yml"]),
    workflowFile("ci.yml", CI_YML),
    runs([PUSH_RUN], [PUSH_RUN, run(2, "pull_request", "completed", "success")]),
  ]);
  queueViews([ghPr(PUSH_CHECKS)]);
  await merge({ requiredChecks: ["Gate · lint & build"] });
  const ev = events();
  assert.equal(ev.filter((e) => e.includes("/actions/runs?")).length, 2, ev.join("\n"));
  assert.equal(mergeCalls().length, 1);
});

test("actions: expected pull_request run that never starts refuses after the timeout", async () => {
  routeApi([workflowsDir(["ci.yml"]), workflowFile("ci.yml", CI_YML), runs([PUSH_RUN])]);
  queueViews([ghPr(PUSH_CHECKS)]);
  await assert.rejects(merge({ gate: { timeoutMs: 80 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(
      e.message,
      /workflow \.github\/workflows\/ci\.yml \(pull_request\) has not started for abc123 yet \(gave up after/,
    );
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("actions: no checks yet but a PR workflow is expected → waits (no grace refusal), then merges", async () => {
  routeApi([
    workflowsDir(["ci.yml"]),
    workflowFile("ci.yml", CI_YML),
    runs([], [run(2, "pull_request", "completed", "success")]),
  ]);
  queueViews([ghPr([]), ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await merge({ gate: { emptyRollupGraceMs: 0 } });
  assert.equal(mergeCalls().length, 1);
});

test("actions: failed run without any check run (startup_failure) refuses immediately", async () => {
  routeApi([
    workflowsDir(["ci.yml"]),
    workflowFile("ci.yml", CI_YML),
    runs([PUSH_RUN, run(2, "pull_request", "completed", "startup_failure")]),
  ]);
  queueViews([ghPr(PUSH_CHECKS)]);
  await assert.rejects(merge(), /workflow "CI" \(pull_request\) concluded startup_failure/);
  assert.deepEqual(mergeCalls(), []);
  assert.equal(viewCount(), 1);
});

test("actions: fork run awaiting approval refuses with action_required", async () => {
  routeApi([
    workflowsDir(["ci.yml"]),
    workflowFile("ci.yml", CI_YML),
    runs([run(2, "pull_request", "completed", "action_required")]),
  ]);
  queueViews([ghPr([])]);
  await assert.rejects(merge(), /needs approval \(action_required\)/);
  assert.deepEqual(mergeCalls(), []);
});

test("actions: workflows filtered out by branches / paths are not awaited", async () => {
  routeApi([
    workflowsDir(["only-develop.yml", "src-only.yml", "labels.yml", "disabled.yml"]),
    workflowFile("only-develop.yml", "on:\n  pull_request:\n    branches: [develop]\n"),
    workflowFile("src-only.yml", "on:\n  pull_request:\n    paths: ['src/**', '!src/**/*.md']\n"),
    workflowFile("labels.yml", "on:\n  pull_request:\n    types: [labeled]\n"),
    workflowFile("disabled.yml", "on: pull_request\n"),
    [
      "/actions/workflows[?]",
      [{ workflows: [{ path: ".github/workflows/disabled.yml", state: "disabled_manually" }] }],
    ],
    ["/pulls/7/files[?]", [[{ filename: "docs/a.md" }, { filename: "src/x/readme.md" }]]],
  ]);
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { baseRefName: "main" })]);
  await merge();
  assert.equal(mergeCalls().length, 1);
});

test("actions: running run from another event on the head commit blocks until it finishes", async () => {
  routeApi([
    runs(
      [run(1, "push", "in_progress", null, ".github/workflows/cd.yml")],
      [run(1, "push", "completed", "success", ".github/workflows/cd.yml")],
    ),
  ]);
  queueViews([ghPr(PUSH_CHECKS)]);
  await merge();
  assert.equal(events().filter((e) => e.includes("/actions/runs?")).length, 2);
  assert.equal(mergeCalls().length, 1);
});

test("actions: head moving while checks are read re-checks the new head and pins it", async () => {
  routeApi([
    ["/actions/runs[?]head_sha=abc123", [{ workflow_runs: [] }]],
    ["/actions/runs[?]head_sha=def999", [{ workflow_runs: [] }]],
  ]);
  const green = [checkRun("build", "COMPLETED", "SUCCESS")];
  queueViews([ghPr(green), ghPr(green, { headRefOid: "def999" })]);
  await merge();
  assert.deepEqual(mergeCalls(), [
    ["pr", "merge", "7", "--squash", "--match-head-commit", "def999"],
  ]);
  assert.ok(events().some((e) => e.includes("head_sha=def999")));
});

test("actions: unreadable Actions API keeps waiting, then refuses (never merges blind)", async () => {
  routeApi([["/actions/runs[?]", [{ not: "a runs payload" }]]]);
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await assert.rejects(merge({ gate: { timeoutMs: 80 } }), /could not read GitHub Actions runs/);
  assert.deepEqual(mergeCalls(), []);
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("filter patterns follow GitHub's cheat sheet", () => {
  assert.equal(includedByFilter(["main"], "main"), true);
  assert.equal(includedByFilter(["release/*"], "release/1.0"), true);
  assert.equal(includedByFilter(["release/*"], "release/1/0"), false);
  assert.equal(includedByFilter(["release/**"], "release/1/0"), true);
  assert.equal(includedByFilter(["feature/**", "!feature/wip-*"], "feature/wip-x"), false);
  assert.equal(includedByFilter(["!feature/wip-*", "feature/**"], "feature/wip-x"), true);
  assert.equal(includedByFilter(["v[12].*"], "v2.x"), true);
  assert.equal(includedByFilter(["*.jsx?"], "a.js"), true);
  assert.equal(includedByFilter(["*.jsx?"], "a.jsxx"), false);
  assert.equal(includedByFilter(["**.md"], "docs/a.md"), true);
  assert.equal(includedByFilter(["a.b"], "aXb"), false);
  assert.equal(ignoredByFilter(["docs/**"], "docs/x/y.md"), true);
});

test("workflowExpectedForPullRequest: trigger forms and filters", async () => {
  const ctx = (base = "main", files = ["src/a.ts"]) => ({
    baseBranch: base,
    changedFiles: async () => files,
  });
  const yes = async (yml, c = ctx()) => (await workflowExpectedForPullRequest(yml, c)).expected;
  assert.equal(await yes("on: pull_request\n"), true);
  assert.equal(await yes("on: [push, pull_request]\n"), true);
  assert.equal(await yes("on: push\n"), false);
  assert.equal(await yes("on:\n  pull_request_target:\n"), false);
  assert.equal(await yes("on:\n  workflow_call:\n"), false);
  assert.equal(await yes("on:\n  pull_request:\n    types: [opened, synchronize]\n"), true);
  assert.equal(await yes("on:\n  pull_request:\n    types: [closed]\n"), false);
  assert.equal(await yes("on:\n  pull_request:\n    branches: [main]\n"), true);
  assert.equal(await yes("on:\n  pull_request:\n    branches-ignore: [main]\n"), false);
  assert.equal(await yes("on:\n  pull_request:\n    paths-ignore: ['docs/**']\n", ctx("main", ["docs/a"])), false);
  assert.equal(await yes("on:\n  pull_request:\n    paths-ignore: ['docs/**']\n", ctx("main", ["docs/a", "x"])), true);
  // Unknown base branch → branch filters assumed to match (wait rather than skip).
  assert.equal(await yes("on:\n  pull_request:\n    branches: [develop]\n", ctx(null)), true);
  // GitHub turns unparsable workflows into failed runs → still awaited.
  assert.equal(await yes("on: [pull_request\n"), true);
});

test("evaluateActionsRuns: latest run per workflow + event decides; unknown fails closed", () => {
  const r = evaluateActionsRuns(
    [
      run(1, "pull_request", "completed", "failure"),
      run(5, "pull_request", "completed", "success"),
      run(3, "push", "completed", "skipped", ".github/workflows/cd.yml"),
      run(4, "push", "completed", "weird", ".github/workflows/x.yml"),
    ],
    [".github/workflows/ci.yml", ".github/workflows/lint.yml"],
  );
  assert.deepEqual(r.failed, ['workflow "CI" (push) concluded weird']);
  assert.deepEqual(r.pending, []);
  assert.deepEqual(r.missing, [".github/workflows/lint.yml"]);
});

test("errorBackoffMs: exponential with jitter, capped at 60 s", () => {
  for (let n = 0; n < 12; n++) {
    const d = errorBackoffMs(10_000, n);
    assert.ok(d >= 10_000 && d <= Math.min(60_000, 10_000 * 2 ** n), `${n}: ${d}`);
  }
});

// ---------------------------------------------------------------------------
// Stale base: the head the gate approved must contain <remote>/<base>
// (observed: a branch rebuilt with `git reset --soft <stale origin/develop>` was
// squash-merged after develop had moved and silently reverted other TASKs' work).
// ---------------------------------------------------------------------------

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const g = (cwd, ...args) => execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();

function commitFile(cwd, name, content) {
  writeFileSync(join(cwd, name), content);
  g(cwd, "add", "-A");
  g(cwd, "commit", "-q", "-m", `edit ${name}`);
  return g(cwd, "rev-parse", "HEAD");
}

/** Bare origin with `main`; `work` = clone whose origin/main is fetched at the start. */
function gitHost() {
  const root = mkdtempSync(join(tmpdir(), "vibeops-stale-"));
  const origin = join(root, "origin.git");
  g(root, "init", "-q", "--bare", "-b", "main", origin);
  const other = join(root, "other");
  g(root, "clone", "-q", origin, other);
  g(other, "switch", "-q", "-c", "main");
  commitFile(other, "a.txt", "a\n");
  g(other, "push", "-q", "origin", "main");
  const work = join(root, "work");
  g(root, "clone", "-q", origin, work);
  return { origin, other, work };
}

/** Another TASK lands on main (moves origin/main; `work` does not fetch). */
function landOnMain(other, name) {
  g(other, "switch", "-q", "main");
  g(other, "pull", "-q", "--ff-only", "origin", "main");
  commitFile(other, name, `${name}\n`);
  g(other, "push", "-q", "origin", "main");
}

const STALE = { remote: "origin", baseBranch: "main" };
const green = (headRefOid) => ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { headRefOid });

test("stale base: head containing origin/main merges (head fetched by sha from another clone)", async () => {
  const { other, work } = gitHost();
  g(other, "switch", "-q", "-c", "task/1");
  const head = commitFile(other, "t.txt", "t\n");
  g(other, "push", "-q", "origin", "task/1"); // `work` has never seen this commit
  queueViews([green(head)]);
  await merge({ cwd: work, requireBaseInHead: STALE });
  assert.deepEqual(mergeCalls(), [["pr", "merge", "7", "--squash", "--match-head-commit", head]]);
});

test("stale base: base moved after the branch started → refuses, no merge call", async () => {
  const { other, work } = gitHost();
  g(work, "switch", "-q", "-c", "task/2");
  const head = commitFile(work, "t.txt", "t\n");
  g(work, "push", "-q", "origin", "task/2");
  landOnMain(other, "b.txt");
  queueViews([green(head)]);
  await assert.rejects(merge({ cwd: work, requireBaseInHead: STALE }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /stale base: head \w{7} does not contain origin\/main \(1 commit\(s\) behind\)/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("stale base: branch rebuilt with reset --soft on a stale local origin/main is refused", async () => {
  const { other, work } = gitHost();
  g(work, "switch", "-q", "-c", "task/3");
  commitFile(work, "t.txt", "t1\n");
  commitFile(work, "t.txt", "t2\n");
  landOnMain(other, "b.txt"); // work's origin/main is now stale (no fetch)
  g(work, "reset", "-q", "--soft", "origin/main");
  g(work, "commit", "-q", "-m", "squashed");
  const head = g(work, "rev-parse", "HEAD");
  g(work, "push", "-q", "-f", "origin", "task/3");
  queueViews([green(head)]);
  await assert.rejects(merge({ cwd: work, requireBaseInHead: STALE }), /stale base/);
  assert.deepEqual(mergeCalls(), []);
});

test("stale base: unreadable remote fails closed (never merges unchecked)", async () => {
  const { work } = gitHost();
  const head = g(work, "rev-parse", "HEAD");
  g(work, "remote", "set-url", "origin", join(work, "missing.git"));
  queueViews([green(head)]);
  await assert.rejects(merge({ cwd: work, requireBaseInHead: STALE }), /could not fetch origin\/main/);
  assert.deepEqual(mergeCalls(), []);
});

test("stale base: without requireBaseInHead (task release) the check is not applied", async () => {
  const { other, work } = gitHost();
  g(work, "switch", "-q", "-c", "task/4");
  const head = commitFile(work, "t.txt", "t\n");
  g(work, "push", "-q", "origin", "task/4");
  landOnMain(other, "b.txt");
  queueViews([green(head)]);
  await merge({ cwd: work });
  assert.equal(mergeCalls().length, 1);
});

// ---------------------------------------------------------------------------
// After `gh pr merge` returns, the merge is confirmed by ONE read: GitHub's / GitLab's
// merge APIs answer synchronously (no polling for a result that is already known).
// ---------------------------------------------------------------------------

test("merge verify: one read — merged PR passes, open PR is reported without polling", async () => {
  const { assertMergeRequestMerged } = await import("../dist/lib/task-merge-verify.js");
  const verify = () =>
    assertMergeRequestMerged({ cwd: process.cwd(), host: "github", url: URL, integrationBranch: "develop" });

  queueViews([ghPr([], { state: "MERGED", mergedAt: "2026-10-17T00:00:00Z" })]);
  assert.deepEqual(await verify(), { ok: true });
  assert.equal(viewCount(), 1);

  writeFileSync(join(stateDir, "counter"), "0");
  queueViews([ghPr([], { state: "OPEN" })]);
  const started = Date.now();
  const r = await verify();
  assert.equal(r.ok, false);
  assert.match(r.message, /is open, not merged into develop \(merge queue or auto-merge pending\?\)/);
  assert.equal(viewCount(), 1, "read once");
  assert.ok(Date.now() - started < 5_000, "no waiting");
});

// ---------------------------------------------------------------------------
// Dependabot dynamic runs are not the commit's CI (observed: a PR with green CI refused
// because `dynamic/dependabot/dependabot-updates` on the same head failed; such a run
// cannot be re-run). GitHub: dynamic workflows are generated per run and not stored in
// `.github/workflows` (about-dependabot-on-github-actions-runners).
// ---------------------------------------------------------------------------

const DEPENDABOT_DYNAMIC = (id, status, conclusion) => ({
  id,
  name: "Dependabot Updates",
  path: "dynamic/dependabot/dependabot-updates",
  event: "dynamic",
  status,
  conclusion,
});

test("actions: a failed Dependabot dynamic run on the head does not block a green PR", async () => {
  routeApi([
    workflowsDir(["ci.yml"]),
    workflowFile("ci.yml", CI_YML),
    runs([
      run(1, "pull_request", "completed", "success"),
      DEPENDABOT_DYNAMIC(2, "completed", "failure"),
      DEPENDABOT_DYNAMIC(3, "in_progress", null),
    ]),
  ]);
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await merge();
  assert.deepEqual(mergeCalls(), [["pr", "merge", "7", "--squash", "--match-head-commit", "abc123"]]);
});

test("actions: dynamic runs alone do not count as CI (no checks → refused without allowNoChecks)", async () => {
  routeApi([runs([DEPENDABOT_DYNAMIC(2, "completed", "success")])]);
  queueViews([ghPr([])]);
  await assert.rejects(merge(), /no checks/i);
  assert.deepEqual(mergeCalls(), []);
});

test("checks: a failed '(dynamic)' check run is ignored unless required by name", async () => {
  const rollup = [
    checkRun("build", "COMPLETED", "SUCCESS"),
    checkRun("Dependabot (dynamic)", "COMPLETED", "FAILURE"),
  ];
  queueViews([ghPr(rollup)]);
  await merge();
  assert.equal(mergeCalls().length, 1);

  writeFileSync(join(stateDir, "counter"), "0");
  queueViews([ghPr(rollup)]);
  await assert.rejects(merge({ requiredChecks: ["Dependabot (dynamic)"] }), /failed checks: "Dependabot \(dynamic\)"/);
  assert.equal(mergeCalls().length, 1, "no second merge");
});

test("evaluateActionsRuns / isDynamicRun skip dynamic runs", () => {
  const r = evaluateActionsRuns([DEPENDABOT_DYNAMIC(2, "completed", "failure")], []);
  assert.deepEqual(r, { failed: [], pending: [], missing: [] });
});
