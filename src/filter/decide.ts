import type { Filters, SkillsFile } from "../config/schema.js";
import type { Job, MatchVerdict, Verdict } from "../core/types.js";
import type { JdFacts } from "../llm/extract.js";
import { minYearsFromText } from "./cheap.js";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");

/** True when a required skill names one of the user's skills or aliases (version suffixes allowed). */
function makeMatcher(skills: SkillsFile): (required: string) => boolean {
  const known = skills.skills.flatMap((s) => [s.name, ...s.aliases]).map(norm);
  return (required) => {
    const r = norm(required);
    return known.some((k) => k === r || (r.startsWith(k) && /^\d+$/.test(r.slice(k.length))));
  };
}

const bandFor = (minYears: number | null, f: Filters) =>
  minYears === f.stretchMinYears ? "stretch" : "strong";

export function decide(job: Job, facts: JdFacts | null, skills: SkillsFile, f: Filters): Verdict {
  if (job.isStub) return { kind: "stub" };
  if (!facts) {
    const min = minYearsFromText(job.descriptionText ?? "");
    return { kind: "match", band: bandFor(min, f), aiChecked: false, matched: [], missing: [], score: 0 };
  }
  if (f.skipRoleTypes.includes(facts.roleType)) {
    return { kind: "skip", rule: "role-type", detail: `role type ${facts.roleType}` };
  }
  if (facts.minYears !== null && facts.minYears >= f.maxMinYears) {
    return { kind: "skip", rule: "min-years", detail: `asks for ${facts.minYears}+ years` };
  }
  const has = makeMatcher(skills);
  const matched = facts.mustHave.filter(has);
  const missing = facts.mustHave.filter((s) => !has(s));
  if (facts.mustHave.length >= 2 && matched.length === 0) {
    return { kind: "skip", rule: "core-stack", detail: `needs ${facts.mustHave.slice(0, 4).join(", ")}` };
  }
  return {
    kind: "match",
    band: bandFor(facts.minYears, f),
    aiChecked: true,
    matched,
    missing,
    score: matched.length / Math.max(facts.mustHave.length, 1),
  };
}

export interface RankedMatch {
  job: Job;
  verdict: MatchVerdict;
}

/** Strong before stretch, then must-have coverage, then newest first. */
export function rank(matches: RankedMatch[]): RankedMatch[] {
  const posted = (m: RankedMatch) => (m.job.postedAt ? Date.parse(m.job.postedAt) : 0);
  return [...matches].sort(
    (a, b) =>
      (a.verdict.band === "strong" ? 0 : 1) - (b.verdict.band === "strong" ? 0 : 1) ||
      b.verdict.score - a.verdict.score ||
      posted(b) - posted(a),
  );
}
