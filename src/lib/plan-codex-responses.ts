/**
 * ChatGPT Codex backend (subscription OAuth) — POST /backend-api/codex/responses
 * with store:false and stream:true (required for ChatGPT OAuth tokens).
 *
 * @see https://github.com/openclaw/openclaw/issues/67740 (payload constraints)
 */
import { resolveCodexOAuthAccessToken } from "./plan-codex-auth.js";
import { httpErrorMessage } from "./llm-error.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";

const DEFAULT_BASE = "https://chatgpt.com/backend-api/codex";

/** Base URL for Codex ChatGPT routes (`…/responses`, `…/models`). */
export function codexResponsesBaseUrl(): string {
  return (process.env.VIBEOPS_CODEX_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

/** ChatGPT-account Codex (`/backend-api/codex/responses`) does not accept API-only codex model ids such as `gpt-5.1-codex`. */
function codexModel(): string {
  return process.env.VIBEOPS_CODEX_MODEL?.trim() || "gpt-5.4";
}

interface ResponsesInputMessage {
  readonly type: "message";
  readonly role: "user" | "assistant";
  readonly content: ReadonlyArray<
    { readonly type: "input_text"; readonly text: string } | { readonly type: "output_text"; readonly text: string }
  >;
}

function mapChatMessagesToCodexBody(messages: readonly OpenAiChatMessage[]): {
  instructions: string;
  input: ResponsesInputMessage[];
} {
  const systemChunks: string[] = [];
  const input: ResponsesInputMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemChunks.push(m.content);
      continue;
    }
    if (m.role === "user") {
      input.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: m.content }],
      });
      continue;
    }
    if (m.role === "assistant") {
      input.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: m.content }],
      });
    }
  }
  const instructions = systemChunks.join("\n\n").trim();
  if (instructions.length === 0) {
    throw new Error("Codex responses: at least one system message is required.");
  }
  return { instructions, input };
}

function deltaTextFromEvent(obj: Record<string, unknown>): string {
  const d = obj.delta;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const t = (d as { text?: unknown }).text;
    if (typeof t === "string") return t;
  }
  return "";
}

function completedOutputText(obj: Record<string, unknown>): string {
  const resp = obj.response;
  if (!resp || typeof resp !== "object") return "";
  const output = (resp as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  let text = "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const o = c as { type?: unknown; text?: unknown };
      if (o.type === "output_text" && typeof o.text === "string") text += o.text;
    }
  }
  return text;
}

/** Accumulates one SSE stream: non-empty deltas win; the completed/done output is used only when no delta arrived. */
class CodexSseText {
  private deltas = "";
  private sawDelta = false;
  private completed = "";

  /** Handles every `data:` line of one SSE block (or the unterminated tail). */
  handleBlock(block: string): void {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue; /* ignore malformed SSE JSON */
      }
      const typ = String(j.type ?? "");
      if (typ === "response.output_text.delta" || typ.endsWith(".output_text.delta")) {
        const t = deltaTextFromEvent(j);
        if (t.length > 0) {
          this.sawDelta = true;
          this.deltas += t;
        }
      } else if (typ === "response.completed" || typ === "response.done") {
        this.completed += completedOutputText(j);
      }
    }
  }

  text(): string {
    return (this.sawDelta ? this.deltas : this.completed).trim();
  }
}

/**
 * Parses SSE from Codex responses stream. The stream sends the text twice — as
 * `response.output_text.delta` events and again in `response.completed` — so the
 * deltas are used when present and the completed output only as a fallback.
 */
export async function readSseTextBody(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    const t = await response.text();
    return t;
  }
  const reader = body.getReader();
  const dec = new TextDecoder();
  const acc = new CodexSseText();
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = pending.indexOf("\n\n")) >= 0) {
      acc.handleBlock(pending.slice(0, sep));
      pending = pending.slice(sep + 2);
    }
  }
  pending += dec.decode();
  if (pending.trim().length > 0) acc.handleBlock(pending);
  return acc.text();
}

/** Error for a non-OK Codex response; a model the account cannot use gets a `VIBEOPS_CODEX_MODEL` hint. */
export function codexHttpError(status: number, errText: string, model: string): Error {
  if (/model_not_found|model_not_in_accessible_catalog/i.test(errText)) {
    return new Error(
      `Codex responses HTTP ${status}: model "${model}" is not available to this account — set VIBEOPS_CODEX_MODEL to a model your account can use.`,
    );
  }
  return new Error(httpErrorMessage("Codex responses", status, errText));
}

async function postCodexResponses(body: Record<string, unknown>): Promise<Response> {
  const { accessToken } = await resolveCodexOAuthAccessToken();
  const url = `${codexResponsesBaseUrl()}/responses`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "OpenAI-Beta": "responses=v1",
    },
    body: JSON.stringify(body),
  });
}

/**
 * One planning model turn via Codex (ChatGPT OAuth). Returns raw assistant text
 * (expected to be a single JSON object per VibeOps protocol).
 */
export async function codexOAuthPlanCompletion(
  messages: readonly OpenAiChatMessage[],
  options?: { readonly model?: string },
): Promise<string> {
  const { instructions, input } = mapChatMessagesToCodexBody(messages);
  const model = options?.model?.trim() || codexModel();

  const withJsonFormat = (): Record<string, unknown> => ({
    model,
    instructions,
    input,
    store: false,
    stream: true,
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const minimal = (): Record<string, unknown> => ({
    model,
    instructions,
    input,
    store: false,
    stream: true,
  });

  let res = await postCodexResponses(withJsonFormat());
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 400 && /unknown|unsupported|text|format|parameter/i.test(errText)) {
      res = await postCodexResponses(minimal());
      if (!res.ok) {
        const err2 = await res.text().catch(() => "");
        throw codexHttpError(res.status, err2, model);
      }
    } else {
      throw codexHttpError(res.status, errText, model);
    }
  }

  const text = await readSseTextBody(res);
  if (text.length === 0) {
    throw new Error("Codex responses stream produced empty text.");
  }
  return text;
}

/**
 * One assistant turn as free markdown (no JSON schema) — used for planner apply.
 */
export async function codexOAuthTextCompletion(
  messages: readonly OpenAiChatMessage[],
  options?: { readonly model?: string },
): Promise<string> {
  const { instructions, input } = mapChatMessagesToCodexBody(messages);
  const model = options?.model?.trim() || codexModel();
  const res = await postCodexResponses({
    model,
    instructions,
    input,
    store: false,
    stream: true,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw codexHttpError(res.status, errText, model);
  }
  const text = await readSseTextBody(res);
  if (text.length === 0) {
    throw new Error("Codex responses stream produced empty text.");
  }
  return text;
}
