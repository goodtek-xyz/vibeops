# TASK-034: Adopt develop as integration branch

## Status

Shipped

## Goal

Follow the organization's branch standard (owner decision, 2026-10-17): `develop` is the integration and default branch, `main` only receives releases via `vibeops task release` (D-010).

## Scope

- `.vibeops.json`: `integrationBranch: develop`, `productionBranch: main`; `merge.releaseRequiredChecks` = the CI jobs (release PR gate)
- `.github/workflows/ci.yml`: push trigger on `develop` and `main`
- Docs: 09-deployment release flow (release-prep TASK → `task release` → tag on `main`), 05-current-state, AGENTS.md (gitleaks on `develop` / `main`), D-010, daily log
- Outside the diff (owner-approved, done around this TASK): `develop` created from `main` (`1d44474`); GitHub default branch → `develop` after this merges; open PRs retargeted to `develop`

## Out of Scope

- `vibeops init` setting the host default branch for new repositories (separate TASK)
- `publish.yml` (unchanged: tag must be on `main`)

## Acceptance Criteria

1. `vibeops task add` / `ship` / `merge` target `develop`; `task release --dry-run` plans `develop → main`
2. CI runs on PRs and on pushes to `develop` and `main`
3. Release docs describe the develop → main flow
4. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `vibeops task release --dry-run` and `vibeops status` on this branch
- `pnpm lint`, `pnpm smoke`; CI on the PR (and on the `develop` push after merge)

## Git Context

- Base Branch: `develop`
- Base Commit: `1d4447471616fd1cc36076d67776517fce3c7c99`
- Task Branch: `task/034-adopt-develop-as-integration-branch`
- Started At: `2026-10-17T05:13:45.829Z`

## Result

- update: `.vibeops.json` — `integrationBranch: develop`, `productionBranch: main`, `merge.releaseRequiredChecks` (CI jobs)
- update: `.github/workflows/ci.yml` — push on `develop`, `main`
- docs: `docs/project/09-deployment.md` release flow, `05-current-state.md`, `AGENTS.md`, D-010, `docs/logs/2026-10-17.md`
- outside the diff: `develop` created from `main` at `1d44474` (owner-approved)

## Test Result

- `vibeops task release --dry-run`: head `develop`, base `main`, required checks = CI jobs
- `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 134 pass, 0 fail)
- CI: on the PR
