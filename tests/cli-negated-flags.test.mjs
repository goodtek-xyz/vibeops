import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// commander stores `--no-foo` as `opts.foo === false` and never sets `opts.noFoo`.
// Reading `opts.noFoo` silently dropped these flags (observed: `task release
// --no-merge` merged the release PR before its checks finished).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist/cli.js");

// Fake `gh`: logs every call; `pr create` answers with a URL, anything else fails.
const binDir = mkdtempSync(join(tmpdir(), "vibeops-negated-gh-"));
const ghLog = join(binDir, "calls.log");
writeFileSync(
  join(binDir, "gh"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake 1.0"); process.exit(0); }
fs.appendFileSync(${JSON.stringify(ghLog)}, args.slice(0, 2).join(" ") + "\\n");
if (args[0] === "pr" && args[1] === "create") {
  console.log("https://github.com/example/repo/pull/1");
  process.exit(0);
}
process.stderr.write("fake gh: unsupported " + args.join(" "));
process.exit(1);
`,
);
chmodSync(join(binDir, "gh"), 0o755);

const ENV = {
  ...process.env,
  PATH: `${binDir}:${process.env.PATH}`,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function runCli(args) {
  try {
    const out = execFileSync("node", [cli, ...args], {
      env: ENV,
      // Bounds a broken run only: an ignored --no-merge enters the merge gate,
      // which waits up to its configured timeout instead of returning.
      timeout: 20_000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function ghCalls() {
  return existsSync(ghLog) ? readFileSync(ghLog, "utf8").trim().split("\n") : [];
}

// gitflow project with TASK-001 on `task/001-x`, pushed to a bare `origin`.
function project() {
  const root = mkdtempSync(join(tmpdir(), "vibeops-negated-"));
  const origin = join(root, "origin.git");
  const dir = join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "init", "-q", "-b", "main", dir);
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "3.1.2",
      schemaVersion: 1,
      createdAt: "2026-10-16T00:00:00Z",
      clients: ["cursor"],
      git: { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    }),
  );
  mkdirSync(join(dir, "docs/tasks"), { recursive: true });
  writeFileSync(
    join(dir, "docs/tasks/TASK-001-x.md"),
    [
      "# TASK-001: x",
      "",
      "## Status",
      "",
      "In Progress",
      "",
      "## Git Context",
      "",
      "- Base Branch: `develop`",
      "- Base Commit: `0000000000000000000000000000000000000000`",
      "- Task Branch: `task/001-x`",
      "- Started At: `2026-10-16T00:00:00Z`",
      "",
    ].join("\n"),
  );
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
  git(dir, "branch", "develop");
  git(dir, "branch", "task/001-x");
  git(dir, "remote", "add", "origin", origin);
  git(dir, "push", "-q", "origin", "main", "develop", "task/001-x");
  return dir;
}

test("release --dry-run: plans the merge by default, not with --no-merge", () => {
  const dir = project();
  const plain = runCli(["task", "release", "--dry-run", "--cwd", dir]);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /merge Pull request \(merge\) only when all checks are green/);

  const noMerge = runCli(["task", "release", "--dry-run", "--no-merge", "--cwd", dir]);
  assert.equal(noMerge.code, 0, noMerge.out);
  assert.doesNotMatch(noMerge.out, /merge Pull request/);
});

test("release --no-merge: creates the release PR and never reads or merges it", () => {
  const dir = project();
  const before = ghCalls().length;
  const r = runCli(["task", "release", "--no-merge", "--cwd", dir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Merge skipped \(--no-merge\)/);
  assert.deepEqual(ghCalls().slice(before), ["pr create"]);
});

test("del --dry-run: --no-remote-delete / --no-close-mr reach the command", () => {
  const dir = project();
  const plain = runCli(["task", "del", "TASK-001", "--dry-run", "--cwd", dir]);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /would git push origin --delete task\/001-x/);
  assert.doesNotMatch(plain.out, /close skipped/);

  const kept = runCli([
    "task", "del", "TASK-001", "--dry-run", "--no-remote-delete", "--no-close-mr", "--cwd", dir,
  ]);
  assert.equal(kept.code, 0, kept.out);
  assert.doesNotMatch(kept.out, /push origin --delete/);
  assert.match(kept.out, /Open MR\/PR close skipped \(--no-close-mr\)/);
});

test("sync --dry-run: --no-remote-delete keeps the remote branch", () => {
  const dir = project();
  const plain = runCli(["task", "sync", "TASK-001", "--dry-run", "--cwd", dir]);
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /git push origin --delete task\/001-x/);

  const kept = runCli(["task", "sync", "TASK-001", "--dry-run", "--no-remote-delete", "--cwd", dir]);
  assert.equal(kept.code, 0, kept.out);
  assert.doesNotMatch(kept.out, /push origin --delete/);
});

test("cli.ts reads no `opts.no<Name>` (commander never sets them)", () => {
  const src = readFileSync(join(repoRoot, "src/cli.ts"), "utf8");
  assert.deepEqual(src.match(/opts\.no[A-Z]\w*/g) ?? [], []);
});
