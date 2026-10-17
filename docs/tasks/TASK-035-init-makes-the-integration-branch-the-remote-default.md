# TASK-035: Init makes the integration branch the remote default

## Status

In Progress

## Goal

Organization branch standard (owner decision, 2026-10-17): `develop` is the default branch. `vibeops init` created repositories whose default was `main` (GitLab `--defaultBranch main`) or whichever branch was pushed first (GitHub). It now sets the integration branch as default for repositories it creates.

## Scope

- `src/lib/git-remote.ts`: `setRemoteDefaultBranch` — GitHub `gh repo edit --default-branch <b>`, GitLab `glab api --method PUT projects/:id --raw-field default_branch=<b>` (official CLIs / API, linked); `EnsureRemoteResult.created`
- `src/commands/init.ts`: after the baseline push of both branches, for a repository init created, set the default branch; on failure warn and print the manual command
- Tests with fake `gh` / `glab`; README, CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Changing the default branch of an existing repository (init connected to it): owner's setting
- Trunk preset (integration = production)

## Acceptance Criteria

1. GitHub: `gh repo edit --default-branch develop`; GitLab: project API `default_branch=develop`
2. A failing CLI → warning + manual command, init continues
3. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/remote-default-branch.test.mjs` (fake CLIs record argv; failure path)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `533933be02a6b5e287bd2ab8295eeaa897a54c67`
- Task Branch: `task/035-init-makes-the-integration-branch-the-remote-default`
- Started At: `2026-10-17T05:16:46.031Z`

## Result

- update: `src/lib/git-remote.ts` — `setRemoteDefaultBranch`, `created` flag on repositories init created
- update: `src/commands/init.ts` — default branch → integration branch after the baseline push (created repositories only); manual command on failure
- test: `tests/remote-default-branch.test.mjs` (3)
- docs: README (`init`), CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before (develop before this TASK): `setRemoteDefaultBranch` did not exist (new tests cannot import it)
- After: new tests pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 137 pass, 0 fail)
- CI: on the PR
