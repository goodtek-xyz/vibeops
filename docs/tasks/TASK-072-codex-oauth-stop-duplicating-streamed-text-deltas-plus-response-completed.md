# TASK-072: Codex OAuth: stop duplicating streamed text (deltas plus response.completed);...

## Status

Shipped

## Goal

Codex OAuth: stop duplicating streamed text (deltas plus response.completed); show the real LLM error

## Scope

- `src/lib/plan-codex-responses.ts`: one per-event SSE handler for the main loop and the unterminated tail; use `response.output_text.delta` text when any non-empty delta arrived, else the `response.completed` / `response.done` `output_text`.
- Codex HTTP error with `model_not_found` / `model_not_in_accessible_catalog` → message hints `VIBEOPS_CODEX_MODEL` (no model cache file is read).
- "LLM unavailable" warnings (`task add`, `task ship`, `ship --new-cycle`) include a one-line, token-masked cause; PR text and commit message generation warn with the cause when a provider is connected but fails; no provider → silent fallback. Fallback behaviour unchanged.

## Out of Scope

- Other providers' parsing, model discovery, retries.

## Acceptance Criteria

1. Deltas + completed → text once; completed only (also in the tail) → text; deltas only → text.
2. A JSON reply streamed as deltas + completed parses via `extractJsonObject`.
3. Unavailable warnings show the cause; `model_not_found` hints `VIBEOPS_CODEX_MODEL`.
4. Codex responses, Codex OAuth refresh and OpenAI HTTP errors never embed the response body: status plus an extracted `error` / `error.code` / `error.message` / `error_description` (≤ ~120 chars, redacted), nothing for non-JSON bodies.
5. `llmFailureCause` masks Bearer, `sk-`, JWTs, `Authorization: <scheme> <value>` and values of `access/refresh/id token`, `api key`, `client secret`, `password` keys in any case / separator (JSON, `key=value`, `key: value`; bare `key value` when the key has no space, so prose such as "Refresh token expired" is kept).
6. Empty delta + completed → completed text.
7. Result and Test Result are filled before `vibeops task ship`.

## Test Plan

<!-- Tests run in CI and locally only, never on production/staging hosts; host-control code is faked (AGENTS.md "Testing and host safety"). -->

- `tests/codex-sse.test.mjs` (SSE cases, JSON parse, cause message, model hint)
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`

## Git Context

- Base Branch: `develop`
- Base Commit: `72d2bcf7cb491da3a21dfbd0d29a810dc73ad7a4`
- Task Branch: `task/072-codex-oauth-stop-duplicating-streamed-text-deltas-plus-response-completed`
- Started At: `2026-11-27T04:20:15.247Z`

## Result

- `plan-codex-responses.ts`: `CodexSseText.handleBlock` used for every block and the tail; `completedOutputText` used only when no delta was seen; `codexHttpError` adds the `VIBEOPS_CODEX_MODEL` hint.
- `llm-error.ts` (new): `redactSecrets`, `httpErrorDetail`, `httpErrorMessage`; used by `codexHttpError`, `plan-codex-auth.ts` refresh failure and `plan-llm-openai.ts` (bodies no longer embedded).
- `llm-complete.ts`: `llmFailureCause` (one line, `redactSecrets`, 200 chars) and `llmUnavailableMessage`.
- `sawDelta` set only for a non-empty delta.
- `llmScaffoldTask`, `llmCompleteTaskShip`, `llmCompleteTaskReship` take `onError`; `task add`, `task ship`, `task-new-cycle` print the cause; `task-pr-llm.ts`, `task-commit-msg.ts` warn with the cause only when a provider is connected (`anyLlmProviderAvailable` gate; no provider → silent fallback as before, test in `tests/task-pr-llm.test.mjs`).
- CHANGELOG Unreleased (Fixed), `05-current-state.md`, `docs/logs/2026-11-27.md`.

## Test Result

- `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test` exit 0 (204 pass, 0 fail; 11 new in `tests/codex-sse.test.mjs`, 1 new in `tests/task-pr-llm.test.mjs`); `pnpm smoke` exit 0.
