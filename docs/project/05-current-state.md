# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **3.1.2** (merge gate waits for the PR's own CI; npm publish pending).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.
- **2.5.2:** `.vibeops.json` / governance dirt soft-pass on integration sync.
- **3.0.0 (breaking):** merge gate — CheckRun/StatusContext classification fix, fail-closed (incl. no checks unless `merge.allowNoChecks`), strict `merge` config, SHA-pinned merges; requires gh ≥ 2.13.0 (TASK-020).
- **3.1.1:** `task ship` commits staged / unstaged deletions and renames (`porcelain=v1 -z`, `git add -A` only for unstaged paths) (TASK-022).
- **3.1.2:** merge gate waits for the PR's own GitHub Actions runs (expected `pull_request` workflows + all runs for the head SHA), head re-read before merge (TASK-024); CI on PRs + `main` (lint, typecheck, build, tests, smoke, gitleaks), npm Trusted Publishing workflow, OSS hygiene (TASK-023).
- **Unreleased:** `--no-merge` (`task release`), `--no-remote-delete` / `--no-close-mr` (`task del`, `task sync`) take effect; they were ignored before (TASK-025).
- **Unreleased:** `task add --dry-run` no longer crashes (ENOENT) and names the real task branch (TASK-026).
- **3.1.0:** worktree-safe `task add` / `task sync` / `task del` / new-cycle (no integration checkout), repository lock, stash by SHA, global TASK id allocation + ship-time remote id guard (TASK-021).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `git.ts` | Preflight; governance-only dirty OK |
| CI | `.github/workflows/ci.yml` | GitHub-hosted only; required by `.vibeops.json` `merge.requiredChecks` |
| npm publish | `.github/workflows/publish.yml`; manual `scripts/npm-publish.sh` | Trusted Publishing (OIDC) once the owner registers `publish.yml`; until then Infisical / `.env` → temp npmrc |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |
| Worktrees / lock / TASK ids | `src/lib/git-worktree.ts`, `src/lib/task-lock.ts`, `src/lib/task-id-allocation.ts` | D-006 |
| Merge gate | `src/lib/check-rollup.ts`, `src/lib/github-actions-gate.ts`, `src/lib/merge-config.ts`, `src/lib/pr-create.ts` (`waitForMergeGate`) | Fail closed; rollup + GitHub Actions runs (D-007); `.vibeops.json` `merge` block |

## Next

- Consumers: `npm i -g @goodtek/vibeops@3.1.2` (or `volta install @goodtek/vibeops@3.1.2`) once published. Repos without CI: `"merge": {"allowNoChecks": true}`.
- Maintainers: register `publish.yml` as npm trusted publisher (09-deployment.md), then release by tag `vX.Y.Z`; until then `pnpm publish:npm`.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
