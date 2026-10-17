# TASK-040: Handoff: mark-shipped commit keeps -m trailers (candidate)

## Status

In Progress

## Goal

Record a reported gap as a next-feature candidate in the handoff section: the "mark shipped" metadata commit drops the body and trailers of `task ship -m`.

## Scope

- `05-current-state.md` handoff: candidate 2 (evidence: fixed `docsCommitMessageFor(…, "mark shipped")` in `src/commands/task-ship.ts`); renumber the list

## Out of Scope

- The fix itself (next feature)

## Acceptance Criteria

1. Candidate listed with the code location
2. `pnpm lint` passes

## Test Plan

- `grep -n "mark shipped" src/commands/task-ship.ts`; `pnpm lint`

## Git Context

- Base Branch: `develop`
- Base Commit: `e25701447b44507903c9e96e3463ac15300f9047`
- Task Branch: `task/040-handoff-mark-shipped-commit-keeps-m-trailers-candidate`
- Started At: `2026-10-17T08:00:34.678Z`

## Result

- update: `docs/project/05-current-state.md` — next feature candidate "metadata commit keeps `-m` trailers"
- docs: `docs/logs/2026-10-17.md`

## Test Result

- `src/commands/task-ship.ts:146` and `:320` build the metadata commit with `docsCommitMessageFor(…, "mark shipped")` (no `-m` body / trailers)
- `pnpm lint` OK
