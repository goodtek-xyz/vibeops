# TASK-055: Release 3.3.1

## Status

Shipped

## Goal

Prepare release 3.3.1 on `develop` (owner-approved): `init` lists the coding agents as Claude Code, Codex CLI, Cursor (TASK-054). Patch version: a changed prompt order, no new feature, no breaking change.

## Scope

- `package.json` 3.3.0 → 3.3.1; CHANGELOG `## 3.3.1 - 2026-10-18`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.3.1; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.3.1; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `d9c6b25b53c99cd47043933351272b5bf98deb7d`
- Task Branch: `task/055-release-3-3-1`
- Started At: `2026-10-17T19:15:51.145Z`

## Result

- `package.json` 3.3.1; CHANGELOG `## 3.3.1 - 2026-10-18`; `05-current-state.md` package / release / install / handoff "Released" lines

## Test Result

- `node dist/cli.js --version` → 3.3.1; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 161 pass, 0 fail)
- CI: on the PR
