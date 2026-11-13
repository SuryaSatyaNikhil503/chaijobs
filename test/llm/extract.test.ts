import { describe, expect, it } from "vitest";
import type { ProviderEntry } from "../../src/config/schema.js";
import type { ChatCall } from "../../src/llm/chain.js";
import { extractJdFacts, JdFacts } from "../../src/llm/extract.js";

const p = (name: string): ProviderEntry => ({
  name,
  baseUrl: `https://${name}.example/v1`,
  model: `${name}-model`,
  apiKeyEnv: `${name.toUpperCase()}_KEY`,
});
const chain = [p("groq"), p("gemini")];
const env = { GROQ_KEY: "g", GEMINI_KEY: "m" };
const JD = "Java and Spring Boot, 2-4 years of experience. Kafka is a plus.";
const good = JSON.stringify({
  minYears: 2,
  maxYears: 4,
  mustHave: ["Java", "Spring Boot"],
  niceToHave: ["Kafka"],
  roleType: "backend",
  applyEmail: null,
});

describe("extractJdFacts", () => {
  it("falls through 429 to second provider", async () => {
    const calls: string[] = [];
    const call: ChatCall = async (prov) => {
      calls.push(prov.name);
      return prov.name === "groq" ? { status: 429, text: "" } : { status: 200, text: good };
    };
    const r = await extractJdFacts(JD, chain, env, call);
    expect(r).toMatchObject({ ok: true, provider: "gemini", facts: { minYears: 2, roleType: "backend" } });
    expect(calls).toEqual(["groq", "gemini"]);
  });

  it("retries once on invalid json then moves on", async () => {
    const calls: string[] = [];
    const call: ChatCall = async (prov) => {
      calls.push(prov.name);
      return prov.name === "groq" ? { status: 200, text: "not json" } : { status: 200, text: good };
    };
    const r = await extractJdFacts(JD, chain, env, call);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["groq", "groq", "gemini"]);
  });

  it("waits out a per-minute 429 and retries the same provider", async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    let first = true;
    const call: ChatCall = async (prov) => {
      calls.push(prov.name);
      if (first) {
        first = false;
        return { status: 429, text: "", retryAfterMs: 7_000 };
      }
      return { status: 200, text: good };
    };
    const r = await extractJdFacts(JD, chain, env, call, new Set(), async (ms) => {
      waits.push(ms);
    });
    expect(r).toMatchObject({ ok: true, provider: "groq" });
    expect(calls).toEqual(["groq", "groq"]);
    expect(waits).toEqual([7_000]);
  });

  it("a long retry-after (daily quota) blocks the provider and moves on", async () => {
    const blocked = new Set<string>();
    const waits: number[] = [];
    const call: ChatCall = async (prov) =>
      prov.name === "groq" ? { status: 429, text: "", retryAfterMs: 3_600_000 } : { status: 200, text: good };
    const r = await extractJdFacts(JD, chain, env, call, blocked, async (ms) => {
      waits.push(ms);
    });
    expect(r).toMatchObject({ ok: true, provider: "gemini" });
    expect(waits).toEqual([]);
    expect(blocked.has("groq")).toBe(true);
  });

  it("all 429 returns all-quota", async () => {
    const r = await extractJdFacts("JD", chain, env, async () => ({ status: 429, text: "" }));
    expect(r).toEqual({ ok: false, reason: "all-quota" });
  });

  it("invalid everywhere returns invalid", async () => {
    const r = await extractJdFacts("JD", chain, env, async () => ({ status: 200, text: "{}" }));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("no keys set returns no-providers", async () => {
    const r = await extractJdFacts("JD", chain, {}, async () => ({ status: 200, text: good }));
    expect(r).toEqual({ ok: false, reason: "no-providers" });
  });

  it("thrown network error moves to next provider", async () => {
    const call: ChatCall = async (prov) => {
      if (prov.name === "groq") throw new Error("timeout");
      return { status: 200, text: good };
    };
    expect((await extractJdFacts("JD", chain, env, call)).ok).toBe(true);
  });

  it("strips a markdown code fence around the json", async () => {
    const r = await extractJdFacts("JD", chain, env, async () => ({
      status: 200,
      text: `\`\`\`json\n${good}\n\`\`\``,
    }));
    expect(r.ok).toBe(true);
  });

  it("drops skills and emails the JD never mentions", async () => {
    const injected = JSON.stringify({
      minYears: 0,
      maxYears: null,
      mustHave: ["Java", "Rust"],
      niceToHave: ["Kafka"],
      roleType: "backend",
      applyEmail: "attacker@evil.example",
    });
    const r = await extractJdFacts("Java role. 5+ years of experience.", chain, env, async () => ({
      status: 200,
      text: injected,
    }));
    expect(r).toMatchObject({
      ok: true,
      facts: { mustHave: ["Java"], niceToHave: [], applyEmail: null, minYears: 5 },
    });
  });

  it("keeps an apply email that appears in the JD", async () => {
    const withEmail = JSON.stringify({ ...JSON.parse(good), applyEmail: "jobs@example.com" });
    const r = await extractJdFacts(
      "Java, Spring Boot. Send CVs to jobs@example.com",
      chain,
      env,
      async () => ({
        status: 200,
        text: withEmail,
      }),
    );
    expect(r).toMatchObject({ ok: true, facts: { applyEmail: "jobs@example.com" } });
  });

  it("zod rejects minYears 99", () => {
    expect(JdFacts.safeParse({ ...JSON.parse(good), minYears: 99 }).success).toBe(false);
  });
});
