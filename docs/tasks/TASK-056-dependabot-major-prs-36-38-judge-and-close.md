# TASK-056: Dependabot major PRs #36-#38: judge and close

## Status

In Progress

## Goal

Dependabot major PRs #36-#38: judge and close

## Scope

- Judge the three open Dependabot major PRs (#36, #37, #38) with changelog / requirement evidence, major status and CI, and record the verdict here.
- Majors that fail CI or need code / policy changes roll to the next cycle: closed with the reason and listed as next candidates in `05-current-state.md`.
- `.github/dependabot.yml`: `ignore` the `@types/node` and `commander` semver-major updates while the reason holds (typescript is not ignored — its migration is a real next candidate).

## Out of Scope

- The TypeScript 6 migration and raising the Node floor (separate TASKs).
- Any other change to `.github/dependabot.yml`.

## Acceptance Criteria

1. Each PR has a row with package, major?, CI, evidence and verdict.
2. `.github/dependabot.yml` parses and has exactly the two `ignore` entries added.
3. `05-current-state.md` handoff shows no open PRs and the two new candidates.
4. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

- Parse `.github/dependabot.yml` with `js-yaml`.
- `pnpm lint`, `pnpm smoke`.

## Git Context

- Base Branch: `develop`
- Base Commit: `b1dd8f54e106b39079c18c642f66d4ad6fa89875`
- Task Branch: `task/056-dependabot-major-prs-36-38-judge-and-close`
- Started At: `2026-10-17T19:55:07.941Z`

## Result

Evidence gathered 2026-10-18 (read-only `gh`, `npm view`). This package declares `engines.node` `>=20`; CI verifies Node 20, 22, 24.

| PR | Package | Major? | CI (head) | Changelog / requirement evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| #36 | `@types/node` 20.19.40 → 26.6.4 (dev) | yes | pass (Node 20/22/24, gitleaks) | `@types/node` majors track Node majors; 26.x describes Node 26 APIs, so code could compile against APIs that Node 20 (the floor) lacks. | Close. Keep 20.x while the floor is `>=20`; `ignore` semver-major. |
| #37 | `typescript` 5.9.3 → 6.0.3 (dev) | yes | fail on Node 20/22/24 (gitleaks pass) | `engines` `>=14.17` (no Node issue). Failed log: `TS2591 Cannot find name 'node:fs/promises' / 'process'`, `TS2584 Cannot find name 'console'`, `TS7006` — TS 6 no longer includes `@types/*` automatically (`types` must be set in `tsconfig.json`). Needs a code change. | Close; next candidate "TypeScript 6 migration". Not ignored, so the next 6.x release reopens a PR (closing already skips 6.0.3). |
| #38 | `commander` 12.1.0 → 15.0.0 (prod) | yes | pass (Node 20/22/24, gitleaks) | `npm view commander@15 engines` → `node >=22.12.0`, above this package's `>=20`; users on Node 20 / 22.0–22.11 would get an unsupported runtime dependency. | Close; next candidate "Raise the Node floor to `>=22.12`" (owner decision; also re-check negated-flag parsing, TASK-025). `ignore` semver-major until then. |

Changes:

- `.github/dependabot.yml`: npm `ignore` for `@types/node` and `commander` `version-update:semver-major`, with the reason in a comment. Nothing else changed (`cooldown` 14 days stays).
- `docs/project/05-current-state.md`: handoff 2026-10-18 — open PRs none (#36–#38 closed with reasons here), two new next candidates, ready for the next `vibeops task add`.
- No CHANGELOG entry: config-only change, like the TASK-038 Dependabot change.

The PRs are closed after this TASK merges, with a comment pointing to this table.

## Test Result

- `js-yaml` parse of `.github/dependabot.yml`: OK — npm `ignore` = `@types/node`, `commander` (semver-major); github-actions entry unchanged.
- `pnpm lint`: pass (no errors).
- `pnpm smoke`: OK (18 commands).
