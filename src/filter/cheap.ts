import type { Filters } from "../config/schema.js";
import type { Job, Verdict } from "../core/types.js";
import { type FreshnessWindow, isFresh } from "./freshness.js";

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const NUM = String.raw`(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)`;
const YEARS_RE = new RegExp(
  String.raw`(minimum of|min\.?|at least|atleast)?\s*${NUM}\s*(\+|plus)?\s*(?:(?:-|–|to)\s*${NUM}\s*\+?)?\s*(?:years?|yrs?)\b(.{0,40})`,
  "gi",
);
const EXPERIENCE_AFTER = /^\s*(of\s+)?([a-z-]+\s+){0,2}(experience|exp\b|work)/i;

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);

/** Smallest minimum-experience figure stated in the text, or null when none is unambiguous. */
export function minYearsFromText(text: string): number | null {
  let min: number | null = null;
  for (const m of text.matchAll(YEARS_RE)) {
    const [, prefix, first, plus, second, after = ""] = m;
    if (!first) continue;
    const qualified = Boolean(prefix || plus || second || EXPERIENCE_AFTER.test(after));
    if (!qualified) continue;
    const n = toNumber(first);
    if (Number.isFinite(n) && (min === null || n < min)) min = n;
  }
  return min;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function titleHit(title: string, words: string[]): string | null {
  const t = title.toLowerCase();
  return (
    words.find((w) => new RegExp(`(?<![a-z0-9])${escapeRegex(w.toLowerCase())}(?![a-z0-9])`).test(t)) ?? null
  );
}

/** Rules that need no LLM. Returns a skip verdict, or null when the job survives to the next stage. */
export function applyCheapRules(job: Job, f: Filters, win: FreshnessWindow): Verdict | null {
  if (!job.southIndia && !(f.allowRemoteIndia && job.remoteIndia)) {
    return { kind: "skip", rule: "location", detail: job.locations.join("; ") || "no location" };
  }
  if (!isFresh(job, win)) {
    return { kind: "skip", rule: "stale", detail: `posted ${job.postedAt ?? "unknown"}` };
  }
  const hit = titleHit(job.title, f.titleExclude);
  if (hit) return { kind: "skip", rule: "title-excluded", detail: `title contains "${hit}"` };
  if (job.descriptionText) {
    const min = minYearsFromText(job.descriptionText);
    if (min !== null && min >= f.maxMinYears) {
      return { kind: "skip", rule: "min-years", detail: `asks for ${min}+ years` };
    }
  }
  return null;
}
