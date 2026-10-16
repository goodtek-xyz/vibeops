import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, test } from "node:test";

// Observed: with a release PR already open, `task release` failed at `gh pr create`
// instead of picking up the open PR.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist/cli.js");

// Fake `gh`: logs calls; `pr list` answers `<state>/open.json` when present (else `[]`);
// `pr create` fails like gh does when the open PR exists, else returns a new URL.
const binDir = mkdtempSync(join(tmpdir(), "vibeops-release-gh-"));
const stateDir = mkdtempSync(join(tmpdir(), "vibeops-release-state-"));
writeFileSync(
  join(binDir, "gh"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const dir = ${JSON.stringify(stateDir)};
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake 1.0"); process.exit(0); }
fs.appendFileSync(dir + "/calls.log", args.slice(0, 2).join(" ") + "\\n");
const open = dir + "/open.json";
if (args[0] === "pr" && args[1] === "list") {
  process.stdout.write(fs.existsSync(open) ? fs.readFileSync(open, "utf8") : "[]");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "create") {
  if (fs.existsSync(open)) {
    process.stderr.write('a pull request for branch "develop" into branch "main" already exists');
    process.exit(1);
  }
  console.log("https://github.com/example/repo/pull/2");
  process.exit(0);
}
process.stderr.write("fake gh: unsupported " + args.join(" "));
process.exit(1);
`,
);
chmodSync(join(binDir, "gh"), 0o755);

const ENV = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };

beforeEach(() => {
  for (const f of ["calls.log", "open.json"]) rmSync(join(stateDir, f), { force: true });
});

function project() {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-release-"));
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "3.1.5",
      schemaVersion: 1,
      createdAt: "2026-10-17T00:00:00Z",
      clients: ["cursor"],
      git: { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    }),
  );
  return dir;
}

function release(dir, ...args) {
  try {
    const out = execFileSync("node", [cli, "task", "release", ...args, "--cwd", dir], {
      env: ENV,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const calls = () => {
  const p = join(stateDir, "calls.log");
  return existsSync(p) ? readFileSync(p, "utf8").trim().split("\n") : [];
};

test("release: an open release PR is reused instead of creating one", () => {
  writeFileSync(
    join(stateDir, "open.json"),
    JSON.stringify([{ url: "https://github.com/example/repo/pull/1", state: "OPEN" }]),
  );
  const r = release(project(), "--no-merge");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /already open — reusing: https:\/\/github\.com\/example\/repo\/pull\/1/);
  assert.deepEqual(calls(), ["pr list"]);
});

test("release: without an open release PR one is created", () => {
  const r = release(project(), "--no-merge");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /pull\/2/);
  assert.deepEqual(calls(), ["pr list", "pr create"]);
});

test("release --dry-run says the merge waits for the PR's own CI", () => {
  const r = release(project(), "--dry-run");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /reuse the open Pull request develop → main/);
  assert.match(r.out, /waits for the Pull request's own CI runs/);
  assert.match(r.out, /required checks \(by name, in addition\): none configured/);
});

test("release: a failing open-PR lookup refuses (no create, no merge)", () => {
  writeFileSync(join(stateDir, "open.json"), "not json");
  const r = release(project());
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Could not look up an open release Pull request/);
  assert.deepEqual(calls(), ["pr list"]);
});
