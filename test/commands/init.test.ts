import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initInstance } from "../../src/commands/init.js";
import { verifyCompanies } from "../../src/commands/verifyCompanies.js";
import type { Company } from "../../src/config/schema.js";

describe("initInstance", () => {
  it("copies template into a new folder", () => {
    const target = join(mkdtempSync(join(tmpdir(), "chaijobs-init-")), "my-instance");
    initInstance(target);
    expect(existsSync(join(target, ".github", "workflows", "daily.yml"))).toBe(true);
    expect(existsSync(join(target, "config", "companies.yml"))).toBe(true);
  });

  it("refuses non-empty dir", () => {
    const target = mkdtempSync(join(tmpdir(), "chaijobs-init-"));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "something.txt"), "x");
    expect(() => initInstance(target)).toThrow(/not empty/);
  });
});

describe("verifyCompanies", () => {
  const c = (slug: string): Company => ({ name: slug, type: "product", ats: "greenhouse", slug });

  it("reports OK with job counts and FAIL with reasons", async () => {
    const results = await verifyCompanies([c("good"), c("bad")], async (co) => {
      if (co.slug === "bad") throw new Error("HTTP 404");
      return [{} as never, {} as never];
    });
    expect(results).toEqual([
      { company: "greenhouse:good", ok: true, detail: "2 jobs" },
      { company: "greenhouse:bad", ok: false, detail: "HTTP 404" },
    ]);
  });
});
