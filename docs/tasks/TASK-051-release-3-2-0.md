# TASK-051: Release 3.2.0

## Status

In Progress

## Goal

Prepare release 3.2.0 on `develop` (owner-approved): baseline checks in `task add` / `task ship` (TASK-045), `task release --tag` (TASK-046), baseline in `vibeops status` (TASK-047), stale-branch update in `task merge` (TASK-048), new-cycle Base Commit fix (TASK-050). Minor version: new features, no breaking change.

## Scope

- `package.json` 3.1.9 → 3.2.0; CHANGELOG `## 3.2.0 - 2026-10-18`; `05-current-state.md`

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.2.0; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.2.0; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `a009bf7b229b744aef06a1e07ea30f2fcb08cc08`
- Task Branch: `task/051-release-3-2-0`
- Started At: `2026-10-17T15:53:30.838Z`

## Result

- `package.json` 3.2.0; CHANGELOG `## 3.2.0 - 2026-10-18`; `05-current-state.md` package / release / install lines

## Test Result

- `node dist/cli.js --version` → 3.2.0; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 156 pass, 0 fail)
- CI: on the PR
