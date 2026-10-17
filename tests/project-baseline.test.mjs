import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BaselineConfigError,
  parseBaselineConfig,
  preflightBaseline,
  runBaselineChecks,
} from "../dist/lib/project-baseline.js";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();

const GITFLOW = { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" };

/** Clone of a bare origin with main + develop; origin's default branch (HEAD) = `head`. */
function repo(head) {
  const root = mkdtempSync(join(tmpdir(), "vibeops-baseline-"));
  const bare = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  const seed = join(root, "seed");
  git(root, "clone", "-q", bare, seed);
  git(seed, "switch", "-q", "-c", "main");
  writeFileSync(join(seed, "README.md"), "x\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "init");
  git(seed, "push", "-q", "origin", "main");
  git(seed, "push", "-q", "origin", "main:develop");
  git(bare, "symbolic-ref", "HEAD", `refs/heads/${head}`);
  return seed;
}

const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.ok]));

test("parseBaselineConfig: defaults, valid block, strict errors", () => {
  assert.deepEqual(parseBaselineConfig(undefined), { mode: "warn", crew: null });
  assert.deepEqual(parseBaselineConfig({ mode: "enforce", crew: "vibe-crew" }), {
    mode: "enforce",
    crew: "vibe-crew",
  });
  for (const [raw, re] of [
    [null, /must be an object/],
    [{ mode: "strict" }, /`mode` must be one of off, warn, enforce/],
    [{ crew: "Vibe Crew" }, /`crew` must be a crew name/],
    [{ crews: "vibe-crew" }, /unknown key `crews`/],
  ]) {
    assert.throws(() => parseBaselineConfig(raw), (e) => e instanceof BaselineConfigError && re.test(e.message));
  }
});

test("branch checks: gitflow + origin default = integration pass; trunk / default main fail", async () => {
  const ok = repo("develop");
  assert.deepEqual(byId(await runBaselineChecks(ok, GITFLOW, { mode: "warn", crew: null })), {
    "branch-policy": true,
    "default-branch": true,
  });
  const bad = repo("main");
  const trunk = { ...GITFLOW, integrationBranch: "main" };
  assert.deepEqual(byId(await runBaselineChecks(bad, trunk, { mode: "warn", crew: null })), {
    "branch-policy": false,
    "default-branch": true, // default main = integration main
  });
  assert.equal(byId(await runBaselineChecks(bad, GITFLOW, { mode: "warn", crew: null }))["default-branch"], false);
});

test("crew checks only when a crew is configured: SOURCE + AGENTS.md section", async () => {
  const dir = repo("develop");
  const cfg = { mode: "warn", crew: "vibe-crew" };
  assert.deepEqual(byId(await runBaselineChecks(dir, GITFLOW, cfg)), {
    "branch-policy": true,
    "default-branch": true,
    personas: false,
    "agents-contract": false,
  });
  mkdirSync(join(dir, ".personas", "vibe-crew"), { recursive: true });
  writeFileSync(join(dir, ".personas", "vibe-crew", "SOURCE"), "catalog: x\n");
  writeFileSync(join(dir, "AGENTS.md"), "# a\n\n<!-- getpersona:vibe-crew -->\n## crew\n<!-- /getpersona:vibe-crew -->\n");
  const after = byId(await runBaselineChecks(dir, GITFLOW, cfg));
  assert.equal(after.personas, true);
  assert.equal(after["agents-contract"], true);
});

test("preflight: warn continues, enforce stops, off skips", async () => {
  const dir = repo("main");
  const write = (baseline) =>
    writeFileSync(join(dir, ".vibeops.json"), JSON.stringify({ name: "x", baseline }));
  write({ mode: "warn" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add"), true);
  write({ mode: "enforce" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add"), false);
  write({ mode: "off" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add"), true);
  write({ mode: "loud" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add"), false, "invalid block fails closed");
});

test("cli: task add in enforce mode stops on a failing check and creates no TASK", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
  const dir = repo("main"); // origin default = main, integration = develop → default-branch fails
  mkdirSync(join(dir, "docs", "tasks"), { recursive: true });
  const cfg = (mode) =>
    writeFileSync(
      join(dir, ".vibeops.json"),
      JSON.stringify({
        name: "x",
        vibeopsVersion: "3.1.9",
        schemaVersion: 1,
        createdAt: "2026-10-17T00:00:00Z",
        clients: ["cursor"],
        git: GITFLOW,
        baseline: { mode },
      }),
    );
  cfg("enforce");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "config");
  git(dir, "push", "-q", "origin", "main", "main:develop", "--force");
  const r = spawnSync(process.execPath, [cli, "task", "add", "--non-interactive", "--idea", "x", "--cwd", dir], {
    env: ENV,
    encoding: "utf8",
  });
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 1, out);
  assert.match(out, /baseline default-branch: origin default branch is main/);
  assert.match(out, /fix: gh repo edit --default-branch develop/);
  assert.deepEqual(readdirSync(join(dir, "docs", "tasks")), [], "no TASK created");
});

test("summarizeBaseline: checks, crew commit from SOURCE, other remote branches", async () => {
  const { summarizeBaseline } = await import("../dist/lib/project-baseline.js");
  const dir = repo("develop");
  for (const b of ["task/001-x", "sync/abc", "feature-y"]) git(dir, "push", "-q", "origin", `main:${b}`);
  mkdirSync(join(dir, ".personas", "vibe-crew"), { recursive: true });
  writeFileSync(join(dir, ".personas", "vibe-crew", "SOURCE"), "catalog: x\npath: roles/vibe-crew\ncommit: abcdef1234567\n");
  writeFileSync(join(dir, "AGENTS.md"), "<!-- getpersona:vibe-crew -->\n");
  writeFileSync(join(dir, ".vibeops.json"), JSON.stringify({ name: "x", baseline: { crew: "vibe-crew" } }));
  const s = await summarizeBaseline(dir, GITFLOW);
  assert.equal(s.mode, "warn");
  assert.equal(s.crew, "vibe-crew");
  assert.equal(s.crewCommit, "abcdef1234567");
  assert.ok(s.checks.every((c) => c.ok), JSON.stringify(s.checks));
  assert.deepEqual(s.otherBranches, ["feature-y"]);
  assert.equal(s.configError, null);

  writeFileSync(join(dir, ".vibeops.json"), JSON.stringify({ name: "x", baseline: { mode: "loud" } }));
  assert.match((await summarizeBaseline(dir, GITFLOW)).configError, /`mode` must be one of/);
});

test("preflight repair / requireOk: repair downgrades enforce; requireOk stops whatever the mode", async () => {
  const dir = repo("main"); // default-branch fails for integration develop
  const write = (baseline) =>
    writeFileSync(join(dir, ".vibeops.json"), JSON.stringify({ name: "x", baseline }));
  write({ mode: "enforce" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add", { repair: true }), true);
  write({ mode: "off" });
  assert.equal(await preflightBaseline(dir, GITFLOW, "task ship", { requireOk: true }), false);
  write({ mode: "loud" }); // the repair may be the config itself
  assert.equal(await preflightBaseline(dir, GITFLOW, "task add", { repair: true }), true);
  assert.equal(await preflightBaseline(dir, GITFLOW, "task ship", { requireOk: true }), false);
});

test("cli: task add --repair-baseline in enforce mode, ship only after the repair", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readdirSync, readFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
  const dir = repo("main");
  const bare = join(dir, "..", "origin.git");
  mkdirSync(join(dir, "docs", "tasks"), { recursive: true });
  writeFileSync(join(dir, "docs", "tasks", ".keep"), "");
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "3.2.0",
      schemaVersion: 1,
      createdAt: "2026-10-18T00:00:00Z",
      clients: ["cursor"],
      git: GITFLOW,
      baseline: { mode: "enforce" },
    }),
  );
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "config");
  git(dir, "push", "-q", "origin", "main", "main:develop", "--force");
  const run = (...a) =>
    spawnSync(process.execPath, [cli, ...a, "--cwd", dir], { env: ENV, encoding: "utf8" });

  const plain = run("task", "add", "--non-interactive", "--idea", "fix default branch");
  assert.equal(plain.status, 1, plain.stdout + plain.stderr);
  assert.match(plain.stdout + plain.stderr, /To repair: vibeops task add --repair-baseline/);

  const add = run("task", "add", "--non-interactive", "--idea", "fix default branch", "--repair-baseline");
  assert.equal(add.status, 0, add.stdout + add.stderr);
  assert.match(add.stdout + add.stderr, /baseline repair: failures reported as warnings/);
  const name = readdirSync(join(dir, "docs", "tasks")).find((n) => n.startsWith("TASK-"));
  assert.match(readFileSync(join(dir, "docs", "tasks", name), "utf8"), /## Baseline\n\nRepair — opened with/);

  const early = run("task", "ship", "--dry-run", "--non-interactive");
  assert.equal(early.status, 1, early.stdout + early.stderr);
  assert.match(early.stdout + early.stderr, /baseline-repair TASK ships only when every check passes/);

  git(bare, "symbolic-ref", "HEAD", "refs/heads/develop"); // the repair (host default branch)
  const ok = run("task", "ship", "--dry-run", "--non-interactive");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.doesNotMatch(ok.stdout + ok.stderr, /baseline/);
});
