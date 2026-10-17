# TASK-046: task release --tag tags the release merge commit

## Status

Shipped

## Goal

Make "merge into production" the release in one VibeOps step: after `task release` merges, tag the release merge commit `v<package.json version>` and push the tag (which starts the publish workflow). Removes the manual tag push after the release.

## Scope

- `src/lib/release-tag.ts`: `tagReleaseCommit` — commit must be on the fetched `<remote>/<production>`; version from `package.json` at that commit (semver); refuse an existing tag (local / remote); `git tag` + `git push <remote> refs/tags/<tag>`
- `task release --tag`: uses the host's merge commit SHA after the verified merge; dry-run plan line; `--tag` with `--no-merge` refused
- Tests; README, 09-deployment release flow, D-013, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Projects without `package.json` (refused with a message)
- Making `--tag` the default

## Acceptance Criteria

1. Tags `vX.Y.Z` on the merge commit and pushes it
2. Refuses: commit not on production, non-semver / missing `package.json`, existing tag
3. `--tag --no-merge` exits 1; dry-run lists the tag step
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/release-tag.test.mjs` (real git with a bare origin; CLI flags)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `5f56b248355048e292503ed85c3502bed9f4cd20`
- Task Branch: `task/046-task-release-tag-tags-the-release-merge-commit`
- Started At: `2026-10-17T13:21:48.265Z`

## Result

- new: `src/lib/release-tag.ts`
- update: `src/commands/task-release.ts` (`--tag`), `src/cli.ts`
- test: `tests/release-tag.test.mjs` (4)
- docs: README, `docs/project/09-deployment.md`, D-013, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before: module and flag did not exist (new tests cannot run)
- After: 4 new tests pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 151 pass, 0 fail)
- CI: on the PR
