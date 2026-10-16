# TASK-028: Release docs for Trusted Publishing

## Status

Shipped

## Goal

The release docs describe what is true now: npm Trusted Publishing through `publish.yml` is active (3.1.4 published with provenance, connection *Valid*), and the token-based `pnpm publish:npm` is a fallback. Record what was learned while setting it up.

## Scope

- `docs/project/09-deployment.md`: release flow (release PR → merge after its own CI → tag on `main` → `publish.yml`), Trusted Publishing as the current path, owner configuration table, setup notes (password + security-key confirmation, form lost after the password redirect, *Pending validation* → *Valid*, 2-day expiry, E404 when no matching connection, fields fixed after creation), re-run failed job instead of re-tagging, already-published tag fails harmlessly, registry lag and stale `npm view` cache (`--prefer-online`), token path as fallback, `INFISICAL_API_URL` with `/api`
- `docs/project/05-current-state.md`: implementation table row and "Next" for maintainers
- Daily log

## Out of Scope

- Code, workflows, scripts
- npm account / package settings (e.g. disallowing tokens) — owner decision

## Acceptance Criteria

1. No doc states that Trusted Publishing is pending or that `pnpm publish:npm` is the current path
2. 09-deployment.md lets a maintainer release and troubleshoot without this session's context
3. No internal hosts, paths or private repo names added
4. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `grep` for stale phrases ("until then", "target path", "until Trusted Publishing is configured")
- `pnpm lint`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `47fa2b282eacf4b43b019e89fd75f73298467f6c`
- Task Branch: `task/028-release-docs-for-trusted-publishing`
- Started At: `2026-10-16T08:56:39.469Z`

## Result

- update: `docs/project/09-deployment.md` — release flow ends with tag → `publish.yml`; "Publish from GitHub Actions" is the current path (active since 3.1.4); trusted publisher table + setup notes; troubleshooting (E404 without a connection, already-published tag, `gh run rerun <id> --failed`, registry lag / `--prefer-online`); token publish moved under "Fallback"; environment table puts OIDC first; `INFISICAL_API_URL` example with `/api`
- update: `docs/project/05-current-state.md` — npm publish row and maintainer "Next"
- docs: `docs/logs/2026-10-16.md`

## Test Result

- `grep -rn "until then\|target path\|until Trusted Publishing is configured" docs/project README.md AGENTS.md` → no matches
- `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 116 pass, 0 fail)
- CI: on the PR
