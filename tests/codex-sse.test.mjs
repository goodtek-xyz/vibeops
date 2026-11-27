import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import { test } from "node:test";
import { TextEncoder } from "node:util";

import { llmFailureCause, llmUnavailableMessage } from "../dist/lib/llm-complete.js";
import { httpErrorDetail, httpErrorMessage, redactSecrets } from "../dist/lib/llm-error.js";
import { codexHttpError, readSseTextBody } from "../dist/lib/plan-codex-responses.js";
import { extractJsonObject } from "../dist/lib/plan-llm-openai.js";

const delta = (text) => `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}`;
const completed = (text) =>
  `data: ${JSON.stringify({
    type: "response.completed",
    response: { output: [{ type: "message", content: [{ type: "output_text", text }] }] },
  })}`;

/** Response whose body streams each string as its own chunk. */
function sse(chunks) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new globalThis.Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

test("deltas plus response.completed yield the text once", async () => {
  const text = await readSseTextBody(
    sse([`${delta("O")}\n\n`, `${delta("K")}\n\n`, `${completed("OK")}\n\n`, "data: [DONE]\n\n"]),
  );
  assert.equal(text, "OK");
});

test("completed only yields its output_text", async () => {
  assert.equal(await readSseTextBody(sse([`${completed("OK")}\n\n`])), "OK");
});

test("completed only, left in the unterminated tail, yields its output_text", async () => {
  assert.equal(await readSseTextBody(sse([completed("OK")])), "OK");
});

test("deltas only yield the joined text", async () => {
  assert.equal(await readSseTextBody(sse([`${delta("a")}\n\n${delta("b")}`])), "ab");
});

test("JSON scaffold reply streamed as deltas plus completed parses", async () => {
  const json = '{"ok":true}';
  const text = await readSseTextBody(
    sse([`${delta('{"ok":')}\n\n`, `${delta("true}")}\n\n`, `${completed(json)}\n\n`]),
  );
  assert.deepEqual(JSON.parse(extractJsonObject(text)), { ok: true });
});

test("LLM unavailable message carries a one-line, masked cause", () => {
  const cause = llmFailureCause(new Error("boom Bearer abc.def sk-secret123\nsecond line"));
  assert.equal(cause, "boom Bearer *** sk-***");
  assert.equal(
    llmUnavailableMessage(cause, "using minimal TASK template."),
    "LLM unavailable (boom Bearer *** sk-***) — using minimal TASK template.",
  );
  assert.equal(llmUnavailableMessage(undefined, "x"), "LLM unavailable — x");
});

test("model_not_found hints VIBEOPS_CODEX_MODEL without echoing the body", () => {
  for (const code of ["model_not_found", "model_not_in_accessible_catalog"]) {
    const e = codexHttpError(404, `{"error":{"code":"${code}","detail":"raw"}}`, "gpt-x");
    assert.match(e.message, /VIBEOPS_CODEX_MODEL/);
    assert.match(e.message, /"gpt-x"/);
    assert.doesNotMatch(e.message, /raw/);
  }
});

test("empty delta plus completed yields the completed text", async () => {
  const text = await readSseTextBody(sse([`${delta("")}\n\n`, `${completed("OK")}\n\n`]));
  assert.equal(text, "OK");
});

test("non-model Codex HTTP error keeps status and extracted code/message, not the body", () => {
  const body = JSON.stringify({
    error: { code: "rate_limited", message: "Slow down", extra: "raw-body-marker" },
  });
  assert.equal(codexHttpError(429, body, "m").message, "Codex responses HTTP 429: rate_limited: Slow down");
  assert.equal(codexHttpError(500, "<html>raw-body-marker</html>", "m").message, "Codex responses HTTP 500");
  const long = JSON.stringify({ error: { message: "x".repeat(300) } });
  assert.ok(codexHttpError(400, long, "m").message.length < 160);
});

test("auth / OpenAI HTTP errors embed only the extracted field", () => {
  const body = JSON.stringify({
    error: "invalid_grant",
    error_description: "Refresh token expired",
    refresh_token: "should-not-appear",
  });
  assert.equal(
    httpErrorMessage("Codex OAuth refresh failed:", 401, body),
    "Codex OAuth refresh failed: HTTP 401: invalid_grant: Refresh token expired",
  );
  assert.equal(httpErrorDetail("not json access_token=abc"), "");
  assert.equal(httpErrorMessage("OpenAI", 502, "Bad gateway"), "OpenAI HTTP 502");
});

test("redactSecrets masks JWTs and token key/value pairs", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
  assert.equal(redactSecrets(`token ${jwt} end`), "token *** end");
  assert.equal(redactSecrets('{"access_token":"abc123","x":1}'), '{"access_token":"***","x":1}');
  assert.equal(redactSecrets('{"refresh_token": "r1"}'), '{"refresh_token": "***"}');
  assert.equal(redactSecrets("id_token=zzz&a=1"), "id_token=***&a=1");
  assert.equal(redactSecrets("refresh_token: qqq next"), "refresh_token: *** next");
  assert.equal(redactSecrets("refresh_token rt_x"), "refresh_token ***");
  assert.equal(redactSecrets("refresh token: x"), "refresh token: ***");
  assert.equal(redactSecrets("api_key=x"), "api_key=***");
  assert.equal(redactSecrets("apiKey: k1"), "apiKey: ***");
  assert.equal(redactSecrets('"accessToken":"x"'), '"accessToken":"***"');
  assert.equal(redactSecrets('{"idToken": "t", "client_secret":"s"}'), '{"idToken": "***", "client_secret":"***"}');
  assert.equal(redactSecrets("PASSWORD=hunter2&x=1"), "PASSWORD=***&x=1");
  assert.equal(redactSecrets("client-secret cs1"), "client-secret ***");
  assert.equal(redactSecrets("Refresh token expired"), "Refresh token expired");
  assert.equal(redactSecrets("Authorization: Basic abc"), "Authorization: ***");
  assert.equal(redactSecrets("authorization: Bearer t0k, next"), "authorization: ***, next");
  assert.equal(llmFailureCause(new Error(`failed access_token=abc ${jwt}`)), "failed access_token=*** ***");
});
