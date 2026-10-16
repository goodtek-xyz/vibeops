# TASK-031: PR body lists changes against the fetched base

## Status

Shipped

## Goal

The MR/PR body's Commits / Files lists show only this TASK's changes. Observed in a consumer repo (3.1.6): after `origin/develop` was merged into the task branch, the body listed another TASK's commit and file. Cause (checked read-only): the lists came from `<TASK Base Commit>..HEAD`, and the base merge brings every commit merged into the base since the Base Commit into that range. 3.1.5's stale-base check makes such merges routine.

## Scope

- `src/lib/task-push-pr.ts`: fetch `<remote>/<base>` and list `git log --no-merges <remote>/<base>..HEAD` and `git diff --name-only <remote>/<base>...HEAD` (merge-base); "no commits ahead" uses the same base; fall back to the Base Commit (with a warning) only when the fetch fails
- `fetchBaseBranch` extracted from the stale-base check (`src/lib/merge-base-freshness.ts`) and reused
- `gitLogOneline` option `noMerges`
- Test through the built CLI; CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Editing bodies of PRs that are already open
- The LLM prompt for the PR body (it receives the corrected summary)

## Acceptance Criteria

1. Task branch with `origin/develop` merged in → PR body lists this TASK's commit and file, not the other TASK's, and no merge commit
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/pr-body-range.test.mjs` (real git fixture, `task add` → commit → base moves → merge base → `task ship`, fake `gh` records `pr create --body`) against the 3.1.6 source (expect failure) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `5af1713cca5502c0fe3e5a15274bea1c5bc89250`
- Task Branch: `task/031-pr-body-lists-changes-against-the-fetched-base`
- Started At: `2026-10-16T23:23:42.354Z`

## Result

- update: `src/lib/task-push-pr.ts` — `resolveDiffBase` (fetch `<remote>/<base>`, fallback Base Commit with warning); `buildDiffSummary(base)` lists `--no-merges <base>..HEAD` commits and `<base>...HEAD` files; ahead count uses the same base
- update: `src/lib/merge-base-freshness.ts` — `fetchBaseBranch` (shared with the stale-base check)
- update: `src/lib/git.ts` — `gitLogOneline(..., { noMerges })`
- test: `tests/pr-body-range.test.mjs`
- docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before (3.1.6 source): new test fails — "another TASK's file is not listed"
- After: passes; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 131 pass, 0 fail)
- CI: on the PR
