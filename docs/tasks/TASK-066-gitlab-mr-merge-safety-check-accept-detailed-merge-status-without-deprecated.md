# TASK-066: GitLab MR merge safety check: accept detailed_merge_status without deprecated...

## Status

Shipped

## Goal

GitLab MR merge safety check: accept detailed_merge_status without deprecated merge_status

## Scope

- `src/lib/pr-create.ts` strict GitLab MR shape check (`readMergeRequestDetails`, used by `task merge`): require at least one of `merge_status` / `detailed_merge_status` instead of both. GitLab 15.6 deprecated `merge_status` for `detailed_merge_status` (https://docs.gitlab.com/api/merge_requests/#merge-status); some instances return only the detailed field.
- Regression tests in `tests/merge-gate.test.mjs`.

## Out of Scope

- Readiness rules (`src/lib/merge-request-readiness.ts` already prefers `detailed_merge_status`), other shape checks, GitHub path.

## Acceptance Criteria

1. A GitLab MR view with only `detailed_merge_status` passes the strict check and the readiness gate still judges it (mergeable merges; `not_approved` refuses).
2. A view with only `merge_status` passes the strict check.
3. A view with neither field is refused with one problem: "`merge_status` and `detailed_merge_status` are both missing"; no merge call.
4. All other strict checks (`state`, `head_pipeline`, `head_pipeline.status`, `sha`) are unchanged.
5. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`.

## Git Context

- Base Branch: `develop`
- Base Commit: `72442f3437fbb88531d73da678cba7e7e69f7396`
- Task Branch: `task/066-gitlab-mr-merge-safety-check-accept-detailed-merge-status-without-deprecated`
- Started At: `2026-11-18T04:05:30.738Z`

## Result

- `readMergeRequestDetails` (strict, GitLab) no longer lists `merge_status` and `detailed_merge_status` as separately required fields; it adds one problem only when both keys are absent (same "present" semantics: key missing or `undefined`; `null` counts as present). Comment cites the GitLab doc.
- 4 regression tests: only detailed → merges; only detailed `not_approved` → refused by readiness; only `merge_status` → merges; neither → refused, no merge call.
- CHANGELOG `Unreleased` → Fixed; `05-current-state.md`; `docs/logs/2026-11-18.md`.

## Test Result

- `pnpm lint`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: 192 tests, 192 pass, 0 fail.
- `pnpm smoke`: OK.
