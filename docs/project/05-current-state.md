# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **3.1.7** (PR body against the fetched base; `ship --new-cycle` ships committed work and keeps `-m`).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.
- **2.5.2:** `.vibeops.json` / governance dirt soft-pass on integration sync.
- **3.0.0 (breaking):** merge gate — CheckRun/StatusContext classification fix, fail-closed (incl. no checks unless `merge.allowNoChecks`), strict `merge` config, SHA-pinned merges; requires gh ≥ 2.13.0 (TASK-020).
- **3.1.1:** `task ship` commits staged / unstaged deletions and renames (`porcelain=v1 -z`, `git add -A` only for unstaged paths) (TASK-022).
- **3.1.2:** merge gate waits for the PR's own GitHub Actions runs (expected `pull_request` workflows + all runs for the head SHA), head re-read before merge (TASK-024); CI on PRs + `main` (lint, typecheck, build, tests, smoke, gitleaks), npm Trusted Publishing workflow, OSS hygiene (TASK-023).
- **Unreleased:** `init` sets the integration branch as the default branch of a repository it creates (TASK-035).
- **Unreleased:** this repository uses `develop` (integration, default) + `main` (releases only) (TASK-034).
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
| Merge gate | `src/lib/check-rollup.ts`, `src/lib/github-actions-gate.ts`, `src/lib/merge-base-freshness.ts`, `src/lib/merge-config.ts`, `src/lib/pr-create.ts` (`waitForMergeGate`) | Fail closed; rollup + GitHub Actions runs (D-007); head must contain base (D-008); `.vibeops.json` `merge` block |

## Next

- Consumers: `npm i -g @goodtek/vibeops@3.1.7` (or `volta install @goodtek/vibeops@3.1.7`). Repos without CI: `"merge": {"allowNoChecks": true}`.
- Maintainers: TASK PRs → `develop`; release = release-prep TASK on `develop` → `vibeops task release` (develop → main, after its CI) → tag `vX.Y.Z` on `main` → `publish.yml` publishes via npm Trusted Publishing (no token; 09-deployment.md). Manual `pnpm publish:npm` is a fallback only.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
