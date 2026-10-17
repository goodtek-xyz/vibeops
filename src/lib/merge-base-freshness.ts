import { gitIsAncestor, runGit } from "./git.js";

export interface BaseInHeadOptions {
  readonly cwd: string;
  readonly remote: string;
  readonly baseBranch: string;
  readonly headSha: string;
}

export type BaseInHeadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: string };

/** Fetch `<remote>/<baseBranch>` into its remote-tracking ref and return that ref. Throws on failure. */
export async function fetchBaseBranch(
  cwd: string,
  remote: string,
  baseBranch: string,
): Promise<string> {
  const baseRef = `refs/remotes/${remote}/${baseBranch}`;
  await runGit(cwd, ["fetch", "--no-tags", remote, `+refs/heads/${baseBranch}:${baseRef}`]);
  return baseRef;
}

/**
 * The MR/PR head must contain the current tip of its base branch.
 *
 * A head that does not (base moved, or the branch was rebuilt on a stale base,
 * e.g. `git reset --soft <old base>` + commit) can silently revert work merged
 * into the base since; a squash merge then lands that revert. Fetches the base
 * branch and the head commit first; any fetch / read failure fails closed.
 */
export async function checkBaseInHead(opts: BaseInHeadOptions): Promise<BaseInHeadResult> {
  const { cwd, remote, baseBranch, headSha } = opts;
  const baseRef = `refs/remotes/${remote}/${baseBranch}`;
  try {
    await fetchBaseBranch(cwd, remote, baseBranch);
    if (!(await commitExists(cwd, headSha))) {
      await runGit(cwd, ["fetch", "--no-tags", remote, headSha]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return {
      ok: false,
      problem: `could not fetch ${remote}/${baseBranch} and head ${short(headSha)} to check the base is current (${msg})`,
    };
  }

  if (await gitIsAncestor(cwd, baseRef, headSha)) return { ok: true };

  let behind = "";
  try {
    const { stdout } = await runGit(cwd, ["rev-list", "--count", `${headSha}..${baseRef}`]);
    behind = ` (${stdout.trim()} commit(s) behind)`;
  } catch {
    // count is informational only
  }
  return {
    ok: false,
    problem:
      `stale base: head ${short(headSha)} does not contain ${remote}/${baseBranch}${behind}. ` +
      `Merging it can silently revert work merged into ${baseBranch} since. ` +
      `Update the task branch (git fetch ${remote} && git merge ${remote}/${baseBranch}, resolve, test), ` +
      `push it (vibeops task ship), wait for CI, then rerun vibeops task merge.`,
  };
}

async function commitExists(cwd: string, sha: string): Promise<boolean> {
  try {
    await runGit(cwd, ["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function short(sha: string): string {
  return sha.slice(0, 7);
}
