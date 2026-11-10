import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SourceError } from "../../src/sources/http.js";
import { fetchSerpApi } from "../../src/sources/serpapi.js";

const now = new Date("2026-11-11T01:37:00Z");
const body = JSON.parse(readFileSync(new URL("../fixtures/sources/serpapi.json", import.meta.url), "utf8"));

describe("serpapi google jobs", () => {
  it("maps google jobs results", async () => {
    let calledUrl = "";
    const jobs = await fetchSerpApi("java developer hyderabad", "KEY", now, async (url) => {
      calledUrl = url;
      return body;
    });
    expect(calledUrl).toContain("engine=google_jobs");
    expect(calledUrl).toContain("gl=in");
    expect(jobs[0]).toMatchObject({
      source: "serpapi",
      company: "Example Services Ltd",
      title: "Java Backend Developer",
      locations: ["Hyderabad, Telangana, India"],
      url: "https://www.linkedin.com/jobs/view/123?utm_source=google",
      postedAt: new Date(now.getTime() - 5 * 3_600_000).toISOString(),
      postedAtKind: "posted",
    });
    expect(jobs[0]?.descriptionText).toContain("Spring Boot");
  });

  it("throws when key missing", async () => {
    await expect(fetchSerpApi("q", "", now, async () => body)).rejects.toThrow(
      new SourceError("serpapi: no key"),
    );
  });

  it("unparseable posted_at falls back to first-seen", async () => {
    const odd = structuredClone(body);
    odd.jobs_results[0].detected_extensions.posted_at = "recently";
    const [job] = await fetchSerpApi("q", "KEY", now, async () => odd);
    expect(job?.postedAtKind).toBe("first-seen");
    expect(job?.postedAt).toBeNull();
  });
});
