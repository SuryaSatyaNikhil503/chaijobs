import { afterEach, describe, expect, it, vi } from "vitest";
import { openAiCompatibleCall } from "../../src/llm/chain.js";

afterEach(() => vi.unstubAllGlobals());
const provider = { name: "p", baseUrl: "https://llm.example/v1", model: "m", apiKeyEnv: "K" };

describe("openAiCompatibleCall", () => {
  it("retries without response_format when the provider rejects it with 400", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      bodies.push(body);
      if (body.response_format) return new Response("bad", { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
    });
    const r = await openAiCompatibleCall(provider, "key", [{ role: "user", content: "x" }]);
    expect(r).toEqual({ status: 200, text: "{}" });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.response_format).toBeUndefined();
  });
});
