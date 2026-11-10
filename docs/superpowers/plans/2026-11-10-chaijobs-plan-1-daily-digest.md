# chaijobs Plan 1: Daily Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every morning at about 07:07 IST, the owner's private instance repo runs one command. That command finds fresh (≤ the window) South-India/remote-India backend jobs from career-site feeds, Google job search and alert emails. It filters them by the owner's rules, then emails a short ranked digest with source health.

**Architecture:**
- **Two repos.** The public `chaijobs` repo (MIT) holds the TypeScript CLI. A private instance repo, made from `template/instance/`, holds config, secrets and committed state, and runs a GitHub Actions schedule that executes `chaijobs run`.
- **Pipeline:** fetch → normalise → dedupe → cheap rules → LLM fact extraction (free-provider fallback chain) → rule decision → rank → save state → email digest.
- **Plain code decides.** The LLM only extracts facts.

**Tech Stack:**
- Node 24 LTS and TypeScript 5 (ESM, `strict`)
- npm, Vitest, Biome (lint + format), zod, `yaml`
- `imapflow` + `mailparser` (alert emails), `nodemailer` (digest)
- `html-to-text`, `commander` (CLI)
- Global `fetch`: no LLM SDKs

**Spec:** `docs/superpowers/specs/2026-11-10-india-job-hunter-design.md` (approved 2026-11-10).

**Later plans (outlines only, written after Plan 1 ships):**
- **Plan 2, more sources and hydration:**
  - SmartRecruiters, Workday and Google Careers adapters
  - auto-discovery of companies from job links
  - stub hydration (match an alert stub to a feed or SerpApi job)
  - a larger verified seed company list
  - the 30-JD labelled acceptance test (owner labels)
- **Plan 3, laptop app:**
  - fact bank and importer, tailoring with citation checks, the Typst resume template
  - ATS text-order check, Gmail draft via IMAP APPEND, Sent-folder applied detection
  - `user-state` push, `skills.yml` export
  - local dashboard and browser extension

## Global Constraints

- Node `>=24`; package name `chaijobs`; licence MIT; conventional commits.
- **Never commit** real JDs, personal data, the fact bank, `data/` of an instance, `.env`, or credentials. Test fixtures are synthetic or paraphrased.
- The daily job **never** runs in the public repo, only in an instance repo.
- No email is sent except the digest, from the user's own address to the same address.
- LinkedIn, Naukri and Indeed are never fetched directly. Their jobs arrive only via alert emails or SerpApi results.
- **Location:**
  - South India means the states Andhra Pradesh, Telangana, Karnataka, Tamil Nadu, Kerala and Puducherry.
  - Explicit cities: Hyderabad, Bengaluru, Chennai, Coimbatore, Vizag.
  - Remote roles open to India pass (`allowRemoteIndia: true` by default).
- **Freshness window:** from `lastSuccessfulRun` to now, capped at **36h**. On the first run (no `lastSuccessfulRun`), the window is 24h, and jobs with `postedAtKind: "first-seen"` are recorded but not digested.
- **Filter defaults** (`filters.yml`):
  - Skip if `minYears >= 5`; band is `stretch` if `minYears == 4`.
  - Skip role types `frontend`, `mobile`, `devops`, `qa`, `data`.
  - Skip if the must-have core is outside skills.
  - Unknown `minYears` never causes a skip.
- Every skip records its rule ID. No job vanishes without a reason.
- Schedule: cron `37 1 * * *` (01:37 UTC = 07:07 IST).
- `CLAUDE.md` must stay **under 200 lines**.

## Review Focus

1. **A source fails** (HTTP 4xx/5xx, HTML instead of JSON, timeout). The cycle continues and the digest's health section names the source and error. Pinned in Task 14.
2. **Experience phrasing variety.** "1-5 years" must not be cheap-skipped, since its minimum is 1. "5+ yrs", "minimum of five years" and "5 - 8 years" are skips. Pinned in Task 9.
3. **Location strings:**
   - `"Bangalore/Bengaluru, India"` passes.
   - `"Hyderabad, Telangana; Pune"` passes.
   - `"India - Remote"` passes.
   - `"Remote (US)"` and `"Pune, Maharashtra"` fail.

   Pinned in Task 3.
4. **The same job from Greenhouse and from SerpApi** appears once in the digest. Pinned in Task 8.
5. **Quiet or broken days.** A day with zero matches, or with every LLM quota exhausted, still sends a digest. It says "0 new matches" or "not AI-checked" plus health, never silence. Pinned in Tasks 13 and 14.

---

### Task 1: Public repo bootstrap, CI and CLAUDE.md

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`
- Create: `.github/workflows/ci.yml`, `src/cli.ts`, `test/cli.test.ts`
- Move into repo: `docs/superpowers/specs/2026-11-10-india-job-hunter-design.md`, this plan

**Interfaces:**
- Produces: the npm scripts every later task uses:
  - `npm test` (vitest run)
  - `npm run lint` (biome check .)
  - `npm run typecheck` (tsc --noEmit)
  - `npm run build` (tsc → `dist/`)
  - `bin.chaijobs = dist/cli.js`

- [ ] **Step 1:** Create the repo at `~/Projects/chaijobs`, run `git init -b main`, and write `.gitignore` **first**. It must cover `node_modules/`, `dist/`, `.env*`, `data/`, `factbank/`, `*.pdf`, `*.eml` and `.chaijobs/`. Then make the first commit, `chore: gitignore`.
- [ ] **Step 2:** Write the failing test `test/cli.test.ts`. `"prints version"` spawns `node dist/cli.js --version` after the build, and expects stdout to equal the `package.json` version.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (no cli).
- [ ] **Step 4:** Implement `src/cli.ts` with commander. Register `--version` and empty `run`, `init` and `companies verify` subcommands that print "not implemented".
- [ ] **Step 5:** Run `npm run build && npm test`. Expected: PASS.
- [ ] **Step 6:** Write `ci.yml`.
  - Matrix: `ubuntu-latest` and `windows-latest`, Node 24.
  - Steps: `npm ci`, lint, typecheck, build, test, then a **fresh-install smoke test**. The smoke test runs `npm pack`, installs the tarball into an empty temp directory with `npm i`, and expects `npx chaijobs --version` to print the version. This covers the spec's Windows install requirement.
- [ ] **Step 7:** Write `CLAUDE.md` (**under 200 lines**). It must hold:
  - the exact commands from the Interfaces block
  - the architecture rules: the LLM only extracts and code decides; no provider is hard-coded; the daily job never runs in the public repo; no personal data or real JDs in fixtures; every skip has a rule ID
  - the module map, the fixture policy, and the commit style

  Also write the MIT `LICENSE` (holder "Surya Satya Nikhil"), a README stub with the privacy and terms note (GitHub Actions grey area stated plainly), and CONTRIBUTING with an "add a source adapter" outline.
- [ ] **Step 8:** Verify with `wc -l CLAUDE.md`. Expected: < 200.
- [ ] **Step 9:** Commit (`chore: bootstrap chaijobs`). Then run `gh repo create chaijobs --public --source=. --push`. Expected: the CI run is green on both OSes (`gh run watch`).

### Task 2: Core types and config loading

**Files:**
- Create: `src/core/types.ts`, `src/config/schema.ts`, `src/config/load.ts`
- Create: `test/config/load.test.ts`, `test/fixtures/instance-min/config/*.yml`

**Interfaces:**
- Produces (`src/core/types.ts`):
  ```ts
  type SourceId = "greenhouse" | "lever" | "ashby" | "serpapi" | "alert-linkedin" | "alert-naukri" | "alert-indeed";
  type PostedAtKind = "posted" | "email-received" | "first-seen";
  interface RawJob { source: SourceId; sourceJobId: string; company: string; title: string;
    locations: string[]; url: string; postedAt: string | null; postedAtKind: PostedAtKind;
    descriptionText: string | null; }
  interface Job extends RawJob { id: string; companyKey: string; cities: string[];
    southIndia: boolean; remoteIndia: boolean; isStub: boolean; firstSeenAt: string; }
  type Band = "strong" | "stretch";
  type RuleId = "location" | "stale" | "title-excluded" | "min-years" | "role-type" | "core-stack" | "already-seen";
  type Verdict =
    | { kind: "skip"; rule: RuleId; detail: string }
    | { kind: "match"; band: Band; aiChecked: boolean; matched: string[]; missing: string[]; score: number }
    | { kind: "stub" };
  ```
- Produces (`src/config/load.ts`): `loadConfig(instanceDir: string): Config`, where `Config = { companies: Company[]; filters: Filters; providers: ProviderEntry[]; skills: SkillsFile; alerts: AlertsConfig; serpapi: { enabled: boolean; queries: string[] } }`
  - `Company = { name: string; type: "product"|"service"|"startup"|"gcc"; ats: "greenhouse"|"lever"|"ashby"; slug: string }`
  - `Filters = { maxMinYears: number /*5*/; stretchMinYears: number /*4*/; skipRoleTypes: string[]; titleExclude: string[]; allowRemoteIndia: boolean; windowCapHours: number /*36*/ }`
  - `ProviderEntry = { name: string; baseUrl: string; model: string; apiKeyEnv: string }`
  - `SkillsFile = { skills: { name: string; aliases: string[] }[] }`
  - `AlertsConfig = { senders: Record<"alert-linkedin"|"alert-naukri"|"alert-indeed", string[]> }`

- [ ] **Step 1:** Write the failing tests:
  - `"loads minimal instance with defaults"`: the fixture omits `filters.yml`. Expect `filters.maxMinYears === 5`, `stretchMinYears === 4`, `windowCapHours === 36`, `allowRemoteIndia === true`.
  - `"rejects company with unknown ats"`: expect a throw whose message contains the file name and `ats`.
- [ ] **Step 2:** Run `npx vitest run test/config`. Expected: FAIL.
- [ ] **Step 3:** Implement the zod schemas with the defaults above, and `loadConfig`, which reads `config/*.yml` with `yaml`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: config schemas and loader`).

### Task 3: Location normalisation

**Files:** Create: `src/filter/location.ts`, `test/filter/location.test.ts`

**Interfaces:** Produces `normaliseLocation(raw: string[]): { cities: string[]; southIndia: boolean; remoteIndia: boolean }`

- [ ] **Step 1:** Write the failing table test `"classifies location strings"`, with each input mapped to `{southIndia, remoteIndia}`:

  | Input | southIndia | remoteIndia |
  |---|---|---|
  | `["Bangalore/Bengaluru, India"]` | true | false |
  | `["Hyderabad, Telangana; Pune"]` | true | false |
  | `["Visakhapatnam"]` | true | false |
  | `["Vishakhapatnam"]` | true | false |
  | `["Kochi, Kerala"]` | true | false |
  | `["India - Remote"]` | false | true |
  | `["Remote (US)"]` | false | false |
  | `["Pune, Maharashtra"]` | false | false |
  | `[]` | false | false |

  Bengaluru inputs must yield `cities` containing `"Bengaluru"`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement using a canonical-city map:
  - variants: Bangalore→Bengaluru, Vizag/Vishakhapatnam→Visakhapatnam, Madras→Chennai, Cochin→Kochi, Trivandrum→Thiruvananthapuram, Mysore→Mysuru, Mangalore→Mangaluru
  - plus state names, split on `/ ; , |` and " or "
  - remote-India = "remote" with "india", or "remote" with no other country
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: south india location normalisation`).

### Task 4: Freshness window and relative dates

**Files:** Create: `src/filter/freshness.ts`, `test/filter/freshness.test.ts`

**Interfaces:**
- Produces: `freshnessWindow(lastSuccessfulRun: string | null, now: Date, capHours: number): { from: Date; firstRun: boolean }`
- Produces: `parseRelativePosted(text: string, now: Date): string | null` (returns an ISO string)
- Produces: `isFresh(job: Pick<Job,"postedAt"|"postedAtKind">, win: { from: Date; firstRun: boolean }): boolean`

- [ ] **Step 1:** Write the failing tests:
  - Last run 10h ago gives `from` = 10h ago. Last run 3 days ago gives `from` = now − 36h. `null` gives now − 24h with `firstRun: true`.
  - `parseRelativePosted`: `"5 hours ago"` → now − 5h; `"1 day ago"` → now − 24h; `"30+ days ago"` → now − 30d; `"just posted"` and `"today"` → now; `"gibberish"` → null.
  - On a first run, `isFresh` with `postedAtKind:"first-seen"` is false. After the first run it is true.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: freshness window`).

### Task 5: Career-site adapters (Greenhouse, Lever, Ashby)

**Files:**
- Create: `src/sources/http.ts`, `src/sources/greenhouse.ts`, `src/sources/lever.ts`, `src/sources/ashby.ts`
- Create: `test/sources/*.test.ts`, `test/fixtures/sources/{greenhouse,lever,ashby}.json` (synthetic, in the real response shape)

**Interfaces:**
- Produces: `type Fetcher = (url: string) => Promise<unknown>` (in `http.ts`). The default is `fetchJson`, with a 20s timeout, a `User-Agent: chaijobs (+https://github.com/SuryaSatyaNikhil503/chaijobs)` header, and a `SourceError` thrown on non-2xx or non-JSON responses.
- Produces: `fetchGreenhouse(c: Company, f?: Fetcher): Promise<RawJob[]>`, and the same signature for `fetchLever` and `fetchAshby`.
- Endpoints:
  - Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`
  - Lever: `https://api.lever.co/v0/postings/{slug}?mode=json`
  - Ashby: `https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false`

- [ ] **Step 1 (live check of the raw source):** For one known board per platform (Greenhouse `groww`, Lever `cred`, and an Ashby board you find), run curl once and record which field is the true **first-published** date:
  - Greenhouse: expect `first_published`. **Not** `updated_at`, which the spike showed is misleading.
  - Lever: expect `createdAt` (ms).
  - Ashby: expect `publishedAt`.

  Write the confirmed field names into the adapter header comments. If a platform has no posting date, map it to `postedAtKind:"first-seen"`.
- [ ] **Step 2:** Write the failing tests, one per adapter, using an injected fake `Fetcher` that returns the fixture:
  - Expect the `RawJob` fields, `postedAtKind:"posted"`, `postedAt` from the confirmed field, and `descriptionText` with the HTML stripped (no `<` characters).
  - Also `"throws SourceError on html body"`.
- [ ] **Step 3:** Run `npx vitest run test/sources`. Expected: FAIL.
- [ ] **Step 4:** Implement the three adapters and `fetchJson`, using `html-to-text` for descriptions.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit (`feat: greenhouse lever ashby adapters`).

### Task 6: Google job search via SerpApi

**Files:** Create: `src/sources/serpapi.ts`, `test/sources/serpapi.test.ts`, `test/fixtures/sources/serpapi.json`

**Interfaces:** Produces `fetchSerpApi(query: string, apiKey: string, now: Date, f?: Fetcher): Promise<RawJob[]>`
- Endpoint: `https://serpapi.com/search.json?engine=google_jobs&q={query}&gl=in&hl=en&api_key=…`
- `postedAt` comes from `detected_extensions.posted_at`, parsed with `parseRelativePosted`.
- `url` comes from the first `apply_options[].link`, falling back to `share_link`.

- [ ] **Step 1 (live check):** Make one live call with the owner's key, if set, to confirm the field names. Record them in the header comment, and do **not** commit the response.
- [ ] **Step 2:** Write the failing test `"maps google jobs results"`.
  - The fixture's `"5 hours ago"` must give `postedAt` = now − 5h and `source:"serpapi"`.
  - `"skips when key missing"`: the adapter's caller is tested in Task 14, so here assert that an empty key throws `SourceError("serpapi: no key")`.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run. Expected: PASS.
- [ ] **Step 6:** Commit (`feat: serpapi google jobs adapter`).

### Task 7: Alert emails over IMAP (LinkedIn, Naukri, Indeed)

**Files:**
- Create: `src/sources/alerts/imap.ts`, `src/sources/alerts/{linkedin,naukri,indeed}.ts`
- Create: `test/sources/alerts/*.test.ts`, `test/fixtures/alerts/*.html` (paraphrased)

**Interfaces:**
- Produces: `parseLinkedInAlert(html: string, receivedAt: string): RawJob[]`, and the same for `parseNaukriAlert` and `parseIndeedAlert`. All produce `postedAtKind:"email-received"` and `descriptionText:null`, which makes them stubs.
- Produces: `fetchAlerts(cfg: AlertsConfig, imap: { host: string; user: string; pass: string }, sinceUid: number): Promise<{ jobs: RawJob[]; maxUid: number }>`. It searches INBOX by `FROM` each configured sender **and** `SINCE` (now − 2 days), fetching only UIDs above `sinceUid`.

- [ ] **Step 1 (owner task, raw material):** Ask the owner to save 2 recent alert emails from each of LinkedIn, Naukri and Indeed as `.eml` into `~/.chaijobs/samples/`, outside any repo. Read the real sender addresses from them and put those in the `alerts.yml` defaults.
- [ ] **Step 2:** Make paraphrased fixtures. Keep the HTML structure, and replace companies, titles and links with fake ones.
- [ ] **Step 3:** Write the failing tests:
  - Each parser returns the right count of jobs with the expected titles, companies, locations and URLs.
  - `"returns [] for non-alert html"`.
- [ ] **Step 4:** Run. Expected: FAIL.
- [ ] **Step 5:** Implement the parsers using a selector-free strategy that survives template tweaks: extract `<a>` job links that match the per-sender URL patterns, then read the nearby text lines. Implement `fetchAlerts` with `imapflow` + `mailparser`. It is not unit-tested against a live server; it is covered by Task 15's end-to-end run.
- [ ] **Step 6:** Run. Expected: PASS.
- [ ] **Step 7:** Commit (`feat: job alert email parsers`).

### Task 8: Normalise, identity and dedupe

**Files:** Create: `src/pipeline/normalise.ts`, `test/pipeline/normalise.test.ts`

**Interfaces:**
- Produces: `toJob(raw: RawJob, nowIso: string): Job`. Here `isStub = raw.descriptionText === null`, and `companyKey` is lowercase with legal suffixes stripped (`pvt ltd`, `private limited`, `inc`, `technologies`, `india`).
- Produces: `jobId(job: Job): string`, a sha1 of the canonical apply URL with query string and tracking params stripped. When the URL host is a LinkedIn, Naukri or Indeed redirect, it uses `companyKey|normalised title|first city` instead.
- Produces: `dedupe(jobs: Job[]): Job[]`. Among same-ID or same `companyKey|title|city` jobs, it keeps one, preferring a non-stub, then `postedAtKind:"posted"`.

- [ ] **Step 1:** Write the failing tests:
  - `"same job from greenhouse and serpapi dedupes to the greenhouse one"`
  - `"Groww Pvt Ltd" and "groww" share companyKey`
  - `"stub replaced by full JD duplicate"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: normalise and dedupe jobs`).

### Task 9: Cheap rules (no LLM)

**Files:** Create: `src/filter/cheap.ts`, `test/filter/cheap.test.ts`

**Interfaces:** Produces `applyCheapRules(job: Job, f: Filters, win: { from: Date; firstRun: boolean }): Verdict | null`. A `null` return means it survives to the next stage. The order is:
1. `location` (not southIndia, and not remoteIndia-when-allowed)
2. `stale` (not `isFresh`)
3. `title-excluded` (a word in `f.titleExclude`, case-insensitive; the defaults include frontend, front end, ui engineer, android, ios, .net, php, salesforce, sap, qa, sdet, test engineer, devops, sre, data scientist, intern, manager, director)
4. `min-years`, only when the JD text has an unambiguous minimum ≥ `f.maxMinYears`

It also exports `minYearsFromText(text: string): number | null`.

- [ ] **Step 1:** Write the failing tests:
  - `minYearsFromText`:

    | Text | Result |
    |---|---|
    | `"1-5 years"` | 1 |
    | `"5+ yrs"` | 5 |
    | `"minimum of five years"` | 5 |
    | `"5 - 8 years"` | 5 |
    | `"3 to 5 years"` | 3 |
    | `"0-2 years"` | 0 |
    | `"10 years of history"` (company age) | null, and the job must not be skipped |
    | No experience text | null |

  - `"1-5 years not skipped"`
  - `"Senior Frontend Engineer skipped with rule title-excluded"`
  - `"stub with unknown years passes"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. For `minYearsFromText`, only count numbers adjacent to "years of experience", "yrs", "years exp", or ranges followed by years. When several numbers conflict, take the smallest minimum found.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: cheap filter rules`).

### Task 10: LLM provider chain and JD fact extraction

**Files:** Create: `src/llm/chain.ts`, `src/llm/extract.ts`, `src/llm/cache.ts`, `test/llm/*.test.ts`

**Interfaces:**
- Produces (`extract.ts`):
  ```ts
  const JdFacts = z.object({ minYears: z.number().int().min(0).max(30).nullable(),
    maxYears: z.number().int().nullable(), mustHave: z.array(z.string()).max(25),
    niceToHave: z.array(z.string()).max(25),
    roleType: z.enum(["backend","fullstack-backend-heavy","fullstack","frontend","mobile","devops","qa","data","other"]),
    applyEmail: z.string().email().nullable() });
  type JdFacts = z.infer<typeof JdFacts>;
  extractJdFacts(text: string, chain: ProviderEntry[], env: Record<string,string|undefined>, call?: ChatCall):
    Promise<{ ok: true; facts: JdFacts; provider: string } | { ok: false; reason: "all-quota" | "invalid" | "no-providers" }>
  ```
- Produces (`chain.ts`): `type ChatCall = (p: ProviderEntry, apiKey: string, messages: {role:string;content:string}[]) => Promise<{ status: number; text: string }>`. The default POSTs to `{baseUrl}/chat/completions` with `response_format: {type:"json_object"}` and `temperature: 0`.
- Chain behaviour:
  - Skip providers whose `apiKeyEnv` is unset.
  - On 429, 5xx or a timeout, move to the next provider.
  - On a 2xx with invalid JSON or a zod failure, retry once on the same provider, then move to the next.
- Cache: `cache.ts` keys on `sha256(model + text)` and stores into `data/llm-cache.json`, which the state task persists.
- Example `providers.yml` (in the template): Groq `https://api.groq.com/openai/v1`, Gemini `https://generativelanguage.googleapis.com/v1beta/openai`, Cloudflare `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1`. Model IDs are set to free-tier models **verified live at task time**.

- [ ] **Step 1:** Write the failing tests, with a fake `ChatCall`:
  - `"falls through 429 to second provider"`
  - `"retries once on invalid json then moves on"`
  - `"all 429 returns all-quota"`
  - `"no keys set returns no-providers"`
  - `"zod rejects minYears 99"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The system prompt says to extract only what is stated, and to use null when absent. `mustHave` holds skills explicitly required ("must", "required", "should have"); `niceToHave` holds "good to have", "plus" and "preferred".
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: llm fallback chain and jd extraction`).

### Task 11: Decision and ranking

**Files:** Create: `src/filter/decide.ts`, `test/filter/decide.test.ts`

**Interfaces:**
- Produces: `decide(job: Job, facts: JdFacts | null, skills: SkillsFile, f: Filters): Verdict`
- Produces: `rank(matches: { job: Job; verdict: Extract<Verdict,{kind:"match"}> }[]): typeof matches`

Rules:
- If the job is a stub → `{kind:"stub"}`.
- If `facts` is null (AI unavailable) → a match with `aiChecked:false` and a band derived from `minYearsFromText`.
- With facts:
  - `role-type` skip if `roleType` is in `f.skipRoleTypes`
  - `min-years` skip if `minYears >= f.maxMinYears`
  - `core-stack` skip if `mustHave.length >= 2` and **none** of `mustHave` matches a skill or alias
  - `band = minYears === f.stretchMinYears ? "stretch" : "strong"`
  - `matched`/`missing` = `mustHave` split by skill match (case-insensitive, aliases included)
  - `score = matched / max(mustHave.length, 1)`
- Ranking order: strong before stretch, then score descending, then `postedAt` descending.

- [ ] **Step 1:** Write the failing tests:
  - `"java spring jd is strong match with matched [Java, Spring Boot]"`
  - `".NET core jd skipped core-stack"`
  - `"4 years min is stretch"`
  - `"unknown minYears never skips"`
  - `"facts null gives aiChecked false"`
  - `"rank puts strong 0.5 above stretch 1.0"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: rule decision and ranking`).

### Task 12: Instance state

**Files:** Create: `src/state/store.ts`, `test/state/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface JobRecord { job: Job; verdict: Verdict; facts: JdFacts | null; digestedAt: string | null }
  interface SourceHealth { source: string; ok: boolean; count: number; error: string | null }
  interface State { lastSuccessfulRun: string | null; imapMaxUid: number; jobs: Record<string, JobRecord>; lastHealth: SourceHealth[] }
  interface UserState { statuses: Record<string, string>; extraCompanies: Company[] } // written by the laptop in Plan 3
  loadState(dir: string): State
  saveState(dir: string, s: State): void
  loadUserState(dir: string): UserState
  ```
- Files: `data/state.json`, `data/llm-cache.json`, `data/user-state.json` (read-only here; missing means empty).
- Prune job records older than 30 days on save.

- [ ] **Step 1:** Write the failing tests:
  - `"missing files give empty state"`
  - `"round-trips"`
  - `"prunes records older than 30 days"`
  - `"user-state applied ids are readable"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with atomic writes (write a temp file, then rename).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: instance state store`).

### Task 13: Digest render and send

**Files:** Create: `src/digest/render.ts`, `src/digest/send.ts`, `test/digest/render.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DigestInput { date: Date; matches: { job: Job; verdict: Extract<Verdict,{kind:"match"}> }[];
    stubs: Job[]; skippedCounts: Partial<Record<RuleId, number>>; health: SourceHealth[]; aiUnavailable: boolean }
  renderDigest(d: DigestInput): { subject: string; html: string; text: string }
  sendDigest(m: { subject: string; html: string; text: string }, smtp: { user: string; pass: string }): Promise<void>
  ```
- Subject: `☕ chaijobs · {N} new matches · {DD Mon}`.
- Sections in order:
  1. Matches. Each shows title, company, cities, posted "Xh ago", band, matched/missing, and links. A `not AI-checked` tag appears when `aiChecked` is false.
  2. "From your alerts: needs full JD"
  3. Filtered counts by rule
  4. Source health, with failures first
- Caps: at most 25 matches, with an "and N more" line.
- `sendDigest` uses nodemailer through `smtp.gmail.com:465`, from and to `smtp.user`.

- [ ] **Step 1:** Write the failing tests:
  - `"zero matches still renders subject with 0 and health section"`
  - `"failed source listed first with its error"`
  - `"aiUnavailable shows not AI-checked banner"`
  - `"caps at 25 with and-N-more"`
  - `"html has no external images or scripts"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with inline styles only, for phone mail clients.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit (`feat: digest email`).

### Task 14: The `run` cycle

**Files:** Create: `src/pipeline/run.ts`. Modify: `src/cli.ts`. Test: `test/pipeline/run.test.ts`

**Interfaces:**
- Produces: `runCycle(opts: { instanceDir: string; now: Date; env: Record<string,string|undefined>; dryRun: boolean; deps?: Partial<RunDeps> }): Promise<{ digest: ReturnType<typeof renderDigest>; sent: boolean }>`. `RunDeps` holds the injectable adapters, `ChatCall` and `sendDigest`, so the test needs no network.
- CLI: `chaijobs run --instance <dir> [--dry-run]`. A dry run prints the digest text and does not send or save.
- Secrets come from env: `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `SERPAPI_KEY`, and the providers' `apiKeyEnv`.
- Behaviour:
  - Each source runs in its own try/catch, and its outcome goes into `SourceHealth`.
  - SerpApi is skipped (health `ok:true, count:0, error:"no key"`) when the key is unset.
  - Jobs already in state with `digestedAt`, or present in `user-state.statuses`, become `already-seen`.
  - LLM extraction runs only on survivors that aren't stubs.
  - The digest is sent **even when there are zero matches**.
  - `lastSuccessfulRun` is set only after the send succeeds.

- [ ] **Step 1:** Write the failing tests, all with fake deps:
  - `"one source throws: others still processed and health shows error"`
  - `"all providers 429: matches sent with aiUnavailable"`
  - `"previously digested job not repeated"`
  - `"user-state applied job not repeated"`
  - `"send failure leaves lastSuccessfulRun unchanged"`
  - `"zero jobs still sends"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the CLI.
- [ ] **Step 4:** Run `npm test && npm run build && node dist/cli.js run --instance test/fixtures/instance-min --dry-run`. Expected: PASS, and the digest text is printed.
- [ ] **Step 5:** Commit (`feat: daily run cycle`).

### Task 15: Instance template, `init`, company verify, and the real first digest

**Files:**
- Create: `template/instance/.github/workflows/daily.yml`, `template/instance/config/{companies,filters,providers,skills,alerts,serpapi}.yml`, `template/instance/README.md`
- Create: `src/commands/init.ts`, `src/commands/verifyCompanies.ts`
- Test: `test/commands/init.test.ts`
- Modify: `README.md` (quickstart)

**Interfaces:**
- Produces: `chaijobs init <dir>`, which copies `template/instance` into the directory, refusing a non-empty one.
- Produces: `chaijobs companies verify --instance <dir>`, which fetches each board and prints `OK n jobs` or `FAIL reason` per company, with exit code 1 if any fail.
- `daily.yml`:
  - triggers: `schedule: cron "37 1 * * *"` and `workflow_dispatch`; `permissions: contents: write`; `timeout-minutes: 15`
  - steps: Node 24 setup, then `npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.1.0 run --instance .` with secrets passed via `env:` only, then commit and push `data/`
  - (npm publish is deferred until the owner sets up an npm account)

- [ ] **Step 1:** Write the failing test `"init copies template and refuses non-empty dir"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `init` and `verifyCompanies`. Seed `companies.yml` with the boards the spike confirmed live (Greenhouse groww, rubrik, databricks; Lever cred, zeta, meesho), plus up to 30 more product, service, startup and GCC companies with South India offices. Add each one **only after `companies verify` prints OK**. Seed `skills.yml` with a **sample** backend skill set. A real user's skills go only into their private instance, never into the public template.
- [ ] **Step 4:** Run `npm test` and `node dist/cli.js companies verify --instance template/instance`. Expected: PASS, and every company OK.
- [ ] **Step 5:** Commit, tag `v0.1.0`, and push the tag.
- [ ] **Step 6 (owner's instance, the real test):**
  - Run `chaijobs init ~/Projects/chaijobs-instance` and `gh repo create chaijobs-instance --private --source=. --push`.
  - The owner adds the secrets in the web UI: `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, at least one LLM key, and optionally `SERPAPI_KEY`.
  - Run `gh workflow run daily.yml`.
  - Expected: the run succeeds, `data/state.json` is committed, and **the owner confirms the digest notification arrived on their phone with real jobs**.
- [ ] **Step 7:** Read `runs.log` from `digest-spike` and put the observed schedule delay in the README. With the owner's OK, run `gh repo delete SuryaSatyaNikhil503/digest-spike`.
