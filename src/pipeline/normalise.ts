import { createHash } from "node:crypto";
import type { Job, RawJob } from "../core/types.js";
import { normaliseLocation } from "../filter/location.js";

const LEGAL_SUFFIXES =
  /\b(private limited|pvt\.? ltd\.?|pvt|ltd\.?|limited|inc\.?|llc|llp|technologies|technology|india|solutions|software|services)\b/g;

export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const normTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const TRACKING_PARAM = /^(utm_.*|lever-source|gh_src|source|src|ref|refid|trk|trackingid|from|origin)$/i;
const BOARD_HOSTS = /(^|\.)(linkedin\.com|naukri\.com|indeed\.com|google\.com)$/i;

function canonicalUrl(url: string): string | null {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    u.hash = "";
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

export function fallbackKey(job: Pick<Job, "companyKey" | "title" | "cities">): string {
  return `${job.companyKey}|${normTitle(job.title)}|${job.cities[0] ?? ""}`;
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** Canonical apply URL when it identifies the job; job-board redirect URLs fall back to company|title|city. */
export function jobId(job: Pick<Job, "url" | "companyKey" | "title" | "cities">): string {
  const canonical = canonicalUrl(job.url);
  let host = "";
  try {
    host = new URL(job.url).host;
  } catch {}
  if (canonical && !BOARD_HOSTS.test(host)) return sha1(canonical);
  return sha1(fallbackKey(job));
}

export function toJob(raw: RawJob, nowIso: string): Job {
  const loc = normaliseLocation(raw.locations);
  const partial = {
    ...raw,
    companyKey: companyKey(raw.company),
    cities: loc.cities,
    southIndia: loc.southIndia,
    remoteIndia: loc.remoteIndia,
    isStub: raw.descriptionText === null,
    firstSeenAt: nowIso,
  };
  return { ...partial, id: jobId(partial) };
}

const SOURCE_RANK: Record<string, number> = { greenhouse: 0, lever: 0, ashby: 0, serpapi: 1 };

function better(a: Job, b: Job): Job {
  if (a.isStub !== b.isStub) return a.isStub ? b : a;
  if ((a.postedAtKind === "posted") !== (b.postedAtKind === "posted"))
    return a.postedAtKind === "posted" ? a : b;
  return (SOURCE_RANK[a.source] ?? 2) <= (SOURCE_RANK[b.source] ?? 2) ? a : b;
}

/** Collapses jobs sharing an id or a company|title|city key, keeping the most complete one. */
export function dedupe(jobs: Job[]): Job[] {
  const groupOf = new Map<string, number>();
  const kept: Job[] = [];
  for (const job of jobs) {
    const keys = [`id:${job.id}`, `fk:${fallbackKey(job)}`];
    const existing = keys.map((k) => groupOf.get(k)).find((g) => g !== undefined);
    if (existing === undefined) {
      kept.push(job);
      for (const k of keys) groupOf.set(k, kept.length - 1);
    } else {
      kept[existing] = better(kept[existing] as Job, job);
      for (const k of keys) groupOf.set(k, existing);
    }
  }
  return kept;
}
