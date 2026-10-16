# TASK-032: New cycle ships committed work and keeps -m

## Status

Shipped

## Goal

Two `task ship --new-cycle` gaps reported from a consumer repo (3.1.6):

1. With the follow-up work already committed on the task branch, the new cycle said "Nothing to do — merged with no new changes": it only looked for uncommitted files.
2. `-m` was ignored in new-cycle mode (the commit always used the TASK title), so the intended message and trailers (`Co-Authored-By`) were lost.

## Scope

- `src/lib/task-new-cycle.ts`: uncommitted changes → commit with the same message resolution as a normal ship (`-m`, LLM, prompt, title; body and trailers kept). No uncommitted changes → fetch `<remote>/<base>` and compare content: after the integration merge, `git diff --name-only <base> HEAD` (with `--no-integrate`: `<base>...HEAD`); files → open the cycle for them, none → "Nothing to do". Content, not commit count: earlier cycles were squash-merged, so their commits are never ancestors of the base. Compare failure → exit 1
- `-m` with nothing to commit → warning (existing commits keep their messages; no empty commits)
- `task ship` passes `message` / `nonInteractive` to the new cycle
- Tests through the built CLI; CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- Rewriting messages of commits already made by hand
- `--allow-open-mr` behaviour beyond the shared commit message

## Acceptance Criteria

1. First cycle squash-merged, follow-up committed by hand → new cycle pushes and opens the PR (no "Nothing to do")
2. Uncommitted follow-up with `-m "fix: …\n\nCo-Authored-By: …"` → commit subject `fix(task-NNN): …`, trailer kept
3. Nothing new after a squash merge → still "Nothing to do"
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass; CI green

## Test Plan

- 3 "new cycle" tests in `tests/worktree-lifecycle.test.mjs` (squash merge on the remote, fake gh reporting the first PR merged) against the 3.1.6 source (expect 2 failures) and this build
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `main`
- Base Commit: `7ef5e45b2d370ba29688d1c096ac9abade587614`
- Task Branch: `task/032-new-cycle-ships-committed-work-and-keeps-m`
- Started At: `2026-10-16T23:26:58.454Z`

## Result

- update: `src/lib/task-new-cycle.ts` — `unmergedFiles` (fetch base, content diff after integration / merge-base diff with `--no-integrate`); committed-but-unmerged work opens the cycle; uncommitted work committed via `resolveShipCommitMessage` (`-m` kept with body / trailers); `-m` with nothing to commit warns; compare failure exits 1
- update: `src/commands/task-ship.ts` — passes `message`, `nonInteractive` to `runPostMergeNewCycle`
- tests: 3 new-cycle tests (+ `squashOnRemote`, `ghMergedEnv` helpers)
- docs: CHANGELOG Unreleased, `05-current-state.md`, `docs/logs/2026-10-17.md`

## Test Result

- Before (3.1.6 source): "ships committed work" and "-m keeps trailer" fail; "nothing new" passes (control)
- After: all 3 pass; `pnpm lint` OK, `pnpm typecheck` OK, `pnpm smoke` OK (`pnpm test` part: 134 pass, 0 fail)
- CI: on the PR
