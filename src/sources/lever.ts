// Lever Postings API. Verified live 2026-11-10: `createdAt` (epoch millis) is the posting date.
import { z } from "zod";
import type { Company } from "../config/schema.js";
import type { RawJob } from "../core/types.js";
import { type Fetcher, fetchJson, htmlToText, parseResponse } from "./http.js";

const Schema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    createdAt: z.number().optional(),
    categories: z
      .object({ location: z.string().optional(), allLocations: z.array(z.string()).optional() })
      .optional(),
    descriptionPlain: z.string().optional(),
    lists: z.array(z.object({ text: z.string().optional(), content: z.string() })).optional(),
    additionalPlain: z.string().optional(),
  }),
);

export async function fetchLever(c: Company, f: Fetcher = fetchJson): Promise<RawJob[]> {
  const body = await f(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  return parseResponse("lever", Schema, body).map((j) => {
    const lists = (j.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content)}`).join("\n");
    const text = [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n").trim();
    const locations = j.categories?.allLocations ?? (j.categories?.location ? [j.categories.location] : []);
    return {
      source: "lever",
      sourceJobId: j.id,
      company: c.name,
      title: j.text,
      locations,
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      postedAtKind: j.createdAt ? "posted" : "first-seen",
      descriptionText: text || null,
    };
  });
}
