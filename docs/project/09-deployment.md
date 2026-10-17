# 09 — Deployment

How this project is built, packaged, and shipped.

## Local run

```bash
pnpm install
pnpm build
pnpm smoke
node dist/cli.js --help
```

## Build

```bash
pnpm build          # → dist/
pnpm prepack        # clean + build (runs automatically before npm pack/publish)
```

## Packaging / distribution (npm)

Package: `@goodtek/vibeops` (public). Version is `package.json` `version`.

### Release flow

Long-lived branches: `develop` (integration, default branch) and `main` (production). `main` only receives releases (`vibeops task release`); `.vibeops.json` `git` block: `integrationBranch: develop`, `productionBranch: main`.

1. TASK PRs (`task/*` → `develop`) merge with `vibeops task merge` after their CI is green and the head contains the current `develop`.
2. Release prep on `develop` (a TASK such as "Release X.Y.Z"): bump `package.json` `version`, move the CHANGELOG `Unreleased` entries under `## X.Y.Z - YYYY-MM-DD`, update `05-current-state.md`. Patch for fixes, minor for features, major for breaking changes.
3. `vibeops task release --tag`: opens (or reuses) the `develop → main` PR, merges it with a merge commit once its own CI is green (`merge.releaseRequiredChecks`), then tags that merge commit `vX.Y.Z` (the `package.json` version there) and pushes the tag. It refuses to move an existing tag.
4. The tag push starts `publish.yml`, which publishes `X.Y.Z` (below). No token, OTP or manual step.
5. Check the registry: `npm view @goodtek/vibeops dist-tags --prefer-online`.

### Publish from GitHub Actions — npm Trusted Publishing (current path)

`.github/workflows/publish.yml` publishes with npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC): no npm token exists in GitHub or anywhere else, and npm attaches provenance automatically (public repo + public package). Active since 3.1.4 (trusted publisher status **Valid**).

Requirements (from the npm docs, checked by the workflow): GitHub-hosted runner, `permissions: id-token: write`, npm CLI ≥ 11.5.1 (Node 24 image), package.json `repository.url` = `git+https://github.com/goodtek-xyz/vibeops.git`, and the workflow **filename** `publish.yml` registered on npmjs.com.

Trigger — `task release --tag` pushes it; by hand (fallback) tag the release merge commit on `main`:

```bash
git switch main && git pull --ff-only
git tag vX.Y.Z            # must equal package.json version
git push origin vX.Y.Z
```

The workflow refuses a tag that does not match `package.json` or is not on `main`, runs lint / typecheck / build / tests / smoke, then `npm publish --access public`. A tag whose version is already on npm fails at the publish step (`You cannot publish over the previously published versions`) — harmless, nothing is changed.

If the publish step fails for a reason outside the code (e.g. the trusted publisher configuration), fix the cause and re-run the failed job (`gh run rerun <run-id> --failed`); do not move or re-push the tag.

#### Trusted publisher configuration (owner, npmjs.com)

Package **@goodtek/vibeops** → **Settings** → **Trusted Publisher** → **GitHub Actions**:

| Field | Value |
|-------|-------|
| Organization or user | `goodtek-xyz` |
| Repository | `vibeops` |
| Workflow filename | `publish.yml` (file name only, no path) |
| Environment name | *(empty)* |
| Allowed actions | **Allow `npm publish`** checked (`npm stage publish` is always allowed; without this box `publish.yml`'s direct publish is refused) |

Notes from setting it up:

- Fields are case-sensitive, not validated on save, and cannot be edited later — delete the connection and create a new one to change them.
- **Set up connection** asks to confirm the password and then for the security key (2FA). After the password step npm may redirect to the account settings page and drop the form; go back to the package settings and save again. The connection exists only when it is listed under *Trusted Publisher*.
- A new connection shows *Pending validation* and expires unless a publish succeeds through it within 2 days; it shows *Valid* after the first successful publish.
- Without a matching connection, `npm publish` in the workflow fails with `E404 Not Found - PUT https://registry.npmjs.org/@goodtek%2fvibeops` ("could not be found or you do not have permission").
- Optional hardening (owner decision): **Publishing access** → *Require two-factor authentication and disallow tokens*, then revoke the granular token. This disables the token fallback below.

#### Registry lag and stale cache

After `+ @goodtek/vibeops@X.Y.Z` npm says the package "may take a few minutes to become available". `npm view` can also answer from the local cache and show the previous version or a 404; query with `--prefer-online`.

### Fallback: manual publish with an npm token

Only when the Actions path is unavailable. Needs an npm **granular access token** (Read and write, bypass 2FA for publish) — unless the package disallows tokens (above).

With Infisical (token stored as `NPM_TOKEN` at path **`/`**, env `local`; optional `/npm` folder with `INFISICAL_PATH=/npm`):

```bash
export INFISICAL_API_URL=https://<your-infisical-host>/api   # add to shell profile
brew install infisical/get-cli/infisical
infisical login
infisical init    # creates .infisical.json (local only, gitignored — never commit it)
pnpm publish:npm          # smoke + npm publish
pnpm publish:npm:dry      # dry-run
```

`scripts/npm-publish.sh` requires `INFISICAL_API_URL`, injects secrets via `scripts/infisical-run.sh`, writes a **temporary** npmrc (not `~/.npmrc`), then runs `npm publish`. Its post-publish registry check can time out while npm is still processing (see *Registry lag*); confirm with `npm view … --prefer-online` instead of publishing again.

With a local `.env` (gitignored):

```bash
cp .env.example .env
# edit NPM_TOKEN=npm_...
pnpm publish:npm
```

If the token does not bypass 2FA, pass the current one-time code in `NPM_OTP` (e.g. `NPM_OTP=<6-digit code> pnpm publish:npm`).

When a release was published by hand, still push its `vX.Y.Z` tag on `main` for the history; the triggered workflow then fails at the publish step as described above.

## Environment separation

| Secret source | When |
|---------------|------|
| none (OIDC) | GitHub Actions `publish.yml` (Trusted Publishing) — default |
| Infisical `/` (`NPM_TOKEN`) | Fallback from maintainer machines |
| `.env` | Solo fallback |
| `NPM_TOKEN` already exported | Ad-hoc shell |

## Rollback

- npm: publish a new patch that reverts behavior, or `npm deprecate @goodtek/vibeops@x.y.z "message"`.
- Git: revert the release commit on `main`.
