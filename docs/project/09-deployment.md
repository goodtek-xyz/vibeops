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

1. TASK PRs merge into `main` after CI (`.github/workflows/ci.yml`) is green.
2. Release PR (`release/X.Y.Z` → `main`): bump `package.json` `version`, move the CHANGELOG `Unreleased` entries under `## X.Y.Z - YYYY-MM-DD`. Patch for fixes, minor for features, major for breaking changes.
3. Publish `X.Y.Z` (below).

### Publish from GitHub Actions — npm Trusted Publishing (target path)

`.github/workflows/publish.yml` publishes with npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC): no npm token exists in GitHub or anywhere else, and npm attaches provenance automatically (public repo + public package).

Requirements (from the npm docs, checked by the workflow): GitHub-hosted runner, `permissions: id-token: write`, npm CLI ≥ 11.5.1 (Node 24 image), package.json `repository.url` = `git+https://github.com/goodtek-xyz/vibeops.git`, and the workflow **filename** `publish.yml` registered on npmjs.com.

Trigger — tag the release commit on `main`:

```bash
git switch main && git pull --ff-only
git tag vX.Y.Z            # must equal package.json version
git push origin vX.Y.Z
```

The workflow refuses a tag that does not match `package.json` or is not on `main`, runs lint / typecheck / build / tests / smoke, then `npm publish --access public`.

One-time owner setup on npmjs.com (package **@goodtek/vibeops** → **Settings** → **Trusted Publisher** → **GitHub Actions**):

| Field | Value |
|-------|-------|
| Organization or user | `goodtek-xyz` |
| Repository | `vibeops` |
| Workflow filename | `publish.yml` |
| Environment name | *(empty)* |
| Allowed actions | enable direct `npm publish` (new configurations default to `npm stage publish` only) |

Fields are case-sensitive and not validated on save. A new configuration expires unless it publishes successfully within 2 days, so tag a release soon after saving it. After the first successful OIDC publish: package **Settings** → **Publishing access** → *Require two-factor authentication and disallow tokens*, then revoke the old granular token. Until then the manual path below keeps working.

### Manual publish with Infisical (until Trusted Publishing is configured)

1. Create an npm **granular access token** (Read and write, enable bypass 2FA for publish).
2. Store it in Infisical as `NPM_TOKEN` at path **`/`** (env `local`). Optional: use a `/npm` folder and `INFISICAL_PATH=/npm`.
3. Link this repo once:

```bash
export INFISICAL_API_URL=https://<your-infisical-host>   # add to shell profile
brew install infisical/get-cli/infisical
infisical login
infisical init    # creates .infisical.json (local only, gitignored — never commit it)
```

4. Publish:

```bash
pnpm publish:npm          # smoke + npm publish
pnpm publish:npm:dry      # dry-run
```

`scripts/npm-publish.sh` injects secrets via `scripts/infisical-run.sh`, writes a **temporary** npmrc (not `~/.npmrc`), then runs `npm publish`.

### Publish with local `.env` (fallback)

```bash
cp .env.example .env
# edit NPM_TOKEN=npm_...
pnpm publish:npm
```

`.env` is gitignored.

### One-shot OTP

If the token does not bypass 2FA:

```bash
NPM_OTP=123456 pnpm publish:npm
```

## Environment separation

| Secret source | When |
|---------------|------|
| Infisical `/` (`NPM_TOKEN`) | Team publish from maintainer machines |
| `.env` | Solo fallback |
| `NPM_TOKEN` already exported | Ad-hoc shell |
| none (OIDC) | GitHub Actions `publish.yml` (Trusted Publishing) |

## Rollback

- npm: publish a new patch that reverts behavior, or `npm deprecate @goodtek/vibeops@x.y.z "message"`.
- Git: revert the release commit on `main`.
