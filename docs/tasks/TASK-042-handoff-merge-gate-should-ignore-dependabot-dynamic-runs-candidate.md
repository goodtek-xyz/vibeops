# TASK-042: Handoff: merge gate should ignore Dependabot dynamic runs (candidate)

## Status

Shipped

## Goal

Record a reported merge-gate gap as a next-feature candidate with its evidence and the documented basis for the fix.

## Scope

- `05-current-state.md` handoff: candidate 2 (gate counts Dependabot dynamic runs); renumber the list
- Daily log

## Out of Scope

- The gate change itself (next feature)

## Acceptance Criteria

1. Candidate listed with code location, observation and GitHub documentation
2. `pnpm lint` passes

## Test Plan

- Read-only: runs for the observed PR head (`event: dynamic`, `dynamic/dependabot/dependabot-updates`, failure) and the gate's "every run for the head SHA" rule; `pnpm lint`

## Git Context

- Base Branch: `develop`
- Base Commit: `71c5cc7796fe04874a006e4f2e28a03bde3926a8`
- Task Branch: `task/042-handoff-merge-gate-should-ignore-dependabot-dynamic-runs-candidate`
- Started At: `2026-10-17T09:55:20.791Z`

## Result

- update: `docs/project/05-current-state.md` — next feature candidate "merge gate ignores Dependabot dynamic runs" (with documentation link)
- docs: `docs/logs/2026-10-17.md`

## Test Result

- Observed PR head runs (read-only): `pull_request .github/workflows/ci.yml success`, `dynamic dynamic/dependabot/dependabot-updates failure` (and others in progress), `push … success`
- `src/lib/github-actions-gate.ts` header: "Every workflow run for the head SHA (any event) must be completed with success, neutral or skipped"
- `pnpm lint` OK
