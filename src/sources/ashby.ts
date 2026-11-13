// Ashby public posting API. Verified live 2026-11-10: `publishedAt` is the posting date.
import { z } from "zod";
import type { Company } from "../config/schema.js";
import type { RawJob } from "../core/types.js";
import { type Fetcher, fetchJson, parseResponse } from "./http.js";

const Schema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      jobUrl: z.string(),
      publishedAt: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      secondaryLocations: z.array(z.object({ location: z.string() })).optional(),
      isListed: z.boolean().optional(),
      descriptionPlain: z.string().nullable().optional(),
    }),
  ),
});

export async function fetchAshby(c: Company, f: Fetcher = fetchJson): Promise<RawJob[]> {
  const body = await f(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=false`);
  return parseResponse("ashby", Schema, body)
    .jobs.filter((j) => j.isListed !== false)
    .map((j) => ({
      source: "ashby",
      sourceJobId: j.id,
      company: c.name,
      title: j.title,
      locations: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(
        (l): l is string => Boolean(l),
      ),
      url: j.jobUrl,
      postedAt: j.publishedAt ? new Date(j.publishedAt).toISOString() : null,
      postedAtKind: j.publishedAt ? "posted" : "first-seen",
      descriptionText: j.descriptionPlain?.trim() || null,
    }));
}
