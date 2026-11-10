import { loadConfig } from "../config/load.js";
import type { Company } from "../config/schema.js";
import type { Job, MatchVerdict, RawJob, RuleId, Verdict } from "../core/types.js";
import { type RenderedDigest, renderDigest } from "../digest/render.js";
import { sendDigest } from "../digest/send.js";
import { applyCheapRules } from "../filter/cheap.js";
import { decide, rank } from "../filter/decide.js";
import { freshnessWindow } from "../filter/freshness.js";
import { LlmCache } from "../llm/cache.js";
import { type ChatCall, openAiCompatibleCall } from "../llm/chain.js";
import { extractJdFacts, JdFacts } from "../llm/extract.js";
import { fetchAshby } from "../sources/ashby.js";
import { fetchGreenhouse } from "../sources/greenhouse.js";
import { fetchLever } from "../sources/lever.js";
import { fetchSerpApi } from "../sources/serpapi.js";
import {
  type JobRecord,
  loadLlmCache,
  loadState,
  loadUserState,
  type SourceHealth,
  saveLlmCache,
  saveState,
} from "../state/store.js";
import { dedupe, toJob } from "./normalise.js";

export interface RunDeps {
  fetchCompany: (c: Company) => Promise<RawJob[]>;
  fetchSerpApi: (query: string, apiKey: string, now: Date) => Promise<RawJob[]>;
  /** null when IMAP alerts are not wired; returns jobs plus the highest UID seen. */
  fetchAlerts: ((sinceUid: number) => Promise<{ jobs: RawJob[]; maxUid: number }>) | null;
  chatCall: ChatCall;
  sendDigest: (m: RenderedDigest, smtp: { user: string; pass: string }) => Promise<void>;
}

const ADAPTERS: Record<Company["ats"], (c: Company) => Promise<RawJob[]>> = {
  greenhouse: (c) => fetchGreenhouse(c),
  lever: (c) => fetchLever(c),
  ashby: (c) => fetchAshby(c),
};

export const defaultDeps: RunDeps = {
  fetchCompany: (c) => ADAPTERS[c.ats](c),
  fetchSerpApi: (q, key, now) => fetchSerpApi(q, key, now),
  fetchAlerts: null,
  chatCall: openAiCompatibleCall,
  sendDigest,
};

export interface RunOptions {
  instanceDir: string;
  now: Date;
  env: Record<string, string | undefined>;
  dryRun: boolean;
  deps?: Partial<RunDeps>;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runCycle(opts: RunOptions): Promise<{ digest: RenderedDigest; sent: boolean }> {
  const deps: RunDeps = { ...defaultDeps, ...opts.deps };
  const { instanceDir, now, env } = opts;
  const nowIso = now.toISOString();
  const cfg = loadConfig(instanceDir);
  const state = loadState(instanceDir);
  const user = loadUserState(instanceDir);
  const cache = new LlmCache(loadLlmCache(instanceDir));
  const win = freshnessWindow(state.lastSuccessfulRun, now, cfg.filters.windowCapHours);

  // 1. Fetch every source; a failure is recorded, never fatal.
  const raws: RawJob[] = [];
  const health: SourceHealth[] = [];
  const track = async (source: string, fn: () => Promise<RawJob[]>) => {
    try {
      const jobs = await fn();
      raws.push(...jobs);
      health.push({ source, ok: true, count: jobs.length, error: null });
    } catch (e) {
      health.push({ source, ok: false, count: 0, error: errorText(e) });
    }
  };
  const seen = new Set<string>();
  for (const c of [...cfg.companies, ...user.extraCompanies]) {
    const key = `${c.ats}:${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await track(key, () => deps.fetchCompany(c));
  }
  if (cfg.serpapi.enabled) {
    const key = env.SERPAPI_KEY;
    if (!key) health.push({ source: "serpapi", ok: true, count: 0, error: "no key" });
    else
      for (const q of cfg.serpapi.queries) await track(`serpapi:${q}`, () => deps.fetchSerpApi(q, key, now));
  }
  let imapMaxUid = state.imapMaxUid;
  if (deps.fetchAlerts) {
    const fetchAlerts = deps.fetchAlerts;
    await track("alerts", async () => {
      const r = await fetchAlerts(state.imapMaxUid);
      imapMaxUid = Math.max(imapMaxUid, r.maxUid);
      return r.jobs;
    });
  }

  // 2. Normalise, dedupe, decide.
  const jobs = dedupe(raws.map((r) => toJob(r, nowIso)));
  const chainKey = cfg.providers.map((p) => p.model).join("|");
  const skippedCounts: Partial<Record<RuleId, number>> = {};
  const matches: { job: Job; verdict: MatchVerdict }[] = [];
  const stubs: Job[] = [];
  let aiUnavailable = false;

  for (const job of jobs) {
    const previous = state.jobs[job.id];
    if (previous?.digestedAt || user.statuses[job.id]) {
      skippedCounts["already-seen"] = (skippedCounts["already-seen"] ?? 0) + 1;
      continue;
    }
    if (previous) job.firstSeenAt = previous.job.firstSeenAt;
    let verdict: Verdict | null = applyCheapRules(job, cfg.filters, win);
    let facts: JdFacts | null = null;
    if (!verdict && !job.isStub && job.descriptionText) {
      const cached = JdFacts.safeParse(cache.get(chainKey, job.descriptionText));
      if (cached.success) facts = cached.data;
      else {
        const r = await extractJdFacts(job.descriptionText, cfg.providers, env, deps.chatCall);
        if (r.ok) {
          facts = r.facts;
          cache.set(chainKey, job.descriptionText, r.facts);
        } else aiUnavailable = true;
      }
    }
    verdict ??= decide(job, facts, cfg.skills, cfg.filters);
    state.jobs[job.id] = { job, verdict, facts, digestedAt: null } satisfies JobRecord;
    if (verdict.kind === "skip") skippedCounts[verdict.rule] = (skippedCounts[verdict.rule] ?? 0) + 1;
    else if (verdict.kind === "stub") stubs.push(job);
    else matches.push({ job, verdict });
  }

  const ranked = rank(matches);
  const digest = renderDigest({ date: now, matches: ranked, stubs, skippedCounts, health, aiUnavailable });
  if (opts.dryRun) return { digest, sent: false };

  // 3. Send, then (and only then) mark the run successful.
  const user_ = env.GMAIL_ADDRESS;
  const pass = env.GMAIL_APP_PASSWORD;
  if (!user_ || !pass) throw new Error("GMAIL_ADDRESS and GMAIL_APP_PASSWORD must be set to send the digest");
  await deps.sendDigest(digest, { user: user_, pass });

  for (const { job } of ranked) (state.jobs[job.id] as JobRecord).digestedAt = nowIso;
  for (const job of stubs) (state.jobs[job.id] as JobRecord).digestedAt = nowIso;
  state.lastSuccessfulRun = nowIso;
  state.lastHealth = health;
  state.imapMaxUid = imapMaxUid;
  saveState(instanceDir, state, now);
  saveLlmCache(instanceDir, cache.toJSON());
  return { digest, sent: true };
}
