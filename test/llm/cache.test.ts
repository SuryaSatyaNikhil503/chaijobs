import { describe, expect, it } from "vitest";
import { LlmCache } from "../../src/llm/cache.js";

describe("LlmCache", () => {
  it("returns stored facts for the same model and text", () => {
    const c = new LlmCache({});
    c.set("m1", "jd text", { minYears: 1 }, "2026-11-10T00:00:00.000Z");
    expect(c.get("m1", "jd text")).toEqual({ minYears: 1 });
    expect(c.get("m2", "jd text")).toBeUndefined();
    expect(Object.keys(c.toJSON())).toHaveLength(1);
  });

  it("prunes entries older than 30 days", () => {
    const c = new LlmCache({});
    c.set("m", "old", 1, "2026-09-01T00:00:00.000Z");
    c.set("m", "new", 2, "2026-11-10T00:00:00.000Z");
    c.prune(new Date("2026-11-11T00:00:00Z"));
    expect(c.get("m", "old")).toBeUndefined();
    expect(c.get("m", "new")).toBe(2);
  });

  it("treats legacy entries without a timestamp as expired on prune", () => {
    const c = new LlmCache({ somekey: { minYears: 1 } });
    c.prune(new Date("2026-11-11T00:00:00Z"));
    expect(Object.keys(c.toJSON())).toHaveLength(0);
  });
});
