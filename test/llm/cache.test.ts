import { describe, expect, it } from "vitest";
import { LlmCache } from "../../src/llm/cache.js";

describe("LlmCache", () => {
  it("returns stored facts for the same model and text", () => {
    const c = new LlmCache({});
    c.set("m1", "jd text", { minYears: 1 });
    expect(c.get("m1", "jd text")).toEqual({ minYears: 1 });
    expect(c.get("m2", "jd text")).toBeUndefined();
    expect(Object.keys(c.toJSON())).toHaveLength(1);
  });
});
