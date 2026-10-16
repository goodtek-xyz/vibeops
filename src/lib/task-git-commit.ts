import { dim, log } from "./logger.js";
import {
  gitAddPaths,
  gitPush,
  listUnstagedRelPaths,
  listWorkingTreeRelPaths,
  partitionPathsForAutoCommit,
  readGitInfo,
  runGit,
} from "./git.js";

export function featCommitMessageFor(taskId: string, title: string): string {
  const slug = title.replace(/^TASK-\d+\s*[:-]\s*/i, "").trim() || taskId;
  return `feat(${taskId.toLowerCase()}): ${slug}`;
}

export function docsCommitMessageFor(taskId: string, suffix: string): string {
  return `docs(${taskId.toLowerCase()}): ${suffix}`;
}

const CONVENTIONAL_COMMIT_RE = /^([a-z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/is;

/**
 * Normalize a raw commit message so it carries the TASK id as the conventional
 * commit scope (git-safety rule: `feat(task-001): …`).
 *
 * - `"fix: handle null"`            → `fix(task-001): handle null`
 * - `"fix(login): handle null"`     → `fix(task-001): handle null` (scope rewritten)
 * - `"handle null"`                 → `feat(task-001): handle null` (defaultType)
 * - already-scoped correct messages are returned unchanged.
 * - only the subject (first line) is scoped; a body and trailers after it
 *   (e.g. `Co-Authored-By:`) are kept line by line.
 */
export function taskScopedCommitMessage(
  taskId: string,
  rawMessage: string,
  defaultType = "feat",
): string {
  const scope = taskId.toLowerCase();
  const lines = rawMessage.replace(/\r\n?/g, "\n").trim().split("\n");
  const msg = (lines[0] ?? "").replace(/\s+/g, " ").trim();
  const body = lines.slice(1).map((l) => l.trimEnd()).join("\n").replace(/^\n+/, "");
  const withBody = (subject: string): string => (body.length > 0 ? `${subject}\n\n${body}` : subject);
  if (msg.length === 0) return withBody(`${defaultType}(${scope}): ${taskId}`);

  const m = CONVENTIONAL_COMMIT_RE.exec(msg);
  if (m) {
    const type = m[1]!.toLowerCase();
    const bang = m[3] ?? "";
    const subject = m[4]!.trim();
    return withBody(`${type}(${scope})${bang}: ${subject}`);
  }
  return withBody(`${defaultType}(${scope}): ${msg}`);
}

/**
 * Commit all committable dirty paths (staged and unstaged, including deletions
 * and renames); returns whether a commit was created. Only paths whose
 * working-tree state is not yet in the index are passed to `git add`; staged
 * changes are already part of the commit.
 */
export async function commitDirtyWorkingTree(
  cwd: string,
  message: string,
  dryRun: boolean,
): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (!git.isRepo || git.dirty !== true) return false;
  const { committable, excluded } = partitionPathsForAutoCommit(
    await listWorkingTreeRelPaths(cwd),
    { unmerged: [] },
  );
  if (committable.length === 0) return false;
  if (excluded.length > 0) {
    log.warn(`Skipping ${excluded.length} build artifact path(s) from auto-commit.`);
  }
  if (dryRun) {
    log.info(dim(`  would commit ${committable.length} path(s): ${message}`));
    return true;
  }
  const committableSet = new Set(committable);
  await gitAddPaths(
    cwd,
    (await listUnstagedRelPaths(cwd)).filter((p) => committableSet.has(p)),
  );
  await runGit(cwd, ["commit", "-q", "-m", message]);
  log.ok(`Committed: ${message}`);
  return true;
}

export async function pushBranch(
  cwd: string,
  remote: string,
  branch: string,
  setUpstream: boolean,
): Promise<void> {
  await gitPush(cwd, remote, branch, setUpstream);
}
