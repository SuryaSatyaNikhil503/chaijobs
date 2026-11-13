import type { Job, MatchVerdict, RuleId } from "../core/types.js";
import type { SourceHealth } from "../state/store.js";

export interface DigestInput {
  date: Date;
  matches: { job: Job; verdict: MatchVerdict }[];
  stubs: Job[];
  skippedCounts: Partial<Record<RuleId, number>>;
  health: SourceHealth[];
  aiUnavailable: boolean;
  /** Why AI checks were unavailable: no key configured, or every provider rate-limited/failed. */
  aiReason?: "no-key" | "quota" | "time";
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export const MAX_MATCHES = 25;
export const MAX_STUBS = 25;

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Only http(s) links become clickable; anything else (javascript:, data:) is shown as plain text. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const link = (url: string, label: string, style: string) => {
  const safe = safeUrl(url);
  return safe
    ? `<a href="${esc(safe)}" style="${style}">${esc(label)}</a>`
    : `<span style="${style}">${esc(label)}</span>`;
};

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(d);

function postedAge(job: Job, now: Date): string {
  if (!job.postedAt) return "first seen today";
  const hours = Math.max(0, Math.round((now.getTime() - Date.parse(job.postedAt)) / 3_600_000));
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const where = (job: Job) =>
  job.cities.length ? job.cities.join(", ") : job.remoteIndia ? "Remote (India)" : "";

export function renderDigest(d: DigestInput): RenderedDigest {
  const n = d.matches.length;
  const alerts = d.stubs.length ? ` · ${d.stubs.length} from alerts` : "";
  const subject = `☕ chaijobs · ${n} new match${n === 1 ? "" : "es"}${alerts} · ${dayLabel(d.date)}`;
  const shown = d.matches.slice(0, MAX_MATCHES);
  const more = n - shown.length;
  const health = [...d.health].sort((a, b) => Number(a.ok) - Number(b.ok));
  const skipped = Object.entries(d.skippedCounts).filter(([, c]) => (c ?? 0) > 0);

  const text: string[] = [subject, ""];
  const html: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.45;color:#1f2933;max-width:640px">`,
    `<h2 style="margin:0 0 12px">${esc(subject)}</h2>`,
  ];

  if (d.aiUnavailable) {
    const banner =
      d.aiReason === "no-key"
        ? "⚠ No AI key is configured: matches below are not AI-checked (rules only). Add a free LLM key to your repo secrets."
        : d.aiReason === "time"
          ? "⚠ AI checks hit today's time limit: some matches below are not AI-checked (rules only)."
          : "⚠ Free AI quota ran out: matches below are not AI-checked (rules only).";
    text.push(banner, "");
    html.push(`<p style="background:#fff4e5;padding:8px 10px;border-radius:6px">${esc(banner)}</p>`);
  }

  text.push(n ? "Matches" : "No new matches today.");
  html.push(`<h3 style="margin:16px 0 6px">${n ? "Matches" : "No new matches today."}</h3>`);
  for (const { job, verdict: v } of shown) {
    const tags = [v.band, v.aiChecked ? "" : "not AI-checked"].filter(Boolean).join(" · ");
    const skills = [
      v.matched.length ? `✓ ${v.matched.join(", ")}` : "",
      v.missing.length ? `✗ ${v.missing.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("   ");
    text.push(
      `• ${job.title} @ ${job.company} | ${where(job)} | ${postedAge(job, d.date)} | ${tags}`,
      ...(skills ? [`  ${skills}`] : []),
      `  ${safeUrl(job.url) ?? "(link withheld: not http)"}`,
    );
    html.push(
      `<div style="margin:0 0 12px;padding:10px;border:1px solid #e4e7eb;border-radius:8px">`,
      link(job.url, job.title, "font-weight:600;color:#1d4ed8;text-decoration:none"),
      `<div>${esc(job.company)} · ${esc(where(job))} · ${esc(postedAge(job, d.date))} · <i>${esc(tags)}</i></div>`,
      skills ? `<div style="color:#52606d">${esc(skills)}</div>` : "",
      `</div>`,
    );
  }
  if (more > 0) {
    text.push(`…and ${more} more`);
    html.push(`<p>…and ${more} more</p>`);
  }

  if (d.stubs.length) {
    text.push("", "Needs full JD (open the link to read it)");
    html.push(`<h3 style="margin:16px 0 6px">Needs full JD (open the link to read it)</h3>`);
    for (const job of d.stubs.slice(0, MAX_STUBS)) {
      text.push(
        `• ${job.title} @ ${job.company} | ${where(job)}`,
        `  ${safeUrl(job.url) ?? "(link withheld: not http)"}`,
      );
      html.push(`<div>${link(job.url, job.title, "color:#1d4ed8")} · ${esc(job.company)}</div>`);
    }
  }

  if (d.stubs.length > MAX_STUBS) {
    const extra = d.stubs.length - MAX_STUBS;
    text.push(`…and ${extra} more`);
    html.push(`<p>…and ${extra} more</p>`);
  }

  if (skipped.length) {
    const line = skipped.map(([rule, c]) => `${rule}: ${c}`).join(", ");
    text.push("", `Filtered out: ${line}`);
    html.push(`<p style="color:#52606d">Filtered out: ${esc(line)}</p>`);
  }

  text.push("", "Source health");
  html.push(`<h3 style="margin:16px 0 6px">Source health</h3><ul style="padding-left:18px;color:#52606d">`);
  for (const h of health) {
    const line = h.ok
      ? `✓ ${h.source}: ${h.count} jobs${h.error ? ` (${h.error})` : ""}`
      : `✗ ${h.source}: ${h.error ?? "failed"}`;
    text.push(line);
    html.push(`<li>${esc(line)}</li>`);
  }
  html.push("</ul></div>");

  return { subject, html: html.join("\n"), text: text.join("\n") };
}
