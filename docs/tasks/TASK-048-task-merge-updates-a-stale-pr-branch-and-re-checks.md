# TASK-048: task merge updates a stale PR branch and re-checks

## Status

Shipped

## Goal

Merging must not need manual base updates while bot PRs keep landing (observed: several PRs per day updated by hand in a consumer repository; once by rebase + force-push, against the rules). On GitHub, when the stale-base check (D-008) fails, `task merge` updates the PR branch on the host and re-checks with the same rules.

## Scope

- `updateGitHubPullBranch` (`src/lib/pr-create.ts`): `PUT repos/{o}/{r}/pulls/{n}/update-branch` with `expected_head_sha` (host merge, no force push; 202) — outcomes accepted / head-moved / conflict / error
- `mergeMergeRequest`: one deadline (`waitTimeoutSeconds`) for the whole merge; stale + `updateBranch` → update, wait for the new head, run the whole gate again (CI wait, base check), repeat; conflict → stop with the local-merge instruction; API error → exponential back-off with full jitter (existing cap 60 s)
- `.vibeops.json` `merge.updateBranch` (default `true`); `task merge` passes it; dry-run line
- `task ship` push-rejected hint: merge (`git pull --no-rebase`), not rebase
- Fixture tests; README, D-014, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- GitLab (MR rebase is a server-side rebase; unchanged)
- Trailers on generated commits (next feature candidate)

## Acceptance Criteria

1. Base moves twice during the merge → two updates, merge pinned to the final head, no human step
2. Conflict → refused, instruction printed, no merge
3. `updateBranch: false` → previous refusal
4. Gate rules unchanged (same CI wait and base check on every new head)
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- 3 new tests in `tests/merge-gate.test.mjs` with a real git fixture (bare origin, base moving between updates) and a fake `gh` that applies prepared heads on update-branch; against the pre-fix source and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `c32e643d3d15cb3b1e4273d05c74c44a9693fc79`
- Task Branch: `task/048-task-merge-updates-a-stale-pr-branch-and-re-checks`
- Started At: `2026-10-17T14:32:35.830Z`

## Result

- update: `src/lib/pr-create.ts` (`updateGitHubPullBranch`, update loop in `mergeMergeRequest`, `waitForHeadChange`), `src/lib/merge-config.ts` + `src/types/config.ts` (`updateBranch`), `src/commands/task-merge.ts`, `src/commands/task-ship.ts` (hint)
- tests: 3 update-branch tests; fake `gh` handles update-branch / head override; config test covers `updateBranch`
- docs: README, D-014, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before (pre-fix source): "base moves twice" and "conflict" fail; "disabled" passes (control)
- After: all pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 155 pass, 0 fail)
- CI: on the PR
