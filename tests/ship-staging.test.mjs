import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { listWorkingTreeRelPaths, parsePorcelainZ } from "../dist/lib/git.js";
import { commitDirtyWorkingTree } from "../dist/lib/task-git-commit.js";

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

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

/** Temp repo with one initial commit containing `files` (path → content). */
function repoWith(files) {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-ship-staging-"));
  git(dir, "init", "-q", "-b", "main");
  for (const [p, content] of Object.entries(files)) {
    const parts = p.split("/");
    if (parts.length > 1) mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

/** `name-status` of HEAD: e.g. ["D\tllms-gateway", "R100\tc\tc2"]. */
function headChanges(dir) {
  return git(dir, "show", "--name-status", "--format=", "-M", "HEAD")
    .split("\n")
    .filter((l) => l.length > 0);
}

function statusClean(dir) {
  return git(dir, "status", "--porcelain=v1").trim() === "";
}

test("ship commits a deletion that is already staged (git rm --cached + file removed)", async () => {
  const dir = repoWith({ "llms-gateway": "bin\n", "keep.txt": "k\n" });
  try {
    git(dir, "rm", "-q", "--cached", "llms-gateway");
    rmSync(join(dir, "llms-gateway"));
    writeFileSync(join(dir, "keep.txt"), "k2\n");
    assert.equal(await commitDirtyWorkingTree(dir, "feat(task-134): drop gateway", false), true);
    assert.deepEqual(headChanges(dir).sort(), ["D\tllms-gateway", "M\tkeep.txt"]);
    assert.ok(statusClean(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ship commits when the only change is a staged deletion", async () => {
  const dir = repoWith({ "gone.txt": "x\n", "keep.txt": "k\n" });
  try {
    git(dir, "rm", "-q", "gone.txt");
    assert.equal(await commitDirtyWorkingTree(dir, "chore: remove", false), true);
    assert.deepEqual(headChanges(dir), ["D\tgone.txt"]);
    assert.ok(statusClean(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ship stages and commits a tracked file deleted but not staged", async () => {
  const dir = repoWith({ "old.txt": "x\n", "keep.txt": "k\n" });
  try {
    rmSync(join(dir, "old.txt"));
    assert.equal(await commitDirtyWorkingTree(dir, "chore: remove", false), true);
    assert.deepEqual(headChanges(dir), ["D\told.txt"]);
    assert.ok(statusClean(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ship commits staged renames, including a rename modified afterwards", async () => {
  const dir = repoWith({ "c.txt": "same content line\n".repeat(20), "d.txt": "other\n".repeat(20) });
  try {
    git(dir, "mv", "c.txt", "c2.txt");
    git(dir, "mv", "d.txt", "d2.txt");
    writeFileSync(join(dir, "d2.txt"), "other\n".repeat(20) + "extra\n");
    assert.equal(await commitDirtyWorkingTree(dir, "refactor: rename", false), true);
    const changes = headChanges(dir).map((l) => l.replace(/^R\d+/, "R")).sort();
    assert.deepEqual(changes, ["R\tc.txt\tc2.txt", "R\td.txt\td2.txt"]);
    assert.ok(statusClean(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ship handles paths git would quote (spaces, non-ASCII) and glob characters", async () => {
  const dir = repoWith({
    "sp ace.txt": "a\n",
    "한글.txt": "b\n",
    "lit[1].txt": "c\n",
  });
  try {
    writeFileSync(join(dir, "sp ace.txt"), "a2\n");
    rmSync(join(dir, "한글.txt"));
    writeFileSync(join(dir, "lit[1].txt"), "c2\n");
    writeFileSync(join(dir, "new file.txt"), "n\n");
    const listed = (await listWorkingTreeRelPaths(dir)).sort();
    assert.deepEqual(listed, ["lit[1].txt", "new file.txt", "sp ace.txt", "한글.txt"]);
    assert.equal(await commitDirtyWorkingTree(dir, "chore: odd names", false), true);
    const changes = git(dir, "-c", "core.quotepath=false", "show", "--name-status", "--format=", "HEAD")
      .split("\n")
      .filter((l) => l.length > 0)
      .sort();
    assert.deepEqual(changes, ["A\tnew file.txt", "D\t한글.txt", "M\tlit[1].txt", "M\tsp ace.txt"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ship still leaves build artifacts out of the auto-commit", async () => {
  const dir = repoWith({ "src.txt": "s\n" });
  try {
    writeFileSync(join(dir, "src.txt"), "s2\n");
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "out.js"), "x\n");
    assert.equal(await commitDirtyWorkingTree(dir, "feat: x", false), true);
    assert.deepEqual(headChanges(dir), ["M\tsrc.txt"]);
    assert.match(git(dir, "status", "--porcelain=v1"), /^\?\? dist\/$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parsePorcelainZ reads -z records, including rename sources and names containing ' -> '", () => {
  const out = parsePorcelainZ(
    "D  llms-gateway\0 D b\0R  new name\0a -> b\0RM c2\0c\0 M sp ace\0?? dir/\0",
  );
  assert.deepEqual(
    out.map((e) => [e.code, e.path, e.origPath ?? null, e.staged, e.unstaged, e.untracked]),
    [
      ["D ", "llms-gateway", null, true, false, false],
      [" D", "b", null, false, true, false],
      ["R ", "new name", "a -> b", true, false, false],
      ["RM", "c2", "c", true, true, false],
      [" M", "sp ace", null, false, true, false],
      ["??", "dir/", null, false, false, true],
    ],
  );
});
