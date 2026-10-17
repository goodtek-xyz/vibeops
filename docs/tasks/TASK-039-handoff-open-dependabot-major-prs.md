# TASK-039: Handoff: open Dependabot major PRs

## Status

In Progress

## Goal

The first Dependabot run (TASK-038) opened five PRs. Minor / patch groups were merged after CI; the three major-version PRs stay open with the reason recorded in the handoff section.

## Scope

- `05-current-state.md` handoff: open PR list with reasons (CI results, `engines` evidence)
- Daily log

## Out of Scope

- The major upgrades themselves (each its own TASK / owner decision on the Node floor)

## Acceptance Criteria

1. Each open PR is listed with its reason
2. `pnpm lint` passes; CI green

## Test Plan

- `gh pr list --state open`; `npm view <pkg>@<version> engines`; `pnpm lint`

## Git Context

- Base Branch: `develop`
- Base Commit: `d50f1437cb852173095edc1a8b17d932c370eb90`
- Task Branch: `task/039-handoff-open-dependabot-major-prs`
- Started At: `2026-10-17T07:55:44.932Z`

## Result

- update: `docs/project/05-current-state.md` — open Dependabot PRs #36–#38 with reasons; merged #34, #35 noted
- docs: `docs/logs/2026-10-17.md`

## Test Result

- #36 CI green; #37 CI fails (Node 20 / 22 / 24); #38 CI green; `commander@15.0.0` engines `node >=22.12.0`, this package `node >=20`
- After merging #34 then #35 (the second was merged after the first moved `develop` without re-checking its base): `pnpm install --frozen-lockfile` OK, `pnpm test` 138 pass, lint / typecheck / smoke OK, `develop` CI green at `d50f143`
- `pnpm lint` OK
