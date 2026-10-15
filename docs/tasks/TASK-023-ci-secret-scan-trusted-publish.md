# TASK-023 · CI, secret scanning, npm Trusted Publishing, OSS hygiene

## Status

In Progress

## Goal

Every pull request and every push to `main` is verified by CI (lint, typecheck, build, tests, smoke) and scanned for secrets, so `vibeops task merge` in this repo can require real checks instead of `merge.allowNoChecks`. npm releases can be published from GitHub Actions with npm Trusted Publishing (OIDC + provenance) without any stored npm token. The tracked tree carries no maintainer-internal details.

## Scope

- `.github/workflows/ci.yml`: `pull_request` + `push` to `main`; GitHub-hosted `ubuntu-latest` only (public repo: fork PRs never run on maintainer machines); `permissions: contents: read`; actions pinned by full commit SHA; Node 20 / 22 / 24 matrix
- `pnpm lint` (ESLint 10 + typescript-eslint recommended, no type-aware rules); fix the trivial findings
- Secret scanning: gitleaks CLI 8.30.1 (MIT; not `gitleaks-action`), pinned sha256 compared with the release checksums file; `gitleaks git --redact --log-opts "<base>..<head>"` on PRs, full history on `main`
- `.github/workflows/publish.yml`: tag `vX.Y.Z` on `main` → verify → `npm publish` via OIDC (`id-token: write`, npm ≥ 11.5.1, provenance automatic); `package.json` `repository.url` = this repo
- `.vibeops.json`: `git` block (integration = production = `main`), `merge.requiredChecks` = the CI jobs (drop `allowNoChecks`)
- OSS hygiene: placeholders for internal hosts, personal paths, private repo names and other repos' TASK numbers; untrack `.infisical.json`
- `AGENTS.md`: public OSS note

## Out of Scope

- Configuring the trusted publisher on npmjs.com, revoking tokens (owner)
- GitHub repository settings (owner; recommendations in the PR)
- Rewriting git history
- The merge-gate bug (TASK-024)

## Acceptance Criteria

1. CI runs on this PR on GitHub-hosted runners and passes: lint, typecheck, build, tests, smoke on Node 20 / 22 / 24, gitleaks on the PR range
2. Only first-party actions, pinned by full SHA; workflow token is read-only; publish job alone has `id-token: write`
3. gitleaks binary is verified against both the pinned sha256 and the release checksums file before it runs
4. No `NPM_TOKEN` or other npm credential is referenced by any workflow
5. Tracked tree: no internal hostnames, internal IPs, personal paths, secret-manager project ids
6. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass locally

## Test Plan

- Local: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`
- Local: `gitleaks git --redact` over full history (report file:line:rule only)
- Hygiene grep over `git ls-files`
- CI run on this PR

## Git Context

- Base Branch: `main`
- Base Commit: `f0ca998a7124eef48db2f0fb9d919344ebb91729`
- Task Branch: `task/task-023-ci-secret-scan-trusted-publish`
- Started At: `2026-10-15T19:35:43Z`

## Result

- new: `.github/workflows/ci.yml` (jobs `Verify · node 20|22|24`, `Secret scan · gitleaks`), `.github/workflows/publish.yml`, `eslint.config.js`
- update: `package.json` (`lint` script, ESLint dev dependencies pinned exactly, repository URLs), `.vibeops.json` (`git` block, `merge.requiredChecks`), `AGENTS.md` (public OSS note), `docs/project/09-deployment.md` (release flow, Trusted Publishing owner steps, manual path kept), `CHANGELOG.md` (Unreleased)
- Lint fixes: useless `\-` escapes (3 files), unused `eslint-disable` directive; `no-useless-assignment` / `preserve-caught-error` (new in ESLint 10 `recommended`) are off for now — they touch status / lock / new-cycle flows and belong in their own TASK
- Hygiene: internal secret-manager URL → `<your-infisical-host>` (`scripts/*.sh`, `.env.example`, `09-deployment.md`); personal checkout paths → `<vibeops-checkout>` (TASK-007/008/010); internal service name / other repo's TASK number → generic (TASK-022, test fixture, log); private repo name → generic (`v3-scope.md`); `.infisical.json` untracked + gitignored

## Test Result

- `pnpm lint` OK; `pnpm typecheck` OK; `pnpm test` 96 pass / 0 fail; `pnpm smoke` OK
- `gitleaks git --redact` full history (all refs, 71 commits): 0 findings; `gitleaks dir` working tree: 0 findings
- Hygiene grep over `git ls-files`: remaining `goodtek.xyz` hits are the public support / contact addresses (deliberate)
- CI: see PR checks
