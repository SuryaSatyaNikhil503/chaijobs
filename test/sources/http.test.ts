import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, SourceError } from "../../src/sources/http.js";

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("rejects responses larger than the cap", async () => {
    vi.stubGlobal("fetch", async () => new Response("x".repeat(2_000)));
    await expect(fetchJson("https://example.com/jobs", { maxBytes: 1_000 })).rejects.toThrow(
      new SourceError("response too large from example.com"),
    );
  });

  it("parses JSON under the cap", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: 1 })));
    await expect(fetchJson("https://example.com/jobs", { maxBytes: 1_000 })).resolves.toEqual({ ok: 1 });
  });
});
