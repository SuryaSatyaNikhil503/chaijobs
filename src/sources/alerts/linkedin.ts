// LinkedIn job-alert emails. Not yet verified against a real LinkedIn alert email, so this
// relies only on the documented public job URL shape linkedin.com/(comm/)jobs/view/<id>; the cells after a
// title link are company then location. Verify against a real alert when one arrives.
import type { RawJob } from "../../core/types.js";
import { jobLinks, stripEllipsis } from "./common.js";

const VIEW = /^https:\/\/(www\.)?linkedin\.com\/(comm\/)?jobs\/view\/(\d+)/i;

export function parseLinkedInAlert(html: string, receivedAt: string): RawJob[] {
  const jobs = new Map<string, RawJob>();
  for (const link of jobLinks(html, (h) => VIEW.test(h))) {
    const id = VIEW.exec(link.href)?.[3] as string;
    const title = link.label.join(" ").trim();
    if (!title || jobs.has(id)) continue;
    const [company = "", location = ""] = link.after;
    jobs.set(id, {
      source: "alert-linkedin",
      sourceJobId: id,
      company: stripEllipsis(company),
      title,
      locations: location ? [location] : [],
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      postedAt: receivedAt,
      postedAtKind: "email-received",
      descriptionText: null,
    });
  }
  return [...jobs.values()];
}
