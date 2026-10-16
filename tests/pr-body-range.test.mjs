import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Observed: after `origin/develop` was merged into a task branch (as the stale-base check
// requires), the PR body listed another TASK's commit and file: it was computed from the
// TASK's Base Commit (`<Base Commit>..HEAD`) instead of the current base.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist/cli.js");

const root = mkdtempSync(join(tmpdir(), "vibeops-prbody-"));
const binDir = join(root, "bin");
const bodyFile = join(root, "pr-create.json");
mkdirSync(binDir);
// Fake `gh`: no open PR; `pr create` records its argv and returns a URL.
writeFileSync(
  join(binDir, "gh"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake 1.0"); process.exit(0); }
if (args[0] === "pr" && args[1] === "list") { process.stdout.write("[]"); process.exit(0); }
if (args[0] === "pr" && args[1] === "create") {
  fs.writeFileSync(${JSON.stringify(bodyFile)}, JSON.stringify(args));
  console.log("https://github.com/example/repo/pull/9");
  process.exit(0);
}
process.stderr.write("fake gh: unsupported " + args.join(" "));
process.exit(1);
`,
);
chmodSync(join(binDir, "gh"), 0o755);

// Isolated PATH / HOME: no LLM CLI or credentials, so the PR body is the deterministic fallback.
const ENV = {
  PATH: `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: join(root, "home"),
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
mkdirSync(ENV.HOME);

const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
const vibeops = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [cli, ...args, "--cwd", cwd], { env: ENV, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

function commit(cwd, name) {
  writeFileSync(join(cwd, name), `${name}\n`);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", `add ${name}`);
}

test("PR body lists only this TASK's changes after origin/develop was merged into the task branch", () => {
  const bare = join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  const seed = join(root, "seed");
  git(root, "clone", "-q", bare, seed);
  git(seed, "switch", "-q", "-c", "main");
  writeFileSync(
    join(seed, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "3.1.6",
      schemaVersion: 1,
      createdAt: "2026-10-17T00:00:00Z",
      clients: ["cursor"],
      git: { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    }),
  );
  mkdirSync(join(seed, "docs", "tasks"), { recursive: true });
  writeFileSync(join(seed, "docs", "tasks", "TASK-001-seed.md"), "# TASK-001: seed\n\n## Status\n\nShipped\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", "origin", "main");
  git(seed, "switch", "-q", "-c", "develop");
  git(seed, "push", "-q", "-u", "origin", "develop");

  const work = join(root, "work");
  git(root, "clone", "-q", "-b", "develop", bare, work);
  const add = vibeops(work, "task", "add", "--non-interactive", "--idea", "Mine");
  assert.equal(add.code, 0, add.out);
  commit(work, "mine.txt");

  // Another TASK lands on develop; the task branch merges it (stale-base requirement).
  commit(seed, "other-task.txt");
  git(seed, "push", "-q", "origin", "develop");
  git(work, "fetch", "-q", "origin");
  git(work, "merge", "-q", "--no-edit", "origin/develop");

  const taskName = readdirSync(join(work, "docs", "tasks")).find((n) => n.startsWith("TASK-002-"));
  const taskFile = join(work, "docs", "tasks", taskName);
  writeFileSync(
    taskFile,
    readFileSync(taskFile, "utf8")
      .replace(/## Result\n\n[^#]*/, "## Result\n\ndone\n\n")
      .replace(/## Test Result\n\n[^#]*/, "## Test Result\n\nok\n"),
  );

  const ship = vibeops(work, "task", "ship", "-m", "feat: mine", "--non-interactive");
  assert.equal(ship.code, 0, ship.out);

  const args = JSON.parse(readFileSync(bodyFile, "utf8"));
  const body = args[args.indexOf("--body") + 1];
  assert.match(body, /mine\.txt/);
  assert.match(body, /add mine\.txt/);
  assert.doesNotMatch(body, /other-task\.txt/, "another TASK's file is not listed");
  assert.doesNotMatch(body, /Merge (remote-tracking )?branch/, "merge commits are not listed");
});
