/**
 * Git trailers for commits VibeOps creates itself (`.vibeops.json` `git.commitTrailers`).
 * Each entry is passed as `git commit --trailer <entry>` (git-commit(1), git-interpret-trailers(1)).
 */

export class CommitTrailersConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitTrailersConfigError";
  }
}

/** `Token: value` — token of letters, digits and `-` (git trailer key), non-empty single-line value. */
const TRAILER_RE = /^[A-Za-z0-9][A-Za-z0-9-]*: \S.*$/;

/**
 * Validate the raw `git.commitTrailers` value. Absent → `undefined`; anything that is not
 * an array of single-line `Token: value` strings throws (fail closed, entry named).
 */
export function parseCommitTrailers(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new CommitTrailersConfigError(
      ".vibeops.json git.commitTrailers must be an array of \"Token: value\" strings.",
    );
  }
  return raw.map((entry, i) => {
    if (typeof entry !== "string" || /[\r\n]/.test(entry) || !TRAILER_RE.test(entry)) {
      throw new CommitTrailersConfigError(
        `.vibeops.json git.commitTrailers[${i}] is invalid: ${JSON.stringify(entry)} — expected one line "Token: value" (e.g. "Co-Authored-By: Name <name@example.com>").`,
      );
    }
    return entry;
  });
}

/** `git commit` arguments for the trailers (`--trailer <t>` each). */
export function commitTrailerArgs(trailers: readonly string[]): string[] {
  return trailers.flatMap((t) => ["--trailer", t]);
}
