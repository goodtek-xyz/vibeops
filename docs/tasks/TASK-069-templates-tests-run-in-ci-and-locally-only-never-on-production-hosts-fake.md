# TASK-069: Templates: tests run in CI and locally only, never on production hosts; fake...

## Status

In Progress

## Goal

Templates: tests run in CI and locally only, never on production hosts; fake host-control code in tests

## Background

A test that invoked a real service-stop command on a production host stopped a running service. Consumer projects need a standing rule so their agents keep tests off servers and never let a test reach the real host-control call.

## Scope

- `templates/core/AGENTS.md`: new "Testing and host safety" section (the one authoritative copy): tests in CI and on developer machines only; deploys verified by CI results, artifact hash, restart, health checks; host-control code behind one guard that refuses under a test runner, tests use fakes and test-only names; no test-marker env vars in production/staging.
- Short references to that section: `templates/core/docs/tasks/TASK-000-template.md` and the `task add` scaffold (`src/lib/task-scaffold.ts`) Test Plan comment, `templates/skills-shared/plan-task/SKILL.md`, `templates/skills-shared/implement-task/SKILL.md`.
- `scripts/smoke.mjs`: assert `init` writes the section into `AGENTS.md`.

## Out of Scope

- A runtime guard library shipped by VibeOps; Cursor `.mdc` rule changes (Cursor reads `AGENTS.md`); VibeOps' own test suite.

## Acceptance Criteria

1. `vibeops init` writes `AGENTS.md` with the "Testing and host safety" section containing the three rules.
2. The TASK template, the `task add` scaffold, and both shared skills point to that section without copying it.
3. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass.

## Test Plan

- `pnpm lint`, `pnpm typecheck`, `pnpm test`
- `pnpm smoke` (runs a real `init` into a temp dir and checks `AGENTS.md` for the section)

## Git Context

- Base Branch: `develop`
- Base Commit: `f932a4e4fa3d131c0dbc3c2ff7718dd26ee1a596`
- Task Branch: `task/069-templates-tests-run-in-ci-and-locally-only-never-on-production-hosts-fake`
- Started At: `2026-11-22T09:05:06.704Z`

## Result

- `templates/core/AGENTS.md`: "Testing and host safety" section (three rules).
- References: `templates/core/docs/tasks/TASK-000-template.md` and `src/lib/task-scaffold.ts` Test Plan comment; `plan-task` step 5; `implement-task` step 4.
- `templates/clients/claude/CLAUDE.md`: `@AGENTS.md` import (Claude Code memory import syntax) plus a pointer line; `templates/clients/cursor/.cursor/rules/01-task-source-of-truth.mdc`: pointer line.
- `scripts/smoke.mjs` fails if `init` does not write the section, and runs a second `init --clients claude` that must produce a `CLAUDE.md` with an `@AGENTS.md` line.
- Existing consumers: re-run `vibeops init` (overwrites `AGENTS.md` and client rules; re-apply local edits).

## Test Result

- `pnpm lint` OK, `pnpm typecheck` OK, `pnpm test` 192/192 pass, `pnpm smoke` OK (includes the AGENTS.md section check and the Claude-client `@AGENTS.md` check).
