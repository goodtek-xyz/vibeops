# TASK-053: Release 3.3.0

## Status

Shipped

## Goal

Prepare release 3.3.0 on `develop` (owner-approved): `task add --repair-baseline` for baseline repair TASKs (D-015, TASK-052). Minor version: new feature, no breaking change.

## Scope

- `package.json` 3.2.0 → 3.3.0; CHANGELOG `## 3.3.0 - 2026-10-18`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.3.0; no `Unreleased:` entries in `05-current-state.md`; the handoff "Released" line no longer names a stale tag
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.3.0; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `0c309a459f12140a84dbd9f7df2f53e8dacb8dd6`
- Task Branch: `task/053-release-3-3-0`
- Started At: `2026-10-17T18:31:55.420Z`

## Result

- `package.json` 3.3.0; CHANGELOG `## 3.3.0 - 2026-10-18`; `05-current-state.md` package / release / install lines, handoff "Released" line reworded (releases tagged `vX.Y.Z` on the release merge commit on `main`, no stale tag)

## Test Result

- `node dist/cli.js --version` → 3.3.0; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 158 pass, 0 fail)
- CI: on the PR
