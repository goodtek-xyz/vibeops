# TASK-073: Release 3.6.1

## Status

In Progress

## Goal

Prepare release 3.6.1 on `develop` (owner-approved): `codex-oauth` streamed text read once and "LLM unavailable" warnings name the cause (TASK-072). Patch version: bug fix.

## Scope

- `package.json` 3.6.0 → 3.6.1; CHANGELOG `## 3.6.1 - 2026-11-27`; `05-current-state.md` (package / release / install / handoff "Released" lines)

## Out of Scope

- The release itself (`vibeops task release --tag`) — after this merges

## Acceptance Criteria

1. Version and docs say 3.6.1; no `Unreleased:` entries in `05-current-state.md`
2. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

<!-- Tests run in CI and locally only, never on production/staging hosts; host-control code is faked (AGENTS.md "Testing and host safety"). -->

- `node dist/cli.js --version` → 3.6.1; `pnpm build`, `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `019a74e406358417615280623646cc1c561ff6f3`
- Task Branch: `task/073-release-3-6-1`
- Started At: `2026-11-27T04:43:29.574Z`

## Result

- `package.json` 3.6.1; CHANGELOG `## 3.6.1 - 2026-11-27`; `05-current-state.md` package / release / install / handoff "Released" lines

## Test Result

- `node dist/cli.js --version` → 3.6.1; `pnpm build` OK, `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 204 pass, 0 fail)
- CI: on the PR
