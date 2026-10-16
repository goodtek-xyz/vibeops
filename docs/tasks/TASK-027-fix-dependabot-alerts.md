# TASK-027: Fix Dependabot alerts

## Status

Shipped

## Goal

Resolve the open Dependabot alerts on `main` (all from `pnpm-lock.yaml`) with upstream releases, and record an assessment for any alert without a fix.

## Scope

- `js-yaml` 3.14.2 (runtime, via `gray-matter` 4.0.3; GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh high; GHSA-h67p-54hq-rp68 medium): patched in 3.15.2, inside `gray-matter`'s `^3.13.1` range → lockfile update, no override
- `esbuild` 0.27.7 (dev, via `tsx` 4.21.0; GHSA-g7r4-m6w7-qqqr low, Windows dev server only): `tsx` ^4.23.15 depends on `esbuild ~0.28.0` → resolves 0.28.2 (patched ≥ 0.28.1)
- `sprintf-js` 1.0.3 (runtime, via `js-yaml` → `argparse`; GHSA-hp3w-g68c-fv3c medium): no patched release exists. Assessment only (see Result)
- License check of changed packages; CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Replacing `gray-matter` (would remove `js-yaml` 3 / `argparse` / `sprintf-js`; frontmatter parsing behaviour change → separate TASK if wanted)
- Dismissing alerts on GitHub (owner decision)
- Other dependency upgrades

## Acceptance Criteria

1. Lockfile resolves `js-yaml` ≥ 3.15.2 and `esbuild` ≥ 0.28.1; `package.json` changes only `tsx`
2. `pnpm install --frozen-lockfile` succeeds; changed packages are OSI open source (MIT)
3. `pnpm audit` reports only the unfixable `sprintf-js` advisory
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- `pnpm why js-yaml`, `pnpm why esbuild`, `pnpm audit`, `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm typecheck`, `pnpm smoke`; `pnpm dev --version` (tsx entry); CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `47fa2b282eacf4b43b019e89fd75f73298467f6c`
- Task Branch: `task/027-fix-dependabot-alerts`
- Started At: `2026-10-16T08:54:31.552Z`

## Result

- update: `package.json` devDependency `tsx` ^4.19.0 → ^4.23.15 (resolves 4.23.15 → `esbuild` 0.28.2)
- update: `pnpm-lock.yaml` — `js-yaml` 3.14.2 → 3.15.2 (`pnpm update js-yaml`; unrelated specifier rewrites by that command reverted), `tsx` 4.21.0 → 4.23.15, `esbuild` 0.27.7 → 0.28.2; `get-tsconfig` / `resolve-pkg-maps` dropped with old `tsx`
- licenses: `js-yaml` MIT, `tsx` MIT, `esbuild` MIT
- `sprintf-js` (GHSA-hp3w-g68c-fv3c): no patched version (`<= 1.1.3` vulnerable, `first_patched_version` null). Reached only as `js-yaml` → `argparse` → `sprintf-js`; `argparse` is required only by `js-yaml`'s CLI (`bin/js-yaml.js`), no file under `js-yaml/lib` references it, and vibeops calls `gray-matter` → `js-yaml` library only (`src/lib/task.ts`). The vulnerable code is not reachable from vibeops. Left open; removing it needs a `gray-matter` replacement (Out of Scope)
- docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-16.md`

## Test Result

- `pnpm why`: `js-yaml` 3.15.2, `esbuild` 0.28.2, `sprintf-js` 1.0.3
- `pnpm install --frozen-lockfile` OK; `pnpm audit`: 1 moderate (`sprintf-js`, GHSA-hp3w-g68c-fv3c) — the 5 fixable advisories are gone
- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 116 pass, 0 fail); `pnpm dev --version` → 3.1.4
- CI: on the PR
