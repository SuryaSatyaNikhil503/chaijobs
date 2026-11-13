import type { ProviderEntry } from "../config/schema.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export type ChatCall = (p: ProviderEntry, apiKey: string, messages: ChatMessage[]) => Promise<ChatResult>;

export interface ChatResult {
  status: number;
  text: string;
  /** From the provider's Retry-After header on 429, in milliseconds. */
  retryAfterMs?: number;
}

async function post(p: ProviderEntry, apiKey: string, messages: ChatMessage[], jsonMode: boolean) {
  return fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/**
 * OpenAI-compatible POST {baseUrl}/chat/completions; returns the first choice's content.
 * Not every provider accepts JSON mode, so a 400 is retried once without `response_format`
 * (the prompt still asks for JSON and the reply is validated either way).
 */
export const openAiCompatibleCall: ChatCall = async (p, apiKey, messages) => {
  let res = await post(p, apiKey, messages, true);
  if (res.status === 400) res = await post(p, apiKey, messages, false);
  if (!res.ok) {
    const retryAfterMs = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
    return retryAfterMs === undefined
      ? { status: res.status, text: "" }
      : { status: res.status, text: "", retryAfterMs };
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { status: res.status, text: body.choices?.[0]?.message?.content ?? "" };
};
