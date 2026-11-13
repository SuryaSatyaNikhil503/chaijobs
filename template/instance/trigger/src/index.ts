// chaijobs on-time trigger: a Cloudflare Worker whose cron starts your instance's daily workflow through
// GitHub's API at the exact minute. GitHub's own `schedule` stays as a backup; it often runs hours late
// and skips itself when this trigger already sent today's digest (--min-gap-hours).

export interface Env {
  /** Fine-grained GitHub token: this one repository only, permission "Actions: Read and write". */
  GITHUB_TOKEN: string;
  /** "owner/repo" of your PRIVATE instance repo. */
  GITHUB_REPO: string;
  WORKFLOW?: string;
  REF?: string;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  detail: string;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BACKOFF_MS = [5_000, 20_000];

/** Dispatches the digest workflow. 5xx and network errors are retried; auth errors are not. */
export async function dispatchDigest(
  env: Env,
  fetchFn: FetchFn = (url, init) => fetch(url, init),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<DispatchResult> {
  if (!REPO.test(env.GITHUB_REPO ?? "")) {
    return { ok: false, status: 0, detail: "GITHUB_REPO must be set to owner/repo in wrangler.toml" };
  }
  if (!env.GITHUB_TOKEN) return { ok: false, status: 0, detail: "GITHUB_TOKEN secret is not set" };
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW ?? "daily.yml"}/dispatches`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "chaijobs-trigger",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.REF ?? "main", inputs: { mode: "digest" } }),
  };
  let last: DispatchResult = { ok: false, status: 0, detail: "not attempted" };
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetchFn(url, init);
      if (res.ok) {
        const body = res.status === 204 ? "" : await res.text();
        const runUrl = /"html_url"\s*:\s*"([^"]+)"/.exec(body)?.[1];
        return { ok: true, status: res.status, detail: runUrl ?? "dispatched" };
      }
      last = { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
      if (res.status < 500) return last; // 401/403/404/422: retrying will not help
    } catch (e) {
      last = { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
    }
    const backoff = BACKOFF_MS[attempt];
    if (backoff !== undefined) await wait(backoff);
  }
  return last;
}

export default {
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      dispatchDigest(env).then((r) => {
        // Throwing marks the cron run as failed in Cloudflare's dashboard and logs.
        if (!r.ok) throw new Error(`chaijobs dispatch failed: HTTP ${r.status} ${r.detail}`);
        console.log(`chaijobs dispatched: ${r.detail}`);
      }),
    );
  },
  /** No public HTTP endpoint: nobody can trigger your workflow by visiting the worker's URL. */
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
};
