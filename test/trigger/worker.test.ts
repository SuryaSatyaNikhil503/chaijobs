import { describe, expect, it } from "vitest";
import worker, { dispatchDigest, type Env } from "../../template/instance/trigger/src/index.js";

const env: Env = { GITHUB_TOKEN: "ghp_secret", GITHUB_REPO: "someone/chaijobs-instance" };
const noWait = async () => {};

function recorder(statuses: number[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = statuses.shift() ?? 200;
    const body = status === 200 ? JSON.stringify({ html_url: "https://github.com/run/1" }) : "boom";
    return new Response(body, { status });
  };
  return { calls, fetchFn };
}

describe("dispatchDigest", () => {
  it("posts a workflow_dispatch for daily.yml on main in digest mode", async () => {
    const { calls, fetchFn } = recorder([200]);
    const r = await dispatchDigest(env, fetchFn, noWait);
    expect(r).toEqual({ ok: true, status: 200, detail: "https://github.com/run/1" });
    expect(calls[0]?.url).toBe(
      "https://api.github.com/repos/someone/chaijobs-instance/actions/workflows/daily.yml/dispatches",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ghp_secret");
    expect(headers["X-GitHub-Api-Version"]).toBe("2026-03-10");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ ref: "main", inputs: { mode: "digest" } });
  });

  it("accepts the older 204 response too", async () => {
    const { fetchFn } = recorder([204]);
    expect((await dispatchDigest(env, fetchFn, noWait)).ok).toBe(true);
  });

  it("retries GitHub 5xx and succeeds", async () => {
    const { calls, fetchFn } = recorder([502, 200]);
    expect((await dispatchDigest(env, fetchFn, noWait)).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("does not retry a 401 and never echoes the token", async () => {
    const { calls, fetchFn } = recorder([401]);
    const r = await dispatchDigest(env, fetchFn, noWait);
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("ghp_secret");
  });

  it("refuses a malformed repo setting", async () => {
    const { calls, fetchFn } = recorder([200]);
    const r = await dispatchDigest({ ...env, GITHUB_REPO: "__GITHUB_REPO__" }, fetchFn, noWait);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("worker", () => {
  it("exposes no public HTTP trigger", async () => {
    const res = await worker.fetch();
    expect(res.status).toBe(404);
  });
});
