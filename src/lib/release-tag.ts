import { fetchBaseBranch } from "./merge-base-freshness.js";
import { gitIsAncestor, runGit } from "./git.js";

export interface TagReleaseOptions {
  readonly cwd: string;
  readonly remote: string;
  readonly productionBranch: string;
  /** The release merge commit (host's merge commit SHA). */
  readonly commit: string;
}

export type TagReleaseResult =
  | { readonly ok: true; readonly tag: string; readonly commit: string }
  | { readonly ok: false; readonly message: string };

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Tag the release merge commit `v<package.json version>` and push the tag, so "merged into
 * production" and "tagged for publishing" are one step. Refuses when the commit is not on the
 * freshly fetched `<remote>/<production>`, when package.json has no plain semver `version`,
 * or when the tag already exists locally or on the remote (tags are never moved).
 */
export async function tagReleaseCommit(opts: TagReleaseOptions): Promise<TagReleaseResult> {
  const { cwd, remote, productionBranch, commit } = opts;
  let prodRef: string;
  try {
    prodRef = await fetchBaseBranch(cwd, remote, productionBranch);
  } catch (e) {
    return { ok: false, message: `could not fetch ${remote}/${productionBranch}: ${firstLine(e)}` };
  }
  if (!(await gitIsAncestor(cwd, commit, prodRef))) {
    return { ok: false, message: `${short(commit)} is not on ${remote}/${productionBranch}` };
  }
  let version: unknown;
  try {
    const { stdout } = await runGit(cwd, ["show", `${commit}:package.json`]);
    version = (JSON.parse(stdout) as { version?: unknown }).version;
  } catch {
    return { ok: false, message: `no readable package.json at ${short(commit)} to take the version from` };
  }
  if (typeof version !== "string" || !SEMVER_RE.test(version)) {
    return { ok: false, message: `package.json version at ${short(commit)} is not a semver string` };
  }
  const tag = `v${version}`;
  try {
    await runGit(cwd, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
    return { ok: false, message: `tag ${tag} already exists locally — tags are not moved` };
  } catch {
    // absent locally: good
  }
  try {
    const { stdout } = await runGit(cwd, ["ls-remote", "--tags", remote, `refs/tags/${tag}`]);
    if (stdout.trim().length > 0) {
      return { ok: false, message: `tag ${tag} already exists on ${remote} — tags are not moved` };
    }
  } catch (e) {
    return { ok: false, message: `could not list tags on ${remote}: ${firstLine(e)}` };
  }
  try {
    await runGit(cwd, ["tag", tag, commit]);
    await runGit(cwd, ["push", remote, `refs/tags/${tag}`]);
  } catch (e) {
    return { ok: false, message: `could not create / push ${tag}: ${firstLine(e)}` };
  }
  return { ok: true, tag, commit };
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function firstLine(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split("\n")[0]!;
}
