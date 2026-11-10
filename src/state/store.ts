import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Company, CompanySchema } from "../config/schema.js";
import type { Job, Verdict } from "../core/types.js";
import type { JdFacts } from "../llm/extract.js";

export interface JobRecord {
  job: Job;
  verdict: Verdict;
  facts: JdFacts | null;
  digestedAt: string | null;
}

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
  lastHealth: SourceHealth[];
}

/** Written by the laptop app (Plan 3); the cloud cycle only reads it. */
export interface UserState {
  statuses: Record<string, string>;
  extraCompanies: Company[];
}

const PRUNE_DAYS = 30;
const DAY = 86_400_000;

export const emptyState = (): State => ({ lastSuccessfulRun: null, imapMaxUid: 0, jobs: {}, lastHealth: [] });

const dataPath = (dir: string, file: string) => join(dir, "data", file);

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function loadState(dir: string): State {
  const raw = readJson(dataPath(dir, "state.json")) as Partial<State> | undefined;
  return { ...emptyState(), ...raw };
}

export function saveState(dir: string, s: State, now: Date = new Date()): void {
  const cutoff = now.getTime() - PRUNE_DAYS * DAY;
  const jobs = Object.fromEntries(
    Object.entries(s.jobs).filter(([, r]) => Date.parse(r.job.firstSeenAt) >= cutoff),
  );
  writeJsonAtomic(dataPath(dir, "state.json"), { ...s, jobs });
}

const UserStateSchema = z.object({
  statuses: z.record(z.string(), z.string()).default({}),
  extraCompanies: z.array(CompanySchema).default([]),
});

export function loadUserState(dir: string): UserState {
  return UserStateSchema.parse(readJson(dataPath(dir, "user-state.json")) ?? {});
}

export function loadLlmCache(dir: string): Record<string, unknown> {
  return (readJson(dataPath(dir, "llm-cache.json")) as Record<string, unknown> | undefined) ?? {};
}

export function saveLlmCache(dir: string, entries: Record<string, unknown>): void {
  writeJsonAtomic(dataPath(dir, "llm-cache.json"), entries);
}
