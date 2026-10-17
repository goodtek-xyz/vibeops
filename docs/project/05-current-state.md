# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **3.1.9** (merge gate ignores dynamic workflow runs such as Dependabot updates).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.
- **2.5.2:** `.vibeops.json` / governance dirt soft-pass on integration sync.
- **3.0.0 (breaking):** merge gate — CheckRun/StatusContext classification fix, fail-closed (incl. no checks unless `merge.allowNoChecks`), strict `merge` config, SHA-pinned merges; requires gh ≥ 2.13.0 (TASK-020).
- **3.1.1:** `task ship` commits staged / unstaged deletions and renames (`porcelain=v1 -z`, `git add -A` only for unstaged paths) (TASK-022).
- **3.1.2:** merge gate waits for the PR's own GitHub Actions runs (expected `pull_request` workflows + all runs for the head SHA), head re-read before merge (TASK-024); CI on PRs + `main` (lint, typecheck, build, tests, smoke, gitleaks), npm Trusted Publishing workflow, OSS hygiene (TASK-023).
- **Unreleased:** `task merge` updates a stale PR branch on GitHub (update-branch, no force push) and re-checks (D-014, TASK-048).
- **Unreleased:** `vibeops status` shows the baseline (checks, crew commit, other remote branches) (TASK-047).
- **Unreleased:** `task release --tag` tags the release merge commit (D-013, TASK-046).
- **Unreleased:** `task add` / `task ship` baseline checks (branch policy, remote default branch, persona crew when configured) (D-012, TASK-045).
- **3.1.9:** merge gate ignores dynamic workflow runs (Dependabot) (D-011, TASK-043).
- **3.1.8:** time values from official docs (D-009): merge wait default 21600 s, no empty-rollup grace, no post-merge polling (TASK-033). Lock values (D-006) still open.
- **3.1.8:** `init` sets the integration branch as the default branch of a repository it creates (TASK-035).
- **3.1.8:** this repository uses `develop` (integration, default) + `main` (releases only) (TASK-034).
- **3.1.7:** `ship --new-cycle` ships committed-but-unmerged work and keeps `-m` (TASK-032).
- **3.1.7:** PR body lists only this TASK's changes (against the fetched `<remote>/<base>`) (TASK-031).
- **3.1.6:** `task release` reuses an open release PR; unreadable Git Context stops `task ship` / `task add` with the line named (TASK-030).
- **3.1.5:** `task merge` refuses a stale base (head must contain `<remote>/<base>`, D-008); `ship -m` keeps body and trailers (TASK-029).
- **3.1.5:** Dependabot fixes — `js-yaml` 3.15.2, dev `tsx` / `esbuild` 0.28.2; `sprintf-js` advisory unfixable upstream and unreachable (TASK-027).
- **3.1.4:** no CLI changes; first release published by `publish.yml` (Trusted Publishing, provenance).
- **3.1.3:** `--no-merge` (`task release`), `--no-remote-delete` / `--no-close-mr` (`task del`, `task sync`) take effect; they were ignored before (TASK-025). `task add --dry-run` no longer crashes (ENOENT) and names the real task branch (TASK-026).
- **3.1.0:** worktree-safe `task add` / `task sync` / `task del` / new-cycle (no integration checkout), repository lock, stash by SHA, global TASK id allocation + ship-time remote id guard (TASK-021).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `git.ts` | Preflight; governance-only dirty OK |
| CI | `.github/workflows/ci.yml` | PRs + pushes to `develop` / `main`; GitHub-hosted only; required by `.vibeops.json` `merge.requiredChecks` / `releaseRequiredChecks` |
| npm publish | `.github/workflows/publish.yml`; fallback `scripts/npm-publish.sh` | Trusted Publishing (OIDC, provenance), active since 3.1.4; fallback Infisical / `.env` → temp npmrc |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |
| Worktrees / lock / TASK ids | `src/lib/git-worktree.ts`, `src/lib/task-lock.ts`, `src/lib/task-id-allocation.ts` | D-006 |
| Merge gate | `src/lib/check-rollup.ts`, `src/lib/github-actions-gate.ts`, `src/lib/merge-base-freshness.ts`, `src/lib/merge-config.ts`, `src/lib/pr-create.ts` (`waitForMergeGate`) | Fail closed; rollup + GitHub Actions runs (D-007), dynamic runs ignored (D-011); head must contain base (D-008); `.vibeops.json` `merge` block |

## Next

- Consumers: `npm i -g @goodtek/vibeops@3.1.9` (or `volta install @goodtek/vibeops@3.1.9`). Repos without CI: `"merge": {"allowNoChecks": true}`.
- Maintainers: TASK PRs → `develop`; release = release-prep TASK on `develop` → `vibeops task release --tag` (develop → main after its CI, then tag `vX.Y.Z` on the merge commit) → `publish.yml` publishes via npm Trusted Publishing (no token; 09-deployment.md). Manual `pnpm publish:npm` is a fallback only.

## Handoff (2026-10-17)

State at handoff — clean, ready to start the next feature from `develop`:

- Released: `@goodtek/vibeops` **3.1.9** (3.1.8 before) on npm (`latest`, SLSA provenance), tag `v3.1.8` on `main` (`cb59407`), published by `publish.yml` (Trusted Publishing, connection *Valid*). First release through `develop → main` (D-010).
- Branches: `develop` (default, integration) and `main` (releases only). No other branches and no worktrees.
- Open PRs: only Dependabot major-version PRs, left open on purpose (each needs its own TASK). Dependabot minor / patch groups are merged after CI (#34 eslint, #35 @inquirer/prompts).
  - #36 `@types/node` 20 → 26: CI green, but the types must follow the lowest supported Node (`engines.node` `>=20`); keep 20.x (ignore majors) unless the Node floor moves.
  - #37 `typescript` 5.9 → 6.0: CI fails on all Node versions; needs a migration TASK.
  - #38 `commander` 12 → 15: CI green, but commander 15 requires Node `>=22.12.0`, above this package's `>=20`; adopt only with a decision to raise the Node floor (also re-check negated-flag parsing, TASK-025).
- TASKs: none In Progress (TASK-000 is the template). TASK-001…017 still carry the old status words `done` / `Review` from before the Shipped vocabulary.
- CI green on `develop` and `main`. One open Dependabot alert: `sprintf-js` (no fixed release; reached only through `js-yaml`'s CLI, not used — see TASK-027).

Next feature candidates (each its own TASK, smallest first):

1. `task sync --non-interactive`: accept the flag like `task add` / `task ship` (sync never prompts, but scripts that pass it fail with "unknown option").
2. `task ship -m` trailers on the metadata commit (also requested as a config option, e.g. a `Co-Authored-By` trailer for every generated commit): the "mark shipped" commit (and the open-PR / new-cycle metadata commits) uses a fixed message (`docsCommitMessageFor`, `src/commands/task-ship.ts`), so the body and trailers of `-m` (e.g. `Co-Authored-By`) are missing there. Carry the trailers of `-m` over to the metadata commit (or accept trailers separately).
3. `findMergeRequestByBranches` error contract: it returns the helper's promise without `await` inside its `try`, so lookup errors escape the intended `catch` (`task ship`, `task del`; `task release` already handles it). Decide per caller: swallow vs. surface.
4. Repository lock without design-value timeouts (D-006 / D-009): event-based wait (file watch) instead of the 50 ms retry, process start time for pid reuse instead of `staleSeconds` age, explicit handling of other-host / unreadable locks.
5. Normalise the status words of TASK-001…017 (`done` / `Review` → `Shipped`) after checking each was merged.

Owner decisions pending:

- Organization baseline check: Dependabot configuration (TASK-038) and the persona crew + agent-contract section (TASK-041, public variant) are in; "Update branch" on PRs (`allow_update_branch`) is applied by the maintainers' platform tooling.
- npm package setting: *Require two-factor authentication and disallow tokens* (recommended by npm now that OIDC publishing works; disables the manual `pnpm publish:npm` fallback).
- Dependabot `sprintf-js` alert: handled through Dependabot (TASK-038) — no fixed release exists yet; replacing `gray-matter` would remove it (TASK, if wanted).

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
