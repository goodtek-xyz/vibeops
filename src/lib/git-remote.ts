import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  brewInstall,
  formatHostCliHint,
  formatHostCliMissingMessage,
  glabAuthLoginArgs,
  hostCliTool,
  parseOwnerRepo,
  probeBrew,
  probeHostCliAuth,
  remoteUrlForHost,
  repoExistsOnHost,
  runInteractiveCli,
  type HostCliTool,
} from "./git-host-cli.js";
import { detectGitHost } from "./git-host.js";
import {
  DEFAULT_GITLAB_URL,
  GitlabUrlError,
  gitlabCliUnsupportedReason,
  glabHostnameArgs,
  parseGitlabBaseUrl,
  resolveGitlabBaseUrl,
} from "./gitlab-url.js";
import { gitRemoteUrl, runGit } from "./git.js";
import { askInput, askSelect, askYesNo } from "./inquirer-helpers.js";
import { dim, log, yellow } from "./logger.js";
import type { GitHost } from "../types/config.js";

const execFileAsync = promisify(execFile);

export interface EnsureRemoteOptions {
  readonly cwd: string;
  readonly remoteName?: string;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly allowMissing?: boolean;
  /** Preferred host from `--git-host` (used when interactive select is skipped). */
  readonly preferredHost?: GitHost;
  /** GitLab `glab repo create --defaultBranch` (defaults to main). */
  readonly defaultBranch?: string;
  /**
   * GitLab base URL from `--gitlab-url` or `.vibeops.json` (normalized). Absent = GitLab.com.
   * When set from the flag, the interactive GitLab URL prompt is skipped.
   */
  readonly gitlabUrl?: string;
  /** True when `gitlabUrl` came from `--gitlab-url` (no prompt). */
  readonly gitlabUrlFromFlag?: boolean;
}

export interface EnsureRemoteResult {
  readonly remote: string;
  readonly url: string;
  readonly host: GitHost;
  /** True when the user chose local-only / skip. */
  readonly skipped?: boolean;
  /** True when init created this repository on the host (not an existing one). */
  readonly created?: boolean;
  /** GitLab base URL used for this remote (normalized; undefined = GitLab.com). */
  readonly gitlabUrl?: string;
}

async function createGithubRepo(cwd: string, name: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "gh",
    ["repo", "create", name, "--source=.", "--remote=origin", "--push", "--private"],
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
  if (match) return match[0]!.replace(/\.git$/, "") + ".git";
  const url = await gitRemoteUrl(cwd, "origin");
  if (url) return url;
  throw new Error("gh repo create finished but origin URL could not be read.");
}

/**
 * `glab repo create` argv. A self-managed instance is selected by passing the project as a
 * full URL (docs.gitlab.com/cli/repo/create/: "provide either a GITLAB_HOST environment
 * variable, or a full URL for the project"); GitLab.com keeps the plain path.
 * Throws `GitlabUrlError` for a sub-path base URL (glab cannot reach it).
 */
export function glabRepoCreateArgs(
  name: string,
  defaultBranch: string,
  remote: string,
  gitlabUrl?: string,
): string[] {
  const reason = gitlabCliUnsupportedReason(gitlabUrl);
  if (reason !== null) throw new GitlabUrlError(reason);
  const base = resolveGitlabBaseUrl(gitlabUrl);
  const path = name.trim().replace(/^\/+|\/+$/g, "");
  const target = base.url === DEFAULT_GITLAB_URL ? path : `${base.url}/${path}`;
  return ["repo", "create", target, "--remoteName", remote, "--defaultBranch", defaultBranch];
}

async function createGitlabRepo(
  cwd: string,
  name: string,
  defaultBranch: string,
  gitlabUrl: string | undefined,
): Promise<string> {
  await execFileAsync("glab", glabRepoCreateArgs(name, defaultBranch, "origin", gitlabUrl), {
    cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
  const url = await gitRemoteUrl(cwd, "origin");
  if (url) return url;
  throw new Error("glab repo create finished but origin URL could not be read.");
}

async function addRemoteUrl(
  cwd: string,
  remote: string,
  url: string,
  gitlabUrl: string | undefined,
): Promise<EnsureRemoteResult> {
  const host = detectGitHost(url, gitlabUrl);
  if (!host) {
    throw new Error("Only GitHub and GitLab HTTPS/SSH URLs are supported.");
  }
  await runGit(cwd, ["remote", "add", remote, url.trim()]);
  return { remote, url: url.trim(), host, ...(gitlabUrl ? { gitlabUrl } : {}) };
}

/**
 * Remote URL for "connect existing": a full https/ssh URL is kept (`.git` appended);
 * `owner/repo` (or `group/sub/project`) becomes an HTTPS URL on the host's base URL.
 */
export function resolveConnectUrl(host: GitHost, input: string, gitlabUrl?: string): string {
  const trimmed = input.trim();
  const isUrl = /^(https?:\/\/|ssh:\/\/)/i.test(trimmed) || /^[^/\s]+@[^/\s]+:/.test(trimmed);
  if (isUrl) {
    if (parseOwnerRepo(trimmed, gitlabUrl) || detectGitHost(trimmed, gitlabUrl)) {
      return /\.git$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\/+$/, "")}.git`;
    }
    throw new Error(`Could not parse remote: ${trimmed}`);
  }
  const parsed = parseOwnerRepo(trimmed, gitlabUrl);
  if (parsed) return remoteUrlForHost(host, parsed.owner, parsed.repo, gitlabUrl);
  throw new Error(`Could not parse remote: ${trimmed}`);
}

async function repairMissingCli(
  host: GitHost,
  gitlabUrl: string | undefined,
): Promise<"retry" | "manual" | "skip"> {
  const tool = hostCliTool(host);
  const status = await probeHostCliAuth(host, gitlabUrl);
  log.warn(
    status === "missing"
      ? formatHostCliMissingMessage(host, "create a remote repository")
      : `${tool} is installed but not logged in.`,
  );
  for (const line of formatHostCliHint(host, gitlabUrl)) {
    log.info(dim(`  ${line}`));
  }

  const loginArgs = host === "gitlab" ? glabAuthLoginArgs(gitlabUrl) : [tool, "auth", "login"];
  const brewOk = status === "missing" ? await probeBrew() : false;
  const choices = [
    "I installed / logged in — retry",
    ...(brewOk ? [`Run brew install ${tool}`] : []),
    "Enter remote URL manually",
    "Skip remote for now",
  ];

  // Loop so brew install / retry can re-prompt.
  for (;;) {
    const pick = await askSelect({
      message: "How do you want to continue?",
      nonInteractive: false,
      choices,
    });

    if (pick === "I installed / logged in — retry") {
      const again = await probeHostCliAuth(host, gitlabUrl);
      if (again === "ok") return "retry";
      log.warn(
        again === "missing"
          ? `${tool} still not found on PATH.`
          : `${tool} still not authenticated. Run \`${loginArgs.join(" ")}\`.`,
      );
      continue;
    }

    if (pick.startsWith("Run brew install")) {
      log.info(dim(`Running: brew install ${tool}`));
      try {
        await brewInstall(tool as HostCliTool);
        log.ok(`Installed ${tool}`);
        log.info(dim(`Next: ${loginArgs.join(" ")}`));
        const loginNow = await askYesNo({
          message: `Run \`${loginArgs.join(" ")}\` now?`,
          nonInteractive: false,
          defaultValue: true,
        });
        if (loginNow) {
          try {
            await runInteractiveCli(tool, loginArgs.slice(1));
          } catch {
            /* user may cancel */
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`brew install failed: ${msg}`);
      }
      continue;
    }

    if (pick === "Enter remote URL manually") return "manual";
    return "skip";
  }
}

async function connectExisting(
  cwd: string,
  remote: string,
  host: GitHost,
  gitlabUrl: string | undefined,
): Promise<EnsureRemoteResult> {
  const input = await askInput({
    message: "Repository URL or owner/repo",
    nonInteractive: false,
    required: true,
  });
  const url = resolveConnectUrl(host, input, gitlabUrl);
  const parsed = parseOwnerRepo(url, gitlabUrl) ?? parseOwnerRepo(input, gitlabUrl);

  const cliUsable = host !== "gitlab" || gitlabCliUnsupportedReason(gitlabUrl) === null;
  if (parsed && cliUsable && (await probeHostCliAuth(host, gitlabUrl)) === "ok") {
    const exists = await repoExistsOnHost(host, parsed.owner, parsed.repo, gitlabUrl);
    if (!exists) {
      log.warn(
        yellow(
          `Could not verify ${parsed.owner}/${parsed.repo} on ${host} (missing or private). Continuing with remote add.`,
        ),
      );
    }
  }

  return addRemoteUrl(cwd, remote, url, gitlabUrl);
}

async function createOnHost(
  cwd: string,
  remote: string,
  host: GitHost,
  defaultBranch: string,
  gitlabUrl: string | undefined,
): Promise<EnsureRemoteResult> {
  const folder = basename(cwd);
  const label = host === "gitlab" ? "GitLab project path (group/project)" : "GitHub repository (owner/repo or name)";
  const name = await askInput({
    message: label,
    nonInteractive: false,
    required: true,
    default: folder,
  });

  log.info(dim(`Creating ${host} repository via ${hostCliTool(host)}…`));
  if (host === "gitlab") {
    const url = await createGitlabRepo(cwd, name, defaultBranch, gitlabUrl);
    // glab may name remote differently; ensure our remote name.
    const current = await gitRemoteUrl(cwd, remote);
    if (!current) {
      const origin = await gitRemoteUrl(cwd, "origin");
      if (origin && remote !== "origin") {
        await runGit(cwd, ["remote", "rename", "origin", remote]);
      }
    }
    return { remote, url, host, created: true, ...(gitlabUrl ? { gitlabUrl } : {}) };
  }
  const url = await createGithubRepo(cwd, name);
  return { remote, url, host, created: true };
}

/**
 * Make `branch` the host's default branch (official CLIs: `gh repo edit --default-branch`,
 * cli.github.com/manual/gh_repo_edit; GitLab project API `default_branch` via `glab api`,
 * docs.gitlab.com/api/projects/#edit-a-project; `:id` placeholder: docs.gitlab.com/cli/api/).
 * GitLab targets the configured instance with `glab api --hostname` (docs.gitlab.com/cli/api/).
 * Returns false (caller prints the manual step) when the CLI call fails.
 */
export async function setRemoteDefaultBranch(
  cwd: string,
  host: GitHost,
  branch: string,
  gitlabUrl?: string,
): Promise<boolean> {
  try {
    if (host === "gitlab") {
      await execFileAsync("glab", glabSetDefaultBranchArgs(branch, gitlabUrl), {
        cwd,
        maxBuffer: 1024 * 1024,
      });
    } else {
      await execFileAsync("gh", ["repo", "edit", "--default-branch", branch], {
        cwd,
        maxBuffer: 1024 * 1024,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** `glab api` argv that sets the project's default branch on the configured instance. */
export function glabSetDefaultBranchArgs(branch: string, gitlabUrl?: string): string[] {
  return [
    "api",
    ...glabHostnameArgs(gitlabUrl),
    "--method",
    "PUT",
    "projects/:id",
    "--raw-field",
    `default_branch=${branch}`,
  ];
}

/** Ask for the GitLab base URL (pre-filled), re-asking until it parses. */
async function askGitlabUrl(initial: string | undefined): Promise<string | undefined> {
  for (;;) {
    const answer = await askInput({
      message: "GitLab URL",
      nonInteractive: false,
      required: true,
      default: initial ?? DEFAULT_GITLAB_URL,
    });
    try {
      const { url } = parseGitlabBaseUrl(answer);
      return url === DEFAULT_GITLAB_URL ? undefined : url;
    } catch (e) {
      if (e instanceof GitlabUrlError) {
        log.warn(e.message);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Ensures `origin` (or named remote) exists.
 * Interactive: ask host → create/connect; soft-gate when CLI missing.
 */
export async function ensureOriginRemote(
  opts: EnsureRemoteOptions,
): Promise<EnsureRemoteResult | null> {
  const remote = opts.remoteName ?? "origin";
  const existing = await gitRemoteUrl(opts.cwd, remote);
  if (existing) {
    const host = detectGitHost(existing, opts.gitlabUrl);
    if (!host) {
      log.warn(`Remote ${remote} URL is not GitHub or GitLab: ${existing}`);
      if (opts.allowMissing) return null;
      throw new Error("Only GitHub and GitLab remotes are supported.");
    }
    return { remote, url: existing, host, ...(opts.gitlabUrl ? { gitlabUrl: opts.gitlabUrl } : {}) };
  }

  if (opts.dryRun) {
    const host = opts.preferredHost ?? "github";
    const where = host === "gitlab" ? ` at ${resolveGitlabBaseUrl(opts.gitlabUrl).url}` : "";
    log.info(dim(`would configure git remote ${remote} (${host}${where})`));
    return { remote, url: "(dry-run)", host, ...(opts.gitlabUrl ? { gitlabUrl: opts.gitlabUrl } : {}) };
  }

  if (opts.allowMissing) {
    return null;
  }

  if (opts.nonInteractive) {
    throw new Error(
      `Git remote "${remote}" is not configured. Add it with: git remote add ${remote} <url>`,
    );
  }

  log.blank();
  log.info("Remote setup — used later for pull requests / merge requests.");

  const hostPick = await askSelect({
    message: "Where will this project's remote live?",
    nonInteractive: false,
    choices: ["GitHub", "GitLab", "Skip for now (local only)"],
    default:
      opts.preferredHost === "gitlab"
        ? "GitLab"
        : opts.preferredHost === "github"
          ? "GitHub"
          : undefined,
  });

  if (hostPick.startsWith("Skip")) {
    log.warn("No git remote configured. task ship push/MR will fail until origin exists.");
    log.info(dim(`  Later: git remote add ${remote} <url>`));
    return null;
  }

  const host: GitHost = hostPick === "GitLab" ? "gitlab" : "github";
  const gitlabUrl =
    host === "gitlab" && opts.gitlabUrlFromFlag !== true
      ? await askGitlabUrl(opts.gitlabUrl)
      : opts.gitlabUrl;

  const mode = await askSelect({
    message: "Set up the remote",
    nonInteractive: false,
    choices: ["Create a new repository", "Connect an existing repository"],
  });

  if (mode.startsWith("Connect")) {
    return connectExisting(opts.cwd, remote, host, gitlabUrl);
  }
  const unsupported = host === "gitlab" ? gitlabCliUnsupportedReason(gitlabUrl) : null;
  if (unsupported !== null) {
    log.error(unsupported);
    return connectExisting(opts.cwd, remote, host, gitlabUrl);
  }

  // Create path — requires authenticated CLI (soft gate).
  for (;;) {
    const auth = await probeHostCliAuth(host, gitlabUrl);
    if (auth === "ok") {
      const defaultBranch =
        typeof opts.defaultBranch === "string" && opts.defaultBranch.length > 0
          ? opts.defaultBranch
          : "main";
      return createOnHost(opts.cwd, remote, host, defaultBranch, gitlabUrl);
    }

    const action = await repairMissingCli(host, gitlabUrl);
    if (action === "retry") continue;
    if (action === "manual") {
      return connectExisting(opts.cwd, remote, host, gitlabUrl);
    }
    log.warn("No git remote configured. task ship push/MR will fail until origin exists.");
    log.info(dim(`  Later: git remote add ${remote} <url>`));
    return null;
  }
}
