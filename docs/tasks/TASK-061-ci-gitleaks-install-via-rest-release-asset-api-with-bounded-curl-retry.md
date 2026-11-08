# TASK-061: ci: gitleaks install via REST release-asset API with bounded curl retry

## Status

Shipped

## Goal

CI job "Secret scan · gitleaks" stops failing when GitHub's web release-download path is down: on 2026-11-08 `github.com/<repo>/releases/download/...` answered HTTP 504 for over an hour and the install step (`curl -sSfLO`, no retry) failed every run.

## Scope

- `.github/workflows/ci.yml` job `secret-scan`, step "Install gitleaks": resolve asset ids from `api.github.com/repos/gitleaks/gitleaks/releases/tags/v<version>` (job token `GH_TOKEN: ${{ github.token }}`), download `/releases/assets/<id>` with `Accept: application/octet-stream`; curl `--retry 5 --retry-connrefused --retry-max-time 120` (no `--retry-all-errors`, so a 404 fails at once); pinned sha256 + release checksums verification kept

## Out of Scope

- Calling a shared reusable secret-scan workflow: this repo is public and a reusable workflow in a private repository can be shared only with private repositories of the same organization (GitHub docs "Sharing actions and workflows with your organization"), so the job stays inline
- gitleaks version bump, scan steps, runner

## Acceptance Criteria

1. The install step downloads via the REST release-asset API with bounded curl retries; checksum checks unchanged
2. A missing release (404) fails at once, without retries
3. actionlint passes; CI green including "Secret scan · gitleaks"

## Test Plan

- Run the step's script locally with a token (download + checksum); a non-existent version → 404 at once; `actionlint` (with shellcheck); PR CI

## Git Context

- Base Branch: `develop`
- Base Commit: `24c0013a969ed21fd140a07487ccfe600bd14176`
- Task Branch: `task/061-ci-gitleaks-install-via-rest-release-asset-api-with-bounded-curl-retry`
- Started At: `2026-11-08T10:44:06.594Z`

## Result

- `ci.yml` "Install gitleaks": REST API release lookup → asset ids via `jq` → `/releases/assets/<id>` download (octet-stream, 302 followed by `curl -L`); `curl_api` array with `--retry 5 --retry-connrefused --retry-max-time 120`, auth + API-version headers; missing asset → `::error::` and exit 1; pinned sha256 / checksums `cmp` / `sha256sum -c` unchanged. Comments give the curl(1) and GitHub docs basis (retry codes, backoff 1+2+4+8+16 s, why no `--retry-all-errors`, why no jitter)
- Reusable shared workflow not used: public repo cannot call a private repo's reusable workflow (Out of Scope)

## Test Result

- Local run of the step script (token from `gh auth token`, not printed): release.json + both assets downloaded, `gitleaks_8.30.1_linux_x64.tar.gz: OK` (cmp + sha256sum passed; the linux binary itself cannot run on macOS, expected)
- Version `0.0.999`: `curl: (56) ... error: 404` after 0 s, exit non-zero (no retries)
- `actionlint` 1.7.12 + shellcheck 0.11.0: OK
- CI: on the PR