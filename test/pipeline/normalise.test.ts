import { describe, expect, it } from "vitest";
import type { RawJob } from "../../src/core/types.js";
import { companyKey, dedupe, jobId, toJob } from "../../src/pipeline/normalise.js";

const now = "2026-11-11T01:37:00.000Z";
const raw = (over: Partial<RawJob>): RawJob => ({
  source: "greenhouse",
  sourceJobId: "1",
  company: "Groww",
  title: "Backend Engineer",
  locations: ["Bengaluru, India"],
  url: "https://boards.greenhouse.io/groww/jobs/1",
  postedAt: now,
  postedAtKind: "posted",
  descriptionText: "Java",
  ...over,
});

describe("normalise", () => {
  it("Groww Pvt Ltd and groww share companyKey", () => {
    expect(companyKey("Groww Pvt Ltd")).toBe(companyKey("groww"));
    expect(companyKey("Example Technologies Private Limited")).toBe("example");
  });

  it("toJob fills location fields and stub flag", () => {
    const j = toJob(raw({ descriptionText: null }), now);
    expect(j.cities).toEqual(["Bengaluru"]);
    expect(j.southIndia).toBe(true);
    expect(j.isStub).toBe(true);
    expect(j.firstSeenAt).toBe(now);
  });

  it("jobId ignores tracking query params", () => {
    const a = toJob(raw({ url: "https://jobs.lever.co/x/abc?utm_source=google&lever-source=li" }), now);
    const b = toJob(raw({ url: "https://jobs.lever.co/x/abc" }), now);
    expect(jobId(a)).toBe(jobId(b));
  });

  it("same job from greenhouse and serpapi dedupes to the greenhouse one", () => {
    const gh = toJob(raw({}), now);
    const serp = toJob(
      raw({
        source: "serpapi",
        url: "https://www.linkedin.com/jobs/view/999?utm_source=google",
        company: "Groww Pvt Ltd",
        postedAtKind: "first-seen",
        postedAt: null,
      }),
      now,
    );
    const out = dedupe([serp, gh]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("greenhouse");
  });

  it("multi-city posting dedupes with a single-city copy", () => {
    const one = toJob(
      raw({ source: "serpapi", url: "https://www.linkedin.com/jobs/view/1", locations: ["Hyderabad"] }),
      now,
    );
    const many = toJob(raw({ locations: ["Bengaluru; Hyderabad"] }), now);
    expect(dedupe([one, many])).toHaveLength(1);
  });

  it("stub replaced by full JD duplicate", () => {
    const stub = toJob(
      raw({
        source: "alert-naukri",
        url: "https://www.naukri.com/job-listings-x-123",
        descriptionText: null,
      }),
      now,
    );
    const full = toJob(raw({ source: "serpapi", url: "https://example.com/apply/1" }), now);
    const out = dedupe([stub, full]);
    expect(out).toHaveLength(1);
    expect(out[0]?.isStub).toBe(false);
  });
});
