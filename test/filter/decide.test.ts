import { describe, expect, it } from "vitest";
import { FiltersSchema, SkillsFileSchema } from "../../src/config/schema.js";
import type { MatchVerdict, RawJob } from "../../src/core/types.js";
import { decide, rank } from "../../src/filter/decide.js";
import type { JdFacts } from "../../src/llm/extract.js";
import { toJob } from "../../src/pipeline/normalise.js";

const now = "2026-11-11T01:37:00.000Z";
const f = FiltersSchema.parse({});
const skills = SkillsFileSchema.parse({
  skills: [
    { name: "Java", aliases: ["java 21"] },
    { name: "Spring Boot", aliases: ["springboot"] },
    { name: "PostgreSQL", aliases: ["postgres"] },
  ],
});
const job = (over: Partial<RawJob> = {}) =>
  toJob(
    {
      source: "greenhouse",
      sourceJobId: "1",
      company: "Example",
      title: "Backend Engineer",
      locations: ["Chennai"],
      url: "https://boards.greenhouse.io/example/jobs/1",
      postedAt: now,
      postedAtKind: "posted",
      descriptionText: "JD",
      ...over,
    },
    now,
  );
const facts = (over: Partial<JdFacts> = {}): JdFacts => ({
  minYears: 2,
  maxYears: 5,
  mustHave: ["Java", "SpringBoot"],
  niceToHave: [],
  roleType: "backend",
  applyEmail: null,
  ...over,
});

describe("decide", () => {
  it("java spring jd is strong match with matched [Java, SpringBoot]", () => {
    expect(decide(job(), facts(), skills, f)).toEqual({
      kind: "match",
      band: "strong",
      aiChecked: true,
      matched: ["Java", "SpringBoot"],
      missing: [],
      score: 1,
    });
  });

  it(".NET core jd skipped core-stack", () => {
    expect(decide(job(), facts({ mustHave: [".NET Core", "C#", "Azure"] }), skills, f)).toMatchObject({
      kind: "skip",
      rule: "core-stack",
    });
  });

  it("4 years min is stretch", () => {
    expect(decide(job(), facts({ minYears: 4 }), skills, f)).toMatchObject({
      kind: "match",
      band: "stretch",
    });
  });

  it("5 years min is skipped min-years", () => {
    expect(decide(job(), facts({ minYears: 5 }), skills, f)).toMatchObject({
      kind: "skip",
      rule: "min-years",
    });
  });

  it("frontend role type is skipped", () => {
    expect(decide(job(), facts({ roleType: "frontend" }), skills, f)).toMatchObject({
      kind: "skip",
      rule: "role-type",
    });
  });

  it("unknown minYears never skips", () => {
    expect(decide(job(), facts({ minYears: null }), skills, f)).toMatchObject({
      kind: "match",
      band: "strong",
    });
  });

  it("partial coverage lists missing skills", () => {
    const v = decide(job(), facts({ mustHave: ["Java", "Kafka"] }), skills, f) as MatchVerdict;
    expect(v.matched).toEqual(["Java"]);
    expect(v.missing).toEqual(["Kafka"]);
    expect(v.score).toBe(0.5);
  });

  it("facts null gives aiChecked false", () => {
    expect(decide(job({ descriptionText: "4+ years of experience" }), null, skills, f)).toMatchObject({
      kind: "match",
      aiChecked: false,
      band: "stretch",
    });
  });

  it("stub gives stub verdict", () => {
    expect(decide(job({ descriptionText: null }), null, skills, f)).toEqual({ kind: "stub" });
  });
});

describe("rank", () => {
  it("rank puts strong 0.5 above stretch 1.0", () => {
    const m = (band: "strong" | "stretch", score: number): MatchVerdict => ({
      kind: "match",
      band,
      aiChecked: true,
      matched: [],
      missing: [],
      score,
    });
    const ranked = rank([
      { job: job({ sourceJobId: "a" }), verdict: m("stretch", 1) },
      { job: job({ sourceJobId: "b" }), verdict: m("strong", 0.5) },
    ]);
    expect(ranked.map((r) => r.verdict.band)).toEqual(["strong", "stretch"]);
  });
});
