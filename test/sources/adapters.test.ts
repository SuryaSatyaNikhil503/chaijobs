import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Company } from "../../src/config/schema.js";
import { fetchAshby } from "../../src/sources/ashby.js";
import { fetchGreenhouse } from "../../src/sources/greenhouse.js";
import { type Fetcher, SourceError } from "../../src/sources/http.js";
import { fetchLever } from "../../src/sources/lever.js";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/sources/${name}.json`, import.meta.url), "utf8"));
const fake =
  (body: unknown): Fetcher =>
  async () =>
    body;
const company = (ats: Company["ats"], slug: string, name = "Example Co"): Company => ({
  name,
  type: "product",
  ats,
  slug,
});

describe("greenhouse", () => {
  it("maps jobs using first_published, not updated_at", async () => {
    const [job] = await fetchGreenhouse(company("greenhouse", "exampleproduct"), fake(fixture("greenhouse")));
    expect(job).toMatchObject({
      source: "greenhouse",
      sourceJobId: "1001",
      company: "Example Product Co",
      title: "Backend Engineer II",
      locations: ["Bengaluru, India"],
      url: "https://boards.greenhouse.io/exampleproduct/jobs/1001",
      postedAt: new Date("2026-11-10T20:00:00-04:00").toISOString(),
      postedAtKind: "posted",
    });
    expect(job?.descriptionText).toContain("3-5 years of Java and Spring Boot");
    expect(job?.descriptionText).not.toContain("<");
  });

  it("throws SourceError on html body", async () => {
    await expect(fetchGreenhouse(company("greenhouse", "x"), fake("<html>blocked</html>"))).rejects.toThrow(
      SourceError,
    );
  });
});

describe("lever", () => {
  it("maps createdAt millis, all locations and list content", async () => {
    const [job] = await fetchLever(company("lever", "examplefin", "Example Fin"), fake(fixture("lever")));
    expect(job).toMatchObject({
      source: "lever",
      sourceJobId: "a1b2c3",
      company: "Example Fin",
      title: "Software Engineer - Platform",
      locations: ["hyderabad", "chennai"],
      url: "https://jobs.lever.co/examplefin/a1b2c3",
      postedAt: new Date(1794290400000).toISOString(),
      postedAtKind: "posted",
    });
    expect(job?.descriptionText).toContain("2+ years of backend experience");
    expect(job?.descriptionText).not.toContain("<li>");
  });

  it("throws SourceError on html body", async () => {
    await expect(fetchLever(company("lever", "x"), fake("<html></html>"))).rejects.toThrow(SourceError);
  });
});

describe("ashby", () => {
  it("maps publishedAt and secondary locations", async () => {
    const [job] = await fetchAshby(
      company("ashby", "examplestartup", "Example Startup"),
      fake(fixture("ashby")),
    );
    expect(job).toMatchObject({
      source: "ashby",
      sourceJobId: "f00d-1",
      company: "Example Startup",
      locations: ["Chennai", "Remote - India"],
      url: "https://jobs.ashbyhq.com/examplestartup/f00d-1",
      postedAt: new Date("2026-11-10T22:15:00.000+00:00").toISOString(),
      postedAtKind: "posted",
      descriptionText: "Own distributed systems in Node.js and Go.",
    });
  });

  it("throws SourceError on html body", async () => {
    await expect(fetchAshby(company("ashby", "x"), fake("<html></html>"))).rejects.toThrow(SourceError);
  });
});
