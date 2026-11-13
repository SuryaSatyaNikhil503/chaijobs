import type { Job, RuleId, Verdict } from "../core/types.js";
import { rank } from "../filter/decide.js";
import type { JdFacts } from "../llm/extract.js";
import {
  JOB_STATUSES,
  type JobStatus,
  type SourceHealth,
  type State,
  type StatusEvent,
  type UserState,
} from "../state/store.js";

export interface JobRow {
  id: string;
  job: Job;
  verdict: Verdict;
  facts: JdFacts | null;
  status: JobStatus | null;
  digestedAt: string | null;
}

export interface FilteredGroup {
  rule: RuleId;
  count: number;
  /** Records written before titles were kept (2026-11-13) have none; counted here, not listed. */
  untitled: number;
  recent: { title: string; company: string; at: string }[];
}

export interface DashboardView {
  lastRun: string | null;
  health: SourceHealth[];
  matches: JobRow[];
  needsJd: JobRow[];
  filtered: FilteredGroup[];
  counts: Record<JobStatus, number>;
}

const RECENT_PER_RULE = 20;
const HIDDEN_BY_DEFAULT: ReadonlySet<string> = new Set(["skipped", "withdrawn"]);

const asStatus = (s: string | undefined): JobStatus | null =>
  (JOB_STATUSES as readonly string[]).includes(s ?? "") ? (s as JobStatus) : null;

function row(state: State, user: UserState, id: string): JobRow | null {
  const r = state.jobs[id];
  if (!r) return null;
  return {
    id,
    job: r.job,
    verdict: r.verdict,
    facts: r.facts,
    status: asStatus(user.statuses[id]),
    digestedAt: r.digestedAt,
  };
}

export function buildView(state: State, user: UserState, opts: { show: "open" | "all" }): DashboardView {
  const rows = Object.keys(state.jobs)
    .map((id) => row(state, user, id))
    .filter((r): r is JobRow => r !== null);

  const ranked = rank(
    rows.flatMap((r) => (r.verdict.kind === "match" ? [{ job: r.job, verdict: r.verdict }] : [])),
  ).map(({ job }) => rows.find((r) => r.id === job.id) as JobRow);
  const matches = ranked.filter((r) => opts.show === "all" || !HIDDEN_BY_DEFAULT.has(r.status ?? ""));

  const needsJd = rows
    .filter(
      (r) => r.verdict.kind === "stub" && (opts.show === "all" || !HIDDEN_BY_DEFAULT.has(r.status ?? "")),
    )
    .sort((a, b) => Date.parse(b.job.postedAt ?? "") - Date.parse(a.job.postedAt ?? ""));

  const groups = new Map<RuleId, FilteredGroup>();
  for (const s of Object.values(state.seen)) {
    const g = groups.get(s.rule) ?? { rule: s.rule, count: 0, untitled: 0, recent: [] };
    g.count++;
    if (s.title) g.recent.push({ title: s.title, company: s.company ?? "", at: s.lastSeenAt });
    else g.untitled++;
    groups.set(s.rule, g);
  }
  const filtered = [...groups.values()]
    .map((g) => ({
      ...g,
      recent: g.recent.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_PER_RULE),
    }))
    .sort((a, b) => b.count - a.count);

  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  for (const s of Object.values(user.statuses)) {
    const status = asStatus(s);
    if (status) counts[status]++;
  }

  return { lastRun: state.lastSuccessfulRun, health: state.lastHealth, matches, needsJd, filtered, counts };
}

export function jobDetail(
  state: State,
  user: UserState,
  id: string,
): (JobRow & { history: StatusEvent[] }) | null {
  const r = row(state, user, id);
  return r ? { ...r, history: user.history.filter((e) => e.id === id) } : null;
}
