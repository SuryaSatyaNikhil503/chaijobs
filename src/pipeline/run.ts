import { loadConfig } from "../config/load.js";
import type { Company, Config } from "../config/schema.js";
import type { Job, MatchVerdict, RawJob, RuleId, Verdict } from "../core/types.js";
import {
  type DigestInput,
  MAX_MATCHES,
  MAX_STUBS,
  type RenderedDigest,
  renderDigest,
} from "../digest/render.js";
import { sendDigest } from "../digest/send.js";
import { applyCheapRules } from "../filter/cheap.js";
import { decide, type RankedMatch, rank } from "../filter/decide.js";
import { type FreshnessWindow, freshnessWindow } from "../filter/freshness.js";
import { LlmCache } from "../llm/cache.js";
import { type ChatCall, openAiCompatibleCall } from "../llm/chain.js";
import { extractJdFacts, JdFacts } from "../llm/extract.js";
import { fetchAlerts, withGmailInbox } from "../sources/alerts/imap.js";
import { fetchAshby } from "../sources/ashby.js";
import { fetchGreenhouse } from "../sources/greenhouse.js";
import { fetchLever } from "../sources/lever.js";
import { fetchSerpApi } from "../sources/serpapi.js";
import {
  loadLlmCache,
  loadState,
  loadUserState,
  SEEN_COMPANY_MAX,
  SEEN_TITLE_MAX,
  type SourceHealth,
  type State,
  saveLlmCache,
  saveState,
  type UserState,
} from "../state/store.js";
import { dedupe, fallbackKeys, toJob } from "./normalise.js";

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
  /** After this long in LLM extraction, remaining jobs are decided by rules so the digest still goes out. */
  llmBudgetMs?: number;
  /**
   * Skip the run when a digest went out less than this many hours ago. Used for GitHub's own (often
   * hours-late) schedule, which stays as a fallback behind an on-time external trigger.
   */
  minGapHours?: number;
}

export interface RunResult {
  digest: RenderedDigest | null;
  sent: boolean;
  skipped?: string;
}

const FETCH_CONCURRENCY = 6;
const DEFAULT_LLM_BUDGET_MS = 8 * 60_000;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs tasks with a concurrency limit, returning results in input order. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await (tasks[i] as () => Promise<T>)();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

interface Attempt {
  jobs: RawJob[];
  health: SourceHealth;
}

async function attempt(source: string, fn: () => Promise<RawJob[]>): Promise<Attempt> {
  try {
    const jobs = await fn();
    return { jobs, health: { source, ok: true, count: jobs.length, error: null } };
  } catch (e) {
    return { jobs: [], health: { source, ok: false, count: 0, error: errorText(e) } };
  }
}

interface Fetched {
  raws: RawJob[];
  health: SourceHealth[];
  imapMaxUid: number;
}

/** Stage 1: fetch every source. A failing source is recorded in health, never fatal. */
async function fetchAll(cfg: Config, user: UserState, state: State, opts: RunOptions, deps: RunDeps) {
  const out: Fetched = { raws: [], health: [], imapMaxUid: state.imapMaxUid };
  const collect = (r: Attempt) => {
    out.raws.push(...r.jobs);
    out.health.push(r.health);
  };

  const seen = new Set<string>();
  const tasks: (() => Promise<Attempt>)[] = [];
  for (const c of [...cfg.companies, ...user.extraCompanies]) {
    const key = `${c.ats}:${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(() => attempt(key, () => deps.fetchCompany(c)));
  }
  for (const r of await pool(tasks, FETCH_CONCURRENCY)) collect(r);

  if (cfg.serpapi.enabled) {
    const key = opts.env.SERPAPI_KEY;
    if (!key) out.health.push({ source: "serpapi", ok: true, count: 0, error: "no key" });
    else {
      for (const q of cfg.serpapi.queries) {
        collect(await attempt(`serpapi:${q}`, () => deps.fetchSerpApi(q, key, opts.now)));
      }
    }
  }

  const { fetchAlerts } = deps;
  if (fetchAlerts) {
    collect(
      await attempt("alerts", async () => {
        const r = await fetchAlerts(state.imapMaxUid);
        out.imapMaxUid = Math.max(out.imapMaxUid, r.maxUid);
        return r.jobs;
      }),
    );
  }
  return out;
}

interface Judged {
  matches: RankedMatch[];
  stubs: Job[];
  skippedCounts: Partial<Record<RuleId, number>>;
  aiReason: DigestInput["aiReason"] | null;
}

interface JudgeContext {
  cfg: Config;
  state: State;
  user: UserState;
  cache: LlmCache;
  win: FreshnessWindow;
}

/** Stage 2: decide every job and update state records. Rule code decides; the LLM only extracts facts. */
async function judgeJobs(jobs: Job[], ctx: JudgeContext, opts: RunOptions, deps: RunDeps): Promise<Judged> {
  const { cfg, state, user, cache, win } = ctx;
  const nowIso = opts.now.toISOString();
  const chainKey = cfg.providers.map((p) => p.model).join("|");
  const blocked = new Set<string>();
  const llmStart = Date.now();
  const budget = opts.llmBudgetMs ?? DEFAULT_LLM_BUDGET_MS;
  const out: Judged = { matches: [], stubs: [], skippedCounts: {}, aiReason: null };
  const count = (rule: RuleId) => {
    out.skippedCounts[rule] = (out.skippedCounts[rule] ?? 0) + 1;
  };

  for (const job of jobs) {
    const full = state.jobs[job.id];
    const compact = state.seen[job.id];
    const digested = Boolean(full?.digestedAt) || fallbackKeys(job).some((k) => state.digestedKeys[k]);
    if (digested || user.statuses[job.id]) {
      count("already-seen");
      continue;
    }
    job.firstSeenAt = full?.job.firstSeenAt ?? compact?.firstSeenAt ?? job.firstSeenAt;
    // Cut by the digest cap last time: carry it over instead of re-judging freshness.
    if (full?.verdict.kind === "match") {
      state.jobs[job.id] = { ...full, lastSeenAt: nowIso };
      out.matches.push({ job: full.job, verdict: full.verdict });
      continue;
    }
    if (full?.verdict.kind === "stub" && job.isStub) {
      state.jobs[job.id] = { ...full, lastSeenAt: nowIso };
      out.stubs.push(full.job);
      continue;
    }

    let verdict: Verdict | null = applyCheapRules(job, cfg.filters, win);
    let facts: JdFacts | null = null;
    if (!verdict && !job.isStub && job.descriptionText) {
      const cached = JdFacts.safeParse(cache.get(chainKey, job.descriptionText));
      if (cached.success) facts = cached.data;
      else if (Date.now() - llmStart >= budget) out.aiReason = "time";
      else {
        const r = await extractJdFacts(job.descriptionText, cfg.providers, opts.env, deps.chatCall, blocked);
        if (r.ok) {
          facts = r.facts;
          cache.set(chainKey, job.descriptionText, r.facts, nowIso);
        } else out.aiReason = r.reason === "no-providers" ? "no-key" : "quota";
      }
    }
    verdict ??= decide(job, facts, cfg.skills, cfg.filters);

    if (verdict.kind === "skip") {
      count(verdict.rule);
      delete state.jobs[job.id];
      // Rewritten on every sighting, so records from before titles were kept heal themselves.
      state.seen[job.id] = {
        firstSeenAt: job.firstSeenAt,
        lastSeenAt: nowIso,
        rule: verdict.rule,
        title: job.title.slice(0, SEEN_TITLE_MAX),
        company: job.company.slice(0, SEEN_COMPANY_MAX),
      };
      continue;
    }
    delete state.seen[job.id];
    state.jobs[job.id] = { job, verdict, facts, digestedAt: null, lastSeenAt: nowIso };
    if (verdict.kind === "stub") out.stubs.push(job);
    else out.matches.push({ job, verdict: verdict as MatchVerdict });
  }
  return out;
}

function requireSmtp(env: RunOptions["env"]): { user: string; pass: string } {
  const user = env.GMAIL_ADDRESS;
  const pass = env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_ADDRESS and GMAIL_APP_PASSWORD must be set to send the digest");
  return { user, pass };
}

/** Stage 3: after a successful send, mark only what the email showed and commit the run. */
function commitRun(state: State, shown: Job[], fetched: Fetched, now: Date): void {
  const nowIso = now.toISOString();
  for (const job of shown) {
    const record = state.jobs[job.id];
    if (record) record.digestedAt = nowIso;
    for (const k of fallbackKeys(job)) state.digestedKeys[k] = nowIso;
  }
  state.lastSuccessfulRun = nowIso;
  state.lastHealth = fetched.health;
  state.imapMaxUid = fetched.imapMaxUid;
}

export async function runCycle(opts: RunOptions): Promise<RunResult> {
  const smtp = opts.dryRun ? null : requireSmtp(opts.env); // fail in seconds, not after the whole run
  const { instanceDir, now } = opts;
  const cfg = loadConfig(instanceDir);
  const deps: RunDeps = { ...defaultDeps, ...opts.deps };
  const gmail =
    opts.env.GMAIL_ADDRESS && opts.env.GMAIL_APP_PASSWORD
      ? { user: opts.env.GMAIL_ADDRESS, pass: opts.env.GMAIL_APP_PASSWORD }
      : null;
  const hasSenders = Object.values(cfg.alerts.senders).some((s) => s.length > 0);
  if (opts.deps?.fetchAlerts === undefined && gmail && hasSenders) {
    deps.fetchAlerts = (sinceUid) =>
      withGmailInbox(gmail, (box) => fetchAlerts(cfg.alerts, box, sinceUid, now));
  }
  const state = loadState(instanceDir);
  if (opts.minGapHours !== undefined && state.lastSuccessfulRun) {
    const hours = (now.getTime() - Date.parse(state.lastSuccessfulRun)) / 3_600_000;
    if (hours < opts.minGapHours) {
      return {
        digest: null,
        sent: false,
        skipped: `a digest was sent ${hours.toFixed(1)}h ago (minimum gap ${opts.minGapHours}h)`,
      };
    }
  }
  const user = loadUserState(instanceDir);
  const cache = new LlmCache(loadLlmCache(instanceDir));
  const win = freshnessWindow(state.lastSuccessfulRun, now, cfg.filters.windowCapHours);

  const fetched = await fetchAll(cfg, user, state, opts, deps);
  const jobs = dedupe(fetched.raws.map((r) => toJob(r, now.toISOString())));
  const judged = await judgeJobs(jobs, { cfg, state, user, cache, win }, opts, deps);
  const ranked = rank(judged.matches);
  const digest = renderDigest({
    date: now,
    matches: ranked,
    stubs: judged.stubs,
    skippedCounts: judged.skippedCounts,
    health: fetched.health,
    aiUnavailable: judged.aiReason !== null,
    ...(judged.aiReason ? { aiReason: judged.aiReason } : {}),
  });
  if (!smtp) return { digest, sent: false };

  // LLM results are worth keeping even if sending fails; job state is committed only after a send.
  cache.prune(now);
  saveLlmCache(instanceDir, cache.toJSON());
  await deps.sendDigest(digest, smtp);

  // Only what the email actually showed counts as digested; the rest rolls over to tomorrow.
  commitRun(
    state,
    [...ranked.slice(0, MAX_MATCHES).map((m) => m.job), ...judged.stubs.slice(0, MAX_STUBS)],
    fetched,
    now,
  );
  saveState(instanceDir, state, now);
  return { digest, sent: true };
}
