import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load.js";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

describe("loadConfig", () => {
  it("loads minimal instance with defaults", () => {
    const cfg = loadConfig(fixture("instance-min"));
    expect(cfg.filters.maxMinYears).toBe(5);
    expect(cfg.filters.stretchMinYears).toBe(4);
    expect(cfg.filters.windowCapHours).toBe(36);
    expect(cfg.filters.allowRemoteIndia).toBe(true);
    expect(cfg.companies[0]?.slug).toBe("exampleproduct");
    expect(cfg.skills.skills.map((s) => s.name)).toEqual(["Java", "Spring Boot"]);
    expect(cfg.providers).toEqual([]);
    expect(cfg.serpapi.enabled).toBe(false);
  });

  it("rejects company with unknown ats", () => {
    expect(() => loadConfig(fixture("instance-badats"))).toThrow(/companies\.yml[\s\S]*ats/);
  });
});
