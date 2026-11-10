import { describe, expect, it } from "vitest";
import { FiltersSchema } from "../../src/config/schema.js";
import type { RawJob } from "../../src/core/types.js";
import { applyCheapRules, minYearsFromText } from "../../src/filter/cheap.js";
import { toJob } from "../../src/pipeline/normalise.js";

const now = new Date("2026-11-11T01:37:00Z");
const filters = FiltersSchema.parse({});
const win = { from: new Date(now.getTime() - 24 * 3_600_000), firstRun: false };
const job = (over: Partial<RawJob>) =>
  toJob(
    {
      source: "greenhouse",
      sourceJobId: "1",
      company: "Example",
      title: "Backend Engineer",
      locations: ["Hyderabad"],
      url: "https://boards.greenhouse.io/example/jobs/1",
      postedAt: new Date(now.getTime() - 3_600_000).toISOString(),
      postedAtKind: "posted",
      descriptionText: "We need 2-4 years of experience in Java.",
      ...over,
    },
    now.toISOString(),
  );

describe("minYearsFromText", () => {
  it.each([
    ["1-5 years of experience", 1],
    ["5+ yrs in backend", 5],
    ["a minimum of five years of experience", 5],
    ["5 - 8 years experience", 5],
    ["3 to 5 years of experience", 3],
    ["0-2 years", 0],
  ])("%s -> %s", (text, expected) => {
    expect(minYearsFromText(text)).toBe(expected);
  });

  it("ignores company age", () => {
    expect(minYearsFromText("We have 10 years of history building fintech.")).toBeNull();
  });

  it("returns null when no experience is stated", () => {
    expect(minYearsFromText("Build great APIs.")).toBeNull();
  });
});

describe("applyCheapRules", () => {
  it("passes a fresh Hyderabad backend job", () => {
    expect(applyCheapRules(job({}), filters, win)).toBeNull();
  });

  it("1-5 years not skipped", () => {
    expect(applyCheapRules(job({ descriptionText: "1-5 years of experience" }), filters, win)).toBeNull();
  });

  it("5+ years skipped with rule min-years", () => {
    expect(applyCheapRules(job({ descriptionText: "5+ years of experience" }), filters, win)).toMatchObject({
      kind: "skip",
      rule: "min-years",
    });
  });

  it("Senior Frontend Engineer skipped with rule title-excluded", () => {
    expect(applyCheapRules(job({ title: "Senior Frontend Engineer" }), filters, win)).toMatchObject({
      kind: "skip",
      rule: "title-excluded",
    });
  });

  it("Pune job skipped with rule location", () => {
    expect(applyCheapRules(job({ locations: ["Pune, Maharashtra"] }), filters, win)).toMatchObject({
      kind: "skip",
      rule: "location",
    });
  });

  it("remote India passes only when allowed", () => {
    const remote = job({ locations: ["Remote - India"] });
    expect(applyCheapRules(remote, filters, win)).toBeNull();
    expect(applyCheapRules(remote, { ...filters, allowRemoteIndia: false }, win)).toMatchObject({
      rule: "location",
    });
  });

  it("old posting skipped with rule stale", () => {
    const old = job({ postedAt: new Date(now.getTime() - 48 * 3_600_000).toISOString() });
    expect(applyCheapRules(old, filters, win)).toMatchObject({ kind: "skip", rule: "stale" });
  });

  it("stub with unknown years passes", () => {
    expect(applyCheapRules(job({ descriptionText: null }), filters, win)).toBeNull();
  });

  it.each(["Fraud Operations Associate", "Analyst - RMG", "Account Executive, SLED"])(
    "non-engineering title %s skipped with rule title-excluded",
    (title) => {
      expect(applyCheapRules(job({ title }), filters, win)).toMatchObject({
        kind: "skip",
        rule: "title-excluded",
      });
    },
  );

  it.each([
    "SDE 2",
    "Member of Technical Staff",
    "Java Developer",
    "Software Engineer II",
    "Backend Architect",
  ])("engineering title %s passes", (title) => {
    expect(applyCheapRules(job({ title }), filters, win)).toBeNull();
  });

  it("title words match whole words only", () => {
    expect(applyCheapRules(job({ title: "Backend Engineer, Payments Squad" }), filters, win)).toBeNull();
  });
});
