# TASK-029: Merge refuses stale base and ship keeps multi-line messages

## Status

Shipped

## Goal

Two gaps reported from a consumer repo incident (a PR rebuilt with `git reset --soft` on a stale `origin/develop` was squash-merged after `develop` had moved and silently reverted 27 files of other TASKs):

1. `vibeops task merge` must refuse when the approved head commit does not contain the current base branch.
2. `vibeops task ship -m` must keep multi-line messages: it joined all lines, so a `Co-Authored-By:` trailer ended up in the subject.

Already handled earlier and only re-checked here: waiting for the PR's own CI (3.1.2, TASK-024), `task release --no-merge` (3.1.3, TASK-025), merges pinned with `--match-head-commit` (3.0.0), npm Trusted Publishing (3.1.4).

## Scope

- New `src/lib/merge-base-freshness.ts` `checkBaseInHead`: fetch `+refs/heads/<base>:refs/remotes/<remote>/<base>`, fetch the head commit if missing, `git merge-base --is-ancestor`; not contained → problem with commits-behind count and update steps; fetch error → fail closed
- `mergeMergeRequest` option `requireBaseInHead` checked on the head SHA the gate approved (also on the GitLab 405 re-gate); dry-run plan line; `task merge` passes it (all paths), `task release` does not
- `taskScopedCommitMessage`: scope only the subject line; keep body and trailers (CRLF → LF, blank line after the subject)
- Tests (fail on the 3.1.4 source); README merge gate, D-008, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Automatically updating stale task branches (the error gives the commands; updating is a mutating step the human / agent runs)
- `task release` freshness (merge-commit releases: production is normally not an ancestor of integration)
- Release / publish (separate release PR)

## Acceptance Criteria

1. Head containing `<remote>/<base>` merges (head fetched by SHA when not local)
2. Base moved after the branch was pushed → refuses with `stale base`, commits-behind count, no merge call
3. Branch rebuilt with `reset --soft` on a stale local `origin/<base>` → refuses (the base is fetched first)
4. Unreachable remote → refuses (fail closed)
5. `ship -m "subject\n\nbody\n\nCo-Authored-By: …"` → subject scoped and single-line; `Co-Authored-By` is a git trailer
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- `tests/merge-gate.test.mjs` "stale base:" (5), `tests/ship-state.test.mjs` / `tests/ship-staging.test.mjs` multi-line message tests against the 3.1.4 source (expect failures) and this build
- Incident check (read-only): in the consumer repo, the merged PR's head did not contain the base at merge time
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; `task merge --dry-run` plan; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `c4349b818b5053eda582f186f03d4b420e4abf23`
- Task Branch: `task/029-merge-refuses-stale-base-and-ship-keeps-multi-line-messages`
- Started At: `2026-10-16T10:03:21.262Z`

## Result

- new: `src/lib/merge-base-freshness.ts` — `checkBaseInHead` (fetch base + head, `merge-base --is-ancestor`, behind count, fail closed)
- update: `src/lib/pr-create.ts` — `MergeMergeRequestOptions.requireBaseInHead`; checked inside `runGate` on the approved head SHA (base from the host's `baseRefName` / `target_branch` when reported); dry-run line
- update: `src/commands/task-merge.ts` — passes `requireBaseInHead` on every merge path; stale-base hint
- update: `src/lib/task-git-commit.ts` — `taskScopedCommitMessage` scopes the first line only, keeps body / trailers
- tests: 5 "stale base:" tests (real git fixture: bare origin + two clones), 2 multi-line message tests
- docs: README "Merge gate", D-008, CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-16.md`

## Test Result

- Before (3.1.4 source, new tests): 5 fail — stale base merged (3 refuse tests), multi-line message joined (2); the 2 control tests (fresh head merges, check not applied without the option) pass
- After: all new tests pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 123 pass, 0 fail)
- `task merge --dry-run`: plan lists "would refuse unless the head commit contains origin/main (stale base)"
- Incident (read-only, consumer repo): the merged PR's head parent was an older base commit; the base tip just before the merge was **not** an ancestor of the head → this check would have refused it
- CI: on the PR
