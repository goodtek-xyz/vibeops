import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { GitHost } from "../types/config.js";
import {
  DEFAULT_GITLAB_URL,
  GitlabUrlError,
  gitlabCliUnsupportedReason,
  glabHostnameArgs,
  parseRemoteUrl,
  resolveGitlabBaseUrl,
} from "./gitlab-url.js";

const execFileAsync = promisify(execFile);

/** Run a CLI with inherited stdio (e.g. `gh auth login`). */
export function runInteractiveCli(bin: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export type HostCliTool = "gh" | "glab";

export type HostCliAuthStatus = "ok" | "missing" | "unauthenticated";

export function hostCliTool(host: GitHost): HostCliTool {
  return host === "gitlab" ? "glab" : "gh";
}

export async function commandExists(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["--version"], { maxBuffer: 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function probeGhAuth(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

/** `glab auth status [--hostname <hostname>]` argv (docs.gitlab.com/cli/auth/status/). */
export function glabAuthStatusArgs(gitlabUrl?: string): string[] {
  return ["auth", "status", ...glabHostnameArgs(gitlabUrl)];
}

/** `glab auth status` for the configured instance. */
export async function probeGlabAuth(gitlabUrl?: string): Promise<boolean> {
  try {
    await execFileAsync(
      "glab",
      glabAuthStatusArgs(gitlabUrl),
      { maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function probeHostCliAuth(
  host: GitHost,
  gitlabUrl?: string,
): Promise<HostCliAuthStatus> {
  const tool = hostCliTool(host);
  if (!(await commandExists(tool))) return "missing";
  const ok = host === "gitlab" ? await probeGlabAuth(gitlabUrl) : await probeGhAuth();
  return ok ? "ok" : "unauthenticated";
}

/** Install / login lines shared by init and ship/merge. */
export function formatHostCliHint(host: GitHost, gitlabUrl?: string): readonly string[] {
  if (host === "gitlab") {
    return [
      `Install glab: https://gitlab.com/gitlab-org/cli#installation`,
      `  brew install glab`,
      `Then: ${glabAuthLoginArgs(gitlabUrl).join(" ")}`,
    ];
  }
  return [
    `Install gh: https://cli.github.com/`,
    `  brew install gh`,
    `Then: gh auth login`,
  ];
}

/**
 * `glab auth login` argv (docs.gitlab.com/cli/auth/login/). Self-managed: `--hostname <hostname>`;
 * a non-default port adds `--api-host <hostname>:<port>` ("Accepts a hostname or hostname:port"),
 * an `http://` URL adds `--api-protocol http`. The config entry is keyed by hostname, so every
 * other glab call finds it with the same port-less `--hostname`.
 */
export function glabAuthLoginArgs(gitlabUrl?: string): string[] {
  const base = resolveGitlabBaseUrl(gitlabUrl);
  return [
    "glab",
    "auth",
    "login",
    ...glabHostnameArgs(gitlabUrl),
    ...(base.host !== base.hostname ? ["--api-host", base.host] : []),
    ...(base.url.startsWith("http://") ? ["--api-protocol", "http"] : []),
  ];
}

export function formatHostCliMissingMessage(host: GitHost, purpose: string): string {
  const tool = hostCliTool(host);
  return `${tool} CLI is required to ${purpose}.`;
}

export async function probeBrew(): Promise<boolean> {
  return commandExists("brew");
}

export async function brewInstall(pkg: HostCliTool): Promise<void> {
  await execFileAsync("brew", ["install", pkg], {
    maxBuffer: 16 * 1024 * 1024,
  });
}

/**
 * Parse `owner/repo` (GitLab: `group/sub/project`), or an HTTPS / SSH remote URL on
 * GitHub, GitLab.com, or the configured GitLab base URL (`gitlabUrl`, D-017).
 * `owner` is every path segment before the last (nested GitLab groups).
 */
export function parseOwnerRepo(
  input: string,
  gitlabUrl?: string,
): { owner: string; repo: string } | null {
  const raw = input.trim();
  if (raw.length === 0) return null;

  const segment = /^[A-Za-z0-9_.-]+$/;
  const split = (segments: readonly string[]): { owner: string; repo: string } | null => {
    if (segments.length < 2 || !segments.every((s) => segment.test(s))) return null;
    return { owner: segments.slice(0, -1).join("/"), repo: segments[segments.length - 1]! };
  };

  if (!raw.includes(":") && !raw.includes("@")) {
    return split(raw.replace(/\.git$/i, "").split("/"));
  }

  const remote = parseRemoteUrl(raw);
  if (remote === null) return null;
  if (remote.hostname === "github.com" || remote.hostname === "www.github.com") {
    return remote.segments.length === 2 ? split(remote.segments) : null;
  }
  if (remote.hostname === "gitlab.com") return split(remote.segments);
  if (gitlabUrl !== undefined) {
    const base = resolveGitlabBaseUrl(gitlabUrl);
    if (remote.hostname !== base.hostname) return null;
    // HTTPS remotes carry the instance sub-path; SSH remotes do not.
    const prefix = base.path.split("/").filter((s) => s.length > 0);
    const isHttp = /^https?:\/\//i.test(raw);
    if (isHttp && prefix.length > 0) {
      if (!prefix.every((p, i) => remote.segments[i] === p)) return null;
      return split(remote.segments.slice(prefix.length));
    }
    return split(remote.segments);
  }
  return null;
}

/** HTTPS clone URL; GitLab uses the configured base URL (default GitLab.com). */
export function remoteUrlForHost(
  host: GitHost,
  owner: string,
  repo: string,
  gitlabUrl?: string,
): string {
  if (host === "gitlab") {
    return `${resolveGitlabBaseUrl(gitlabUrl).url}/${owner}/${repo}.git`;
  }
  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * `glab repo view` argv: the plain slug on GitLab.com (as before); a self-managed instance is
 * selected by a full URL (docs.gitlab.com/cli/repo/view/: "Specify repository by full URL").
 * Throws on a sub-path base URL (see `gitlabCliUnsupportedReason`).
 */
export function glabRepoViewArgs(slug: string, gitlabUrl?: string): string[] {
  const reason = gitlabCliUnsupportedReason(gitlabUrl);
  if (reason !== null) throw new GitlabUrlError(reason);
  const base = resolveGitlabBaseUrl(gitlabUrl);
  return ["repo", "view", base.url === DEFAULT_GITLAB_URL ? slug : `${base.url}/${slug}`];
}

export async function repoExistsOnHost(
  host: GitHost,
  owner: string,
  repo: string,
  gitlabUrl?: string,
): Promise<boolean> {
  const slug = `${owner}/${repo}`;
  try {
    if (host === "gitlab") {
      await execFileAsync("glab", glabRepoViewArgs(slug, gitlabUrl), { maxBuffer: 1024 * 1024 });
      return true;
    }
    await execFileAsync("gh", ["repo", "view", slug], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}
