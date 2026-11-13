import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Job } from "../../src/core/types.js";
import { startDashboard } from "../../src/dashboard/server.js";
import { emptyState, loadUserState, saveState } from "../../src/state/store.js";

const now = new Date("2026-11-13T06:00:00Z");
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

function instance() {
  const dir = mkdtempSync(join(tmpdir(), "chaijobs-dash-"));
  const s = emptyState();
  s.lastSuccessfulRun = "2026-11-13T01:38:00.000Z";
  s.jobs.a = {
    job: {
      id: "a",
      title: "Backend A",
      company: "Example",
      cities: ["Chennai"],
      locations: ["Chennai"],
      url: "https://example.com",
      postedAt: "2026-11-13T01:00:00.000Z",
      isStub: false,
      descriptionText: "JD",
      firstSeenAt: "2026-11-13T01:38:00.000Z",
    } as Job,
    verdict: { kind: "match", band: "strong", aiChecked: true, matched: ["Java"], missing: [], score: 1 },
    facts: null,
    digestedAt: "x",
  };
  saveState(dir, s, now);
  return dir;
}

async function start(dir = instance()) {
  const d = await startDashboard({ instanceDir: dir, port: 0, sync: false, now: () => now });
  close = d.close;
  return { ...d, dir };
}

/** Raw request so tests can send headers fetch() would not allow (Host). */
function raw(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const req = request(url, { method: opts.method ?? "GET", headers: opts.headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end(opts.body);
  });
}

const csrfFrom = (html: string) => /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

describe("dashboard server", () => {
  it("binds to 127.0.0.1 and serves home with security headers", async () => {
    const { url } = await start();
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toContain("Backend A");
  });

  it("referrer policy lets browsers send the real Origin on form posts (no-referrer makes it null)", async () => {
    const { url } = await start();
    expect((await fetch(url)).headers.get("referrer-policy")).toBe("same-origin");
  });

  it("still rejects a null Origin (sandboxed frames, local files)", async () => {
    const { url, dir } = await start();
    const csrf = csrfFrom(await (await fetch(url)).text());
    const res = await fetch(`${url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "null" },
      body: form({ csrf, status: "applied" }),
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(existsSync(join(dir, "data", "user-state.json"))).toBe(false);
  });

  it("rejects a foreign Host header with 421", async () => {
    const { url } = await start();
    const res = await raw(url, { headers: { Host: "evil.example" } });
    expect(res.status).toBe(421);
  });

  it("rejects POST without the csrf token with 403 and writes nothing", async () => {
    const { url, dir } = await start();
    const res = await fetch(`${url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ status: "applied" }),
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(existsSync(join(dir, "data", "user-state.json"))).toBe(false);
  });

  it("rejects POST with a foreign Origin with 403", async () => {
    const { url, dir } = await start();
    const csrf = csrfFrom(await (await fetch(url)).text());
    const res = await fetch(`${url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
      body: form({ csrf, status: "applied" }),
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    expect(existsSync(join(dir, "data", "user-state.json"))).toBe(false);
  });

  it("valid status POST writes user-state and redirects to the job", async () => {
    const { url, dir } = await start();
    const csrf = csrfFrom(await (await fetch(url)).text());
    const res = await fetch(`${url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: url },
      body: form({ csrf, status: "applied" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/job/a");
    expect(loadUserState(dir).statuses).toEqual({ a: "applied" });
  });

  it("unknown job id is 404 and invalid status is 400, neither writes", async () => {
    const { url, dir } = await start();
    const csrf = csrfFrom(await (await fetch(url)).text());
    const post = (id: string, status: string) =>
      fetch(`${url}/job/${id}/status`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form({ csrf, status }),
        redirect: "manual",
      });
    expect((await post("nope", "applied")).status).toBe(404);
    expect((await post("a", "hired-by-magic")).status).toBe(400);
    expect(existsSync(join(dir, "data", "user-state.json"))).toBe(false);
  });

  it("saving works when the dashboard is opened as localhost", async () => {
    const { url, dir } = await start();
    const local = url.replace("127.0.0.1", "localhost");
    const csrf = csrfFrom(await (await fetch(local)).text());
    const res = await fetch(`${local}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: local },
      body: form({ csrf, status: "interview" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(loadUserState(dir).statuses).toEqual({ a: "interview" });
  });

  it("job page shows the sync note after a save", async () => {
    const { url } = await start();
    const csrf = csrfFrom(await (await fetch(url)).text());
    await fetch(`${url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ csrf, status: "applied" }),
      redirect: "manual",
    });
    expect(await (await fetch(`${url}/job/a`)).text()).toContain("Sync is off");
  });

  it("a save responds at once while the push runs in the background", async () => {
    const dir = instance();
    let releasePush: () => void = () => {};
    const git = async (args: string[], cwd: string) => {
      if (args[0] === "rev-parse") return realpathSync(cwd);
      if (args[0] === "push") await new Promise<void>((r) => (releasePush = r));
      return "";
    };
    const d = await startDashboard({ instanceDir: dir, port: 0, sync: true, now: () => now, git });
    close = d.close;
    const csrf = csrfFrom(await (await fetch(d.url)).text());
    const started = Date.now();
    const res = await fetch(`${d.url}/job/a/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form({ csrf, status: "applied" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(await (await fetch(`${d.url}/job/a`)).text()).toContain("Saving to your instance repo");
    releasePush();
  });

  it("serves the stylesheet and 404s unknown paths", async () => {
    const { url } = await start();
    expect((await fetch(`${url}/app.css`)).headers.get("content-type")).toContain("text/css");
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });
});
