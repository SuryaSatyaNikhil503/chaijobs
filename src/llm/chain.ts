import type { ProviderEntry } from "../config/schema.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export type ChatCall = (
  p: ProviderEntry,
  apiKey: string,
  messages: ChatMessage[],
) => Promise<{ status: number; text: string }>;

/** OpenAI-compatible POST {baseUrl}/chat/completions; returns the first choice's content. */
export const openAiCompatibleCall: ChatCall = async (p, apiKey, messages) => {
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return { status: res.status, text: "" };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { status: res.status, text: body.choices?.[0]?.message?.content ?? "" };
};
