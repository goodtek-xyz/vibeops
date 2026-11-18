# TASK-065: Dependabot PRs #62 #63 #65: judge and merge

## Status

Shipped

## Goal

Dependabot PRs #62 #63 #65: judge and merge

## Scope

- Judge the three open Dependabot PRs (#62, #63, #65) with release-note / `engines` / licence evidence, major status and CI, and record the verdict here.
- Record the merge procedure (rebase onto the latest `develop`, CI on the new head, squash merge pinned to that head, one PR at a time).

## Out of Scope

- Any code or `.github/dependabot.yml` change; CHANGELOG (dependency-only, like #34 / #35 and TASK-056).

## Acceptance Criteria

1. Each PR has a row with packages, major?, CI, evidence and verdict.
2. `05-current-state.md` handoff shows no open PRs once the three are merged.
3. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

- Read-only `gh pr view`, GitHub compare API, `npm view <pkg>@<ver> engines license`.
- `pnpm lint`, `pnpm smoke`.

## Git Context

- Base Branch: `develop`
- Base Commit: `c9a2b36b348ce85190da3ef50b3c38694f554624`
- Task Branch: `task/065-dependabot-prs-62-63-65-judge-and-merge`
- Started At: `2026-11-17T23:57:09.912Z`

## Result

Evidence gathered 2026-11-18 (read-only `gh`, `npm view`). This package declares `engines.node` `>=20`; CI verifies Node 20, 22, 24. Dependabot opens PRs only for versions past the 14-day `cooldown` (counted from the version's release), so all three already satisfy it. Licences unchanged (all MIT).

| PR | Packages | Major? | CI (head) | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| #62 | `actions/setup-node` 7.0.0 → 7.1.0 (`ci.yml`, `publish.yml`) | no (minor) | pass (Node 20/22/24, gitleaks) on `d903c78` | v7.1.0: `mise.toml` support, absolute `node-version-file` paths, Node version validation + manifest fetch retry; dependency updates. No breaking change. Head 8 commits behind `develop`. | Merge |
| #63 | `@inquirer/prompts` 8.7.2 → 8.7.5 (prod, lockfile only; range `^8.4.3`) | no (patch) | pass on `2a19a47` | 8.7.3–8.7.5: prompt bug fixes (`search` stale Enter, `confirm` y/n with localized keywords, `checkbox` async validator, cancelled-prompt output leak, `number` whitespace input, `password` cursor, piped-stdin answers). No API change. `engines` unchanged (`^20.17.0 \|\| ^22.13.0 \|\| >=23.5.0`, same as 8.7.2). Head 3 behind. | Merge |
| #65 | `@types/node` 20.19.40 → 20.19.43, `eslint` 10.12.0 → 10.14.0, `typescript-eslint` 8.71.0 → 8.72.1 (dev) | no (patch / minor) | pass on `dc5d2aa` | `@types/node` stays on 20.x (matches the floor, TASK-056). eslint 10.13 / 10.14: rule fixes and small rule features (lint passes in CI); `minimatch` 10.2.6 to avoid a vulnerable `brace-expansion`. `engines` unchanged: eslint `^20.19.0 \|\| ^22.13.0 \|\| >=24`, typescript-eslint `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0` — Node 20 CI still supported. Head 3 behind. | Merge |

Merge procedure (scm seat, after this TASK merges), one PR at a time in the order #62, #63, #65:

1. Comment `@dependabot rebase` (documented Dependabot command) so the head is rebased onto the latest `develop`.
2. `gh pr checks <n> --watch --fail-fast` on the new head; proceed only when every check (Node 20/22/24, gitleaks) is SUCCESS (`develop` has no server-side required checks).
3. `gh pr merge <n> --squash --match-head-commit <new-head-sha>`.
4. Next PR: rebase again after the previous merge (#63 and #65 both touch `pnpm-lock.yaml`).

Changes:

- `docs/project/05-current-state.md`: handoff 2026-11-18 — open PRs none after #62, #63, #65 merge (judged here).
- No CHANGELOG entry: dependency-only, like #34 / #35 and TASK-056.

## Test Result

- Evidence commands above: OK (CI SUCCESS on all three heads; compare API behind 8 / 3 / 3, ahead 1).
- `pnpm lint`: pass (no errors).
- `pnpm smoke`: OK (18 commands).
- PR merges: see the scm report.
