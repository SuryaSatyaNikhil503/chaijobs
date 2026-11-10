import { describe, expect, it } from "vitest";
import type { MatchVerdict, RawJob } from "../../src/core/types.js";
import { type DigestInput, renderDigest } from "../../src/digest/render.js";
import { toJob } from "../../src/pipeline/normalise.js";

const date = new Date("2026-11-11T01:37:00Z");
const job = (i: number, over: Partial<RawJob> = {}) =>
  toJob(
    {
      source: "greenhouse",
      sourceJobId: String(i),
      company: `Company ${i}`,
      title: `Backend Engineer ${i}`,
      locations: ["Hyderabad"],
      url: `https://boards.greenhouse.io/c/jobs/${i}`,
      postedAt: new Date(date.getTime() - 5 * 3_600_000).toISOString(),
      postedAtKind: "posted",
      descriptionText: "JD",
      ...over,
    },
    date.toISOString(),
  );
const match = (aiChecked = true): MatchVerdict => ({
  kind: "match",
  band: "strong",
  aiChecked,
  matched: ["Java"],
  missing: ["Kafka"],
  score: 0.5,
});
const base: DigestInput = {
  date,
  matches: [],
  stubs: [],
  skippedCounts: {},
  health: [{ source: "greenhouse:groww", ok: true, count: 9, error: null }],
  aiUnavailable: false,
};

describe("renderDigest", () => {
  it("zero matches still renders subject with 0 and health section", () => {
    const d = renderDigest(base);
    expect(d.subject).toBe("☕ chaijobs · 0 new matches · 11 Nov");
    expect(d.text).toContain("Source health");
    expect(d.text).toContain("greenhouse:groww");
  });

  it("subject counts alert jobs so a stub-only day does not read as empty", () => {
    const d = renderDigest({
      ...base,
      stubs: [job(7, { descriptionText: null }), job(8, { descriptionText: null })],
    });
    expect(d.subject).toBe("☕ chaijobs · 0 new matches · 2 from alerts · 11 Nov");
  });

  it("caps the needs-full-JD section at 25 with and-N-more", () => {
    const stubs = Array.from({ length: 30 }, (_, i) => job(100 + i, { descriptionText: null }));
    const d = renderDigest({ ...base, stubs });
    expect(d.text).toContain("and 5 more");
    expect(d.text).not.toContain("Backend Engineer 129");
  });

  it("lists a match with posted age, matched and missing skills", () => {
    const d = renderDigest({ ...base, matches: [{ job: job(1), verdict: match() }] });
    expect(d.subject).toContain("1 new match ");
    expect(d.text).toContain("Backend Engineer 1");
    expect(d.text).toContain("5h ago");
    expect(d.text).toContain("Java");
    expect(d.text).toContain("Kafka");
    expect(d.html).toContain('href="https://boards.greenhouse.io/c/jobs/1"');
  });

  it("failed source listed first with its error", () => {
    const d = renderDigest({
      ...base,
      health: [
        { source: "lever:cred", ok: true, count: 3, error: null },
        { source: "ashby:x", ok: false, count: 0, error: "HTTP 404" },
      ],
    });
    const section = d.text.slice(d.text.indexOf("Source health"));
    expect(section.indexOf("ashby:x")).toBeLessThan(section.indexOf("lever:cred"));
    expect(section).toContain("HTTP 404");
  });

  it("aiUnavailable shows not AI-checked banner", () => {
    const d = renderDigest({
      ...base,
      aiUnavailable: true,
      matches: [{ job: job(1), verdict: match(false) }],
    });
    expect(d.text).toContain("not AI-checked");
  });

  it("caps at 25 with and-N-more", () => {
    const matches = Array.from({ length: 30 }, (_, i) => ({ job: job(i), verdict: match() }));
    const d = renderDigest({ ...base, matches });
    expect(d.text).toContain("and 5 more");
    expect(d.text).not.toContain("Backend Engineer 29");
  });

  it("shows stubs section and skipped counts", () => {
    const d = renderDigest({
      ...base,
      stubs: [job(7, { descriptionText: null })],
      skippedCounts: { location: 12 },
    });
    expect(d.text).toContain("Needs full JD");
    expect(d.text).toContain("location: 12");
  });

  it("escapes html in job titles", () => {
    const d = renderDigest({
      ...base,
      matches: [{ job: job(1, { title: "<script>x</script>" }), verdict: match() }],
    });
    expect(d.html).not.toContain("<script>");
  });

  it("non-http links are not rendered as links", () => {
    const d = renderDigest({
      ...base,
      matches: [{ job: job(1, { url: "javascript:alert(1)" }), verdict: match() }],
    });
    expect(d.html).not.toContain("javascript:");
  });

  it("no LLM key configured says so instead of quota", () => {
    const d = renderDigest({ ...base, aiUnavailable: true, aiReason: "no-key" });
    expect(d.text).toContain("No AI key is configured");
    expect(d.text).not.toContain("quota ran out");
  });

  it("html has no external images or scripts", () => {
    const d = renderDigest({ ...base, matches: [{ job: job(1), verdict: match() }] });
    expect(d.html).not.toMatch(/<img|<script|<link/i);
  });
});
