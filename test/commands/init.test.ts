import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initInstance, resolveReleaseRef } from "../../src/commands/init.js";
import { verifyCompanies } from "../../src/commands/verifyCompanies.js";
import type { Company } from "../../src/config/schema.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("initInstance", () => {
  it("pins the workflow to the exact chaijobs commit", () => {
    const target = join(mkdtempSync(join(tmpdir(), "chaijobs-init-")), "pinned");
    initInstance(target, SHA);
    const wf = readFileSync(join(target, ".github", "workflows", "daily.yml"), "utf8");
    expect(wf).toContain(`ref: ${SHA}`);
    expect(wf).not.toContain("__CHAIJOBS_REF__");
    expect(wf).not.toMatch(/uses: [^@\s]+@v\d/);
  });

  it("refuses a ref that is not a full commit sha", () => {
    const target = join(mkdtempSync(join(tmpdir(), "chaijobs-init-")), "bad");
    expect(() => initInstance(target, "v0.1.0")).toThrow(/full 40-character commit/);
  });

  it("resolves the release tag to a commit sha", () => {
    const ref = resolveReleaseRef("0.1.0", () => `${SHA}\trefs/tags/v0.1.0\n`);
    expect(ref).toBe(SHA);
  });

  it("fails clearly when the release tag does not exist", () => {
    expect(() => resolveReleaseRef("9.9.9", () => "")).toThrow(/--ref/);
  });

  it("copies template into a new folder", () => {
    const target = join(mkdtempSync(join(tmpdir(), "chaijobs-init-")), "my-instance");
    initInstance(target, SHA);
    expect(existsSync(join(target, ".github", "workflows", "daily.yml"))).toBe(true);
    expect(existsSync(join(target, "config", "companies.yml"))).toBe(true);
  });

  it("refuses non-empty dir", () => {
    const target = mkdtempSync(join(tmpdir(), "chaijobs-init-"));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "something.txt"), "x");
    expect(() => initInstance(target, SHA)).toThrow(/not empty/);
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
