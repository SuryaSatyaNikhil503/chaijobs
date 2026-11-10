import { describe, expect, it } from "vitest";
import { checkProviders } from "../../src/commands/providers.js";
import type { ProviderEntry } from "../../src/config/schema.js";

const p = (name: string): ProviderEntry => ({
  name,
  baseUrl: `https://${name}.example/v1`,
  model: `${name}-m`,
  apiKeyEnv: `${name.toUpperCase()}_KEY`,
});
const good = JSON.stringify({
  minYears: 3,
  maxYears: 5,
  mustHave: ["Java"],
  niceToHave: [],
  roleType: "backend",
  applyEmail: null,
});

describe("checkProviders", () => {
  it("reports each provider's outcome without revealing keys", async () => {
    const results = await checkProviders(
      [p("groq"), p("gemini"), p("other")],
      { GROQ_KEY: "secret-1", GEMINI_KEY: "x" },
      async (prov) => (prov.name === "groq" ? { status: 200, text: good } : { status: 429, text: "" }),
    );
    expect(results).toEqual([
      { provider: "groq", model: "groq-m", status: "ok", detail: "extracted minYears=3, mustHave=Java" },
      { provider: "gemini", model: "gemini-m", status: "failed", detail: "HTTP 429" },
      { provider: "other", model: "other-m", status: "no key", detail: "set OTHER_KEY" },
    ]);
    expect(JSON.stringify(results)).not.toContain("secret-1");
  });
});
