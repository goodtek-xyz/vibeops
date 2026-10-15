# TASK-022 · ship stages deletions and renames

## Status

Shipped

## Goal

`vibeops task ship` must commit deletions and renames like any other change. Observed 2026-10-15 in a consumer repo: with a staged deletion (`git rm --cached llms-gateway` + file removed, status `D `) `task ship TASK-134 -m "…"` failed with `fatal: pathspec 'llms-gateway' did not match any files`.

## Scope

- Root cause: `commitDirtyWorkingTree` (`src/lib/task-git-commit.ts`) passed every dirty path to `gitAddPaths` → `git add -- <paths>` (`src/lib/git.ts`). Paths whose change is index-only (staged deletion `D `, source of a staged rename `R  old -> new`) exist in neither the index nor the working tree, so the pathspec fails. Also, `git status --porcelain` (no `-z`) quotes names with spaces / non-ASCII (`"sp ace"`), which were then passed to `git add` verbatim
- Parse `git status --porcelain=v1 -z` (`parsePorcelainZ`): unquoted paths, rename / copy source as its own field
- Stage only paths whose working-tree state is not yet in the index (untracked or Y-column change) with `git add -A -- :(literal)<path>`; staged changes are already part of the commit
- Keep the build-artifact exclusion (`dist/`, `node_modules/`, …) unchanged
- Tests with real temp repos

## Out of Scope

- Excluding build artifacts that the user already staged (unchanged behavior)
- Version bump / npm publish (owner decision)

## Acceptance Criteria

1. Staged deletion (`git rm --cached` + file removed) is committed; no pathspec error
2. A staged deletion as the only change is committed
3. A tracked file deleted but not staged is staged and committed as a deletion
4. Staged renames (and a rename modified afterwards, `RM`) are committed as renames
5. Paths with spaces / non-ASCII / glob characters are listed and staged correctly
6. Build artifacts stay out of the auto-commit
7. `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass

## Test Plan

- `tests/ship-staging.test.mjs` — fails on 3.1.0 source, passes after the fix
- End-to-end: temp consumer repo + bare remote, `task add`, staged deletion, `task ship -m … --no-pr --non-interactive` with installed 3.1.0 vs this build
- `pnpm typecheck`, `pnpm test`, `pnpm smoke`

## Result

- `src/lib/git.ts`: `parsePorcelainZ` + internal `gitStatusEntries` (`git status --porcelain=v1 -z`) replace the line parser for every porcelain consumer; new `listUnstagedRelPaths`; `gitAddPaths` runs `git add -A -- :(literal)<path>`
- `src/lib/task-git-commit.ts`: `commitDirtyWorkingTree` stages only committable paths that need staging; index-only changes (staged deletion, rename source) are committed as already staged
- `tests/ship-staging.test.mjs`: 7 tests (staged deletion, staged deletion only, unstaged deletion, renames incl. `RM`, quoted / non-ASCII names, build artifacts excluded, `-z` parser)
- Docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-15.md`

## Test Result

- Before (source = installed 3.1.0): `tests/ship-staging.test.mjs` 4 of 6 fail — `fatal: pathspec 'llms-gateway' did not match any files`, same for `gone.txt` and rename source `c.txt`; quoted names listed as `"sp ace.txt"` / `"\355\225\234…"`
- End-to-end before (installed 3.1.0): `task ship -m "drop gateway" --no-pr` → `git add -- llms-gateway docs/tasks/TASK-001-drop-gateway.md` → `fatal: pathspec 'llms-gateway' did not match any files`
- End-to-end after (this build, same state): commit `feat(task-001): drop gateway` with `D llms-gateway` + `A docs/tasks/…`, Shipped, pushed; clean tree
- `pnpm typecheck` OK; `pnpm test` 96 pass, 0 fail; `pnpm smoke` OK (exit 0)
