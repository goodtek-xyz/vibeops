import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CommitTrailersConfigError, parseCommitTrailers } from "../dist/lib/commit-trailers.js";
import { readConfig } from "../dist/lib/config.js";
import { readCommitTrailers } from "../dist/lib/git-config.js";
import { commitDirtyWorkingTree, docsCommitMessageFor } from "../dist/lib/task-git-commit.js";

const GIT_ENV = {
  ...process.env,
  LC_ALL: "C",
  LANG: "C",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

const TRAILER = "Co-Authored-By: Example Bot <bot@example.com>";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

function writeVibeopsJson(dir, gitExtra) {
  const config = {
    name: "t",
    vibeopsVersion: "0.0.0",
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    clients: ["cursor"],
    git: {
      remote: "origin",
      host: "github",
      integrationBranch: "develop",
      productionBranch: "main",
      ...gitExtra,
    },
  };
  writeFileSync(join(dir, ".vibeops.json"), `${JSON.stringify(config, null, 2)}\n`);
}

/** Temp repo with a committed `.vibeops.json` and a dirty TASK doc. */
function repo(gitExtra) {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-trailers-"));
  git(dir, "init", "-q", "-b", "main");
  writeVibeopsJson(dir, gitExtra);
  writeFileSync(join(dir, "TASK.md"), "Status: In Progress\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  writeFileSync(join(dir, "TASK.md"), "Status: Shipped\n");
  return dir;
}

test("docs commit carries the configured git.commitTrailers", async () => {
  const dir = repo({ commitTrailers: [TRAILER] });
  try {
    const trailers = await readCommitTrailers(dir);
    assert.deepEqual(trailers, [TRAILER]);
    const msg = docsCommitMessageFor("TASK-001", "mark shipped");
    assert.equal(await commitDirtyWorkingTree(dir, msg, false, trailers), true);
    const out = git(dir, "log", "-1", "--format=%(trailers)").trim();
    console.log(`trailers of HEAD: ${out}`);
    assert.equal(out, TRAILER);
    assert.equal(git(dir, "log", "-1", "--format=%s").trim(), msg);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no trailers when git.commitTrailers is unset", async () => {
  const dir = repo({});
  try {
    const trailers = await readCommitTrailers(dir);
    assert.deepEqual(trailers, []);
    assert.equal(await commitDirtyWorkingTree(dir, "docs(task-001): mark shipped", false, trailers), true);
    assert.equal(git(dir, "log", "-1", "--format=%(trailers)").trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run makes no commit even with trailers", async () => {
  const dir = repo({ commitTrailers: [TRAILER] });
  try {
    const head = git(dir, "rev-parse", "HEAD").trim();
    assert.equal(await commitDirtyWorkingTree(dir, "docs(task-001): x", true, [TRAILER]), true);
    assert.equal(git(dir, "rev-parse", "HEAD").trim(), head);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseCommitTrailers accepts Token: value entries", () => {
  assert.equal(parseCommitTrailers(undefined), undefined);
  assert.deepEqual(parseCommitTrailers([]), []);
  assert.deepEqual(parseCommitTrailers([TRAILER, "Signed-off-by: A <a@example.com>"]), [
    TRAILER,
    "Signed-off-by: A <a@example.com>",
  ]);
});

test("parseCommitTrailers rejects bad entries", () => {
  for (const bad of [
    "Co-Authored-By: x",
    [42],
    [""],
    ["no colon here"],
    ["Bad Key: value"],
    ["Key:value"],
    ["Key: "],
    ["Key: line1\nline2"],
    ["Key: value\r"],
    [": value"],
    ["-Key: value"],
  ]) {
    assert.throws(() => parseCommitTrailers(bad), CommitTrailersConfigError, JSON.stringify(bad));
  }
});

test("readConfig fails visibly on an invalid git.commitTrailers entry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-trailers-cfg-"));
  try {
    writeVibeopsJson(dir, { commitTrailers: ["Co-Authored-By: a\nInjected: b"] });
    await assert.rejects(readConfig(dir), /git\.commitTrailers\[0\] is invalid/);
    await assert.rejects(readCommitTrailers(dir), CommitTrailersConfigError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
