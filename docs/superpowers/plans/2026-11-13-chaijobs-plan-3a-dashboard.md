# chaijobs Plan 3a: Local Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `chaijobs dashboard --instance <dir>` serves a local page (127.0.0.1 only) where the user can:
- see today's matches, the "needs full JD" jobs, why other jobs were filtered, and source health;
- open any job's details (JD text, extracted facts, matched and missing skills);
- mark a job applied, skipped, interview, rejected, offer or withdrawn.

Status changes are saved to the instance's `data/user-state.json` and pushed to the private instance repo, so the daily cloud run never announces those jobs again.

**Architecture:**
- **Server:** a dependency-free server on `node:http` that renders HTML on the server, with plain `<form method="post">` actions and no client-side JavaScript.
- **Pure parts:** a view model built from `state.json` plus `user-state.json`, and an HTML renderer.
- **Writes:** the server only ever writes the laptop-owned `data/user-state.json`, then commits and pushes it with the same rebase-and-retry approach as `save-state.sh`.
- **Out of scope here:** tailoring, Gmail drafts, the fact bank and the browser extension. Those are Plan 3b and later.

**Tech Stack:**
- Node 24 `node:http`, Vitest. No new runtime dependencies.
- Reuses `safeUrl` (digest), `loadState`/`loadUserState` (state) and `RuleId`/`Job` (core).

**Spec:** `docs/superpowers/specs/2026-11-10-india-job-hunter-design.md` §5 (state ownership), §9 (statuses), §10 (dashboard).

## Global Constraints

- Bind to `127.0.0.1` only. Never `0.0.0.0`. Default port `4567`, overridable with `--port`.
- **Untrusted text:** job descriptions, titles and company names come from the internet and from emails.
  - Every interpolated string goes through `esc()`.
  - Links go through `safeUrl()`.
  - JD text is rendered as text (`white-space: pre-wrap`), never as HTML.
- **Response headers:**
  - `Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- **DNS-rebinding guard:** reject (HTTP 421) any request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`.
- **CSRF guard:** every POST needs the per-process random token in a hidden field, and an `Origin` (when present) equal to the server's own origin. Otherwise respond 403.
- **Write ownership:** the dashboard writes only `data/user-state.json`. It never writes `state.json` (CLAUDE.md rule 8).
- **Statuses:** `applied`, `skipped`, `interview`, `rejected`, `offer`, `withdrawn` (spec §9; `found`, `jd_captured` and the rest are derived, not set by hand).
- No real job data in fixtures (CLAUDE.md fixture policy).

## Review Focus

1. **A hostile JD or title** containing `<script>`, `"><img onerror>`, or `javascript:` links renders as inert text. Pinned in Task 5.
2. **Another site in the user's browser** POSTs to `127.0.0.1:4567` (CSRF) or reaches it through DNS rebinding with `Host: evil.example`. Both are rejected. Pinned in Task 6.
3. **The cloud run pushed `state.json`** while the dashboard pushes `user-state.json`. The push rebases cleanly and retries. Pinned in Task 3.
4. **A fresh instance** with no `data/` yet, or an instance that is not a git clone, still renders ("No runs yet") and saves statuses locally, with a visible "not synced" note. Pinned in Tasks 3 and 6.
5. **An unknown job id** or an invalid status in a POST gives 404 or 400 and never writes. Pinned in Task 6.

---

### Task 1: Keep title and company on skipped jobs

**Files:**
- Modify: `src/state/store.ts` (`SeenRecord`), `src/pipeline/run.ts` (where skips are recorded)
- Test: `test/state/store.test.ts`, `test/pipeline/run.test.ts`

**Interfaces:**
- Produces: `SeenRecord = { firstSeenAt: string; lastSeenAt: string; rule: RuleId; title?: string; company?: string }`
  - The new fields are optional, so older files still load.
  - `title` is cut to 120 characters and `company` to 80.

- [ ] **Step 1:** Write failing tests:
  - `"skipped jobs keep title and company for the filtered-out log"`: run with one Pune job and assert `state.seen[id]` has `title` and `company`.
  - Keep the existing "skipped jobs are stored compactly" test, with its bound raised to 600_000 bytes for 2,000 records.
- [ ] **Step 2:** Run `npx vitest run test/pipeline/run test/state`. Expected: FAIL.
- [ ] **Step 3:** Implement: write `title.slice(0, 120)` and `company.slice(0, 80)` into the seen record.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: keep title and company on skipped-job records`

### Task 2: Status changes with history

**Files:** Create: `src/state/userState.ts`. Modify: `src/state/store.ts` (`UserState` schema). Test: `test/state/userState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type JobStatus = "applied" | "skipped" | "interview" | "rejected" | "offer" | "withdrawn";
  interface StatusEvent { id: string; status: JobStatus; at: string }
  // UserState gains: history: StatusEvent[]   (default [])
  recordStatus(dir: string, id: string, status: JobStatus, now: Date): UserState
  ```
- Behaviour: sets `statuses[id] = status`, appends to `history`, then does an atomic write of `data/user-state.json` (one entry per line). The cloud loader keeps reading `statuses` and tolerates `history`.

- [ ] **Step 1:** Write failing tests:
  - `"records a status and appends history"`
  - `"second status for the same job keeps both history events and the latest status"`
  - `"creates data/ when missing"`
  - `"the cloud loader still reads statuses from a file that has history"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: record job status changes with history`

### Task 3: Sync with the instance repo

**Files:** Create: `src/dashboard/sync.ts`. Test: `test/dashboard/sync.test.ts` (uses a bare-repo fixture like `test/scripts/save-state.test.ts`; skipped on Windows)

**Interfaces:**
- Produces:
  ```ts
  type Git = (args: string[], cwd: string) => string;   // default: execFileSync("git", …)
  pullInstance(dir: string, git?: Git): { synced: boolean; note: string }
  pushUserState(dir: string, git?: Git): { synced: boolean; note: string }
  ```
- `pullInstance`:
  - If `dir` is not a git work tree, return `{synced:false, note:"not a git clone: changes stay local"}`.
  - Otherwise run `git pull --rebase --autostash`.
- `pushUserState`:
  - Add and commit `data/user-state.json` with message `chore: update job statuses`.
  - Then `pull --rebase`, then push, retried up to 3 times with 2 s and 5 s waits (injectable).
  - Never throws. On failure it returns `{synced:false, note}`.

- [ ] **Step 1:** Write failing tests:
  - `"pushes user-state even when the cloud run pushed state.json in between"`
  - `"not a git clone: reports local-only and does not throw"`
  - `"nothing to commit is reported as synced"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: sync dashboard status changes with the instance repo`

### Task 4: View model

**Files:** Create: `src/dashboard/model.ts`. Test: `test/dashboard/model.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface JobRow { id: string; job: Job; verdict: Verdict; facts: JdFacts | null; status: JobStatus | null; digestedAt: string | null }
  interface DashboardView {
    lastRun: string | null; health: SourceHealth[];
    matches: JobRow[];            // ranked with rank(); hides skipped/withdrawn unless show=all
    needsJd: JobRow[];            // stubs, newest first
    filtered: { rule: RuleId; count: number; recent: { title: string; company: string; at: string }[] }[];
    counts: Record<JobStatus, number>;
  }
  buildView(state: State, user: UserState, opts: { show: "open" | "all" }): DashboardView
  jobDetail(state: State, user: UserState, id: string): (JobRow & { history: StatusEvent[] }) | null
  ```
- `filtered.recent` holds up to 20 per rule, newest `lastSeenAt` first. Records without a title are counted but not listed.

- [ ] **Step 1:** Write failing tests:
  - `"matches are ranked and skipped ones hidden by default"`
  - `"show=all includes skipped"`
  - `"filtered groups by rule with recent titles"`
  - `"empty state gives an empty view, not an error"`
  - `"jobDetail returns history for that job only"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: dashboard view model`

### Task 5: HTML pages

**Files:** Create: `src/dashboard/html.ts`, `src/dashboard/app.css.ts` (exports the stylesheet string). Test: `test/dashboard/html.test.ts`

**Interfaces:**
- Produces:
  - `renderHome(v: DashboardView, csrf: string, syncNote: string | null): string`
  - `renderJob(d: NonNullable<ReturnType<typeof jobDetail>>, csrf: string): string`
  - `renderNotFound(): string`
  - `APP_CSS: string`
- Page content:
  - **Header:** last run time in IST, health summary ("36/36 sources OK", with failed ones named), and the sync note.
  - **Matches table:** title (links to `/job/<id>`), company, city, posted age, band, AI-checked, matched ✓ and missing ✗ skills, status, and a status form.
  - **Then:** "Needs full JD", "Filtered out" (rule, count, recent titles), and the status counts.
  - **Job page:** facts, verdict, JD text in `<pre>`, the external link (`rel="noopener noreferrer"`), the status history and the status form.
- Must work at phone width: a single column under 640 px with no horizontal scroll. Light and dark themes come from `prefers-color-scheme`.

- [ ] **Step 1:** Write failing tests:
  - `"hostile title and JD render as inert text"`: assert there's no `<script`, the `&lt;script&gt;` text appears, and no `javascript:` in any href.
  - `"each status form carries the csrf token"`
  - `"no runs yet message on empty view"`
  - `"health line names failed sources"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: dashboard pages`

### Task 6: Server

**Files:** Create: `src/dashboard/server.ts`. Test: `test/dashboard/server.test.ts` (starts on port 0 and uses `fetch`)

**Interfaces:**
- Produces: `startDashboard(opts: { instanceDir: string; port: number; sync: boolean; now?: () => Date; git?: Git }): Promise<{ url: string; close(): Promise<void> }>`
- Routes:
  - `GET /` (query `show=open|all`)
  - `GET /job/:id`
  - `POST /job/:id/status` (form fields `csrf` and `status`). Responds 303 to `/job/:id`, after `recordStatus` and, when sync is on, `pushUserState`.
  - `GET /app.css`
  - Anything else gets 404.
- Every response carries the headers listed in Global Constraints. State is re-read on each GET, so a `git pull` done elsewhere shows up.

- [ ] **Step 1:** Write failing tests:
  - `"serves home with security headers"`
  - `"rejects a foreign Host header with 421"`
  - `"rejects POST without the csrf token with 403 and writes nothing"`
  - `"rejects POST with a foreign Origin with 403"`
  - `"valid status POST writes user-state and redirects"`
  - `"unknown job id is 404 and invalid status is 400, neither writes"`
  - `"binds to 127.0.0.1"`: the returned url host is 127.0.0.1.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: local dashboard server`

### Task 7: CLI, docs and a live check

**Files:** Modify: `src/cli.ts`, `README.md`, `CLAUDE.md` (module map), `template/instance/README.md`. Test: `test/cli.test.ts`

**Interfaces:** Produces `chaijobs dashboard --instance <dir> [--port 4567] [--no-sync]`. On start it runs `pullInstance` (unless `--no-sync`), starts the server and prints the URL.

- [ ] **Step 1:** Write the failing test `"dashboard --help lists --instance, --port and --no-sync"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and document. `CLAUDE.md` must stay under 200 lines.
- [ ] **Step 4:** Run the full gate: `npm run lint && npm run typecheck && npm run build && npm test`. Expected: green.
- [ ] **Step 5 (live check):** Run `node dist/cli.js dashboard --instance <local clone of chaijobs-instance>`, open it in the browser, and confirm:
  - the real matches, needs-JD jobs, filtered counts and health appear;
  - marking a status writes `user-state.json`, and the push appears in the instance repo;
  - the layout holds at phone width.
- [ ] **Step 6:** Commit: `feat: chaijobs dashboard command`
