import type { Job } from "../core/types.js";

const HOUR = 3_600_000;
const FIRST_RUN_HOURS = 24;

export interface FreshnessWindow {
  from: Date;
  firstRun: boolean;
}

/** Window runs from the last successful run to now, capped; a first run looks back 24h. */
export function freshnessWindow(
  lastSuccessfulRun: string | null,
  now: Date,
  capHours: number,
): FreshnessWindow {
  if (!lastSuccessfulRun) return { from: new Date(now.getTime() - FIRST_RUN_HOURS * HOUR), firstRun: true };
  const last = new Date(lastSuccessfulRun).getTime();
  const cap = now.getTime() - capHours * HOUR;
  return { from: new Date(Math.max(last, cap)), firstRun: false };
}

const UNIT_HOURS: Record<string, number> = { minute: 1 / 60, hour: 1, day: 24, week: 168, month: 720 };

/** Parses "5 hours ago", "1 day ago", "30+ days ago", "just posted", "today". */
export function parseRelativePosted(text: string, now: Date): string | null {
  const t = text.trim().toLowerCase();
  if (/^(just posted|today|just now)$/.test(t)) return now.toISOString();
  const m = /^(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago$/.exec(t);
  const amount = m?.[1];
  const unit = m?.[2];
  if (!amount || !unit) return null;
  const hours = Number(amount) * (UNIT_HOURS[unit] ?? 0);
  return new Date(now.getTime() - hours * HOUR).toISOString();
}

/** Undated jobs count only when first seen after the window start, so a backlog never floods a later digest. */
export function isFresh(
  job: Pick<Job, "postedAt" | "postedAtKind" | "firstSeenAt">,
  win: FreshnessWindow,
): boolean {
  if (job.postedAtKind === "first-seen" || job.postedAt === null) {
    return !win.firstRun && Date.parse(job.firstSeenAt) > win.from.getTime();
  }
  return new Date(job.postedAt).getTime() >= win.from.getTime();
}
