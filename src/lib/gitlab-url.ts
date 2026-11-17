/**
 * GitLab base URL (`.vibeops.json` `git.gitlabUrl`, `init --gitlab-url`).
 * Default is GitLab.com; a self-managed instance may use a port and a sub-path
 * (`https://example.invalid:8443/gitlab`). See docs/project/06-decisions.md D-017.
 */

export const DEFAULT_GITLAB_URL = "https://gitlab.com";

export class GitlabUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitlabUrlError";
  }
}

export interface GitlabBaseUrl {
  /** Normalized base URL, no trailing slash (e.g. `https://example.invalid/gitlab`). */
  readonly url: string;
  /** Lower-case hostname plus `:port` when non-default (glab `--hostname`). */
  readonly host: string;
  /** Lower-case hostname only (matched against SSH remotes, whose port differs). */
  readonly hostname: string;
  /** Sub-path without trailing slash, `""` when the instance is at the root. */
  readonly path: string;
}

/** Parse and normalize a GitLab base URL; throws `GitlabUrlError` on anything else. */
export function parseGitlabBaseUrl(raw: string): GitlabBaseUrl {
  const input = raw.trim();
  const hint = `Use a base URL such as ${DEFAULT_GITLAB_URL} or https://gitlab.example.com/gitlab`;
  if (input.length === 0) throw new GitlabUrlError(`GitLab URL is empty. ${hint}`);
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new GitlabUrlError(`Invalid GitLab URL "${input}". ${hint}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new GitlabUrlError(`GitLab URL must use https:// or http:// (got "${input}"). ${hint}`);
  }
  if (u.hostname.length === 0) throw new GitlabUrlError(`GitLab URL has no host: "${input}". ${hint}`);
  if (u.username || u.password) {
    throw new GitlabUrlError(`GitLab URL must not contain credentials. ${hint}`);
  }
  if (u.search || u.hash) {
    throw new GitlabUrlError(`GitLab URL must not contain a query or fragment: "${input}". ${hint}`);
  }
  const path = u.pathname.replace(/\/+$/, "");
  const hostname = u.hostname.toLowerCase();
  const host = u.port ? `${hostname}:${u.port}` : hostname;
  return { url: `${u.protocol}//${host}${path}`, host, hostname, path };
}

/** Resolve the configured base URL (absent → GitLab.com). */
export function resolveGitlabBaseUrl(configured: string | undefined): GitlabBaseUrl {
  return parseGitlabBaseUrl(configured ?? DEFAULT_GITLAB_URL);
}

export interface ParsedRemote {
  /** Lower-case hostname (no port). */
  readonly hostname: string;
  /** Path segments after the host (`.git` stripped). */
  readonly segments: readonly string[];
}

/** Parse an https, `ssh://`, or scp-style (`git@host:path`) remote URL. */
export function parseRemoteUrl(raw: string): ParsedRemote | null {
  const input = raw.trim();
  const toSegments = (p: string): string[] =>
    p.replace(/\.git\/?$/i, "").replace(/\/+$/, "").split("/").filter((s) => s.length > 0);

  if (/^(https?|ssh):\/\//i.test(input)) {
    try {
      const u = new URL(input);
      if (!u.hostname) return null;
      return { hostname: u.hostname.toLowerCase(), segments: toSegments(u.pathname) };
    } catch {
      return null;
    }
  }
  const scp = /^(?:[A-Za-z0-9_.-]+@)?([A-Za-z0-9.-]+):(?!\/\/)(.+)$/.exec(input);
  if (scp) return { hostname: scp[1]!.toLowerCase(), segments: toSegments(scp[2]!) };
  return null;
}

/**
 * `["--hostname", hostname]` for a self-managed instance, `[]` for GitLab.com, so default
 * users run the same glab commands as before (docs.gitlab.com/cli/api/,
 * docs.gitlab.com/cli/auth/status/). Never `host:port`: glab keys its config by hostname
 * and takes the port from that entry's `api_host` (set by `glab auth login --api-host`,
 * see `glabAuthLoginArgs`); `glab api --hostname host:port` is rejected ("invalid hostname").
 */
export function glabHostnameArgs(gitlabUrl: string | undefined): string[] {
  const base = resolveGitlabBaseUrl(gitlabUrl);
  return base.url === DEFAULT_GITLAB_URL ? [] : ["--hostname", base.hostname];
}

/**
 * glab builds API URLs as `<host>/api/v4` and has no API-path option, so a sub-path
 * instance (`https://example.invalid/gitlab`) cannot be reached by `glab repo create` /
 * `glab repo view`. Returns the refusal message, or null when the base URL is supported.
 */
export function gitlabCliUnsupportedReason(gitlabUrl: string | undefined): string | null {
  const base = resolveGitlabBaseUrl(gitlabUrl);
  if (base.path === "") return null;
  return `glab cannot reach a GitLab under a sub-path (${base.url}): it calls ${base.url.slice(0, base.url.length - base.path.length)}/api/v4. Create the project in the GitLab web UI, then choose "Connect an existing repository".`;
}
