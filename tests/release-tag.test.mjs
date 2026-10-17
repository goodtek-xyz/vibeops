import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { tagReleaseCommit } from "../dist/lib/release-tag.js";

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

/** Clone of a bare origin whose main has package.json `version`. */
function repo(version) {
  const root = mkdtempSync(join(tmpdir(), "vibeops-tag-"));
  const bare = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  const work = join(root, "work");
  git(root, "clone", "-q", bare, work);
  git(work, "switch", "-q", "-c", "main");
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "x", version }));
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "release");
  git(work, "push", "-q", "origin", "main");
  return { work, bare, commit: git(work, "rev-parse", "HEAD") };
}

const opts = (work, commit) => ({ cwd: work, remote: "origin", productionBranch: "main", commit });

test("tags the release merge commit v<version> and pushes it", async () => {
  const { work, bare, commit } = repo("4.5.6");
  const r = await tagReleaseCommit(opts(work, commit));
  assert.deepEqual(r, { ok: true, tag: "v4.5.6", commit });
  assert.equal(git(bare, "rev-parse", "refs/tags/v4.5.6"), commit);
});

test("an existing tag (remote or local) is never moved", async () => {
  const { work, commit } = repo("1.0.0");
  assert.equal((await tagReleaseCommit(opts(work, commit))).ok, true);
  const again = await tagReleaseCommit(opts(work, commit));
  assert.equal(again.ok, false);
  assert.match(again.message, /tag v1\.0\.0 already exists locally/);
  git(work, "tag", "-d", "v1.0.0");
  const remote = await tagReleaseCommit(opts(work, commit));
  assert.match(remote.message, /tag v1\.0\.0 already exists on origin/);
});

test("refuses a commit that is not on origin/main, or without a semver package.json", async () => {
  const { work } = repo("2.0.0");
  git(work, "switch", "-q", "-c", "side");
  writeFileSync(join(work, "side.txt"), "s\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "side");
  const side = git(work, "rev-parse", "HEAD");
  assert.match((await tagReleaseCommit(opts(work, side))).message, /is not on origin\/main/);

  const bad = repo("next");
  assert.match(
    (await tagReleaseCommit(opts(bad.work, bad.commit))).message,
    /package\.json version at \w{7} is not a semver string/,
  );
  rmSync(join(bad.work, "package.json"));
  git(bad.work, "add", "-A");
  git(bad.work, "commit", "-q", "-m", "drop package.json");
  git(bad.work, "push", "-q", "origin", "main");
  const head = git(bad.work, "rev-parse", "HEAD");
  assert.match((await tagReleaseCommit(opts(bad.work, head))).message, /no readable package\.json/);
});

test("cli: --tag with --no-merge is refused; dry-run plans the tag", () => {
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
  const dir = mkdtempSync(join(tmpdir(), "vibeops-tag-cli-"));
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "3.1.9",
      schemaVersion: 1,
      createdAt: "2026-10-17T00:00:00Z",
      clients: ["cursor"],
      git: { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    }),
  );
  const run = (...a) => spawnSync(process.execPath, [cli, "task", "release", ...a, "--cwd", dir], { env: ENV, encoding: "utf8" });
  const refused = run("--tag", "--no-merge");
  assert.equal(refused.status, 1);
  assert.match(`${refused.stdout}${refused.stderr}`, /--tag needs the merge/);
  const dry = run("--tag", "--dry-run");
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.match(dry.stdout, /tag the release merge commit v<package\.json version> and push the tag to origin/);
});
