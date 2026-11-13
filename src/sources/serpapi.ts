// SerpApi google_jobs engine. Field names follow SerpApi's documented response; confirm with one
// live call once a key is configured (see ledger ruling for Task 6).
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RawJob } from "../core/types.js";
import { parseRelativePosted } from "../filter/freshness.js";
import { type Fetcher, fetchJson, parseResponse, SourceError } from "./http.js";

const Schema = z.object({
  jobs_results: z
    .array(
      z.object({
        title: z.string(),
        company_name: z.string(),
        location: z.string().optional(),
        share_link: z.string().optional(),
        description: z.string().optional(),
        job_id: z.string().optional(),
        detected_extensions: z.object({ posted_at: z.string().optional() }).optional(),
        apply_options: z.array(z.object({ link: z.string() })).optional(),
      }),
    )
    .default([]),
});

export async function fetchSerpApi(
  query: string,
  apiKey: string,
  now: Date,
  f: Fetcher = fetchJson,
): Promise<RawJob[]> {
  if (!apiKey) throw new SourceError("serpapi: no key");
  const params = new URLSearchParams({
    engine: "google_jobs",
    q: query,
    gl: "in",
    hl: "en",
    api_key: apiKey,
  });
  const body = await f(`https://serpapi.com/search.json?${params}`);
  return parseResponse("serpapi", Schema, body).jobs_results.map((j) => {
    const posted = j.detected_extensions?.posted_at
      ? parseRelativePosted(j.detected_extensions.posted_at, now)
      : null;
    const url = j.apply_options?.[0]?.link ?? j.share_link ?? "";
    return {
      source: "serpapi",
      sourceJobId: j.job_id ?? createHash("sha1").update(`${j.company_name}|${j.title}|${url}`).digest("hex"),
      company: j.company_name,
      title: j.title,
      locations: j.location ? [j.location] : [],
      url,
      postedAt: posted,
      postedAtKind: posted ? "posted" : "first-seen",
      descriptionText: j.description?.trim() || null,
    };
  });
}
