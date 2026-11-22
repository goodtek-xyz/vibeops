# TASK-071: Release 3.6.0

## Status

In Progress

## Goal

Prepare release 3.6.0 on `develop` (owner-approved): consumer `AGENTS.md` "Testing and host safety" rule and `CLAUDE.md` `@AGENTS.md` import (TASK-069, TASK-070); dev-dependency minimatch advisory resolved (TASK-068). Minor version: changed consumer templates.

## Scope

- `package.json` 3.5.1 → 3.6.0; CHANGELOG `## 3.6.0 - 2026-11-22`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.6.0; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.6.0; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `9e1a7d42cab070e7d498c7454b54de63d592f66d`
- Task Branch: `task/071-release-3-6-0`
- Started At: `2026-11-22T09:42:25.871Z`

## Result

- `package.json` 3.6.0; CHANGELOG `## 3.6.0 - 2026-11-22`; `05-current-state.md` package / release / install / handoff "Released" lines

## Test Result

- `node dist/cli.js --version` → 3.6.0; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 192 pass, 0 fail)
- CI: on the PR
