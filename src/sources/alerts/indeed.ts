// Indeed emails, structure verified against real alert and match emails (2026-11):
// - Job alerts (donotreply@jobalert.indeed.com): titles link to in.indeed.com/rc/clk/dl?jk=<key>; the cells
//   after are company, location, optional salary / "Easily apply", then "N days ago".
// - Job matches (donotreply@match.indeed.com): every link is cts.indeed.com/v3/<token>/<sig> where the token
//   is base64url(gzip(JSON {m, u})) and u is the real rc/clk?jk=<key> link.
import { gunzipSync } from "node:zlib";
import type { RawJob } from "../../core/types.js";
import { parseRelativePosted } from "../../filter/freshness.js";
import { jobLinks, stripEllipsis } from "./common.js";

const viewUrl = (jk: string) => `https://in.indeed.com/viewjob?jk=${jk}`;
const AGE = /^(\d+\+?\s*(minute|hour|day|week|month)s?\s+ago|just posted|today)$/i;

function jkOf(href: string): string | null {
  try {
    const jk = new URL(href).searchParams.get("jk");
    return jk && /^[a-z0-9]{8,32}$/i.test(jk) ? jk : null;
  } catch {
    return null;
  }
}

export function parseIndeedAlert(html: string, receivedAt: string): RawJob[] {
  const jobs = new Map<string, RawJob>();
  for (const link of jobLinks(
    html,
    (h) => /^https:\/\/[a-z]+\.indeed\.com\/rc\/clk/i.test(h) && jkOf(h) !== null,
  )) {
    const jk = jkOf(link.href) as string;
    const title = link.label.join(" ").trim();
    if (!title || jobs.has(jk)) continue;
    const [company = "", location = ""] = link.after;
    const age = link.after.find((c) => AGE.test(c));
    const posted = age ? parseRelativePosted(age, new Date(receivedAt)) : null;
    jobs.set(jk, {
      source: "alert-indeed",
      sourceJobId: jk,
      company: stripEllipsis(company),
      title,
      locations: location ? [location] : [],
      url: viewUrl(jk),
      postedAt: posted ?? receivedAt,
      postedAtKind: posted ? "posted" : "email-received",
      descriptionText: null,
    });
  }
  return [...jobs.values()];
}

/** Returns the real target of a cts.indeed.com wrapped link, or null when it is not a decodable token. */
export function decodeIndeedTracking(href: string): string | null {
  const m = /^https:\/\/cts\.indeed\.com\/v3\/([A-Za-z0-9_-]+)\//.exec(href);
  if (!m?.[1]) return null;
  try {
    const json = JSON.parse(gunzipSync(Buffer.from(m[1], "base64url")).toString("utf8")) as { u?: unknown };
    return typeof json.u === "string" ? json.u : null;
  } catch {
    return null;
  }
}

const ACTION_LABEL = /^(view job|apply|this is a bad match|pause these emails|unsubscribe)$/i;

export function parseIndeedMatch(html: string, receivedAt: string): RawJob[] {
  const jobs = new Map<string, RawJob>();
  const links = jobLinks(html, (h) => {
    const target = decodeIndeedTracking(h);
    return target !== null && jkOf(target) !== null;
  });
  for (const link of links) {
    const jk = jkOf(decodeIndeedTracking(link.href) as string) as string;
    const title = link.label.join(" ").trim();
    if (!title || ACTION_LABEL.test(title) || jobs.has(jk)) continue;
    const [company = "", location = ""] = link.after;
    jobs.set(jk, {
      source: "alert-indeed",
      sourceJobId: jk,
      company: stripEllipsis(company),
      title,
      locations: location ? [location] : [],
      url: viewUrl(jk),
      postedAt: receivedAt,
      postedAtKind: "email-received",
      descriptionText: null,
    });
  }
  return [...jobs.values()];
}
