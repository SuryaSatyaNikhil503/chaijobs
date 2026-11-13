import type { ProviderEntry } from "../config/schema.js";
import { type ChatCall, openAiCompatibleCall } from "../llm/chain.js";
import { buildMessages, groundFacts, parseFacts } from "../llm/extract.js";

export interface ProviderCheck {
  provider: string;
  model: string;
  status: "ok" | "failed" | "no key";
  detail: string;
}

/** A synthetic JD, so checking a key never sends real job or personal data to a provider. */
const SAMPLE_JD = "Backend Engineer. 3-5 years of experience. Must have Java and REST APIs. Kafka is a plus.";

/** Sends one tiny extraction request to each provider and reports what happened. Keys are never printed. */
export async function checkProviders(
  providers: ProviderEntry[],
  env: Record<string, string | undefined>,
  call: ChatCall = openAiCompatibleCall,
): Promise<ProviderCheck[]> {
  const results: ProviderCheck[] = [];
  for (const p of providers) {
    const base = { provider: p.name, model: p.model };
    const key = env[p.apiKeyEnv];
    if (!key) {
      results.push({ ...base, status: "no key", detail: `set ${p.apiKeyEnv}` });
      continue;
    }
    try {
      const res = await call(p, key, buildMessages(SAMPLE_JD));
      if (res.status < 200 || res.status >= 300) {
        results.push({ ...base, status: "failed", detail: `HTTP ${res.status}` });
        continue;
      }
      const facts = parseFacts(res.text);
      if (!facts) {
        results.push({ ...base, status: "failed", detail: "reply was not valid JSON facts" });
        continue;
      }
      const g = groundFacts(facts, SAMPLE_JD);
      results.push({
        ...base,
        status: "ok",
        detail: `extracted minYears=${g.minYears}, mustHave=${g.mustHave.join(",")}`,
      });
    } catch (e) {
      results.push({ ...base, status: "failed", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
