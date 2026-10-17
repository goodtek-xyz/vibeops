# TASK-043: Merge gate ignores Dependabot dynamic runs

## Status

Shipped

## Goal

`task merge` / `task release` must not be blocked by GitHub's dynamic workflow runs. Observed in a consumer repo: a PR's CI was green, but a failed `dynamic/dependabot/dependabot-updates` run (`event: dynamic`, Dependabot 403) on the same head made the gate refuse; dynamic runs cannot be re-run ("This workflow run cannot be retried"), so the release stayed blocked.

## Scope

- `src/lib/github-actions-gate.ts`: `isDynamicRun` (`event === "dynamic"` or `dynamic/…` path); `evaluateActionsRuns` skips them
- `src/lib/check-rollup.ts`: `withoutDynamicChecks` drops check runs suffixed ` (dynamic)` unless a `requiredChecks` pattern names them
- `src/lib/pr-create.ts`: gate uses both (Actions runs and run count; rollup for the gate, "no checks" and the derived pipeline state)
- Tests; README merge gate, D-011, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Other events (push, pull_request, …) — unchanged
- Re-running or deleting runs on the host

## Acceptance Criteria

1. Green PR CI + failed / in-progress Dependabot dynamic run on the head → merges
2. Only dynamic runs and no checks → "no checks" (refused unless `allowNoChecks`)
3. Failed `(dynamic)` check run → ignored; same check in `requiredChecks` → refused
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- 4 new tests in `tests/merge-gate.test.mjs` against the pre-fix source (expect failures) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `5e14516b45c50632bb446fbd19b66ec05644fdb0`
- Task Branch: `task/043-merge-gate-ignores-dependabot-dynamic-runs`
- Started At: `2026-10-17T09:59:36.819Z`

## Result

- update: `src/lib/github-actions-gate.ts` — `isDynamicRun`, skipped in `evaluateActionsRuns` (GitHub docs linked)
- update: `src/lib/check-rollup.ts` — `withoutDynamicChecks`
- update: `src/lib/pr-create.ts` — dynamic runs filtered before evaluation / run count; dynamic checks filtered for the gate, "no checks" and the pipeline state
- tests: 4 in `tests/merge-gate.test.mjs`
- docs: README, D-011, CHANGELOG, `05-current-state.md` (candidate removed from the list), `docs/logs/2026-10-17.md`

## Test Result

- Before (develop before this TASK): all 4 new tests fail — green PR refused (in-progress dynamic run waited until the timeout, failed one refused), dynamic runs counted as CI, `(dynamic)` check failure refused, `isDynamicRun` missing
- After: all pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 142 pass, 0 fail)
- CI: on the PR
