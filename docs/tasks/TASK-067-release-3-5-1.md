# TASK-067: Release 3.5.1

## Status

Shipped

## Goal

Prepare release 3.5.1 on `develop` (owner-approved): GitLab `task merge` strict MR check accepts `detailed_merge_status` without the deprecated `merge_status` (TASK-066). Patch version: fix only.

## Scope

- `package.json` 3.5.0 → 3.5.1; CHANGELOG `## 3.5.1 - 2026-11-18`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.5.1; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.5.1; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `fc5d2c6bf6a779d3e30af5270b89683d2ca0801d`
- Task Branch: `task/067-release-3-5-1`
- Started At: `2026-11-18T04:12:56.313Z`

## Result

- `package.json` 3.5.1; CHANGELOG `## 3.5.1 - 2026-11-18`; `05-current-state.md` package / release / install / handoff "Released" lines

## Test Result

- `node dist/cli.js --version` → 3.5.1; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 192 pass, 0 fail)
- CI: on the PR
