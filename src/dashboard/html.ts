import type { Job } from "../core/types.js";
import { safeUrl } from "../digest/render.js";
import { JOB_STATUSES, type StatusEvent } from "../state/store.js";
import type { DashboardView, JobRow } from "./model.js";

/** Every interpolated value passes through here: titles, companies and JD text are untrusted. */
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const count = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const ist = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

function age(job: Job, now: Date): string {
  if (!job.postedAt) return "first seen recently";
  const h = Math.max(0, Math.round((now.getTime() - Date.parse(job.postedAt)) / 3_600_000));
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const where = (job: Job) => esc((job.cities ?? []).join(", ") || job.locations?.[0] || "Location not given");

function externalLink(job: Job, label: string): string {
  const url = safeUrl(job.url);
  return url
    ? `<a href="${esc(url)}" rel="noopener noreferrer" target="_blank">${esc(label)}</a>`
    : esc(label);
}

/** What each skip rule means, in the user's words. */
const RULE_LABEL: Record<string, string> = {
  location: "Outside your cities",
  stale: "Posted too long ago",
  "title-excluded": "Title not a fit",
  "min-years": "Asks for more experience",
  "role-type": "Not a backend role",
  "core-stack": "Core stack you don't list",
  "already-seen": "Already shown before",
};

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  skipped: "Skipped",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
  withdrawn: "Withdrawn",
};

function statusForm(r: JobRow, csrf: string): string {
  const options = [`<option value="" disabled${r.status ? "" : " selected"}>Set status</option>`]
    .concat(
      JOB_STATUSES.map(
        (s) => `<option value="${s}"${r.status === s ? " selected" : ""}>${STATUS_LABEL[s]}</option>`,
      ),
    )
    .join("");
  return `<form class="status" method="post" action="/job/${encodeURIComponent(r.id)}/status">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<label class="sr-only" for="s-${esc(r.id)}">Status</label>
<select id="s-${esc(r.id)}" name="status" required>${options}</select>
<button type="submit">Save status</button></form>`;
}

function skillsLine(r: JobRow): string {
  if (r.verdict.kind !== "match") return "";
  const v = r.verdict;
  const have = v.matched.length ? `<span class="have">✓ ${esc(v.matched.join(", "))}</span>` : "";
  const need = v.missing.length ? `<span class="need">✗ ${esc(v.missing.join(", "))}</span>` : "";
  const ai = v.aiChecked ? "" : '<span class="muted">Not AI-checked</span>';
  return [have, need, ai].filter(Boolean).length
    ? `<p class="skills">${[have, need, ai].filter(Boolean).join("&ensp;")}</p>`
    : "";
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/app.css"></head><body><main>${body}</main></body></html>`;
}

export function renderHome(v: DashboardView, csrf: string, syncNote: string | null, now: Date): string {
  const n = v.matches.length;
  const stubs = v.needsJd.length;
  const headline = v.lastRun
    ? `${n ? `${count(n)} ${plural(n, "match", "matches")}` : "No new matches"} this morning${stubs ? `, ${stubs} to check by hand` : ""}.`
    : "No runs yet.";
  const ok = v.health.filter((h) => h.ok).length;
  const failed = v.health.filter((h) => !h.ok);
  const meta = v.lastRun
    ? `Last run ${esc(ist(v.lastRun))}. ${ok} of ${v.health.length} sources OK${failed.length ? `; failing: ${failed.map((h) => esc(h.source)).join(", ")}` : ""}.`
    : "The first daily run hasn't happened yet. Run the workflow once from your instance repo's Actions tab.";

  const matches = n
    ? `<ul class="jobs">${v.matches
        .map(
          (r) =>
            `<li class="job"><div><a class="title" href="/job/${encodeURIComponent(r.id)}">${esc(r.job.title)}</a>${
              r.verdict.kind === "match" && r.verdict.band === "stretch"
                ? '<span class="chip">Stretch</span>'
                : ""
            }<div class="where">${esc(r.job.company)}, ${where(r.job)}, ${age(r.job, now)}</div>${skillsLine(r)}</div>${statusForm(r, csrf)}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">Nothing new matched your rules. Check the jobs below that need a full description.</p>`;

  const needsJd = stubs
    ? `<details><summary>Needs a full job description (${stubs})</summary><ul class="plain">${v.needsJd
        .map(
          (r) =>
            `<li>${externalLink(r.job, r.job.title)} <span class="muted">${esc(r.job.company)}, ${where(r.job)}</span></li>`,
        )
        .join("")}</ul></details>`
    : "";

  const filtered = v.filtered.length
    ? v.filtered
        .map(
          (g) =>
            `<details><summary>${esc(RULE_LABEL[g.rule] ?? g.rule)} (${g.count})</summary><ul class="plain">${g.recent
              .map((x) => `<li>${esc(x.title)} <span class="muted">${esc(x.company)}</span></li>`)
              .join("")}</ul>${
              g.untitled
                ? `<p class="muted">${g.untitled} recorded before titles were kept; they drop off within 30 days.</p>`
                : ""
            }</details>`,
        )
        .join("")
    : "";

  const counts = Object.entries(v.counts)
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${STATUS_LABEL[s]}: ${c}`)
    .join(", ");

  return page(
    "chaijobs",
    `<h1 class="headline">${esc(headline)}</h1><p class="meta">${meta}</p>
${syncNote ? `<p class="note">${esc(syncNote)}</p>` : ""}
<h2>Matches</h2>${matches}
${needsJd}${filtered ? `<h2>Filtered out</h2>${filtered}` : ""}
${counts ? `<p class="muted">Your applications so far: ${esc(counts)}.</p>` : ""}
<p class="muted"><a href="/?show=all">Show skipped and withdrawn jobs too</a></p>`,
  );
}

export function renderJob(
  d: JobRow & { history: StatusEvent[] },
  csrf: string,
  now: Date,
  syncNote: string | null = null,
): string {
  const f = d.facts;
  const facts = f
    ? `<dl class="facts"><dt>Experience</dt><dd>${f.minYears ?? "?"}${f.maxYears ? `–${f.maxYears}` : "+"} years</dd>
<dt>Must have</dt><dd>${esc(f.mustHave.join(", ") || "Not stated")}</dd>
<dt>Nice to have</dt><dd>${esc(f.niceToHave.join(", ") || "Not stated")}</dd>
<dt>Role type</dt><dd>${esc(f.roleType)}</dd>${f.applyEmail ? `<dt>Apply email</dt><dd>${esc(f.applyEmail)}</dd>` : ""}</dl>`
    : `<p class="muted">No AI-extracted facts for this job.</p>`;
  const history = d.history.length
    ? `<ul class="plain">${d.history.map((e) => `<li>${esc(STATUS_LABEL[e.status] ?? e.status)}, ${esc(ist(e.at))}</li>`).join("")}</ul>`
    : `<p class="muted">No status set yet.</p>`;
  return page(
    d.job.title,
    `<p><a href="/">Back to today</a></p>
${syncNote ? `<p class="note">${esc(syncNote)}</p>` : ""}
<h1 class="headline">${esc(d.job.title)}</h1>
<p class="meta">${esc(d.job.company)}, ${where(d.job)}, ${age(d.job, now)}. ${externalLink(d.job, "Open the posting")}</p>
${skillsLine(d)}
${statusForm(d, csrf)}
<h2>Status history</h2>${history}
<h2>What the job asks for</h2>${facts}
<h2>Job description</h2>${d.job.descriptionText ? `<pre class="jd">${esc(d.job.descriptionText)}</pre>` : `<p class="muted">No description captured. Open the posting to read it.</p>`}`,
  );
}

export function renderNotFound(): string {
  return page(
    "Not found",
    `<h1 class="headline">That job isn't in your history.</h1><p><a href="/">Back to today</a></p>`,
  );
}
