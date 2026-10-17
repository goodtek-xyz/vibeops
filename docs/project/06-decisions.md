# 06 — Decisions

Decisions already made. A conflicting new proposal can only change them after being raised as a separate TASK.

## D-001 · The source of truth is `docs/` in Git

Chat is not trusted. When they conflict, fix the docs first, then implement.

## D-002 · One TASK at a time

Large refactors are not done without their own TASK.

## D-003 · Notion is a human dashboard (metadata only)

No body sync. No realtime.

## D-004 · TASK md status is In Progress → Shipped only (2.1+)

- **`task ship`** sets Status **Shipped** (including new PR cycles via `--new-cycle`).
- **`task merge`**, **`task sync`**, and host UI merge do **not** edit TASK markdown.
- Legacy Review/Done/Merged/Planned normalize when read.
- Same-TASK follow-up after merge: **`task ship --new-cycle`** (or interactive confirm), not a new TASK id.

## D-005 · `task merge` is a fail-closed CI gate (3.0+)

Hosts without enforceable branch protection (e.g. private GitHub repos on the free plan) cannot require checks, so `task merge` / `task release` enforce them client-side: any failed, unknown or missing check, untrusted host output (missing/empty fields), or a PR with no checks at all refuses the merge; pending checks wait (bounded, configurable) then refuse; merges are pinned to the checked head SHA. No `--force` override on merge — the repo's `--force` convention (`task sync`, `task del`) bypasses local safety checks, not CI, and agents run these commands; humans keep the host UI. Repos without CI opt in explicitly with `merge.allowNoChecks: true` (one warning per such merge) — fail closed by default rather than silently merging unverified work. Because this refuses PRs that merged before, it shipped as a major version (3.0.0). Required check names and gate timing live only in the consumer's `.vibeops.json` `merge` block (strictly validated), never in VibeOps code. Server-side branch protection, where available, remains the final authority.

## D-006 · Worktree-safe lifecycle and global TASK ids (3.1+)

Consumers run several `git worktree` checkouts of one repo in parallel. Git refuses to check out a branch another worktree has, and worktrees share `refs/stash` and the git common dir. Therefore: (1) VibeOps never requires checking out the integration branch — task branches start from `<remote>/<integration>` after a fetch; the local integration ref is updated only via `merge --ff-only` where it is checked out, else via `git fetch . refs/remotes/<remote>/<b>:refs/heads/<b>` so git itself refuses non-fast-forward and checked-out-elsewhere updates (reported, not failed); leaving a task branch detaches at `<remote>/<integration>` when the integration branch is owned elsewhere. Nothing is forced. (2) Mutating lifecycle steps run under one O_EXCL lock file in the git common dir (stale = dead pid on this host, or older than `lock.staleSeconds` from another host). (3) Governance changes are set aside by stash SHA (`stash create` / `store` / `apply <sha>` / drop that entry), never `stash pop`; untracked files are not stashed. (4) TASK id = 1 + max over local, integration-tree and every-worktree `docs/tasks` and generated-form task branches (local + fetched remote) that contain their TASK file; an unreachable remote refuses `task add`, and `task ship` re-checks the remote for a same-number branch right before pushing (fail closed). Counting only generated-form branches with TASK-file evidence keeps unrelated names (`task/2026-q4-plan`) from inflating ids; uncommitted TASK files are still covered by the every-worktree scan. Lock implementation (no new dependency): the lock file is created atomically with content (temp file + `link`, EEXIST if held); stale = dead pid on this host or older than `lock.staleSeconds` on any host (future timestamps respected); every removal — release and stale takeover — runs under a breaker file and re-checks inode + token before `unlink`, because "read, judge, unlink" without it let two of eight concurrent waiters hold the lock. `proper-lockfile` was considered: it fits the MIT policy but adds three transitive dependencies to a CLI that keeps a minimal dependency set, relies on a periodic mtime heartbeat during the hold, and records no pid/host for the "who holds it" error; the breaker design gives the same atomic takeover with those diagnostics. The git common dir must be on a local filesystem (network filesystems unsupported). All git output VibeOps parses is produced with `LC_ALL=C` / `LANG=C`.


## D-007 · The merge gate learns expected checks from GitHub Actions (3.1.2+)

`statusCheckRollup` is a snapshot of whatever checks exist on the head commit, including ones from other events; right after a PR is opened or pushed its own `pull_request` run (or its jobs) does not exist yet, so a rollup of earlier green checks merged a release PR 5 s after opening (observed on 3.1.0). Options considered: `gh pr checks --watch` exits at once with "no checks reported" or when the existing checks are done, so it cannot know what is still coming; a longer grace window is a guess; branch-protection required checks are not readable on every plan. Decision: on GitHub the gate reads the workflow files at the head commit and evaluates GitHub's documented `pull_request` trigger rules (branches, paths, types; disabled workflows skipped) — each expected workflow must have a `pull_request` run for the head SHA, and every Actions run for that SHA must finish green (latest per workflow + event). Missing / running → wait (bounded); failed, `startup_failure`, `action_required` → refuse; unreadable API → wait, then refuse. The head SHA is re-read before merging and the merge stays pinned with `--match-head-commit`. Checks from other CI systems are still only visible once reported — `requiredChecks` names them. Default poll interval follows `gh pr checks --watch` (10 s); read errors back off exponentially with jitter up to 60 s. New runtime dependency `yaml` (ISC, no dependencies) for workflow parsing.
## D-008 · `task merge` requires the head to contain the current base (3.1.5+)

A consumer PR whose branch had been rebuilt with `git reset --soft` on a stale `origin/develop` was squash-merged after `develop` had moved and silently reverted 27 files of other TASKs; green CI did not catch it because the PR's own tree was consistent. Options considered: diffing the PR against files changed on the base since the TASK's Base Commit (catches only exact reverts, needs heuristics); relying on host branch protection "require branches to be up to date" (not available on every plan). Decision: before merging, `task merge` fetches `<remote>/<base>` and the approved head commit and refuses unless `git merge-base --is-ancestor <remote>/<base> <head>` holds; the error names how many commits the head is behind and how to update. Fetch errors refuse. Consequence: after another PR lands, each open task branch must merge the base (and pass CI) before it can be merged — the same rule as "require up to date" branch protection. `task release` is exempt (merge-commit releases).

## D-010 · This repository uses `develop` + `main` (2026-10-17)

The maintainer organization standardised branches for all its repositories: only `develop` (integration, default branch) and `main` (production) are long-lived, and `main` only receives releases through `vibeops task release`. This repository followed a trunk policy (`main` only, `release/X.Y.Z` PRs). Decision (owner): adopt the standard here too — `.vibeops.json` `integrationBranch: develop`, `productionBranch: main`; CI runs on pushes to both; releases are a release-prep TASK on `develop`, then `task release`, then the `vX.Y.Z` tag on the `main` merge commit (`publish.yml` unchanged: the tag must be on `main`). This also exercises VibeOps' own GitFlow path on every release.

<!--
Add subsequent decisions in the `D-NNN · one-line summary` form.
Keep each entry short — one paragraph of "why" and "consequence" only.
-->
