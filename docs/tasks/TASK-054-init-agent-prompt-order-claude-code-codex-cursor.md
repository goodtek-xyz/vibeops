# TASK-054: init agent prompt order: Claude Code, Codex, Cursor

## Status

Shipped

## Goal

The `vibeops init` agent prompt ("Which coding agents will you use?") lists **Claude Code, Codex CLI, Cursor** in that order (owner request; it listed Cursor, Claude Code, Codex).

## Scope

- `src/lib/init-clients.ts`: `VIBEOPS_CLIENT_IDS` → `claude, codex, cursor`; prompt choices built by `initClientChoices()` (testable); validation message in the same order
- Same order where agents are enumerated for selection: `init` description and `--clients` help (`src/cli.ts`), `--clients` error messages (`src/commands/init.ts`), README (tagline, `--clients` example, pack table)
- Test; CHANGELOG, `05-current-state.md`, daily log

## Out of Scope

- The pre-checked default (stays `cursor`)
- The `llm` provider order
- `printNextSteps` priority and the `--dry-run` default (`["cursor"]`)

## Acceptance Criteria

1. The prompt choices are Claude Code, Codex CLI, Cursor, in that order; Cursor is the only pre-checked one
2. Help text, `--clients` error messages, the validation message and README list the agents in the same order
3. A test pins the order and fails on the old order
4. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- New `tests/init-clients.test.mjs` (choice order + labels, pre-checked default, `--clients` keeps typed order) against the old order and this build
- `pnpm lint`, `pnpm smoke` (includes typecheck, build, `node --test tests/*.test.mjs`); CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `85c17094d49c6e78ac89d50cada04223a9f2b346`
- Task Branch: `task/054-init-agent-prompt-order-claude-code-codex-cursor`
- Started At: `2026-10-17T18:44:38.787Z`

## Result

- update: `src/lib/init-clients.ts` (`VIBEOPS_CLIENT_IDS` order, `initClientChoices()`, validation message), `src/cli.ts` (init description, `--clients` help), `src/commands/init.ts` (`--clients` error messages)
- `VIBEOPS_CLIENT_IDS` is read only by the prompt and `isVibeopsClientId` (order-free). The checkbox returns the selection in prompt order, so an interactive init now passes clients as e.g. `["claude", "cursor"]`: core and client-pack files stay path-sorted (`loadInstallManifest`), but shared skills are installed per client in that order (`installSharedSkills`), so their install-report lines now list `.claude/skills` before `.cursor/skills`; file contents and locations are unchanged. `.vibeops.json` `clients` is written in the same order; nothing reads that order (status prints it as stored). `--clients` keeps the order typed.
- Default unchanged: Cursor is still the only pre-checked agent (owner asked only for order).
- tests: new `tests/init-clients.test.mjs` (3 tests)
- docs: README, CHANGELOG, `05-current-state.md`, `docs/logs/2026-10-18.md`

## Test Result

- Before (old order `cursor, claude, codex` with this test): order test fails (`actual: ['cursor','claude','codex']`, expected `['claude','codex','cursor']`); pristine pre-fix source: the file fails (`initClientChoices` not exported)
- After: 3/3 pass; `pnpm lint` OK, `pnpm smoke` OK (`node --test` part: 161 pass, 0 fail)
- CI: on the PR
