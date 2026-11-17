import type { GitHost } from "../types/config.js";
import { parseRemoteUrl, resolveGitlabBaseUrl } from "./gitlab-url.js";

/**
 * Infer Git host from a remote URL. A remote on the configured GitLab host
 * (`git.gitlabUrl`, default GitLab.com) is GitLab even without "gitlab" in its name.
 */
export function detectGitHost(remoteUrl: string, gitlabUrl?: string): GitHost | null {
  const u = remoteUrl.trim().toLowerCase();
  if (u.includes("github.com")) return "github";
  if (u.includes("gitlab")) return "gitlab";
  if (gitlabUrl !== undefined) {
    const remote = parseRemoteUrl(remoteUrl);
    if (remote !== null && remote.hostname === resolveGitlabBaseUrl(gitlabUrl).hostname) {
      return "gitlab";
    }
  }
  return null;
}

export function mergeRequestLabel(host: GitHost): string {
  return host === "gitlab" ? "Merge request" : "Pull request";
}
