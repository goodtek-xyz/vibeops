# TASK-049: Handoff: new-cycle Base Commit candidate

## Status

In Progress

## Goal

Record a reported defect as a next-feature candidate: `task ship --new-cycle` writes the TASK's own feature commit as Base Commit.

## Scope

- `05-current-state.md` handoff: candidate 5 with code location and check; daily log

## Out of Scope

- The fix (next feature)

## Acceptance Criteria

1. Candidate listed with evidence; `pnpm lint` passes

## Test Plan

- Read `refreshGitContextBaseCommit` in `src/lib/task-reship.ts`; `pnpm lint`

## Git Context

- Base Branch: `develop`
- Base Commit: `4c751d5efffe67c1e983082b46ceeb2aada490c3`
- Task Branch: `task/049-handoff-new-cycle-base-commit-candidate`
- Started At: `2026-10-17T15:30:18.894Z`

## Result

- update: `docs/project/05-current-state.md` — candidate 5 (new-cycle Base Commit)
- docs: `docs/logs/2026-10-18.md`

## Test Result

- `src/lib/task-reship.ts:357-365`: `refreshGitContextBaseCommit` sets `baseCommit` to `gitHeadCommit(cwd)` (task branch HEAD, after the follow-up commit in `task-new-cycle.ts`)
- `pnpm lint` OK
