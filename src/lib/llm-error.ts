/**
 * Secret-free error text for LLM / auth HTTP failures. Response bodies are never
 * embedded in error messages; only a short, redacted field extracted from a JSON body.
 */

const MAX_DETAIL = 120;

/** Secret key names: `access_token`, `refreshToken`, `id-token`, `api key`, `client_secret`, `password` … */
const secretKey = (sep: string): string =>
  String.raw`(?:(?:access|refresh|id)${sep}token|api${sep}key|client${sep}secret|password)`;
/** Any separator (`_`, `-`, space, none) — used with `=` / `:` / JSON. */
const SECRET_KEY = secretKey(String.raw`[_\- ]?`);
/** No space inside the key — used for the bare `key value` form, so prose like "refresh token expired" stays. */
const SECRET_KEY_TIGHT = secretKey(String.raw`[_\-]?`);

/**
 * Masks Bearer tokens, `sk-` keys, JWTs, `Authorization: <scheme> <value>` and the values of
 * secret keys (JSON `"key":"v"`, `key=v`, `key: v`, and `key v` for keys written without a space; case-insensitive).
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(Authorization\s*:\s*)\S+(?:\s+[^\s,;]+)?/gi, "$1***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "***")
    .replace(new RegExp(String.raw`("${SECRET_KEY}"\s*:\s*)"[^"]*"`, "gi"), '$1"***"')
    .replace(new RegExp(String.raw`\b(${SECRET_KEY}\s*[=:]\s*)(?!\*\*\*)[^\s&,;"']+`, "gi"), "$1***")
    .replace(new RegExp(String.raw`\b(${SECRET_KEY_TIGHT} )(?!\*\*\*)[^\s&,;"']+`, "gi"), "$1***");
}

function shortField(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Short detail from an HTTP error body: `error.code` / `error.type` / `error` (string)
 * plus `error.message` / `error_description` / `message` / `detail`. Non-JSON bodies
 * yield "" so nothing from them reaches the message. Result is redacted and cut to ~120 chars.
 */
export function httpErrorDetail(body: string): string {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    return "";
  }
  if (!j || typeof j !== "object") return "";
  const o = j as Record<string, unknown>;
  let code = "";
  let message = "";
  if (o.error && typeof o.error === "object") {
    const e = o.error as Record<string, unknown>;
    code = shortField(e.code) || shortField(e.type);
    message = shortField(e.message);
  } else {
    code = shortField(o.error) || shortField(o.code);
  }
  message = message || shortField(o.error_description) || shortField(o.message) || shortField(o.detail);
  const joined = [code, message].filter((s) => s.length > 0).join(": ").replace(/\s+/g, " ");
  const redacted = redactSecrets(joined);
  return redacted.length > MAX_DETAIL ? `${redacted.slice(0, MAX_DETAIL)}…` : redacted;
}

/** `<prefix> HTTP <status>` plus the extracted detail, never the raw body. */
export function httpErrorMessage(prefix: string, status: number, body: string): string {
  const detail = httpErrorDetail(body);
  return detail ? `${prefix} HTTP ${status}: ${detail}` : `${prefix} HTTP ${status}`;
}
