# VibeOps

> Minimal CLI rails for TASK-driven vibe coding (Cursor, Claude Code, Codex).

[![npm version](https://img.shields.io/npm/v/@goodtek/vibeops.svg)](https://www.npmjs.com/package/@goodtek/vibeops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VibeOps bootstraps an **agent-friendly repo**, starts numbered **TASK** files on Git branches, and runs a clear GitFlow lifecycle. You plan and implement in your chosen agent; the CLI handles files, Git, and short LLM assists.

**Current release:** [`@goodtek/vibeops@2.5.1`](https://www.npmjs.com/package/@goodtek/vibeops) — interactive init remote (GitHub/GitLab), state-aware `task ship` only (no `task reship`), `status` Now/Next card, clearer `task add` integration sync errors.

## Commands

| Command | Purpose |
|---------|---------|
| `vibeops init` | Core docs + agent packs; interactive Git host + create/connect remote |
| `vibeops task add` | New `TASK-NNN` file + task branch |
| `vibeops task del` | Cancel TASK before merge (md + branch + close open MR) |
| `vibeops task ship` | State-aware submit: new PR · update open PR · new PR cycle after merge (Status → **Shipped**) |
| `vibeops task merge` | Merge TASK MR/PR into integration branch (default: squash) |
| `vibeops task sync` | After merge: ff-only integration pull, delete task branches (no TASK md edits) |
| `vibeops task release` | Release PR: integration → production (GitFlow) |
| `vibeops pull` | Fetch remote + update integration branch (e.g. develop) |
| `vibeops status` | **Now / Next** card — focus TASK, checklist, what to run next |
| `vibeops llm` | Connect LLM providers (`connect` · `status` · `use`) |

## Installation

Node.js 20+.

```bash
npm install -g @goodtek/vibeops@2.5.1
# or latest: npm install -g @goodtek/vibeops
vibeops --version   # expect 2.5.1
```

If `vibeops --version` stays on an old release after install, check for a **shell alias** or **Volta** shim shadowing npm:

```bash
type -a vibeops
# alias → unalias vibeops (and remove from ~/.zshrc)
# ~/.volta/bin/vibeops → volta install @goodtek/vibeops@2.5.1
```

**Upgrading from before 2.5:** `task reship` was removed. Use `vibeops task ship` (re-run while the PR is open; after merge use confirm or `--new-cycle`).

Development:

```bash
pnpm install && pnpm build && pnpm smoke
```

## Init

Interactive init asks which agents to install, Git branch policy, then **where the remote lives** (GitHub / GitLab / skip) and whether to **create** or **connect** a repository. If `gh`/`glab` is missing, init prints install hints (optional `brew install` with consent) or accepts a URL — it does not block the rest of VibeOps.

```bash
# Interactive: pick agents (≥1), then Git + remote host
vibeops init

# Non-interactive (GitFlow: develop + main, origin required unless CI)
vibeops init --clients cursor,claude,codex --git --initial-commit --git-policy gitflow --allow-no-remote

# Re-init templates on an existing project
vibeops init --clients cursor --yes
```

| Pack | Installed |
|------|-----------|
| **core** (always) | `AGENTS.md`, `docs/tasks`, `docs/project`, `docs/logs` |
| **cursor** | `.cursor/rules/`, `.cursor/skills/` |
| **claude** | `CLAUDE.md`, `.claude/skills/` |
| **codex** | `.agents/skills/` |

Re-init **overwrites** templates (rules, skills, doc stubs). **`docs/tasks/TASK-*.md` are kept.**

## Workflow

```bash
vibeops init --clients cursor --git --initial-commit

vibeops task add
# Plan / build in Cursor (@docs/tasks/TASK-NNN-*.md)

vibeops task ship
vibeops task merge
vibeops pull
# Same TASK, before merge — edit, then just re-run ship (updates the open PR):
vibeops task ship -m "address review"
# Same TASK, after merge — start a new PR cycle:
vibeops task ship --new-cycle
vibeops task merge
vibeops task sync
vibeops task add
```

`ship` detects the TASK's PR state and does the right thing:

| State | `ship` does | Output |
|-------|-------------|--------|
| No PR yet | push + open a new PR | `Created PR #<n> → <url>` |
| PR open (unmerged) | commit + push the **same** branch (no new PR), CI re-runs | `Updated existing PR #<n> (pushed <sha>) — CI re-running` |
| PR merged | start a **new** PR cycle (needs confirm or `--new-cycle`) | `Started new PR cycle → PR #<n>` |
| No change | no-op | `Nothing to ship (working tree clean, PR #<n> up to date)` |

Occasionally (GitFlow release to production):

```bash
vibeops task release
```

Only one TASK **In Progress** at a time (`task add` blocks otherwise). **Shipped** slices do not block the next add; merge on the host or with `task merge`, then optional `task sync`.

`task add` fast-forward-pulls the integration branch first. If that fails (diverged / **app** dirty / local-ahead), it prints the cause and fix commands and **does not** create a TASK file. VibeOps/governance-only changes (e.g. `.vibeops.json` after `init`) do **not** block. If a previous run left a TASK file without a branch, rerun `task add` to resume.

## Status

```bash
vibeops status
```

Prints a short card:

- **NOW** — focus TASK, stage, Result/Test checklist, branch, PR
- **NEXT** — one primary action (copy-pasteable command)
- footer — project, task counts, LLM (dim)

```bash
vibeops status --json   # machine-readable
```

## LLM (optional)

For **`task add`** / **`task ship`** only (not for coding in the IDE). When `-m` is omitted, `ship` uses a connected provider to draft the commit subject:

```bash
vibeops llm connect
vibeops llm use auto   # auto | codex-oauth | cursor-agent | openai
```

## Flags (common)

- **`init`**: `--clients`, `--yes`, `--dry-run`, `--force`, `--git`, `--initial-commit`, `--git-policy gitflow|trunk`, `--integration-branch`, `--production-branch`, `--git-host github|gitlab`, `--allow-no-remote`, `--cwd`
  When `init` creates the repository on GitHub / GitLab (interactive), it pushes `main` and the integration branch and makes the integration branch (`develop` with the GitFlow preset) the repository's default branch; an existing repository's default branch is not changed.
- **`task add`**: `--dry-run`, `--non-interactive --idea "…"`
- **`task del`**: `--dry-run`, `--force`, `--no-remote-delete`, `--no-close-mr`
- **`task ship`**: `-m/--message`, `--new-cycle`, `--no-commit`, `--dry-run`, `--no-pr`, `--non-interactive`, `--allow-open-mr`, `--no-integrate`, `--recreate-branch`, `--skip-llm`
- **`task merge`**: `--dry-run`, `--merge`, `--rebase`
- **`task sync`**: `--dry-run`, `--no-remote-delete`, `--force`
- **`task release`**: `--dry-run`, `--no-merge`, `--merge`, `--rebase`, `--tag` (after the merge, tag the release merge commit `v<package.json version>` and push it; never moves an existing tag)
- **`pull`**: `--dry-run`
- **`status`**: `--json`

## Git

- **Init** records branch policy in `.vibeops.json` (`integrationBranch`, `productionBranch`, `host`). Interactive remote setup: ask GitHub/GitLab, create or connect; soft-gate when `gh`/`glab` is missing.
- **`task add`**: `task/<NNN-slug>` from **`<remote>/<integration>`** (e.g. `origin/develop`), after `git fetch`. See [Worktrees](#worktrees) and [TASK ids](#task-ids).
- **`task ship`** (state-aware): **no PR** → commit + ship metadata (Status **Shipped**) → push → open MR/PR; **open PR** → commit + push the same branch, CI re-runs, no new PR; **merged PR** → new PR cycle (carries uncommitted work onto the task branch, integrates `develop`, opens a **new** PR). Use `--new-cycle` in non-interactive mode. Commit messages are TASK-id-scoped (`feat(task-001): …`). Refuses when HEAD is not the task branch.
- **`task merge`**: merge MR/PR into integration (TASK md unchanged) — **only when every check is green** (see [Merge gate](#merge-gate)).
- **`task sync`**: verify merge → leave the task branch (switch to integration, or detach at `<remote>/<integration>` when another worktree owns it) → fast-forward local integration where safe → delete local + remote `task/*` branch (TASK md unchanged).
- **`pull`**: fetch + switch to integration branch + `git pull --ff-only` (one command). Refuses (exit 1) when another worktree has the integration branch checked out — run it there.
- **`task release`**: integration → production PR + merge (skipped on trunk policy). Reuses the open release PR when there is one; the merge waits for that PR's own CI like `task merge`.
- **`status`**: Now / Next card — focus stage, checklist, PR, and the next command to run.
- No force-push to shared branches.

## Worktrees

VibeOps supports several `git worktree` checkouts of one repo working in parallel. It never needs to check out the integration branch:

- New task branches start from `<remote>/<integration>` (`git switch -c task/NNN-slug --no-track origin/develop`).
- The local integration branch is fast-forwarded only when safe: in the worktree that has it checked out (`merge --ff-only`), otherwise with `git fetch . refs/remotes/origin/develop:refs/heads/develop`, which git refuses for non-fast-forward updates and for a branch checked out in another worktree — then it is left alone and the log says so (update it in that worktree).
- `task sync` / `task del` / `task ship --new-cycle` leave the task branch by detaching at `<remote>/<integration>` when the integration branch is checked out elsewhere.
- Governance changes set aside for a branch switch are restored by stash SHA, never by `stash pop` (the stash list is shared by all worktrees). Untracked files are not stashed.
- Nothing is ever forced; local integration commits that are not on the remote stop `task add` / `task sync` with fix commands.

### Repository lock

`task add`, `task sync`, `task del`, `task ship --new-cycle` (branch step) and `vibeops pull` take an exclusive lock, `<git-common-dir>/vibeops-task.lock` (shared by all worktrees), recording pid, host, start time, operation and directory. A second command waits, then fails with a message naming the holder.

- The lock file is created atomically with its content (temp file + `link`), so it is never seen half-written.
- **Stale** = holder on this host whose pid is not running, or a lock older than `staleSeconds` (any host; covers pid reuse). A start time in the future (clock skew) is respected, not stale.
- Every removal (release or stale takeover) happens under a short breaker file `vibeops-task.lock.break` and only after re-checking the lock's inode and token, so concurrent takeovers of one stale lock never yield two holders.
- Breaker timings are internal (not in `.vibeops.json`) because the breaker is held for microseconds and only matters after a crash: a breaker older than 30 s is treated as left by a crash; waiting for it is bounded by 60 s (a stale takeover waits at most `waitSeconds`; a release always uses the full 60 s so the lock is not left behind).
- **The git common dir must be on a local filesystem.** Network filesystems (NFS, SMB, cloud-synced folders) are not supported: their `link` / rename / O_EXCL semantics and clocks are not reliable enough for the lock.

| `.vibeops.json` `lock` key | Default | Allowed | Meaning |
|---|---|---|---|
| `waitSeconds` | `60` | integer 0–600 | How long to wait for another holder. |
| `staleSeconds` | `600` | integer 60–86400 | A lock older than this is stale (any host). On this host a lock is also stale as soon as its pid is no longer running. |

## TASK ids

`task add` picks **1 + the highest TASK number found anywhere** so parallel worktrees and unmerged branches never reuse an id:

1. `docs/tasks` in this worktree (including uncommitted files);
2. `docs/tasks` on `<remote>/<integration>` (`git ls-tree`);
3. `docs/tasks` in every worktree (`git worktree list`) — covers task branches whose TASK file is not committed yet;
4. VibeOps task branches, local and on the remote (`git fetch --prune <remote> '+refs/heads/task/*:refs/remotes/<remote>/task/*'`).

A branch counts only when its name has the **generated form** `task/<NNN>` or `task/<NNN>-<slug>` — NNN is the TASK number zero-padded to at least 3 digits, slug is lowercase `a-z0-9` words joined by single hyphens (exactly what `task add` creates from `TASK-<NNN>-<slug>.md`) — **and** its tree contains `docs/tasks/TASK-<NNN>…md`. Other branches (`task/2026-q4-plan`, `task/task-020-x`) are ignored.

If a configured remote cannot be fetched, `task add` stops without creating a TASK file. Across machines, `task ship` re-checks the remote (`git ls-remote`) right before pushing and refuses if another task branch with the same number already exists there.

## Baseline checks

`task add` and `task ship` first check that the repository follows the VibeOps flow (`.vibeops.json` → `baseline`):

| Check | OK when |
|-------|---------|
| `branch-policy` | `git.integrationBranch` ≠ `git.productionBranch` (e.g. `develop` → `main`) |
| `default-branch` | the remote's default branch (`git ls-remote --symref <remote> HEAD`) is the integration branch |
| `personas` | with `baseline.crew` set: `.personas/<crew>/SOURCE` exists |
| `agents-contract` | with `baseline.crew` set: AGENTS.md has the `<!-- getpersona:<crew> -->` section |

```json
{ "baseline": { "mode": "warn", "crew": "vibe-crew" } }
```

- `mode`: `warn` (default — print each failing check with a fix and continue), `enforce` (stop with exit code 1, nothing created or pushed), `off`.
- `crew`: persona crew to require; omitted → the crew checks are skipped.
- The block is validated strictly (unknown keys / values are errors and stop the command).

## Merge gate

> **3.0.0 breaking:** a PR/MR with **no checks at all** is refused by default. Repos without CI: set `"merge": {"allowNoChecks": true}` in `.vibeops.json`. Requires **gh ≥ 2.13.0**.

`task merge` and `task release` are a client-side CI gate (useful when the host plan has no branch protection / required checks, e.g. private GitHub repos on the free plan). **Where server-side branch protection / required checks are available, enable them — the host remains the final authority;** this gate only stops VibeOps itself from merging red work (a human can still merge in the host UI).

Before calling `gh pr merge` / `glab mr merge`:

- **GitHub:** every item in the PR `statusCheckRollup` is classified from GitHub's documented enums — `CheckRun` (Actions) by `status` + `conclusion`, `StatusContext` by `state`:
  - **passed:** `SUCCESS`, `NEUTRAL`, `SKIPPED`
  - **failed:** `FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE`, `ERROR`
  - **pending:** CheckRun `REQUESTED`, `QUEUED`, `IN_PROGRESS`, `WAITING`, `PENDING`; StatusContext `PENDING`, `EXPECTED`
  - **anything missing or undocumented fails closed** (treated as failed). Several checks with the same name: any failure fails.
- **GitHub Actions — the PR's own CI, not leftovers:** the rollup lists every check on the head commit, including checks from other events (e.g. a finished `push` workflow on `develop` when a release PR `develop → main` is opened). Right after a PR is opened or pushed, GitHub has not created its `pull_request` run — or that run's jobs — yet, so such a rollup looked green and 3.1.x merged before CI started. The gate therefore also reads the GitHub Actions API for the head SHA:
  - **Expected workflows:** every `.github/workflows/*.yml|yaml` at the head commit whose `on:` triggers `pull_request` for this PR, using GitHub's filter rules — `branches` / `branches-ignore` against the base branch, `paths` / `paths-ignore` against the PR's changed files (first 300, like GitHub), and `types` (a custom list must contain both `opened` and `synchronize`). Disabled workflows are skipped; `pull_request_target`, `workflow_call` and other events are not awaited. Each expected workflow must have a `pull_request` run for the head SHA — until it appears the gate **waits** (`workflow … (pull_request) has not started for <sha> yet`), then refuses at `waitTimeoutSeconds`.
  - **All runs for the head SHA** (any event, latest run per workflow + event) must be `completed` with `success`, `neutral` or `skipped`. A queued / in-progress / waiting run waits; any other conclusion refuses immediately — including `startup_failure` (no jobs, so nothing in the rollup) and `action_required` (fork PR awaiting approval).
  - The Actions API is required: if it cannot be read, the gate keeps waiting (back-off) and refuses at the timeout — it never merges blind.
- **Dynamic workflows are not CI:** runs GitHub generates on the fly — `event: dynamic`, e.g. `dynamic/dependabot/dependabot-updates`, the jobs that open Dependabot PRs — and check runs suffixed `(dynamic)` are ignored. GitHub documents them as "generated for a specific run and … not stored in your repository's `.github/workflows` directory" ([Dependabot on GitHub Actions runners](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/about-dependabot-on-github-actions-runners)); a failed one says nothing about the commit and cannot be re-run. A `(dynamic)` check named in `requiredChecks` is still required.
- **GitLab:** the MR head pipeline must be `success` or `skipped`. `failed`, `canceled`, `manual` and unknown statuses refuse; `created` / `pending` / `running` / `scheduled` / … wait.
- **Host output is verified:** if `gh pr view` lacks or has empty `state`, `mergeable`, `headRefOid`, or `statusCheckRollup` is not a list (GitLab: `state`, `sha`, `merge_status`, `detailed_merge_status`, `head_pipeline`), the merge is refused.
- **Failed check → refuse immediately** (exit code 1, checks named). **Pending → wait** up to `waitTimeoutSeconds`, then refuse. There is no override flag: fix CI (re-run `task ship`) and rerun `task merge`.
- **No checks at all → refuse** unless `allowNoChecks: true`. "No checks" means: empty rollup, no GitHub Actions run and no expected workflow for the head commit (GitLab: no pipeline). For CI outside GitHub Actions (commit statuses / check apps), list such checks in `requiredChecks` so the gate waits for them by name (`emptyRollupGraceSeconds`, default 0, can re-poll an empty list first).
- **Waiting** polls the host (`gh pr view` + the Actions REST API) every `pollIntervalSeconds` (default 10 s, the default of `gh pr checks --watch`) until the state changes, bounded by `waitTimeoutSeconds` (default 21600 s, the GitHub-hosted job limit). Host read errors back off exponentially with jitter (capped at 60 s, GitHub's guidance for rate-limited clients).
- **After the merge:** `gh pr merge` / `glab mr merge` return the result synchronously (GitHub `merged: true`, GitLab `state: "merged"`), so VibeOps reads the PR/MR once to confirm. Not merged at that point (merge queue / auto-merge) is reported, not waited for.
- **The merge is pinned to the checked commit:** right before merging the gate re-reads the PR head; if it moved, the new head is evaluated from scratch. The merge itself uses `gh pr merge --match-head-commit <sha>` (requires **gh ≥ 2.13.0**) / `glab mr merge --auto-merge=false --sha <sha>` (verified with glab 1.106), so a push between the last check and the merge makes the host refuse. A GitLab `405` re-runs the gate and retries once with the same flags.
- **Unreadable Git Context stops `task ship` / `task add`:** a TASK file whose `## Git Context` cannot be read (e.g. an edit left `## ## Git Context`) makes `task ship` exit 1 before committing or pushing, naming the line; `task add` refuses to "resume" such a TASK (it would write a second section) and names the file and line.
- **`task merge` refuses a stale base:** the head commit the gate approved must contain the current `<remote>/<base>` (`git merge-base --is-ancestor`, after fetching the base branch and the head commit). A head that does not — the base moved since the branch was pushed, or the branch was rebuilt on an old base (e.g. `git reset --soft <stale origin/develop>` + commit) — can silently revert work merged into the base since, and a squash merge lands that revert. Bring the branch up to date (`git fetch` + `git merge <remote>/<base>`, test, `task ship`), wait for CI, then rerun `task merge`. A fetch failure refuses (fail closed). `task release` does not apply this check (with merge-commit releases the production branch is normally not an ancestor of the integration branch).

### Configuration (`.vibeops.json` → `merge`)

```json
{
  "merge": {
    "requiredChecks": ["build", "lint*"],
    "releaseRequiredChecks": ["release smoke"],
    "waitTimeoutSeconds": 21600,
    "pollIntervalSeconds": 10,
    "emptyRollupGraceSeconds": 0,
    "allowNoChecks": false
  }
}
```

| Key | Default | Allowed | Meaning |
|-----|---------|---------|---------|
| `requiredChecks` | `[]` | array of non-empty strings | Checks that must be present and green for `task merge`. A missing one refuses: `required check "X" never ran`. |
| `releaseRequiredChecks` | `[]` | array of non-empty strings | Same for `task release` (integration → production). Shown by `task release --dry-run`. |
| `waitTimeoutSeconds` | `21600` | integer 1–432000 | Upper bound for pending checks. The wait ends as soon as every check finished; the bound only stops a check that never does. Default = the 6-hour job limit of GitHub-hosted runners; self-hosted runners allow up to 5 days ([GitHub Actions limits](https://docs.github.com/actions/reference/limits)). |
| `pollIntervalSeconds` | `10` | integer ≥ 1, ≤ timeout | Poll interval while waiting (same default as `gh pr checks --watch`). |
| `emptyRollupGraceSeconds` | `0` | integer ≥ 0, ≤ timeout | Only when no GitHub Actions workflow is expected: how long an empty check list is re-polled before "no checks" applies. Default `0`: name CI outside GitHub Actions in `requiredChecks` so the gate waits for it by name, instead of guessing how long it takes to report. |
| `allowNoChecks` | `false` | boolean | Merge a PR that has no checks at all (repo without CI). Prints one warning per such merge. |

- Check names are exact (`CheckRun.name` / `StatusContext.context`) or a `*` glob (`"lint*"`, `"* · linux"`). Required checks are GitHub-only; GitLab gates on the head pipeline.
- The block is validated strictly: it must be an object, unknown keys (typos) and wrong types are errors, and `task merge` / `task release` exit 1 naming the key.
- **Recommended:** list your CI jobs in `requiredChecks`. Required checks must be present **and** completed green; missing or pending means wait. Without them the gate still waits for every GitHub Actions workflow that triggers on the PR (see above), but checks from other CI systems are only seen once they report.

## License

MIT
