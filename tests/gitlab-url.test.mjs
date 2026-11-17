import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildConfig, readConfig } from "../dist/lib/config.js";
import {
  glabAuthLoginArgs,
  glabAuthStatusArgs,
  glabRepoViewArgs,
  parseOwnerRepo,
  remoteUrlForHost,
} from "../dist/lib/git-host-cli.js";
import { detectGitHost } from "../dist/lib/git-host.js";
import {
  glabRepoCreateArgs,
  glabSetDefaultBranchArgs,
  resolveConnectUrl,
} from "../dist/lib/git-remote.js";
import {
  DEFAULT_GITLAB_URL,
  GitlabUrlError,
  glabHostnameArgs,
  parseGitlabBaseUrl,
} from "../dist/lib/gitlab-url.js";

// GitLab base URL: default GitLab.com, configurable for self-managed instances (TASK-063, D-017).

test("parseGitlabBaseUrl normalizes default, port, sub-path, trailing slash", () => {
  assert.equal(DEFAULT_GITLAB_URL, "https://gitlab.com");
  assert.deepEqual(parseGitlabBaseUrl("https://gitlab.com/"), {
    url: "https://gitlab.com",
    host: "gitlab.com",
    hostname: "gitlab.com",
    path: "",
  });
  assert.deepEqual(parseGitlabBaseUrl("  HTTPS://GitLab.Example.com:8443/  "), {
    url: "https://gitlab.example.com:8443",
    host: "gitlab.example.com:8443",
    hostname: "gitlab.example.com",
    path: "",
  });
  assert.deepEqual(parseGitlabBaseUrl("http://example.invalid/gitlab//"), {
    url: "http://example.invalid/gitlab",
    host: "example.invalid",
    hostname: "example.invalid",
    path: "/gitlab",
  });
  assert.equal(parseGitlabBaseUrl("https://gitlab.example.com:443").url, "https://gitlab.example.com");
});

test("parseGitlabBaseUrl rejects garbage with a clear error", () => {
  for (const bad of [
    "",
    "gitlab.example.com",
    "ftp://gitlab.example.com",
    "git@gitlab.example.com:group/repo.git",
    "https://user:pw@gitlab.example.com",
    "https://gitlab.example.com/?x=1",
    "https://gitlab.example.com/#top",
    "not a url",
  ]) {
    assert.throws(() => parseGitlabBaseUrl(bad), GitlabUrlError, bad);
  }
  assert.throws(() => parseGitlabBaseUrl("ftp://x.example.invalid"), /https:\/\/ or http:\/\//);
});

test("parseOwnerRepo: custom host https/ssh, nested groups, sub-path", () => {
  const base = "https://gitlab.example.com";
  assert.deepEqual(parseOwnerRepo("https://gitlab.example.com/acme/app.git", base), {
    owner: "acme",
    repo: "app",
  });
  assert.deepEqual(parseOwnerRepo("git@gitlab.example.com:group/sub/app.git", base), {
    owner: "group/sub",
    repo: "app",
  });
  assert.deepEqual(parseOwnerRepo("ssh://git@gitlab.example.com:2222/group/app.git", base), {
    owner: "group",
    repo: "app",
  });
  assert.deepEqual(
    parseOwnerRepo("https://example.invalid/gitlab/group/sub/app.git", "https://example.invalid/gitlab"),
    { owner: "group/sub", repo: "app" },
  );
  // SSH remotes of a sub-path instance carry no sub-path.
  assert.deepEqual(
    parseOwnerRepo("git@example.invalid:group/app.git", "https://example.invalid/gitlab"),
    { owner: "group", repo: "app" },
  );
  assert.deepEqual(parseOwnerRepo("group/sub/app"), { owner: "group/sub", repo: "app" });
  assert.deepEqual(parseOwnerRepo("https://gitlab.com/g/s/app.git"), { owner: "g/s", repo: "app" });
  // Other hosts stay unparsed; GitHub stays owner/repo only.
  assert.equal(parseOwnerRepo("https://other.example.invalid/acme/app.git", base), null);
  assert.equal(parseOwnerRepo("https://github.com/a/b/c.git"), null);
  assert.deepEqual(parseOwnerRepo("https://github.com/acme/app"), { owner: "acme", repo: "app" });
});

test("remoteUrlForHost / resolveConnectUrl build URLs on the configured base", () => {
  assert.equal(remoteUrlForHost("gitlab", "a", "b"), "https://gitlab.com/a/b.git");
  assert.equal(
    remoteUrlForHost("gitlab", "g/s", "app", "https://example.invalid:8443/gitlab"),
    "https://example.invalid:8443/gitlab/g/s/app.git",
  );
  assert.equal(
    resolveConnectUrl("gitlab", "group/app", "https://gitlab.example.com"),
    "https://gitlab.example.com/group/app.git",
  );
  assert.equal(
    resolveConnectUrl("gitlab", "ssh://git@gitlab.example.com:2222/group/app", "https://gitlab.example.com"),
    "ssh://git@gitlab.example.com:2222/group/app.git",
  );
  assert.throws(() => resolveConnectUrl("gitlab", "https://other.example.invalid/a/b", "https://gitlab.example.com"));
});

test("detectGitHost: configured GitLab host counts as gitlab", () => {
  const base = "https://code.example.invalid";
  assert.equal(detectGitHost("git@code.example.invalid:group/app.git"), null);
  assert.equal(detectGitHost("git@code.example.invalid:group/app.git", base), "gitlab");
  assert.equal(detectGitHost("https://code.example.invalid/group/app.git", base), "gitlab");
  assert.equal(detectGitHost("ssh://git@code.example.invalid:2222/g/app.git", base), "gitlab");
  assert.equal(detectGitHost("https://other.example.invalid/g/app.git", base), null);
  assert.equal(detectGitHost("https://github.com/a/b.git", base), "github");
  assert.equal(detectGitHost("https://gitlab.com/a/b.git"), "gitlab");
});

test("glab argv targets the configured host; GitLab.com unchanged", () => {
  assert.deepEqual(glabRepoCreateArgs("group/app", "main", "origin"), [
    "repo", "create", "group/app", "--remoteName", "origin", "--defaultBranch", "main",
  ]);
  assert.deepEqual(glabRepoCreateArgs("group/app", "main", "origin", "https://gitlab.example.com:8443"), [
    "repo", "create", "https://gitlab.example.com:8443/group/app", "--remoteName", "origin", "--defaultBranch", "main",
  ]);
  assert.deepEqual(glabSetDefaultBranchArgs("develop"), [
    "api", "--method", "PUT", "projects/:id", "--raw-field", "default_branch=develop",
  ]);
  assert.deepEqual(glabAuthLoginArgs(), ["glab", "auth", "login"]);
});

// glab keys config by hostname; the port lives in the entry's api_host (glab 1.131.0).
test("glab auth login: port-less --hostname, port via --api-host, http via --api-protocol", () => {
  assert.deepEqual(glabAuthLoginArgs("https://gitlab.example.com"), [
    "glab", "auth", "login", "--hostname", "gitlab.example.com",
  ]);
  assert.deepEqual(glabAuthLoginArgs("https://gitlab.example.com:8443"), [
    "glab", "auth", "login", "--hostname", "gitlab.example.com", "--api-host", "gitlab.example.com:8443",
  ]);
  assert.deepEqual(glabAuthLoginArgs("http://gitlab.example.com:8080"), [
    "glab", "auth", "login", "--hostname", "gitlab.example.com",
    "--api-host", "gitlab.example.com:8080", "--api-protocol", "http",
  ]);
  assert.deepEqual(glabHostnameArgs("https://gitlab.example.com:8443"), ["--hostname", "gitlab.example.com"]);
  assert.deepEqual(glabHostnameArgs(undefined), []);
  assert.deepEqual(glabAuthStatusArgs(), ["auth", "status"]);
  assert.deepEqual(glabAuthStatusArgs("https://gitlab.example.com:8443"), [
    "auth", "status", "--hostname", "gitlab.example.com",
  ]);
});

// glab 1.131.0: `glab api --hostname host:port` → "invalid hostname"; auth accepts host:port.
test("glab api --hostname is port-less", () => {
  assert.deepEqual(glabSetDefaultBranchArgs("develop", "https://gitlab.example.com:8443"), [
    "api", "--hostname", "gitlab.example.com", "--method", "PUT", "projects/:id",
    "--raw-field", "default_branch=develop",
  ]);
});

test("glab repo view: slug on GitLab.com, full URL on a self-managed instance", () => {
  assert.deepEqual(glabRepoViewArgs("acme/app"), ["repo", "view", "acme/app"]);
  assert.deepEqual(glabRepoViewArgs("acme/app", "https://gitlab.com/"), ["repo", "view", "acme/app"]);
  assert.deepEqual(glabRepoViewArgs("g/app", "https://gitlab.example.com"), [
    "repo", "view", "https://gitlab.example.com/g/app",
  ]);
});

// glab calls <host>/api/v4 and drops the sub-path, so create / view are refused there.
test("sub-path base URL: create and repo view are refused with a Connect hint", () => {
  const sub = "https://example.invalid/gitlab";
  assert.throws(() => glabRepoCreateArgs("g/app", "main", "origin", sub), (e) =>
    e instanceof GitlabUrlError && /sub-path/.test(e.message) && /Connect an existing repository/.test(e.message));
  assert.throws(() => glabRepoViewArgs("g/app", sub), GitlabUrlError);
});

function writeCfg(dir, git) {
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x", vibeopsVersion: "0", schemaVersion: 1, createdAt: "2026-01-01T00:00:00Z",
      clients: ["claude"],
      git: { remote: "origin", host: "gitlab", integrationBranch: "develop", productionBranch: "main", ...git },
    }),
  );
}

test("config: gitlabUrl default, normalization, strict validation, re-init keeps it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-gitlab-cfg-"));
  writeCfg(dir, {});
  assert.equal((await readConfig(dir)).git.gitlabUrl, undefined);
  writeCfg(dir, { gitlabUrl: "https://gitlab.com/" });
  assert.equal((await readConfig(dir)).git.gitlabUrl, undefined);
  writeCfg(dir, { gitlabUrl: "https://GitLab.example.com/gl/" });
  const cfg = await readConfig(dir);
  assert.equal(cfg.git.gitlabUrl, "https://gitlab.example.com/gl");
  const gitNoUrl = { ...cfg.git };
  delete gitNoUrl.gitlabUrl;
  assert.equal(buildConfig("x", ["claude"], gitNoUrl, cfg).git.gitlabUrl, "https://gitlab.example.com/gl");
  writeCfg(dir, { gitlabUrl: "gitlab.example.com" });
  await assert.rejects(readConfig(dir), GitlabUrlError);
  writeCfg(dir, { gitlabUrl: 42 });
  await assert.rejects(readConfig(dir), GitlabUrlError);
});

const cli = join(import.meta.dirname, "..", "dist", "cli.js");

test("init --dry-run --gitlab-url shows the GitLab host in the plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-gitlab-init-"));
  const out = execFileSync(
    process.execPath,
    [cli, "init", "--dry-run", "--git-host", "gitlab",
      "--gitlab-url", "https://gitlab.example.com/", "--clients", "claude", "--cwd", dir],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.match(out, /gitlab:\s+https:\/\/gitlab\.example\.com\n/);
  assert.match(out, /would configure git remote origin \(gitlab at https:\/\/gitlab\.example\.com\)/);
});

test("init rejects an invalid --gitlab-url and --gitlab-url with --git-host github", () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-gitlab-init-bad-"));
  const run = (...extra) =>
    spawnSync(
      process.execPath,
      [cli, "init", "--dry-run", "--clients", "claude", "--cwd", dir, ...extra],
      { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
  const bad = run("--git-host", "gitlab", "--gitlab-url", "gitlab.example.com");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout + bad.stderr, /Invalid --gitlab-url/);
  const mixed = run("--git-host", "github", "--gitlab-url", "https://gitlab.example.com");
  assert.equal(mixed.status, 1);
  assert.match(mixed.stdout + mixed.stderr, /GitLab only/);
});
