# TASK-059: Merge gate: latest check run per check identity

## Status

Shipped

## Goal

`task merge` refused a PR whose `statusCheckRollup` held an earlier failed run of a check (transient host error) next to a later passing run of the same check on the same head SHA: any failed item refused. Judge the latest run of each check instead, fail-closed.

## Scope

- `src/lib/check-rollup.ts`: `latestPerCheck`, applied by `classifyRollup` — latest item per check identity (CheckRun: `workflowName` + `name`; StatusContext: `context`), ordered by `startedAt` then `completedAt` (missing = still running = newest). Unknown order (missing / zero `startedAt`, exact tie) keeps every item of that identity.
- `ClassifiedCheck` carries `workflow`, `startedAt`, `completedAt`; `RawRollupItem` reads `startedAt` / `completedAt` (already in `gh pr view --json statusCheckRollup`).
- Tests in `tests/merge-gate.test.mjs`.
- README "Merge gate", CHANGELOG Unreleased (Fixed), D-016, `05-current-state.md`, daily log.

## Out of Scope

- Release / version bump (separate release-prep TASK).
- The Actions-runs part of the gate (`evaluateActionsRuns`, latest per workflow + event by run id) — unchanged.
- GitLab (head pipeline only).

## Acceptance Criteria

1. Older FAILURE + newer SUCCESS of the same check → passes (gate green, merge called).
2. Older SUCCESS + newer FAILURE → fails (no merge).
3. A re-run attempt of an older workflow run that starts and finishes after a newer run's pass wins (fails).
4. Newer pending run → pending.
5. Same check name in different workflows are two checks.
6. Unknown order (missing / zero `startedAt`, exact tie) → all items kept, any failure fails.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `node scripts/smoke.mjs` pass.

## Test Plan

- `tests/merge-gate.test.mjs`: pure `classifyRollup` + `evaluateCheckGate` cases for AC 1–6; fake-`gh` `mergeMergeRequest` cases for AC 1–2.
- Built `classifyRollup` against a real PR rollup with re-runs (`gh pr view --json statusCheckRollup`).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `node scripts/smoke.mjs`.

## Git Context

- Base Branch: `develop`
- Base Commit: `baa57689500b977e534cbdeceb7d7fd5e9243ac3`
- Task Branch: `task/059-merge-gate-latest-check-run-per-check-identity`
- Started At: `2026-11-08T09:10:35.913Z`

## Result

- `latestPerCheck` + `checkIdentity` + `compareRecency` in `src/lib/check-rollup.ts`; `classifyRollup` returns the latest item per check identity; `classifyRollupItem` adds `workflow`, `startedAt`, `completedAt` (Go zero time → `null`). Callers (`readMergeRequestDetails`, `waitForMergeGate`) unchanged — they already go through `classifyRollup`.
- Decision D-016; README "Merge gate" rule; CHANGELOG Unreleased → Fixed; `05-current-state.md`; `docs/logs/2026-11-08.md`.
- Existing "duplicate check names — any failure fails" test kept for items without timing (fail-closed fallback).

## Test Result

- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — 175 tests, 175 pass, 0 fail (8 new in `tests/merge-gate.test.mjs`).
- `node scripts/smoke.mjs` — OK.
- Real PR rollup with re-runs (6 items: 3 runs × `Test`, `Secret scan / gitleaks`, one earlier gitleaks attempt failed): built `classifyRollup` → 2 items, gate `green` (latest gitleaks run passed).
