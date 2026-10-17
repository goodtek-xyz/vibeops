# TASK-050: New cycle records the base it starts from as Base Commit

## Status

Shipped

## Goal

After `task ship --new-cycle` the TASK file's Base Commit must be the base the cycle starts from, not the TASK's own feature commit (reported from a consumer repository; candidate recorded in TASK-049).

## Scope

- `refreshGitContextBaseCommit` (`src/lib/task-reship.ts`): fetch `<remote>/<base>`, record `git merge-base HEAD <remote>/<base>`; on failure keep the previous value with a warning
- `task-new-cycle.ts` passes the remote
- Test; CHANGELOG, `05-current-state.md` (candidate removed), daily log

## Out of Scope

- Rewriting Base Commit values of earlier cycles

## Acceptance Criteria

1. After a new cycle (integration merged), Base Commit = `git rev-parse origin/develop`, not the TASK's commit
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New test in `tests/worktree-lifecycle.test.mjs` (squash-merged first cycle, then a new cycle) against the pre-fix source and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `2eb988a282ee89a662c6a18f68629b5d25e4d651`
- Task Branch: `task/050-new-cycle-records-the-base-it-starts-from-as-base-commit`
- Started At: `2026-10-17T15:49:44.745Z`

## Result

- update: `src/lib/task-reship.ts` (`refreshGitContextBaseCommit`), `src/lib/task-new-cycle.ts`
- test: 1 new in `tests/worktree-lifecycle.test.mjs`
- docs: CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-18.md`

## Test Result

- Before (pre-fix source): new test fails (Base Commit was the TASK's commit)
- After: passes; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 156 pass, 0 fail)
- CI: on the PR
