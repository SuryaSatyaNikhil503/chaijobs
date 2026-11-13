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

const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

/** Reads the body while counting bytes, so a misbehaving board cannot exhaust memory. */
async function readCapped(res: Response, maxBytes: number, host: string): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SourceError(`response too large from ${host}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchJson(url: string, opts: { maxBytes?: number } = {}): Promise<unknown> {
  const host = new URL(url).host;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new SourceError(`HTTP ${res.status} from ${host}`);
  const text = await readCapped(res, opts.maxBytes ?? MAX_RESPONSE_BYTES, host);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError(`non-JSON response from ${host}`);
  }
}

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
