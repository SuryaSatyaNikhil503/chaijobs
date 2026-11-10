import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawJob } from "../../src/core/types.js";
import type { RenderedDigest } from "../../src/digest/render.js";
import { type RunDeps, runCycle } from "../../src/pipeline/run.js";
import { loadState, saveState } from "../../src/state/store.js";

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

describe("runCycle", () => {
  it("sends a digest with the matching job and records state", async () => {
    const dir = instance();
    const { d, sent } = deps();
    const r = await runCycle({ instanceDir: dir, now, env, dryRun: false, deps: d });
    expect(r.sent).toBe(true);
    expect(sent[0]?.text).toContain("Backend Engineer 1");
    expect(loadState(dir).lastSuccessfulRun).toBe(now.toISOString());
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
    saveState(
      dir,
      { lastSuccessfulRun: "2026-11-10T01:37:00.000Z", imapMaxUid: 0, jobs: {}, lastHealth: [] },
      now,
    );
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
