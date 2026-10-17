# TASK-052: task add --repair-baseline for baseline repair TASKs

## Status

Shipped

## Goal

With `baseline.mode: enforce`, a broken baseline stops `task add`, so the TASK that fixes it cannot be opened. The working recovery (edit `.vibeops.json` to `warn` locally, uncommitted) is replaced by an explicit, recorded path: `task add --repair-baseline`.

## Scope

- `preflightBaseline` options: `repair` (add: failures → warnings, invalid `baseline` block → defaults with a warning), `requireOk` (ship: every check must pass, any mode)
- `task add --repair-baseline`: writes `## Baseline` (Repair …) after Status; the enforce refusal now names the flag
- `task ship`: a TASK with that section ships only when every check passes
- Tests; README, D-015, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Changing what the checks verify

## Acceptance Criteria

1. Enforce + failing check: plain `task add` stops and names `--repair-baseline`; with the flag a TASK is created and marked
2. `task ship` of the repair TASK stops while a check fails, passes after the repair
3. Invalid `baseline` block: repair add continues; repair ship stops
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- 2 new tests in `tests/project-baseline.test.mjs` (preflight modes; CLI flow add → ship refused → repair host default branch → ship) against the pre-fix source and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `c793840722305384ca27dbcfc516e2526f598c28`
- Task Branch: `task/052-task-add-repair-baseline-for-baseline-repair-tasks`
- Started At: `2026-10-17T17:45:37.450Z`

## Result

- update: `src/lib/project-baseline.ts` (`PreflightOptions`, repair section constants), `src/lib/task.ts` (`withSectionAfterStatus`), `src/commands/task-add.ts`, `src/commands/task-ship.ts`, `src/cli.ts`
- tests: 2 new in `tests/project-baseline.test.mjs`
- docs: README, D-015, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-18.md`

## Test Result

- Before (pre-fix source): both new tests fail
- After: pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 158 pass, 0 fail)
- CI: on the PR
