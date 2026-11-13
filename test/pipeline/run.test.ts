import { cpSync, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawJob } from "../../src/core/types.js";
import type { RenderedDigest } from "../../src/digest/render.js";
import { type RunDeps, runCycle } from "../../src/pipeline/run.js";
import { emptyState, loadState, saveState } from "../../src/state/store.js";

const now = new Date("2026-11-11T01:37:00Z");
const env = { GMAIL_ADDRESS: "me@example.com", GMAIL_APP_PASSWORD: "pw", GROQ_KEY: "k" };
const instance = () => {
  const d = mkdtempSync(join(tmpdir(), "chaijobs-run-"));
  cpSync(fileURLToPath(new URL("../fixtures/instance-run", import.meta.url)), d, { recursive: true });
  return d;
};
const raw = (i: number, over: Partial<RawJob> = {}): RawJob => ({
  source: "greenhouse",
  sourceJobId: String(i),
  company: "Example Product Co",
  title: `Backend Engineer ${i}`,
  locations: ["Hyderabad"],
  url: `https://boards.greenhouse.io/exampleproduct/jobs/${i}`,
  postedAt: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
  postedAtKind: "posted",
  descriptionText: "2-4 years of experience with Java and Spring Boot.",
  ...over,
});
const facts = JSON.stringify({
  minYears: 2,
  maxYears: 4,
  mustHave: ["Java", "Spring Boot"],
  niceToHave: [],
  roleType: "backend",
  applyEmail: null,
});

function deps(over: Partial<RunDeps> = {}) {
  const sent: RenderedDigest[] = [];
  const d: RunDeps = {
    fetchCompany: async (c) => (c.slug === "exampleproduct" ? [raw(1)] : []),
    fetchSerpApi: async () => [],
    fetchAlerts: null,
    chatCall: async () => ({ status: 200, text: facts }),
    sendDigest: async (m) => {
      sent.push(m);
    },
    ...over,
  };
  return { d, sent };
}

const undated = (i: number): RawJob => raw(i, { postedAt: null, postedAtKind: "first-seen" });

describe("runCycle", () => {
  it("undated backlog from the first run does not flood the second digest", async () => {
    const dir = instance();
    const fetchCompany = async (c: { slug: string }) =>
      c.slug === "exampleproduct" ? [undated(1), undated(2)] : [];
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: deps({ fetchCompany }).d });
    const second = deps({ fetchCompany });
    const later = new Date(now.getTime() + 24 * 3_600_000);
    await runCycle({ instanceDir: dir, now: later, env, dryRun: false, deps: second.d });
    expect(second.sent[0]?.subject).toContain("0 new matches");
  });

  it("matches beyond the digest cap roll over to the next digest", async () => {
    const dir = instance();
    const thirty = Array.from({ length: 30 }, (_, i) => raw(i));
    const fetchCompany = async (c: { slug: string }) => (c.slug === "exampleproduct" ? thirty : []);
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: deps({ fetchCompany }).d });
    const digested = Object.values(loadState(dir).jobs).filter((r) => r.digestedAt).length;
    expect(digested).toBe(25);
    const second = deps({ fetchCompany });
    await runCycle({
      instanceDir: dir,
      now: new Date(now.getTime() + 3_600_000),
      env,
      dryRun: false,
      deps: second.d,
    });
    expect(second.sent[0]?.subject).toContain("5 new matches");
  });

  it("job digested from serpapi is not repeated when it later arrives from greenhouse", async () => {
    const dir = instance();
    const viaSerp = raw(1, {
      source: "serpapi",
      url: "https://www.linkedin.com/jobs/view/555",
      company: "Example Product Co",
      title: "Backend Engineer 1",
    });
    const first = deps({ fetchCompany: async () => [], fetchSerpApi: async () => [viaSerp] });
    await runCycle({
      instanceDir: dir,
      now,
      env: { ...env, SERPAPI_KEY: "s" },
      dryRun: false,
      deps: first.d,
    });
    expect(first.sent[0]?.subject).toContain("1 new match ");
    const fresh = raw(1, { postedAt: new Date(now.getTime() + 1_800_000).toISOString() });
    const second = deps({ fetchCompany: async (c) => (c.slug === "exampleproduct" ? [fresh] : []) });
    await runCycle({
      instanceDir: dir,
      now: new Date(now.getTime() + 3_600_000),
      env,
      dryRun: false,
      deps: second.d,
    });
    expect(second.sent[0]?.subject).toContain("0 new matches");
  });

  it("a rate-limited provider is not called again in the same run", async () => {
    let calls = 0;
    const fetchCompany = async (c: { slug: string }) =>
      c.slug === "exampleproduct" ? [raw(1), raw(2), raw(3)] : [];
    const { d } = deps({
      fetchCompany,
      chatCall: async () => {
        calls++;
        return { status: 429, text: "" };
      },
    });
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d });
    expect(calls).toBe(1);
  });

  it("over the LLM time budget, jobs are decided by rules and the digest is still sent", async () => {
    let calls = 0;
    const { d, sent } = deps({
      chatCall: async () => {
        calls++;
        return { status: 200, text: facts };
      },
    });
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d, llmBudgetMs: 0 });
    expect(calls).toBe(0);
    expect(sent[0]?.text).toContain("not AI-checked");
  });

  it("sends a digest with the matching job and records state", async () => {
    const dir = instance();
    const { d, sent } = deps();
    const r = await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    expect(r.sent).toBe(true);
    expect(sent[0]?.text).toContain("Backend Engineer 1");
    expect(loadState(dir).lastSuccessfulRun).toBe(now.toISOString());
  });

  it("skipped jobs are stored compactly", async () => {
    const dir = instance();
    const pune = Array.from({ length: 2000 }, (_, i) =>
      raw(i, { locations: ["Pune, Maharashtra"], descriptionText: "x".repeat(6000) }),
    );
    const { d } = deps({ fetchCompany: async (c) => (c.slug === "exampleproduct" ? pune : []) });
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    expect(statSync(join(dir, "data", "state.json")).size).toBeLessThan(600_000);
  });

  it("missing Gmail credentials fail before any fetching", async () => {
    let fetched = 0;
    const { d } = deps({
      fetchCompany: async () => {
        fetched++;
        return [];
      },
    });
    await expect(runCycle({ instanceDir: instance(), now, env: {}, dryRun: false, deps: d })).rejects.toThrow(
      /GMAIL_ADDRESS/,
    );
    expect(fetched).toBe(0);
  });

  it("LLM cache is saved even when sending fails", async () => {
    const dir = instance();
    const { d } = deps({
      sendDigest: async () => {
        throw new Error("SMTP down");
      },
    });
    await expect(runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d })).rejects.toThrow();
    expect(existsSync(join(dir, "data", "llm-cache.json"))).toBe(true);
  });

  it("alert-email jobs appear in the needs-full-JD section with alerts health", async () => {
    const stub = raw(77, {
      source: "alert-naukri",
      url: "https://www.naukri.com/jd/job-listings-x-777777777777",
      title: "Java Developer",
      descriptionText: null,
      postedAt: now.toISOString(),
      postedAtKind: "email-received",
    });
    const { d, sent } = deps({ fetchAlerts: async () => ({ jobs: [stub], maxUid: 42 }) });
    const dir = instance();
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    expect(sent[0]?.text).toContain("Needs full JD");
    expect(sent[0]?.text).toContain("✓ alerts: 1 jobs");
    expect(loadState(dir).imapMaxUid).toBe(42);
  });

  it("alert jobs beyond the cap roll over to the next digest", async () => {
    const dir = instance();
    const stubs = Array.from({ length: 30 }, (_, i) =>
      raw(200 + i, {
        source: "alert-naukri",
        url: `https://www.naukri.com/jd/job-listings-x-${900000000000 + i}`,
        descriptionText: null,
        postedAt: now.toISOString(),
        postedAtKind: "email-received",
      }),
    );
    const fetchAlerts = async () => ({ jobs: stubs, maxUid: 1 });
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: deps({ fetchAlerts }).d });
    const second = deps({ fetchAlerts });
    await runCycle({
      instanceDir: dir,
      now: new Date(now.getTime() + 3_600_000),
      env,
      dryRun: false,
      deps: second.d,
    });
    expect(second.sent[0]?.subject).toContain("5 from alerts");
  });

  it("skips when a digest already went out within the minimum gap", async () => {
    const dir = instance();
    saveState(
      dir,
      { ...emptyState(), lastSuccessfulRun: new Date(now.getTime() - 6 * 3_600_000).toISOString() },
      now,
    );
    const { d, sent } = deps();
    const r = await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d, minGapHours: 12 });
    expect(r).toMatchObject({ sent: false, skipped: "a digest was sent 6.0h ago (minimum gap 12h)" });
    expect(sent).toHaveLength(0);
  });

  it("runs normally when the last digest is older than the gap", async () => {
    const dir = instance();
    saveState(
      dir,
      { ...emptyState(), lastSuccessfulRun: new Date(now.getTime() - 20 * 3_600_000).toISOString() },
      now,
    );
    const { d, sent } = deps();
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d, minGapHours: 12 });
    expect(sent).toHaveLength(1);
  });

  it("skipped jobs keep title and company for the filtered-out log", async () => {
    const dir = instance();
    const pune = raw(5, {
      locations: ["Pune, Maharashtra"],
      title: "Backend Engineer 5",
      company: "Example Product Co",
    });
    const { d } = deps({ fetchCompany: async (c) => (c.slug === "exampleproduct" ? [pune] : []) });
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    const rec = Object.values(loadState(dir).seen)[0];
    expect(rec).toMatchObject({
      rule: "location",
      title: "Backend Engineer 5",
      company: "Example Product Co",
    });
  });

  it("an old skipped record without a title gains it when the job is seen again", async () => {
    const dir = instance();
    const pune = raw(6, { locations: ["Pune, Maharashtra"], title: "Backend Engineer 6" });
    const fetchCompany = async (c: { slug: string }) => (c.slug === "exampleproduct" ? [pune] : []);
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: deps({ fetchCompany }).d });
    const state = loadState(dir);
    const id = Object.keys(state.seen)[0] as string;
    state.seen[id] = {
      firstSeenAt: "2026-11-01T00:00:00.000Z",
      lastSeenAt: "2026-11-01T00:00:00.000Z",
      rule: "location",
    };
    saveState(dir, state, now);
    await runCycle({
      instanceDir: dir,
      now: new Date(now.getTime() + 86_400_000),
      env,
      dryRun: false,
      deps: deps({ fetchCompany }).d,
    });
    expect(loadState(dir).seen[id]).toMatchObject({
      title: "Backend Engineer 6",
      firstSeenAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("very long titles are cut so state stays compact", async () => {
    const dir = instance();
    const long = raw(7, { locations: ["Pune"], title: "T".repeat(500), company: "C".repeat(500) });
    const { d } = deps({ fetchCompany: async (c) => (c.slug === "exampleproduct" ? [long] : []) });
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    const rec = Object.values(loadState(dir).seen)[0];
    expect(rec?.title).toHaveLength(120);
    expect(rec?.company).toHaveLength(80);
  });

  it("one source throws: others still processed and health shows error", async () => {
    const { d, sent } = deps({
      fetchCompany: async (c) => {
        if (c.slug === "brokenco") throw new Error("HTTP 503");
        return c.slug === "exampleproduct" ? [raw(1)] : [];
      },
    });
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d });
    expect(sent[0]?.text).toContain("Backend Engineer 1");
    expect(sent[0]?.text).toMatch(/✗ lever:brokenco: HTTP 503/);
  });

  it("all providers 429: matches sent with aiUnavailable", async () => {
    const { d, sent } = deps({ chatCall: async () => ({ status: 429, text: "" }) });
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d });
    expect(sent[0]?.text).toContain("not AI-checked");
    expect(sent[0]?.text).toContain("Backend Engineer 1");
  });

  it("previously digested job not repeated", async () => {
    const dir = instance();
    const first = deps();
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: first.d });
    const second = deps();
    const later = new Date(now.getTime() + 3_600_000);
    await runCycle({ instanceDir: dir, now: later, env, dryRun: false, deps: second.d });
    expect(second.sent[0]?.subject).toContain("0 new matches");
  });

  it("user-state applied job not repeated", async () => {
    const probeDir = instance();
    await runCycle({ instanceDir: probeDir, now, env, dryRun: false, deps: deps().d });
    const jobId = Object.keys(loadState(probeDir).jobs)[0] as string;
    const dir = instance();
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(join(dir, "data", "user-state.json"), JSON.stringify({ statuses: { [jobId]: "applied" } }));
    const { d, sent } = deps();
    await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    expect(sent[0]?.subject).toContain("0 new matches");
  });

  it("send failure leaves lastSuccessfulRun unchanged", async () => {
    const dir = instance();
    saveState(dir, { ...emptyState(), lastSuccessfulRun: "2026-11-10T01:37:00.000Z" }, now);
    const { d } = deps({
      sendDigest: async () => {
        throw new Error("SMTP down");
      },
    });
    await expect(runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d })).rejects.toThrow(
      "SMTP down",
    );
    expect(loadState(dir).lastSuccessfulRun).toBe("2026-11-10T01:37:00.000Z");
  });

  it("zero jobs still sends", async () => {
    const { d, sent } = deps({ fetchCompany: async () => [] });
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d });
    expect(sent[0]?.subject).toContain("0 new matches");
  });

  it("dry run neither sends nor saves", async () => {
    const dir = instance();
    const { d, sent } = deps();
    const r = await runCycle({ instanceDir: dir, now, env, dryRun: true, deps: d });
    expect(r.sent).toBe(false);
    expect(sent).toHaveLength(0);
    expect(existsSync(join(dir, "data", "state.json"))).toBe(false);
  });

  it("serpapi enabled without key reports no key in health", async () => {
    const { d, sent } = deps();
    await runCycle({ instanceDir: instance(), now, env, dryRun: false, deps: d });
    expect(sent[0]?.text).toContain("serpapi");
    expect(sent[0]?.text).toContain("no key");
  });
});
