import { mergeRequestLabel } from "./git-host.js";
import { getMergeRequestDetails, type MergeRequestState } from "./pr-create.js";
import type { GitHost } from "../types/config.js";

/**
 * Read the MR/PR once after `gh pr merge` / `glab mr merge` returned. Both merge APIs
 * answer synchronously — GitHub `200` with `merged: true`
 * (docs.github.com/rest/pulls/pulls#merge-a-pull-request), GitLab the merge request with
 * `state: "merged"` (docs.gitlab.com/api/merge_requests/#merge-a-merge-request; VibeOps
 * merges with `--auto-merge=false`) — so there is nothing to poll for. Not merged here
 * means the host queued it (merge queue / auto-merge): report, do not wait.
 */
export async function assertMergeRequestMerged(input: {
  cwd: string;
  host: GitHost;
  url: string;
  integrationBranch: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const label = mergeRequestLabel(input.host);
  const details = await getMergeRequestDetails(input.cwd, input.host, input.url);
  if (details?.state !== "merged" || details.mergedAt === null) {
    const state: MergeRequestState = details?.state ?? "unknown";
    return {
      ok: false,
      message: `${label} is ${state}, not merged into ${input.integrationBranch} (merge queue or auto-merge pending?). Wait for Merged on the host before task sync, or rerun \`vibeops task merge\`.`,
    };
  }
  return { ok: true };
}
