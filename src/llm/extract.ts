import { z } from "zod";
import type { ProviderEntry } from "../config/schema.js";
import { minYearsFromText } from "../filter/cheap.js";
import { type ChatCall, type ChatMessage, openAiCompatibleCall } from "./chain.js";

export const JdFacts = z.object({
  minYears: z.number().int().min(0).max(30).nullable(),
  maxYears: z.number().int().min(0).max(40).nullable(),
  mustHave: z.array(z.string()).max(25),
  niceToHave: z.array(z.string()).max(25),
  roleType: z.enum([
    "backend",
    "fullstack-backend-heavy",
    "fullstack",
    "frontend",
    "mobile",
    "devops",
    "qa",
    "data",
    "other",
  ]),
  applyEmail: z.string().email().nullable(),
});
export type JdFacts = z.infer<typeof JdFacts>;

export type ExtractResult =
  | { ok: true; facts: JdFacts; provider: string }
  | { ok: false; reason: "all-quota" | "invalid" | "no-providers" };

const SYSTEM_PROMPT = `You extract facts from a job description. Reply with ONE JSON object and nothing else:
{"minYears": number|null, "maxYears": number|null, "mustHave": string[], "niceToHave": string[],
 "roleType": "backend"|"fullstack-backend-heavy"|"fullstack"|"frontend"|"mobile"|"devops"|"qa"|"data"|"other",
 "applyEmail": string|null}
Rules: extract only what the text states; use null when absent; never guess.
minYears/maxYears: the required years of experience ("3-5 years" -> 3 and 5; "5+ years" -> 5 and null).
mustHave: skills/technologies explicitly required ("must", "required", "should have", requirement lists).
niceToHave: skills marked "good to have", "plus", "preferred", "bonus".
Use short canonical names (e.g. "Java", "Spring Boot", "PostgreSQL", "AWS").
applyEmail: an email address the JD asks candidates to send applications to, else null.`;

export function parseFacts(text: string): JdFacts | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JdFacts.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");

/**
 * JD text is untrusted and is also the LLM's input, so the LLM's answer is checked against it:
 * skills and the apply email must literally appear in the text, and a years figure the text states
 * plainly wins over the model's. A crafted posting cannot promote itself with invented facts.
 */
export function groundFacts(facts: JdFacts, text: string): JdFacts {
  const haystack = squash(text);
  const inText = (skill: string) => squash(skill).length > 0 && haystack.includes(squash(skill));
  const stated = minYearsFromText(text);
  return {
    ...facts,
    mustHave: facts.mustHave.filter(inText),
    niceToHave: facts.niceToHave.filter(inText),
    minYears: stated ?? facts.minYears,
    applyEmail:
      facts.applyEmail && text.toLowerCase().includes(facts.applyEmail.toLowerCase())
        ? facts.applyEmail
        : null,
  };
}

export function buildMessages(text: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text.slice(0, 24_000) },
  ];
}

/** A per-minute rate limit is worth waiting out; anything longer means the provider's quota is spent. */
const MAX_RATE_LIMIT_WAIT_MS = 65_000;
const MAX_RATE_LIMIT_WAITS = 2;
const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tries each configured provider in order. A short 429 (per-minute limit) is waited out using the
 * provider's Retry-After; a long one, 5xx or a network error blocks that provider for the rest of the
 * run. Invalid output is retried once, then the next provider is tried.
 */
export async function extractJdFacts(
  text: string,
  chain: ProviderEntry[],
  env: Record<string, string | undefined>,
  call: ChatCall = openAiCompatibleCall,
  /** Providers that failed earlier in this run; skipped and added to. */
  blocked: Set<string> = new Set(),
  sleep: (ms: number) => Promise<void> = sleepFor,
): Promise<ExtractResult> {
  const configured = chain.filter((p) => env[p.apiKeyEnv]);
  if (configured.length === 0) return { ok: false, reason: "no-providers" };
  const usable = configured.filter((p) => !blocked.has(p.name));
  if (usable.length === 0) return { ok: false, reason: "all-quota" };
  const messages = buildMessages(text);
  let sawInvalid = false;
  for (const p of usable) {
    const key = env[p.apiKeyEnv] as string;
    let invalid = 0;
    let waits = 0;
    while (invalid < 2) {
      let res: Awaited<ReturnType<ChatCall>>;
      try {
        res = await call(p, key, messages);
      } catch {
        blocked.add(p.name);
        break;
      }
      if (res.status === 429) {
        const wait = res.retryAfterMs ?? MAX_RATE_LIMIT_WAIT_MS + 1;
        if (wait <= MAX_RATE_LIMIT_WAIT_MS && waits < MAX_RATE_LIMIT_WAITS) {
          waits++;
          await sleep(wait);
          continue;
        }
        blocked.add(p.name);
        break;
      }
      if (res.status < 200 || res.status >= 300) {
        if (res.status >= 500) blocked.add(p.name);
        break;
      }
      const facts = parseFacts(res.text);
      if (facts) return { ok: true, facts: groundFacts(facts, text), provider: p.name };
      sawInvalid = true;
      invalid++;
    }
  }
  return { ok: false, reason: sawInvalid ? "invalid" : "all-quota" };
}
