import type { Job, MatchVerdict, RuleId } from "../core/types.js";
import type { SourceHealth } from "../state/store.js";

export interface DigestInput {
  date: Date;
  matches: { job: Job; verdict: MatchVerdict }[];
  stubs: Job[];
  skippedCounts: Partial<Record<RuleId, number>>;
  health: SourceHealth[];
  aiUnavailable: boolean;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export const MAX_MATCHES = 25;

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

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
  const subject = `☕ chaijobs · ${n} new match${n === 1 ? "" : "es"} · ${dayLabel(d.date)}`;
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
    text.push("⚠ Free AI quota ran out: matches below are not AI-checked (rules only).", "");
    html.push(
      `<p style="background:#fff4e5;padding:8px 10px;border-radius:6px">⚠ Free AI quota ran out: matches below are <b>not AI-checked</b> (rules only).</p>`,
    );
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
      `  ${job.url}`,
    );
    html.push(
      `<div style="margin:0 0 12px;padding:10px;border:1px solid #e4e7eb;border-radius:8px">`,
      `<a href="${esc(job.url)}" style="font-weight:600;color:#1d4ed8;text-decoration:none">${esc(job.title)}</a>`,
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
    text.push("", "From your alerts: needs full JD");
    html.push(`<h3 style="margin:16px 0 6px">From your alerts: needs full JD</h3>`);
    for (const job of d.stubs) {
      text.push(`• ${job.title} @ ${job.company} | ${where(job)}`, `  ${job.url}`);
      html.push(
        `<div><a href="${esc(job.url)}" style="color:#1d4ed8">${esc(job.title)}</a> · ${esc(job.company)}</div>`,
      );
    }
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
