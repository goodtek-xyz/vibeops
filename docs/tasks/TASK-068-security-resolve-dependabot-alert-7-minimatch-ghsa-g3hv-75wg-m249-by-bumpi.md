# TASK-068: Security: resolve Dependabot alert 7 (minimatch GHSA-g3hv-75wg-m249) by bumpi...

## Status

In Progress

## Goal

Security: resolve Dependabot alert 7 (minimatch GHSA-g3hv-75wg-m249) by bumping eslint and typescript-eslint

## Scope

- Resolve Dependabot alert #7, GHSA-g3hv-75wg-m249 (minimatch ReDoS/DoS, vulnerable `>=7.0.0 <11.0.1`). minimatch is a transitive **dev-only** dependency via `eslint`, `@eslint/config-array` and `@typescript-eslint/typescript-estree` (was 10.2.6).
- Fix at the source (no `pnpm.overrides`): upstream already depends on minimatch ^11.
  - devDependency `eslint` 10.14.0 → 10.15.0 (minimatch ^11.0.5, `@eslint/config-array` 0.23.6).
  - devDependency `typescript-eslint` 8.72.1 → 8.73.0 (`typescript-estree` minimatch ^11.0.1).
  - Exact-pin style kept. `@eslint/js` stays 10.0.1 (already the latest; no matching release needed).
  - `pnpm-lock.yaml` regenerated with `pnpm install`.
- Cooldown: both versions are younger than the 14-day `cooldown` in `.github/dependabot.yml`. That file states the cooldown applies to version updates only and security updates are not delayed; this TASK is a security fix, so the cooldown does not apply.
- The owner explicitly approved applying this as a cooldown exception on 2026-11-18.

## Out of Scope

- Runtime dependencies (the published npm package does not depend on minimatch).
- `pnpm.overrides`, other dependency bumps, code changes.

## Acceptance Criteria

1. `pnpm why minimatch` lists no version below 11.0.1; `grep -c "minimatch@10" pnpm-lock.yaml` is 0.
2. `eslint` 10.15.0 and `typescript-eslint` 8.73.0 are exact pins in `package.json`; no `pnpm.overrides`.
3. New versions are MIT and their `engines` still allow Node 20 (`engines.node >=20`).
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass.
5. CHANGELOG Unreleased (Security), `05-current-state.md`, `docs/logs/2026-11-18.md`, Result and Test Result filled before `vibeops task ship`.

## Test Plan

- `pnpm install`, `pnpm why minimatch`, `grep -c "minimatch@10" pnpm-lock.yaml`
- `npm view eslint@10.15.0 license engines`, `npm view typescript-eslint@8.73.0 license engines`
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `0b73cc3aa38d5d3fb53dddaf26ee1fbcd3183c9f`
- Task Branch: `task/068-security-resolve-dependabot-alert-7-minimatch-ghsa-g3hv-75wg-m249-by-bumpi`
- Started At: `2026-11-18T04:33:13.074Z`

## Result

- `package.json`: `eslint` 10.15.0, `typescript-eslint` 8.73.0 (exact pins). `@eslint/js` unchanged (10.0.1 is latest).
- `pnpm-lock.yaml`: every minimatch resolves to **11.0.9** (was 10.2.6). Alert #7 closes when this reaches `develop`.
- Dev-only: the published npm package is unaffected.
- Cooldown reasoning recorded in Scope (security updates are not delayed).

## Test Result

- `pnpm install` OK (pnpm 9.15.9).
- `pnpm why minimatch`: only `minimatch 11.0.9`. `grep -c "minimatch@10" pnpm-lock.yaml` → 0; lockfile has only `minimatch@11.0.9`.
- `eslint@10.15.0`: MIT, node `^20.19.0 || ^22.13.0 || >=24`. `typescript-eslint@8.73.0`: MIT, node `^18.18.0 || ^20.9.0 || >=21.1.0`, peer eslint `^10.0.0` OK.
- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm test` 192 pass / 0 fail, `pnpm smoke` OK.
