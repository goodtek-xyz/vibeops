# TASK-063: GitLab base URL (default gitlab.com, configurable) for init create/connect

## Status

Shipped

## Goal

GitLab base URL (default gitlab.com, configurable) for init create/connect

## Scope

- `.vibeops.json` `git.gitlabUrl` (default `https://gitlab.com`, strict validation, D-017).
- `init`: interactive "GitLab URL" prompt, `--gitlab-url <url>`; create / connect / default-branch / auth calls target that instance.
- Owner/repo parsing for custom-host HTTPS / SSH and nested groups; host detection by configured host.
- README GitLab section, CHANGELOG, tests.

## Out of Scope

- Unrelated refactors and features outside this slice.
- `task merge` update-branch on GitLab; TLS / private CA settings.

## Acceptance Criteria

1. Absent `gitlabUrl` behaves exactly as before (same glab argv, `https://gitlab.com/...` URLs).
2. Base URLs with port / sub-path / trailing slash normalize; invalid ones fail visibly (flag and config).
3. Custom-host HTTPS / SSH / nested-group remotes parse and are detected as GitLab.
4. `init --dry-run --gitlab-url` shows the host in the plan.
5. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

- `node --test tests/gitlab-url.test.mjs` (new), `pnpm lint`, `pnpm smoke`.
- `node dist/cli.js init --dry-run --git-host gitlab --gitlab-url https://gitlab.example.com/ --clients claude --git-policy gitflow --cwd <scratch>`.

## Git Context

- Base Branch: `develop`
- Base Commit: `4125721aed383ec49b50affaa4495f9ff4e193cd`
- Task Branch: `task/063-gitlab-base-url-default-gitlab-com-configurable-for-init-create-connect`
- Started At: `2026-11-17T23:24:54.167Z`

## Result

- New `src/lib/gitlab-url.ts`: `parseGitlabBaseUrl` / `resolveGitlabBaseUrl`, `parseRemoteUrl` (https, ssh://, scp-style), `glabHostnameArgs`.
- `git.gitlabUrl` in `VibeopsGitConfig`; `readConfig` validates and normalizes (throws `GitlabUrlError`); `buildConfig` keeps it on re-init; default not written.
- `init --gitlab-url` (implies GitLab; refused with `--git-host github`), plan line `gitlab: <url>`; interactive "GitLab URL" prompt after choosing GitLab.
- `glab repo create <base>/<path> --remoteName <remote>` (was the unknown `--remote=origin`, also on GitLab.com), `glab repo view` (slug on GitLab.com, full URL otherwise), `glab auth status|api --hostname <hostname>` (always port-less) and `glab auth login --hostname <hostname> [--api-host <hostname>:<port>] [--api-protocol http]` for non-default URLs.
- Sub-path base URL: create and the `repo view` check are refused (`gitlabCliUnsupportedReason`, hint: connect); connect + detection work.
- `parseOwnerRepo` / `remoteUrlForHost` / `resolveConnectUrl` / `detectGitHost` take the base URL; task ship/merge/sync/release/status pass `git.gitlabUrl`.
- D-017; README GitLab section and init flags; CHANGELOG Unreleased.

## Test Result

- Review round 1 (real glab 1.131.0): `glab api --hostname example.invalid:8443 version` → "error parsing --hostname: invalid hostname"; `--hostname example.invalid` → reaches `https://example.invalid/api/v4/version` (DNS error only). Fixed: port-less api hostname, slug for GitLab.com `repo view`, sub-path create refused.
- Review round 2: glab keys config by hostname, port in `api_host`. Verified with a scratch `GLAB_CONFIG_DIR`: `glab auth login --hostname example.invalid --api-host example.invalid:8443` stores entry `example.invalid` with `api_host: example.invalid:8443`, and `glab api --hostname example.invalid version` then calls `https://example.invalid:8443/api/v4/version`. Scratch credential logged out afterwards.
- `tests/gitlab-url.test.mjs`: 13 tests pass; on the base commit (4125721) the file fails (module and exports missing).
- `pnpm lint` OK; `pnpm smoke` OK — 188 tests pass, smoke script OK.
- CLI dry-run shows `gitlab:  https://gitlab.example.com` and `would configure git remote origin (gitlab at https://gitlab.example.com)`.
- Real init with existing remote `git@code.example.invalid:group/sub/app.git` + `--gitlab-url https://code.example.invalid` writes `host: gitlab`, `gitlabUrl`.
- Not verified: a live self-managed GitLab (glab argv checked; login against a real instance not exercised).
