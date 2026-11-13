import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Company, CompanySchema } from "../config/schema.js";
import type { Job, RuleId, Verdict } from "../core/types.js";
import type { JdFacts } from "../llm/extract.js";

/** Full record, kept only for jobs that matched or need a JD (the ones a digest can show). */
export interface JobRecord {
  job: Job;
  verdict: Verdict;
  facts: JdFacts | null;
  digestedAt: string | null;
  /** Last run that saw this job; pruning uses it so long-listed jobs are not re-announced. */
  lastSeenAt?: string;
}

/** Compact record for skipped jobs: enough for freshness and auditing, without the JD text. */
export interface SeenRecord {
  firstSeenAt: string;
  lastSeenAt: string;
  rule: RuleId;
  /** For the dashboard's filtered-out log. Optional: records written before 2026-11-13 have none. */
  title?: string;
  company?: string;
}

export const SEEN_TITLE_MAX = 120;
export const SEEN_COMPANY_MAX = 80;

export interface SourceHealth {
  source: string;
  ok: boolean;
  count: number;
  error: string | null;
}

export interface State {
  lastSuccessfulRun: string | null;
  imapMaxUid: number;
  jobs: Record<string, JobRecord>;
  seen: Record<string, SeenRecord>;
  lastHealth: SourceHealth[];
  /** company|title|city keys of digested jobs, so the same job from another source is not repeated. */
  digestedKeys: Record<string, string>;
}

export const JOB_STATUSES = ["applied", "skipped", "interview", "rejected", "offer", "withdrawn"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface StatusEvent {
  id: string;
  status: JobStatus;
  at: string;
}

/** Written by the laptop app (the dashboard); the cloud cycle only reads it. */
export interface UserState {
  statuses: Record<string, string>;
  extraCompanies: Company[];
  history: StatusEvent[];
}

const PRUNE_DAYS = 30;
const DAY = 86_400_000;

export const emptyState = (): State => ({
  lastSuccessfulRun: null,
  imapMaxUid: 0,
  jobs: {},
  seen: {},
  lastHealth: [],
  digestedKeys: {},
});

const dataPath = (dir: string, file: string) => join(dir, "data", file);

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

export function writeAtomic(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** One entry per line: small daily diffs, so git history grows by what changed, not by the whole file. */
export function linesObject(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n  }`;
}

export function stringifyState(s: State): string {
  return [
    "{",
    `  "lastSuccessfulRun": ${JSON.stringify(s.lastSuccessfulRun)},`,
    `  "imapMaxUid": ${JSON.stringify(s.imapMaxUid)},`,
    `  "lastHealth": ${JSON.stringify(s.lastHealth)},`,
    `  "jobs": ${linesObject(s.jobs)},`,
    `  "seen": ${linesObject(s.seen)},`,
    `  "digestedKeys": ${linesObject(s.digestedKeys)}`,
    "}",
    "",
  ].join("\n");
}

export function loadState(dir: string): State {
  const raw = (readJson(dataPath(dir, "state.json")) ?? {}) as Partial<State>;
  const state: State = {
    ...emptyState(),
    ...raw,
    seen: { ...raw.seen },
    digestedKeys: { ...raw.digestedKeys },
  };
  // Older files kept full records for skipped jobs; fold them into the compact form.
  for (const [id, r] of Object.entries(state.jobs)) {
    if (r.verdict.kind === "skip") {
      state.seen[id] = {
        firstSeenAt: r.job.firstSeenAt,
        lastSeenAt: r.lastSeenAt ?? r.job.firstSeenAt,
        rule: r.verdict.rule,
      };
      delete state.jobs[id];
    }
  }
  return state;
}

export function saveState(dir: string, s: State, now: Date = new Date()): void {
  const cutoff = now.getTime() - PRUNE_DAYS * DAY;
  const fresh = (iso: string) => Date.parse(iso) >= cutoff;
  writeAtomic(
    dataPath(dir, "state.json"),
    stringifyState({
      ...s,
      jobs: Object.fromEntries(
        Object.entries(s.jobs).filter(([, r]) => fresh(r.lastSeenAt ?? r.job.firstSeenAt)),
      ),
      seen: Object.fromEntries(Object.entries(s.seen ?? {}).filter(([, r]) => fresh(r.lastSeenAt))),
      digestedKeys: Object.fromEntries(Object.entries(s.digestedKeys ?? {}).filter(([, at]) => fresh(at))),
    }),
  );
}

const StatusEventSchema = z.object({ id: z.string(), status: z.enum(JOB_STATUSES), at: z.string() });

const UserStateSchema = z.object({
  statuses: z.record(z.string(), z.string()).default({}),
  extraCompanies: z.array(CompanySchema).default([]),
  // Lenient on purpose: a status this version doesn't know (newer dashboard, hand edit) is dropped, never fatal,
  // because the cloud run reads this file and must still send the digest.
  history: z
    .array(z.unknown())
    .default([])
    .transform((events) => events.filter((e): e is StatusEvent => StatusEventSchema.safeParse(e).success)),
});

export function loadUserState(dir: string): UserState {
  return UserStateSchema.parse(readJson(dataPath(dir, "user-state.json")) ?? {});
}

export function loadLlmCache(dir: string): Record<string, unknown> {
  return (readJson(dataPath(dir, "llm-cache.json")) as Record<string, unknown> | undefined) ?? {};
}

export function saveLlmCache(dir: string, entries: Record<string, unknown>): void {
  writeAtomic(
    dataPath(dir, "llm-cache.json"),
    `${linesObject(entries)
      .replaceAll("\n    ", "\n  ")
      .replace(/\n {2}}$/, "\n}")}\n`,
  );
}
