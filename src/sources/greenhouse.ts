// Greenhouse Job Board API. Verified live 2026-11-10: `first_published` is the posting date;
// `updated_at` changes on edits and must not be used for freshness.
import { z } from "zod";
import type { Company } from "../config/schema.js";
import type { RawJob } from "../core/types.js";
import { decodeEntities, type Fetcher, fetchJson, htmlToText, parseResponse } from "./http.js";

const Schema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      title: z.string(),
      absolute_url: z.string(),
      company_name: z.string().optional(),
      first_published: z.string().nullable().optional(),
      location: z.object({ name: z.string() }).nullable().optional(),
      content: z.string().nullable().optional(),
    }),
  ),
});

export async function fetchGreenhouse(c: Company, f: Fetcher = fetchJson): Promise<RawJob[]> {
  const body = await f(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
  return parseResponse("greenhouse", Schema, body).jobs.map((j) => ({
    source: "greenhouse",
    sourceJobId: String(j.id),
    company: j.company_name ?? c.name,
    title: j.title,
    locations: j.location?.name ? [j.location.name] : [],
    url: j.absolute_url,
    postedAt: j.first_published ? new Date(j.first_published).toISOString() : null,
    postedAtKind: j.first_published ? "posted" : "first-seen",
    descriptionText: j.content ? htmlToText(decodeEntities(j.content)) : null,
  }));
}
