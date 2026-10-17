# vibe-crew crew — contract changelog

Content SemVer for role `PERSONA.md` files (`contractVersion`). Distinct from format `schemaVersion` 0.1.

## Language — 2026-09-20

- One `PERSONA.md`. `native: en`. `speaks: ko, en`. Catalog no longer reads `PERSONA.ko.md`. The 1.2.0 line below is the old rule, kept as history.

## 1.9.0 — 2026-09-28

- **Orchestrator:** soften first-words from refusal-first to **identity + handoff**. Lead with Role, path, seat identity, and worker handoff. Hard boundary (no implement/review/deploy) stays in Who/Refusals/Laws. Contract **1.9.0**.

## 1.8.0 — 2026-09-20

- Display name is **Vibe Crew** (UI). Folder id stays `vibe-crew`.
- **Orchestrator:** persona engineering — analyze the ask, assign role personas, verify with evidence, and loop the graph until the goal is met. Contract **1.8.0**.

## 1.7.0 — 2026-09-19

- **Orchestrator:** name the done condition, assign one role a mission and the report to bring back, read the report, then loop until the mission is done. Still one worker at a time. This seat does not implement, review, or deploy.

## 1.6.0 — 2026-09-19

- **Orchestrator:** an edit turn reads this file (not a chat summary or a rule sentence). First words name Role, this path, and the non-goal. Exactly one existing worker PERSONA.md is attached, and only that worker edits. This seat does not implement, review, or deploy. Questions that do not change the repo may skip; editing on that turn starts over. No check scripts or hooks in the contract. No new roles.

## 1.5.0 — 2026-09-17

- **SCM:** ship tool is **project-configured** (vibeops / gh / glab / documented path). Portable packs no longer hardcode VibeOps-only. This product repo still uses VibeOps via D-046 governance.

## 1.4.0 — 2026-09-17

Best-in-class PERSONA.md v0.2 rewrite for all vibe-crew seats (orchestrator, planner, developer, dba, reviewer, scm, deployer, ui-designer, ux) + Korean twins + dogfood `.personas/vibe-crew/`.

- **Orchestrator:** explicit full-path route planner → developer → dba → reviewer → scm → deployer → ui → ux.
- **SCM:** (superseded by 1.5.0) had VibeOps-only wording; never push develop/main directly.
- **Deployer:** release health/rollback only — not git ceremony.
- **Success / Refusals / Laws:** expanded to observable checks and seat boundaries across the crew.
- **Contract:** each role `PERSONA.md` → `1.4.0` (2026-09-17).

## 1.3.0 — 2026-09-16

- **SCM / Git steward** seat added (`scm`): branch, commit, push, PR, merge, branch cleanup via VibeOps path.
- Catalog crew cards default to pipeline **role order** (orchestrator first).

## 1.2.0 — 2026-09-15

- **DBA** seat added (`dba`): schema, migrations, data paths.
- **Natural Korean** laws on orchestrator / developer / ui-designer / ux (and DBA): Korean product copy must not be translationese.
- **Apply pack hard entry:** AGENTS.md / CLAUDE.md / Cursor rule force orchestrator (lead) before any other seat for Codex, Claude Code, and Cursor.
- Catalog `/ko` prefers `PERSONA.ko.md` when present.

## 1.1.1 — 2026-09-14

Role: orchestrator.

- **Laws:** Forced project-manager seat on this product repo; VibeOps-only branch/PR/merge/release/CI·CD (D-046).

## 1.1.0 — 2026-09-13

Roles: planner, developer, reviewer, orchestrator, deployer.

- **Priorities #1:** Accuracy over cost and speed — do not trade a correct path for a cheaper or faster one.
- **Refusal:** Do not shrink the success check, skip failure paths, or skip evidence to save cost or time.
- **Laws (developer, reviewer):** Accuracy is non-negotiable: do not trade a correct path for a cheaper or faster one.
- **Versioning:** Each of the five roles carries `## Version` (`contract: 1.1.0`) and `## Changelog`.

Out of scope this release: ui-designer, ux.
