import { describe, expect, it } from "vitest";
import type { Job, MatchVerdict } from "../../src/core/types.js";
import { buildView, jobDetail } from "../../src/dashboard/model.js";
import { emptyState, type State, type UserState } from "../../src/state/store.js";

const job = (id: string, title: string, postedAt = "2026-11-13T01:00:00.000Z"): Job =>
  ({
    id,
    title,
    company: "Example",
    locations: ["Chennai"],
    cities: ["Chennai"],
    url: "https://example.com",
    postedAt,
    isStub: false,
  }) as Job;
const match = (score: number, band: "strong" | "stretch" = "strong"): MatchVerdict => ({
  kind: "match",
  band,
  aiChecked: true,
  matched: [],
  missing: [],
  score,
});
const user = (statuses: Record<string, string> = {}, history: UserState["history"] = []): UserState => ({
  statuses,
  extraCompanies: [],
  history,
});

function state(): State {
  const s = emptyState();
  s.lastSuccessfulRun = "2026-11-13T01:38:00.000Z";
  s.jobs.a = { job: job("a", "Backend A"), verdict: match(0.5), facts: null, digestedAt: "x" };
  s.jobs.b = { job: job("b", "Backend B"), verdict: match(1), facts: null, digestedAt: "x" };
  s.jobs.c = { job: job("c", "Stretch C"), verdict: match(1, "stretch"), facts: null, digestedAt: "x" };
  s.jobs.s = {
    job: { ...job("s", "Stub S"), isStub: true },
    verdict: { kind: "stub" },
    facts: null,
    digestedAt: "x",
  };
  s.seen.x1 = {
    firstSeenAt: "t",
    lastSeenAt: "2026-11-13T01:38:00.000Z",
    rule: "location",
    title: "Pune role",
    company: "P",
  };
  s.seen.x2 = { firstSeenAt: "t", lastSeenAt: "2026-11-12T01:38:00.000Z", rule: "location" };
  s.seen.x3 = {
    firstSeenAt: "t",
    lastSeenAt: "2026-11-13T01:38:00.000Z",
    rule: "min-years",
    title: "Senior",
    company: "Q",
  };
  return s;
}

describe("buildView", () => {
  it("matches are ranked and skipped ones hidden by default", () => {
    const v = buildView(state(), user({ b: "skipped" }), { show: "open" });
    expect(v.matches.map((r) => r.id)).toEqual(["a", "c"]);
    expect(v.counts.skipped).toBe(1);
  });

  it("show=all includes skipped and keeps rank order", () => {
    const v = buildView(state(), user({ b: "skipped" }), { show: "all" });
    expect(v.matches.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(v.matches[0]?.status).toBe("skipped");
  });

  it("filtered groups by rule with recent titles and counts untitled records", () => {
    const v = buildView(state(), user(), { show: "open" });
    const loc = v.filtered.find((f) => f.rule === "location");
    expect(loc).toMatchObject({ count: 2, untitled: 1 });
    expect(loc?.recent).toEqual([{ title: "Pune role", company: "P", at: "2026-11-13T01:38:00.000Z" }]);
    expect(v.filtered.map((f) => f.rule)).toEqual(["location", "min-years"]);
  });

  it("needs-JD list holds stubs", () => {
    expect(buildView(state(), user(), { show: "open" }).needsJd.map((r) => r.id)).toEqual(["s"]);
  });

  it("empty state gives an empty view, not an error", () => {
    const v = buildView(emptyState(), user(), { show: "open" });
    expect(v).toMatchObject({ lastRun: null, matches: [], needsJd: [], filtered: [] });
  });
});

describe("jobDetail", () => {
  it("returns history for that job only", () => {
    const h = [
      { id: "a", status: "applied" as const, at: "1" },
      { id: "b", status: "skipped" as const, at: "2" },
    ];
    const d = jobDetail(state(), user({ a: "applied" }, h), "a");
    expect(d?.status).toBe("applied");
    expect(d?.history).toEqual([h[0]]);
  });

  it("unknown id is null", () => {
    expect(jobDetail(state(), user(), "nope")).toBeNull();
  });
});
