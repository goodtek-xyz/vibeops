# TASK-064: Release 3.5.0

## Status

Shipped

## Goal

Prepare release 3.5.0 on `develop` (owner-approved): self-managed GitLab base URL for `init` and the glab `--remoteName` fix (D-017, TASK-063), version-free README (TASK-062), CI gitleaks install change (TASK-061). Minor version: new feature, no breaking change.

## Scope

- `package.json` 3.4.1 → 3.5.0; CHANGELOG `## 3.5.0 - 2026-11-18`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.5.0; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `node dist/cli.js --version` → 3.5.0; `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `d137ab65a5290f4a8509e590f48a2e59f86cd147`
- Task Branch: `task/064-release-3-5-0`
- Started At: `2026-11-17T23:42:36.281Z`

## Result

- `package.json` 3.5.0; CHANGELOG `## 3.5.0 - 2026-11-18`; `05-current-state.md` package / release / install / handoff "Released" lines

## Test Result

- `node dist/cli.js --version` → 3.5.0; `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 188 pass, 0 fail)
- CI: on the PR
