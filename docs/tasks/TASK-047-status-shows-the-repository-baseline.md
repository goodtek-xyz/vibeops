# TASK-047: status shows the repository baseline

## Status

Shipped

## Goal

`vibeops status` shows whether the repository follows the VibeOps baseline: the checks of `task add` / `task ship` (D-012), the persona crew and its pinned catalog commit, and remote branches beyond integration / production / `task/*` / `sync/*`.

## Scope

- `src/lib/project-baseline.ts`: `summarizeBaseline` (read-only, never throws)
- `src/commands/status.ts`: `baseline` in the report (`--json`) and `Baseline` / `Branches` lines
- Tests; README, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Host settings (branch protection, PR state of other branches)

## Acceptance Criteria

1. `status` prints `Baseline ok (…)` or the failing checks, mode, crew + commit; other remote branches listed
2. `status --json` has `baseline` (mode, crew, crewCommit, checks, otherBranches, configError)
3. Invalid `baseline` block shown, not thrown
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New test in `tests/project-baseline.test.mjs` (summary against a bare origin with extra branches); `vibeops status` / `--json` on this repository
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `12737c08a00737f70eb8673adad6d864cf53db37`
- Task Branch: `task/047-status-shows-the-repository-baseline`
- Started At: `2026-10-17T13:25:20.274Z`

## Result

- update: `src/lib/project-baseline.ts` (`summarizeBaseline`), `src/commands/status.ts`
- test: 1 new in `tests/project-baseline.test.mjs`
- docs: README, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- This repository: `Baseline  ok (branch-policy, default-branch, personas, agents-contract) · mode warn · vibe-crew 4ecec1f`; `Branches  other remote branches:` the 3 open Dependabot PR branches; `--json` baseline block matches
- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 152 pass, 0 fail)
- CI: on the PR
