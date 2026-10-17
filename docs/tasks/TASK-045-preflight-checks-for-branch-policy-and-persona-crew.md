# TASK-045: Preflight checks for branch policy and persona crew

## Status

In Progress

## Goal

The maintainers' rule for all their repositories (owner, 2026-10-17): changes go through the persona crew and the VibeOps TASK flow into `develop`; `main` only through `task release`. `task add` / `task ship` check what they can see before creating or pushing anything, warn by default.

## Scope

- `src/lib/project-baseline.ts`: `baseline` config (`mode` off / warn / enforce, `crew`), strict parse; checks `branch-policy`, `default-branch` (`git ls-remote --symref`), `personas`, `agents-contract` (only with `crew`); `preflightBaseline`
- `task add` / `task ship`: run it first; enforce → exit 1 before anything happens
- `.vibeops.json` (this repository): `baseline.crew: vibe-crew`; config preserves the raw `baseline` block on re-init
- Tests; README "Baseline checks", D-012, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Host settings (branch protection, extra branches) — host / platform checks
- `task release --tag` and `status` summary (next TASKs)

## Acceptance Criteria

1. Check names match the maintainers' baseline report (`personas`, `agents-contract`, `default-branch`) plus `branch-policy`
2. warn → messages + fix, continue; enforce → exit 1, no TASK created; off → skipped; invalid block → stop
3. Crew checks only with `baseline.crew`
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/project-baseline.test.mjs` (config parsing, branch checks against a bare origin with HEAD set, crew files, preflight modes, CLI enforce)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `7ad2e5f46d0f1810c8ee786b5f479aaf52d123eb`
- Task Branch: `task/045-preflight-checks-for-branch-policy-and-persona-crew`
- Started At: `2026-10-17T13:16:19.485Z`

## Result

- new: `src/lib/project-baseline.ts`
- update: `src/commands/task-add.ts`, `src/commands/task-ship.ts` (preflight), `src/types/config.ts`, `src/lib/config.ts` (preserve `baseline`)
- update: `.vibeops.json` — `baseline.crew: vibe-crew`
- test: `tests/project-baseline.test.mjs` (5)
- docs: README, D-012, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before: the module did not exist (new tests cannot import it)
- After: 5 new tests pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 147 pass, 0 fail)
- This repository: `task ship --dry-run` prints no baseline warning (all four checks pass with `crew: vibe-crew`)
- CI: on the PR
