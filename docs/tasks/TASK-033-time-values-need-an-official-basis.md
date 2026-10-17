# TASK-033: Time values need an official basis

## Status

Shipped

## Goal

Every wait, timeout and interval in VibeOps either cites the official documentation of the system it waits for, or is replaced by that system's own signal / a standard method. Values without a basis are not used (maintainer working rule; D-009).

## Scope

Audit of all time values (`grep` for seconds / ms / sleep / retry) and per value:

| Value | Before | Basis found | Change |
|---|---|---|---|
| Merge-gate poll interval | 10 s | `gh pr checks --watch` default | none (already linked) |
| Read-error back-off cap | 60 s | GitHub REST rate-limit docs | none (already linked) |
| Merge-gate wait bound `waitTimeoutSeconds` | 900 s, max 7200 | GitHub Actions job limits: 6 h hosted, 5 days self-hosted | default 21600, max 432000; the wait still ends at the host's completion signal |
| Empty-rollup grace `emptyRollupGraceSeconds` | 30 s, max 600 | none | default 0; external CI awaited by name via `requiredChecks` (like required status checks); max ≤ wait |
| Poll interval max | 300 s | none | ≤ wait (existing cross-check), absolute max = 5-day job limit |
| Post-merge confirmation | poll 2 s for 120 s | GitHub merge API `200 merged: true`, GitLab merge API returns `state: merged` (synchronous; `--auto-merge=false`) | single read, no polling |
| Codex token leeway | 120 s ("same pattern as" another project) | RFC 7519 §4.1.4: leeway "usually no more than a few minutes" | value kept, RFC cited |
| `npm-publish.sh` registry check | 10 × 2 s fixed | npm publish notice: "may take a few minutes" | exponential back-off + jitter, 5-minute budget, `--prefer-online` |
| Repository lock (D-006): wait 60 s, stale 600 s, breaker 30 s / 60 s, 50 ms retry | design values | none | **not changed here** — needs a lock redesign (event-based wait, process start time for pid reuse); separate TASK |

Also: move the `checkBaseInHead` doc comment back above its function (displaced in TASK-031).

## Out of Scope

- Repository lock redesign (separate TASK)
- Values in other repositories

## Acceptance Criteria

1. Each time value in `src/` and `scripts/` cites its basis, or is replaced, or is listed as open with a follow-up
2. `task merge` / `task release` confirm the merge with one read (no polling)
3. Defaults / limits: wait 21600 s (max 432000), grace 0 (≤ wait), poll ≤ wait
4. `npm-publish.sh` registry check uses back-off with jitter within a budget
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- `tests/merge-gate.test.mjs`: defaults / limits, new "merge verify: one read" test, against the 3.1.7 source (expect failures) and this build
- `bash -n scripts/npm-publish.sh`
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `1d4447471616fd1cc36076d67776517fce3c7c99`
- Task Branch: `task/033-time-values-need-an-official-basis`
- Started At: `2026-10-17T03:05:06.066Z`

## Result

- update: `src/lib/merge-config.ts` — defaults / limits from GitHub Actions job limits (link), grace 0, `emptyRollupGraceSeconds ≤ waitTimeoutSeconds`
- update: `src/lib/task-merge-verify.ts` — one read after the merge (merge API docs linked); `src/lib/pr-create.ts` — `waitForMergeRequestMerged` removed
- update: `src/lib/plan-codex-auth.ts` — RFC 7519 §4.1.4 basis for the 120 s leeway
- update: `scripts/npm-publish.sh` — back-off + jitter, 5-minute budget, `--prefer-online`, clearer "publish succeeded, check later" message
- update: `src/lib/merge-base-freshness.ts` — doc comment back on `checkBaseInHead`
- docs: README merge gate (defaults, after-merge read), D-009, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`
- open: repository lock values (D-006) — follow-up TASK proposed

## Test Result

- Before (3.1.7 source): "documented defaults" and "merge verify: one read" fail (old defaults 900 / 30; a merged PR was read twice, an open one polled)
- After: `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 135 pass, 0 fail); `bash -n scripts/npm-publish.sh` OK
- CI: on the PR
