import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";

import { setRemoteDefaultBranch } from "../dist/lib/git-remote.js";

// `vibeops init` makes the integration branch the default of a repository it created.
// Fake `gh` / `glab` record argv; `<state>/fail` makes them exit 1.

const binDir = mkdtempSync(join(tmpdir(), "vibeops-default-branch-bin-"));
const stateDir = mkdtempSync(join(tmpdir(), "vibeops-default-branch-state-"));
for (const name of ["gh", "glab"]) {
  writeFileSync(
    join(binDir, name),
    `#!/usr/bin/env node
const fs = require("node:fs");
const dir = ${JSON.stringify(stateDir)};
fs.appendFileSync(dir + "/calls.log", JSON.stringify([${JSON.stringify(name)}, ...process.argv.slice(2)]) + "\\n");
process.exit(fs.existsSync(dir + "/fail") ? 1 : 0);
`,
  );
  chmodSync(join(binDir, name), 0o755);
}
process.env.PATH = `${binDir}:${process.env.PATH}`;

beforeEach(() => {
  for (const f of ["calls.log", "fail"]) rmSync(join(stateDir, f), { force: true });
});

const calls = () => {
  const p = join(stateDir, "calls.log");
  return existsSync(p)
    ? readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l))
    : [];
};

test("GitHub: gh repo edit --default-branch <integration>", async () => {
  assert.equal(await setRemoteDefaultBranch(process.cwd(), "github", "develop"), true);
  assert.deepEqual(calls(), [["gh", "repo", "edit", "--default-branch", "develop"]]);
});

test("GitLab: project API default_branch via glab api", async () => {
  assert.equal(await setRemoteDefaultBranch(process.cwd(), "gitlab", "develop"), true);
  assert.deepEqual(calls(), [
    ["glab", "api", "--method", "PUT", "projects/:id", "--raw-field", "default_branch=develop"],
  ]);
});

test("a failing CLI returns false (init prints the manual command)", async () => {
  writeFileSync(join(stateDir, "fail"), "1");
  assert.equal(await setRemoteDefaultBranch(process.cwd(), "github", "develop"), false);
});
