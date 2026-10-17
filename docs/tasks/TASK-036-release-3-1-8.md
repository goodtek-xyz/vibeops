# TASK-036: Release 3.1.8

## Status

Shipped

## Goal

Prepare release 3.1.8 on `develop` (first release through the develop → main flow, D-010): version bump and release notes for TASK-033 (time values, D-009) and TASK-035 (`init` remote default branch).

## Scope

- `package.json` 3.1.7 → 3.1.8
- CHANGELOG `Unreleased` → `## 3.1.8 - 2026-10-17`
- `05-current-state.md` package line and entries

## Out of Scope

- The release itself (`vibeops task release`, tag `v3.1.8`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.1.8; no `Unreleased` entries left in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.1.8 after build; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `82760544ca53ddfd7579b1a5909ea6a955cc0d3a`
- Task Branch: `task/036-release-3-1-8`
- Started At: `2026-10-17T05:42:06.660Z`

## Result

- `package.json` 3.1.8; CHANGELOG `## 3.1.8 - 2026-10-17`; `05-current-state.md` updated

## Test Result

- `node dist/cli.js --version` → 3.1.8; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 138 pass, 0 fail)
- CI: on the PR
