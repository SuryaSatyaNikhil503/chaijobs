import { describe, expect, it } from "vitest";
import type { Job, MatchVerdict } from "../../src/core/types.js";
import { renderHome, renderJob } from "../../src/dashboard/html.js";
import type { DashboardView, JobRow } from "../../src/dashboard/model.js";

const hostileJob = {
  id: "j1",
  title: '<script>alert(1)</script>"><img src=x onerror=alert(2)>',
  company: "<b>Evil</b>",
  cities: ["Chennai"],
  locations: ["Chennai"],
  url: "javascript:alert(3)",
  postedAt: "2026-11-13T01:00:00.000Z",
  descriptionText: "Line one\n<script>steal()</script>",
  isStub: false,
} as unknown as Job;
const verdict: MatchVerdict = {
  kind: "match",
  band: "strong",
  aiChecked: true,
  matched: ["Java"],
  missing: ["Kafka"],
  score: 0.5,
};
const row: JobRow = { id: "j1", job: hostileJob, verdict, facts: null, status: null, digestedAt: "x" };
const view = (over: Partial<DashboardView> = {}): DashboardView => ({
  lastRun: "2026-11-13T01:38:00.000Z",
  health: [
    { source: "greenhouse:groww", ok: true, count: 9, error: null },
    { source: "lever:x", ok: false, count: 0, error: "HTTP 404" },
  ],
  matches: [row],
  needsJd: [],
  filtered: [],
  counts: { applied: 0, skipped: 0, interview: 0, rejected: 0, offer: 0, withdrawn: 0 },
  ...over,
});
const now = new Date("2026-11-13T06:00:00Z");

describe("dashboard html", () => {
  it("hostile title, company, link and JD render as inert text", () => {
    const home = renderHome(view(), "tok", null, now);
    const job = renderJob({ ...row, history: [] }, "tok", now);
    for (const page of [home, job]) {
      expect(page).not.toMatch(/<script/i);
      expect(page).not.toMatch(/<img/i);
      expect(page).not.toMatch(/href="javascript:/i);
      expect(page).not.toContain("<b>Evil</b>");
    }
    expect(job).toContain("&lt;script&gt;steal()&lt;/script&gt;");
  });

  it("each status form carries the csrf token", () => {
    const home = renderHome(view(), "tok123", null, now);
    const forms = home.match(/<form/g) ?? [];
    const tokens = home.match(/name="csrf" value="tok123"/g) ?? [];
    expect(forms.length).toBeGreaterThan(0);
    expect(tokens.length).toBe(forms.length);
  });

  it("headline is a sentence about today", () => {
    expect(renderHome(view(), "t", null, now)).toContain("One match this morning");
    expect(renderHome(view({ matches: [] }), "t", null, now)).toContain("No new matches this morning");
  });

  it("no runs yet message on empty view", () => {
    const html = renderHome(view({ lastRun: null, matches: [], health: [] }), "t", null, now);
    expect(html).toContain("No runs yet");
  });

  it("health line names failed sources", () => {
    expect(renderHome(view(), "t", null, now)).toContain("1 of 2 sources OK");
    expect(renderHome(view(), "t", null, now)).toContain("lever:x");
  });

  it("untitled filtered records are explained, not hidden", () => {
    const html = renderHome(
      view({
        filtered: [
          {
            rule: "location",
            count: 5,
            untitled: 3,
            recent: [{ title: "Pune role", company: "P", at: "2026-11-13T01:38:00.000Z" }],
          },
        ],
      }),
      "t",
      null,
      now,
    );
    expect(html).toContain("Pune role");
    expect(html).toContain("3 recorded before titles were kept");
  });

  it("filtered groups use plain language, not rule ids", () => {
    const html = renderHome(
      view({
        filtered: [
          { rule: "min-years", count: 2, untitled: 0, recent: [] },
          { rule: "title-excluded", count: 1, untitled: 0, recent: [] },
        ],
      }),
      "t",
      null,
      now,
    );
    expect(html).toContain("Asks for more experience (2)");
    expect(html).toContain("Title not a fit (1)");
    expect(html).not.toContain("title-excluded");
  });

  it("status label stays for screen readers but is visually hidden", () => {
    expect(renderHome(view(), "t", null, now)).toMatch(/<label class="sr-only" for="s-j1">Status<\/label>/);
  });

  it("job page shows the sync note", () => {
    expect(renderJob({ ...row, history: [] }, "t", now, "saved here, but push failed: offline")).toContain(
      "push failed: offline",
    );
  });

  it("shows the sync note when present", () => {
    expect(renderHome(view(), "t", "saved here, but push failed: offline", now)).toContain(
      "push failed: offline",
    );
  });
});
