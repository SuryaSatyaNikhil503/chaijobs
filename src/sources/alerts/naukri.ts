// Naukri job-alert emails (sender naukrialerts@naukri.com). Structure verified against real alert emails
// (2026-11-08): each title links to /jd/job-listings-<title>-<company>-<cities>-<N-to-M-years>-<id>;
// the card cells after it are company, an optional rating, then location (often cut with "...").
// "Featured" cards link to /jd?xp=… with no job id and prefix the title with an icon letter "I".
import { createHash } from "node:crypto";
import type { RawJob } from "../../core/types.js";
import { jobLinks, stripEllipsis } from "./common.js";

const JOB_LINK = /^https:\/\/www\.naukri\.com\/jd(\/job-listings-[a-z0-9-]+)?(\?|$)/i;
const RATING = /^\d(\.\d)?$/;

export function parseNaukriAlert(html: string, receivedAt: string): RawJob[] {
  const jobs = new Map<string, RawJob>();
  for (const link of jobLinks(html, (h) => JOB_LINK.test(h))) {
    const url = new URL(link.href);
    const slug = url.pathname.startsWith("/jd/job-listings-")
      ? url.pathname.slice("/jd/job-listings-".length)
      : null;
    const label = slug ? link.label : link.label.filter((c, i) => !(i === 0 && c === "I"));
    const title = label.join(" ").trim();
    const [company = "", ...rest] = link.after.filter((c) => !RATING.test(c));
    if (!title) continue;
    const location = rest[0] ?? "";
    let cleanUrl: string;
    let id: string;
    if (slug) {
      cleanUrl = `${url.origin}${url.pathname}`;
      id = /-(\d{6,})$/.exec(slug)?.[1] ?? createHash("sha1").update(cleanUrl).digest("hex");
    } else {
      // No job id in featured links: they only resolve with the tracking params, so keep them (private repo only).
      for (const k of [...url.searchParams.keys()]) if (k.startsWith("utm_")) url.searchParams.delete(k);
      cleanUrl = url.toString();
      id = createHash("sha1").update(`${company}|${title}`).digest("hex");
    }
    if (jobs.has(id)) continue;
    // Truncated card locations ("Hyderabad, Chenna...") are completed from the slug's city words.
    const locations = [
      location,
      ...(slug && location.endsWith("...") ? [slug.replaceAll("-", " ")] : []),
    ].filter(Boolean);
    jobs.set(id, {
      source: "alert-naukri",
      sourceJobId: id,
      company: stripEllipsis(company),
      title,
      locations,
      url: cleanUrl,
      postedAt: receivedAt,
      postedAtKind: "email-received",
      descriptionText: null,
    });
  }
  return [...jobs.values()];
}
