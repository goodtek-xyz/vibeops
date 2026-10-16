# TASK-026: task add dry-run crashes

## Status

Shipped

## Goal

`vibeops task add --dry-run` must show its plan and exit 0 without writing anything. Observed on 3.1.2: it printed the plan, then threw `ENOENT … open docs/tasks/TASK-NNN-….md` (exit 1). The plan also named the wrong branch (`task/<slug>` instead of `task/<NNN>-<slug>`).

## Scope

- Root cause: `startTaskBranch` (`src/lib/task-start.ts`) read the TASK file (`readTaskFile`, `readGitContext`) before its dry-run branch; `task add --dry-run` passes the path of a file it never wrote. Read the file only after the dry-run return (still before any checkout, as before)
- `task add` dry-run plan: branch name from `branchNameForTaskFile` (what the real run creates) instead of a re-derived slug without the TASK number
- Regression test through the built CLI (fails on the 3.1.2 source)
- CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Other `task add` behaviour, LLM scaffolding, id allocation
- Release / publish

## Acceptance Criteria

1. `task add --non-interactive --dry-run` exits 0, prints no error, writes no TASK file, creates no branch and leaves HEAD unchanged
2. The branch named in the dry-run plan equals the branch a real `task add` with the same idea creates
3. Non-dry `task add` unchanged (existing worktree / id allocation tests pass)
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New test in `tests/worktree-lifecycle.test.mjs` against the 3.1.2 source (expect failure) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `548c4f5ffa2d623a4f10c5ec8b917187e96456d9`
- Task Branch: `task/026-task-add-dry-run-crashes`
- Started At: `2026-10-16T05:32:39.072Z`

## Result

- update: `src/lib/task-start.ts` — `startTaskBranch` reads the TASK file (`readTaskFile`, `readGitContext`) only after the dry-run return; the branch name still comes from the file name. Non-dry order unchanged (read before any checkout)
- update: `src/commands/task-add.ts` — dry-run plan names `branchNameForTaskFile(filePath)` (e.g. `task/002-dry-probe`) instead of the slug without the TASK number
- test: `tests/worktree-lifecycle.test.mjs` — "task add --dry-run plans without writing, and names the branch the real run creates"
- docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-16.md`

## Test Result

- Before (3.1.2 source, new test): fails — `ENOENT … open …/docs/tasks/TASK-002-dry-probe.md`
- After: new test passes
- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 111 pass, 0 fail)
- CI: on the PR
