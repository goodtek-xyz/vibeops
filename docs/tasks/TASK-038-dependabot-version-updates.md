# TASK-038: Dependabot version updates

## Status

In Progress

## Goal

Add the Dependabot configuration the maintainers' repository baseline expects (same settings as their other app repositories): weekly version updates for npm and GitHub Actions into `develop`, with a 14-day cooldown.

## Scope

- `.github/dependabot.yml`: `npm` and `github-actions`, weekly, `cooldown.default-days: 14`, `commit-message` prefix `chore`, minor/patch groups for npm development / production dependencies; no `target-branch` (the default branch is `develop`; `target-branch` would stop these options from applying to security updates, per the Dependabot options reference)
- `05-current-state.md` handoff section, daily log

## Out of Scope

- Merging Dependabot PRs (normal TASK flow)
- The open `sprintf-js` alert (no fixed release; Dependabot reports it, nothing to update)

## Acceptance Criteria

1. Config parses; ecosystems `npm`, `github-actions`; cooldown 14 days; no `target-branch`
2. After merge GitHub accepts the config (no configuration error on the Dependabot run)
3. `pnpm lint` passes; CI green

## Test Plan

- Parse `.github/dependabot.yml` with `yaml`; after merge check the Dependabot run on the repository
- `pnpm lint`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `f07e4ca24d8f63a6d60b060718e810ca3a105480`
- Task Branch: `task/038-dependabot-version-updates`
- Started At: `2026-10-17T07:49:23.751Z`

## Result

- new: `.github/dependabot.yml`
- docs: `05-current-state.md` handoff section, `docs/logs/2026-10-17.md`

## Test Result

- `yaml` parse: version 2, ecosystems `npm`, `github-actions`
- `pnpm lint` OK
- CI: on the PR; Dependabot run checked after merge
