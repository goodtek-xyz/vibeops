# TASK-041: Persona engineering: vibe-crew crew (public)

## Status

Shipped

## Goal

Install the maintainers' persona crew (vibe-crew) for agents working in this repository, in the variant for public repositories: it references only the public catalog `goodtek-xyz/getPersona.md` and adds no internal names.

## Scope

- `.personas/vibe-crew/` (9 role contracts, README, CHANGELOG, `AGENTS.section.md`, `SOURCE`) from the public catalog at a pinned commit, written by the maintainers' installer in public mode
- `AGENTS.md`: the crew section between `<!-- getpersona:vibe-crew -->` markers
- Daily log; handoff section (owner decision closed)

## Out of Scope

- Editing the catalog files (verbatim, CC-BY-4.0)
- Repository settings (applied by the maintainers' platform tooling)

## Acceptance Criteria

1. Installer reports `9 roles, public mode`
2. `SOURCE` has 4 lines: catalog URL, path, commit, license — no installer line
3. `AGENTS.md` crew section present once, including the platform-session line
4. No private repository names / internal hosts / secrets: grep and gitleaks clean
5. `pnpm lint`, `pnpm smoke` pass; CI green

## Test Plan

- `grep -rIn -E 'goodtek-architecture|D-0[0-9]{2}|TASK-[0-9]' .personas AGENTS.md` and a broader host / path scan; gitleaks on `.personas` and `AGENTS.md`
- `pnpm lint`, `pnpm smoke`; CI on the PR

## Git Context

- Base Branch: `develop`
- Base Commit: `ac31e4e86cc58a01e81e540648723306d2af88b5`
- Task Branch: `task/041-persona-engineering-vibe-crew-crew-public`
- Started At: `2026-10-17T08:41:06.510Z`

## Result

- new: `.personas/vibe-crew/` (catalog `goodtek-xyz/getPersona.md`, `roles/vibe-crew` at `4ecec1f7094a4fce47b1c24ca6a914f3dcf49cef`, CC-BY-4.0)
- update: `AGENTS.md` — vibe-crew section (public template)
- docs: `05-current-state.md` handoff (persona decision closed), `docs/logs/2026-10-17.md`

## Test Result

- Installer output: `vibe-crew 4ecec1f7094a installed … (9 roles, public mode)`
- `SOURCE`: 4 lines (catalog, path, commit, license)
- Internal-name grep: no private repository name. Hits: `D-046` ×3 in `.personas/vibe-crew/CHANGELOG.md` / `orchestrator/PERSONA.md` — the public catalog's own decision number, files identical to the catalog at the pinned commit (`diff` empty; catalog repository is public); `AGENTS.md:109` `TASK-001` — this repository's own completion-report example. Broader scan (hosts, private IPs, personal paths): 0
- gitleaks (`.personas`, `AGENTS.md`): no leaks
- `pnpm lint` OK, `pnpm smoke` OK (`pnpm test` part: 138 pass, 0 fail)
- CI: on the PR
