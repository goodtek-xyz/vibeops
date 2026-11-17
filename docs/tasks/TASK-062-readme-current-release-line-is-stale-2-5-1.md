# TASK-062: README current release line is stale (2.5.1)

## Status

In Progress

## Goal

README must not state a hardcoded "current" version that goes stale: it said `2.5.1` while `package.json` / npm `latest` were 3.4.1, because release-prep TASKs never update README.

## Scope

- README: replace the "Current release" line with version-free text (npm badge + `CHANGELOG.md` link); unpin the `@2.5.1` install and Volta examples.
- `docs/project/09-deployment.md` release checklist: note README needs no version bump.
- CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-11-18.md`.

## Out of Scope

- Historical version mentions (`3.0.0 breaking`, `Upgrading from before 2.5`) and CHANGELOG history.
- Any code change or automation.

## Acceptance Criteria

1. `grep -n "2\.[0-9]\.[0-9]\|3\.[0-9]\.[0-9]" README.md` shows only historical mentions; no line claims a current version.
2. The release checklist says README needs no bump.
3. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

- The grep in AC 1.
- `pnpm lint`, `pnpm smoke`.

## Git Context

- Base Branch: `develop`
- Base Commit: `d896b12cb6deb4c00d65a28470109d53713203d2`
- Task Branch: `task/062-readme-current-release-line-is-stale-2-5-1`
- Started At: `2026-11-17T23:19:22.796Z`

## Result

README line 10 now reads "The npm badge above shows the latest published version; see CHANGELOG.md for what each release contains." Install example is `npm install -g @goodtek/vibeops` (expect the badge version); Volta hint is unpinned. Release checklist (09-deployment step 2) states README carries no version. Docs updated: CHANGELOG Unreleased/Docs, `05-current-state.md` Unreleased line, `docs/logs/2026-11-18.md`.

## Test Result

- README version grep: only line 246 (`3.0.0 breaking`, historical).
- `pnpm lint`: OK (no errors).
- `pnpm smoke`: OK.
