# TASK-024 · merge gate waits for the PR's own CI

## Status

In Progress

## Goal

`vibeops task merge` / `task release` must never merge before the PR's CI has run. Observed on 3.1.0 in consumer repos: a release PR (`develop → main`) merged 5 s after it was opened, on the green checks a `push` workflow had left on the same commit, before its own `pull_request` run had created any job; the merge log printed `checks all green` before anything was checked.

## Scope

- Root cause: `waitForMergeGate` (`src/lib/pr-create.ts`) judged only `statusCheckRollup` via `evaluateCheckGate` (`src/lib/check-rollup.ts`). The rollup holds every check on the head commit, from any event; it does not contain checks that do not exist yet. Earlier green checks → "green" → `gh pr merge`. `requiredChecks` did not help when a same-named job from another workflow / event was already green. `task-merge.ts` printed `checks all green` as a header
- GitHub Actions part of the gate (`src/lib/github-actions-gate.ts`): expected `pull_request` workflows from `.github/workflows` at the head SHA (GitHub trigger / filter rules), workflow runs for the head SHA (REST); missing / running → wait, failed → refuse, unreadable → wait then refuse
- Re-read the head SHA before merging; re-evaluate when it moved; keep `--match-head-commit`
- Poll interval default 10 s (gh's `pr checks --watch` default); exponential back-off with jitter on read errors (cap 60 s)
- Tests reproducing the bug (fail on 3.1.1 source, pass after); README, CHANGELOG, D-007

## Out of Scope

- GitLab (head pipeline is already per-SHA)
- Reading branch-protection / ruleset required checks
- Release / publish (separate release PR; npm publish is an owner action)

## Acceptance Criteria

1. Rollup of green checks from another event + expected `pull_request` workflow without a run → waits; merges only after that run completed green
2. Required check satisfied only by a same-named check of another event → waits for the PR's run
3. Expected workflow that never starts → refuses at `waitTimeoutSeconds`, naming the workflow
4. `startup_failure` / `action_required` runs refuse immediately
5. Workflows excluded by `branches` / `paths` / `types` filters or disabled are not awaited
6. Head moving during the check → new head evaluated; merge pinned to it
7. Unreadable Actions API never merges
8. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- `tests/merge-gate.test.mjs` "actions:" tests against the 3.1.1 source (expect failures) and this build
- Read-only check of the new evaluation against real merged PRs (expected workflows, runs)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `16a167b88e150e2fceab8e19ea925a055a0f7403`
- Task Branch: `task/task-024-merge-gate-waits-for-expected-ci`
- Started At: `2026-10-15T19:41:49Z`

## Result

- new: `src/lib/github-actions-gate.ts` — GitHub filter patterns, `workflowExpectedForPullRequest`, `evaluateActionsRuns`, `gh api` readers (workflow files, disabled workflows, PR files, runs for SHA)
- update: `src/lib/pr-create.ts` — `waitForMergeGate` combines rollup + Actions; "no checks" only when nothing exists or is expected; head re-read before merge; changing wait message logged; read-error back-off (`errorBackoffMs`); `baseBranch` in details (`baseRefName` / `target_branch`)
- update: `src/lib/merge-config.ts` / `src/types/config.ts` — `pollIntervalSeconds` default 10
- update: `src/commands/task-merge.ts` — header states the rule instead of `checks all green`
- dependency: `yaml` ^2.9.1 (ISC, no dependencies)
- docs: README "Merge gate", CHANGELOG Unreleased, D-007, `05-current-state.md`, `docs/logs/2026-10-16.md`

## Test Result

- Before (3.1.1 source, new tests): 9 of 10 "actions:" tests fail — e.g. bug repro merged after **1** `pr view` and **0** Actions reads (expected merge after the 4th runs read); required-check variant the same; only the "filtered workflows" test passes (nothing to wait for)
- After: `tests/merge-gate.test.mjs` 55 pass; full `pnpm test` 110 pass / 0 fail; `pnpm lint`, `pnpm typecheck`, `pnpm smoke` OK
- Real data (read-only): release PR from the observation → expected `.github/workflows/ci.yml`; with only the `push` run present (state at the 3.1.0 merge) the verdict is `missing: [ci.yml]` → wait; with today's runs → green. Same for this repo's PR #11 and other consumer PRs
- Dogfood: PR #11 (TASK-023) merged with this build's gate (`requiredChecks` = CI jobs)
