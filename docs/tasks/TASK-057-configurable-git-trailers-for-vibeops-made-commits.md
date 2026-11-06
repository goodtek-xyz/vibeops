# TASK-057: Configurable git trailers for VibeOps-made commits

## Status

In Progress

## Goal

Let commits VibeOps creates itself (`task ship` implementation and `mark shipped` commits, `--new-cycle` metadata commits) carry git trailers such as `Co-Authored-By:`, configured in `.vibeops.json`. git `trailer.*` config only applies with `--trailer` / `interpret-trailers`, and `commit.template` is ignored for `-m`, so the tool itself must pass them.

## Scope

- Optional `.vibeops.json` `git.commitTrailers: string[]` (each `"Token: value"`), typed in `src/types/config.ts`.
- Strict validation (`src/lib/commit-trailers.ts`, used by `parseGitBlock`): not an array, non-string, newline, or not `Token: value` → error naming the entry; `readConfig` surfaces it instead of treating the file as missing.
- `commitDirtyWorkingTree` takes the trailers and passes each as `git commit --trailer <t>`; dry-run output lists them.
- `task ship` and `--new-cycle` read the trailers once (`readCommitTrailers`) and pass them to every commit; re-`init` keeps the list.
- README, CHANGELOG (Unreleased), current state, daily log.

## Out of Scope

- `init`'s own initial commit (`gitCommit` in `src/lib/git.ts`): the config is being created by that same command, so it is left unchanged.
- git hooks or environment-variable workarounds.
- Other commits VibeOps does not make (user commits).

## Acceptance Criteria

1. With `git.commitTrailers: ["Co-Authored-By: …"]`, a docs commit made through `commitDirtyWorkingTree` has that trailer in `git log -1 --format=%(trailers)`.
2. Without the setting, the commit has no trailers.
3. Invalid entries (not an array, non-string, newline/CR, missing `: `, empty value, bad token) are rejected with an error naming the entry; `task ship` / `--new-cycle` exit 1.
4. `--dry-run` makes no commit and mentions the trailers.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

## Test Plan

- `tests/commit-trailers.test.mjs`: real temp git repo — trailer present when configured, absent when unset, dry-run no commit; `parseCommitTrailers` accepts / rejects; `readConfig` rejects an invalid entry.
- Existing `tests/ship-staging.test.mjs` updated for the new parameter.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `node scripts/smoke.mjs`.

## Git Context

- Base Branch: `develop`
- Base Commit: `4090d323d8ea58981f871d80696877328ed6e9f6`
- Task Branch: `task/057-configurable-git-trailers-for-vibeops-made-commits`
- Started At: `2026-11-06T09:09:07.695Z`

## Result

- New `src/lib/commit-trailers.ts` (`parseCommitTrailers`, `commitTrailerArgs`, `CommitTrailersConfigError`); `VibeopsGitConfig.commitTrailers`; `parseGitBlock` validates, `readConfig` rethrows the validation error; `buildConfig` keeps the list on re-init.
- `readCommitTrailers(cwd)` in `src/lib/git-config.ts`; `commitDirtyWorkingTree(cwd, message, dryRun, trailers)` adds `--trailer` per entry and lists them in dry-run.
- `task ship` (`ShipContext.trailers`, all four commit sites + ship metadata) and `--new-cycle` (both commit sites) pass the trailers; invalid config exits 1 before any commit.
- `init`'s initial commit unchanged (Out of Scope).
- Docs: README "Commit trailers", CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-11-06.md`.

## Test Result

- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — 167 tests, 167 pass, 0 fail (new `tests/commit-trailers.test.mjs`, 6 tests; prints `trailers of HEAD: Co-Authored-By: Example Bot <bot@example.com>`).
- `node scripts/smoke.mjs` — OK.
