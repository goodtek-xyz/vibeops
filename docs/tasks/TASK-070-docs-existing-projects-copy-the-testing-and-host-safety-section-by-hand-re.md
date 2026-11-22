# TASK-070: Docs: existing projects copy the Testing and host safety section by hand; re-...

## Status

In Progress

## Goal

Docs: existing projects copy the Testing and host safety section by hand; re-running init overwrites AGENTS.md

## Scope

- `CHANGELOG.md` Unreleased: replace the "re-run `vibeops init`" advice with a by-hand copy of the section (plus `@AGENTS.md` in `CLAUDE.md` for Claude Code) and a warning that re-init overwrites files and drops project-specific sections.
- `docs/tasks/TASK-069-*.md` Result: append a correction note (history kept).
- Search README/docs for other re-init advice for this rule.

## Out of Scope

- Code and template changes.

## Acceptance Criteria

1. No doc recommends re-running `vibeops init` to get the "Testing and host safety" rule (correction note excepted).
2. CHANGELOG tells existing projects to copy the section by hand, add `@AGENTS.md` for Claude Code, and warns re-init drops project-specific sections.
3. No code or template changes; `pnpm lint` and `pnpm smoke` pass.

## Test Plan

- `grep -rn "re-run" README.md docs CHANGELOG.md`
- `pnpm lint`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `2808b251296c3a519b654cf4782b7eaa333b8b53`
- Task Branch: `task/070-docs-existing-projects-copy-the-testing-and-host-safety-section-by-hand-re`
- Started At: `2026-11-22T09:31:57.880Z`

## Result

- `CHANGELOG.md` Unreleased TASK-069 entry reworded: by-hand copy from `templates/core/AGENTS.md`, `@AGENTS.md` in `CLAUDE.md`, re-init warning.
- `docs/tasks/TASK-069-*.md` Result: correction note appended.
- README and other docs: no other re-init advice for this rule found.

## Test Result

- Re-init advice search: only the TASK-069 correction note and this TASK mention it.
- `pnpm lint` OK, `pnpm smoke` OK.
