import { convert } from "html-to-text";
import type { z } from "zod";

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export type Fetcher = (url: string) => Promise<unknown>;

const USER_AGENT = "chaijobs (+https://github.com/SuryaSatyaNikhil503/chaijobs)";

export const fetchJson: Fetcher = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new SourceError(`HTTP ${res.status} from ${new URL(url).host}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError(`non-JSON response from ${new URL(url).host}`);
  }
};

/** Validates a source response; any mismatch (HTML page, changed API) becomes a SourceError. */
export function parseResponse<T extends z.ZodType>(source: string, schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new SourceError(`${source}: unexpected response shape`);
  return result.data;
}

export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
  }).trim();
}

/** Greenhouse double-encodes HTML (&lt;p&gt;); decode the common entities before stripping tags. */
export function decodeEntities(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}
