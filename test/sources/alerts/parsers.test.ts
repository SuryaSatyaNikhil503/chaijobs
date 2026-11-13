import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseIndeedAlert, parseIndeedMatch } from "../../../src/sources/alerts/indeed.js";
import { parseLinkedInAlert } from "../../../src/sources/alerts/linkedin.js";
import { parseNaukriAlert } from "../../../src/sources/alerts/naukri.js";

const received = "2026-11-10T04:36:02.000Z";
const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/alerts/${name}`, import.meta.url), "utf8");

describe("parseNaukriAlert", () => {
  const jobs = parseNaukriAlert(fixture("naukri.html"), received);

  it("finds each job once, ignoring repeats and non-job links", () => {
    expect(jobs.map((j) => j.title)).toEqual(["Java Developer", "Backend Engineer", "Platform Developer"]);
  });

  it("strips tracking params that carry the user's id from slug links", () => {
    expect(jobs[0]?.url).toBe(
      "https://www.naukri.com/jd/job-listings-java-developer-acme-soft-hyderabad-chennai-bengaluru-2-to-5-years-111111111111",
    );
    expect(jobs[0]?.sourceJobId).toBe("111111111111");
  });

  it("reads company and location from the card, skipping the rating", () => {
    expect(jobs[0]).toMatchObject({
      source: "alert-naukri",
      company: "Acme Soft",
      postedAtKind: "email-received",
    });
    expect(jobs[0]?.locations).toContain("Hyderabad, Chenna...");
    expect(jobs[1]?.company).toBe("Zeta Wid");
  });

  it("recovers full cities from the slug when the card truncates them", () => {
    expect(jobs[0]?.locations.join(" ")).toMatch(/bengaluru/i);
  });

  it("drops the stray icon letter from featured titles", () => {
    expect(jobs[2]?.title).toBe("Platform Developer");
    expect(jobs[2]?.company).toBe("Example Labs");
  });

  it("is a stub with the email time as the posting proxy", () => {
    expect(jobs[0]).toMatchObject({ descriptionText: null, postedAt: received });
  });
});

describe("parseIndeedAlert", () => {
  const jobs = parseIndeedAlert(fixture("indeed-alert.html"), received);

  it("maps cards to public viewjob links with company, location and posting age", () => {
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: "alert-indeed",
      sourceJobId: "aaaa1111bbbb2222",
      title: "Software Engineer, Payments",
      company: "Example Pay",
      locations: ["Hyderabad, Telangana"],
      url: "https://in.indeed.com/viewjob?jk=aaaa1111bbbb2222",
      postedAt: new Date(Date.parse(received) - 48 * 3_600_000).toISOString(),
      postedAtKind: "posted",
    });
    expect(jobs[1]).toMatchObject({ company: "Sample Systems Private Limited", postedAt: received });
  });
});

describe("parseIndeedMatch", () => {
  const token = (u: string) => gzipSync(Buffer.from(JSON.stringify({ m: 1, u }))).toString("base64url");
  const job = `https://in.indeed.com/rc/clk?jk=eeee5555ffff6666&from=jobmatch&tk=t`;
  const html = `<html><body>
    <a href="https://cts.indeed.com/v3/${token(job)}/sig">&emsp; View job &emsp;</a>
    <a href="https://cts.indeed.com/v3/${token(job)}/sig" class="strong-text-link">SDE- I</a>
    <div>Example Startup</div><div>Hyderabad, Telangana</div><div>Job type</div>
    <a href="https://cts.indeed.com/v3/${token("https://match.indeed.com/invitations/not-interested?tk=t")}/sig">This is a bad match</a>
    <a href="https://cts.indeed.com/v3/not-a-token/sig">Pause these emails</a>
  </body></html>`;

  it("decodes the wrapped link and reads the single job", () => {
    expect(parseIndeedMatch(html, received)).toEqual([
      {
        source: "alert-indeed",
        sourceJobId: "eeee5555ffff6666",
        company: "Example Startup",
        title: "SDE- I",
        locations: ["Hyderabad, Telangana"],
        url: "https://in.indeed.com/viewjob?jk=eeee5555ffff6666",
        postedAt: received,
        postedAtKind: "email-received",
        descriptionText: null,
      },
    ]);
  });
});

describe("parseLinkedInAlert", () => {
  it("reads job view links (URL shape only; not yet verified on a real alert)", () => {
    const html = `<a href="https://www.linkedin.com/comm/jobs/view/4000000001/?trackingId=x&amp;refId=y">Backend Engineer</a>
      <p>Example Corp</p><p>Bengaluru, Karnataka, India</p>`;
    expect(parseLinkedInAlert(html, received)).toMatchObject([
      {
        source: "alert-linkedin",
        sourceJobId: "4000000001",
        title: "Backend Engineer",
        company: "Example Corp",
        url: "https://www.linkedin.com/jobs/view/4000000001/",
      },
    ]);
  });

  it("returns [] for non-alert html", () => {
    expect(parseLinkedInAlert("<p>hello</p>", received)).toEqual([]);
    expect(parseNaukriAlert("<p>hello</p>", received)).toEqual([]);
    expect(parseIndeedAlert("<p>hello</p>", received)).toEqual([]);
  });
});

describe("hostile alert html", () => {
  it("scans 1 MB of crafted markup in well under a second", async () => {
    const { jobLinks } = await import("../../../src/sources/alerts/common.js");
    const start = performance.now();
    jobLinks("<a ".repeat(350_000), () => true);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("ignores email bodies over the size cap", () => {
    const huge = `<a href="https://www.naukri.com/jd/job-listings-x-123456789012">X</a>${" ".repeat(3_000_000)}`;
    expect(parseNaukriAlert(huge, received)).toEqual([]);
  });
});
