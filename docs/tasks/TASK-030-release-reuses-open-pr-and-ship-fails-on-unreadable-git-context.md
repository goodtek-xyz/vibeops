# TASK-030: Release reuses open PR and ship fails on unreadable Git Context

## Status

In Progress

## Goal

Three findings from a consumer repo (3.1.5):

1. `task release` failed at `gh pr create` when the release PR was already open, so it had to be merged by hand after `--no-merge`.
2. The release dry-run said "required checks: (none configured)", read as "does not wait for CI". Checked (read-only): the release merge already waits for the PR's own CI (same gate as `task merge`); both recent release PRs there merged after their CI finished. Only the wording is fixed.
3. A TASK file with `## ## Git Context` (an edit artifact): `task ship` printed "No Git Context — push/MR skipped" and exited 0 without pushing, and `task add` in every worktree then "resumed" that TASK. First reported as a worktree problem; the cause is the heading.

## Scope

- `task release`: look up the open integration → production PR first and reuse it; a failing lookup refuses (fail closed); dry-run text names the reuse and the CI wait, `requiredChecks` shown as "by name, in addition"
- `findMalformedSectionHeading`, `gitContextProblem`, `damagedGitContext` in `src/lib/task.ts`
- `task ship`: unreadable Git Context → exit 1 before any commit / push (dry-run too), naming the line or the missing fields; same text in the open-PR update path
- `task add`: a blocking In Progress TASK with a damaged Git Context → exit 1 naming file and line, no resume (a TASK without the section at all still resumes)
- Tests (fail on the 3.1.5 source); README, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- `findMergeRequestByBranches` returns the helper's promise without `await` inside its `try`, so lookup errors escape the intended `catch` (also for `ship` / `del`); `task release` handles the error itself. Changing the helper changes other commands → separate TASK
- Auto-repairing TASK files

## Acceptance Criteria

1. Open release PR → reused (no `gh pr create`); none → created; lookup error → exit 1, nothing created or merged
2. Release dry-run lists the reuse and that the merge waits for the PR's own CI
3. `## ## Git Context` → `task ship` (and `--dry-run`) exit 1 naming the line; no commit, no push
4. Same file → `task add` exit 1 naming file and line; no new TASK, no second section
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/release-reuse.test.mjs`, Git Context tests in `tests/worktree-lifecycle.test.mjs`, detector unit test in `tests/ship-state.test.mjs` against the 3.1.5 source (expect failures) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `5df0bd1f1e3157eefcaa1d2f7e117326b91d11cc`
- Task Branch: `task/030-release-reuses-open-pr-and-ship-fails-on-unreadable-git-context`
- Started At: `2026-10-16T17:54:52.896Z`

## Result

- update: `src/commands/task-release.ts` — reuse the open release PR (`findMergeRequestByBranches`), fail closed on lookup error, clearer dry-run lines
- update: `src/lib/task.ts` — `findMalformedSectionHeading`, `gitContextProblem`, `damagedGitContext`
- update: `src/commands/task-ship.ts` — unreadable Git Context stops ship before committing (dry-run too); open-PR update path names the problem
- update: `src/commands/task-add.ts` — damaged Git Context on the blocking TASK refuses instead of resuming
- tests: `tests/release-reuse.test.mjs` (4), 2 Git Context tests in `tests/worktree-lifecycle.test.mjs`, 1 unit test; 3 existing release tests updated for the new wording / the `pr list` lookup
- docs: README, CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before (3.1.5 source, new tests): 6 fail — release created a PR although one was open (and never looked one up), old dry-run text, ship exited 0 without a push, task add resumed the damaged TASK, detector missing
- After: `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 130 pass, 0 fail)
- CI: on the PR
