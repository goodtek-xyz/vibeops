# TASK-025: Negated CLI flags are ignored

## Status

Shipped

## Goal

`--no-*` flags must do what their help text says. Observed on 3.1.0 in a consumer repo: `vibeops task release --no-merge` created the release PR and merged it immediately (before its checks finished) instead of stopping after the PR.

## Scope

- Root cause: commander stores `--no-foo` as `opts.foo === false`; it never sets `opts.noFoo`. `src/cli.ts` read `opts.noMerge`, `opts.noRemoteDelete` and `opts.noCloseMr`, which are always `undefined`, so the flags were silently dropped:
  - `task release --no-merge` (merged anyway)
  - `task del --no-remote-delete`, `task del --no-close-mr` (deleted the remote branch / closed the MR anyway)
  - `task sync --no-remote-delete` (deleted the remote branch anyway)
- Map these flags the way `task ship` already does (`opts.<name> === false`)
- `task release --merge` (merge-commit method, already the release default) shares commander's `merge` key with `--no-merge`; it stays accepted and only `--no-merge` skips the merge
- Regression tests through the built CLI (`dist/cli.js`) that fail on the 3.1.2 source
- CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- `task add --dry-run` crashing after the plan (reads the TASK file it did not create) — separate TASK
- Other flag renames or help-text changes
- Release / publish

## Acceptance Criteria

1. `task release --no-merge` creates the release PR and never calls the host's merge; the dry-run plan does not list a merge step
2. `task release` without the flag still plans / performs the merge
3. `task del --no-remote-delete` / `--no-close-mr` and `task sync --no-remote-delete` reach the command as `true`; without the flags they stay `false`
4. No `opts.no<Name>` reads remain in `src/cli.ts`
5. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/cli-negated-flags.test.mjs` against the 3.1.2 source (expect failures) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `548c4f5ffa2d623a4f10c5ec8b917187e96456d9`
- Task Branch: `task/025-negated-cli-flags-are-ignored`
- Started At: `2026-10-16T05:14:16.485Z`

## Result

- update: `src/cli.ts` — `task release` `noMerge: opts.merge === false`; `task del` `noRemoteDelete: opts.remoteDelete === false`, `noCloseMr: opts.closeMr === false`; `task sync` `noRemoteDelete: opts.remoteDelete === false` (same pattern `task ship` already used). No `opts.no<Name>` reads remain
- new: `tests/cli-negated-flags.test.mjs` — built CLI against a fixture repo with a bare `origin` and a fake `gh` that logs calls: release dry-run plan, real `release --no-merge` (only `gh pr create`, no view / merge), `del` / `sync` dry-run plans with and without the flags, source guard
- docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-16.md`
- Noted, not fixed (Out of Scope): `task add --dry-run` throws ENOENT after printing the plan

## Test Result

- Before (3.1.2 source, new tests): 4 of 5 fail on the bug — `release --no-merge` entered the merge gate and hit the 20 s test bound (exit `null`); `del` / `sync` dry-run still planned `git push origin --delete task/001-x` with the flags; source guard found `opts.noRemoteDelete`, `opts.noCloseMr`, `opts.noMerge` (the first test failed only on its own regex, fixed before the after-run)
- After: `node --test tests/cli-negated-flags.test.mjs` 5 / 5 pass
- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 115 pass, 0 fail)
- CI: on the PR
