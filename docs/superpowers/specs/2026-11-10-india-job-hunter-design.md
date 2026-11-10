# India-first job hunter: design

Date: 2026-11-10 · Status: approved 2026-11-10 · Name: `chaijobs`

> Throughout this document, "the user" is a job seeker running their own copy of chaijobs. User-specific
> values (skills, cities, resume layout) live in that user's private config and fact bank, never here.

## 1. Intent

The first user is a backend developer in South India with a few years of experience in a Java/Spring/AWS
stack. Every morning the user wants a short list of **fresh (≤24h), relevant backend jobs in South India**
on their phone. For any job they pick, they want a **resume tailored to that JD from their own verified
facts**. When the JD has a recruiter email, they want a **Gmail draft ready to send**. **Every job and
application should be tracked** from first sight to outcome.

It is also an **open-source project**: useful to other Indian developers and freshers, and maintained to a standard that works as a portfolio piece. It must cost **₹0** to run.

Prior art: [career-ops](https://github.com/career-ops-hq/career-ops) (MIT, ~81k stars, Node) already does local tailoring, a tracker and draft-only emails. This project deliberately stays **narrow and India-first**: an always-on daily finder and filter with a phone digest, plus focused tailoring. It should be able to hand a job off to career-ops later, but it does not depend on career-ops.

## 2. Goals

1. Daily automatic discovery of jobs posted ≤24h ago, from (a) public company career-site feeds, (b) Google job search via an optional user-supplied SerpApi key, and (c) LinkedIn/Naukri/Indeed alert emails in the user's inbox.
2. A filter that matches how the owner judges jobs (§6), with every rejection logged with its reason.
3. A morning digest email that lands as a phone notification. This is proven by the spike in §13.
4. Resume tailoring from a fact bank, with code-enforced honesty checks (§8) and an ATS-safe one-page PDF.
5. A Gmail draft (resume attached) when the JD has an application email. Otherwise the dashboard shows the apply link next to the tailored PDF.
6. A tracker with a full status trail per job, the exact resume version sent, and automatic "applied" detection from the Gmail Sent folder.
7. A local dashboard on the laptop.
8. Installable by a fresher on Windows, macOS or Linux without paid services.

## 3. Non-goals (v1)

- Submitting applications or filling forms on any site. The owner sends drafts himself.
- Sending any email other than the digest to the user's own address.
- Logging in to, crawling or automating LinkedIn, Naukri or Indeed. Their content arrives only through alert emails, Google job search results, the browser extension, or paste.
- Cover letters, interview prep, salary benchmarking, referral finding, follow-up reminders.
- Multi-user hosting. Each user runs their own copy.
- Mobile app. The phone gets email only.

## 4. Anti-goals (failure even if it "works")

- **A tailored resume containing any number, claim, client name or internal repo name not traceable to the fact bank.** This is the worst possible failure.
- Getting the owner's GitHub, Google or LinkedIn account restricted.
- Personal data (fact bank, resumes, tracker, credentials) appearing in the public repo or in public logs.
- Silent failure: a source breaking, or a free LLM quota running out, without the digest saying so.
- A digest of hundreds of jobs. It must stay short enough to read on a phone.

## 5. Architecture

```
PUBLIC code repo (MIT)                 PRIVATE instance repo (per user, from a GitHub template)
  src/, templates, sample persona  ->    .github/workflows/daily.yml  (schedule 01:37 UTC = 07:07 IST)
  never runs the daily job              config/*.yml (filters, locations, companies, providers)
                                        data/jobs.* (committed state after each run)
                                        secrets: GMAIL_ADDRESS, GMAIL_APP_PASSWORD, LLM keys, SERPAPI_KEY

LAPTOP (owner's machine)
  CLI + local dashboard (localhost only)
  fact bank, tailoring, Typst PDF, Gmail drafts, Sent-folder watch, SQLite
  pulls new jobs from the instance repo (git / gh) when opened
  browser extension -> localhost only
```

- **Cloud cycle** (one command, also runnable on a laptop or any other scheduler): `fetch → normalise → dedupe → freshness and location → rule filter → LLM extraction → rule decision → rank → commit state → email digest`.
- **State ownership: single writer per file, so there are no merge conflicts.**
  - The cloud cycle owns `data/jobs.*` (discovered jobs, filter decisions, source health, `last_successful_run`).
  - The laptop owns `data/user-state.*`, which it commits and pushes to the instance repo. It holds per-job statuses (applied, skipped, …), jobs added by paste or the extension, and companies discovered on the laptop.
  - The cloud reads `user-state` at the start of each run. Applied, skipped or already-digested jobs are never shown as "new" again, and laptop-discovered companies join the watch list.
  - **Job identity key:** the canonical apply URL when one exists. Otherwise a hash of normalised company + normalised title + city.
- **Skills in the cloud (my call):** the laptop exports `config/skills.yml` from the fact bank into the instance repo. It holds skill names and aliases only: no projects, metrics or employer details, the same information as a public resume's skills section. The cloud uses it for the "core stack outside skills" rule, matched/missing lists and ranking.
- **The daily job never runs in the public repo.** This keeps logs private and avoids the 60-day schedule auto-disable that applies to public repos. It also keeps usage closest to GitHub's Actions terms ("production, testing, deployment, or publication of the software project"). The README must state plainly that this is a grey area and that the cycle is portable.
- **Stack: TypeScript on Node 24 LTS** in a single language for the CLI, cloud cycle, dashboard and extension. Use zod to validate every external and LLM payload, Vitest for tests, SQLite on the laptop, and Typst (an external binary) for the PDF. The dashboard UI library is the builder's call; keep it light.

## 6. Sources, freshness, location and filter

**Sources (each is a pluggable adapter with recorded fixture tests):**
- Career-site feeds: Greenhouse, Lever, Ashby and SmartRecruiters public job APIs first. Add Workday and Google Careers as dedicated adapters. Google Careers is not an official API, so its failure must show up in the digest.
- Google job search: SerpApi `google_jobs`, only when the user supplies a key. Otherwise the source is off.
- Alert emails: IMAP, searching only known sender addresses (LinkedIn, Naukri, Indeed) since the last processed UID. Alert jobs start as **stubs** (title, company, location, link) and are never tailored until the full JD is captured.
- Browser extension (Chrome MV3): one click sends the visible page text of the job being viewed to the localhost app. It never clicks, scrolls or navigates.
- Paste: URL or raw JD text, in the dashboard or CLI.

**Company watch list:** a seed list curated during build, covering product, service, startup and GCC companies with South India offices, each entry verified against its live hiring-platform board. **Auto-discovery:** any job link that points at a supported hiring-platform board adds that company to the watch list. Every company is tagged by type and none is excluded for its type.

**Stubs (alert-email jobs without a JD), my call:**
- **Hydration:** the cloud first tries to match the stub to the same job in a career-site feed or a Google job search result (by company + title + city), and takes the full JD from there. Otherwise the JD comes from the owner via the extension or paste.
- **Filtering:** unhydrated stubs pass the cheap rules (title, location, date) only. Unknown experience never causes a skip.
- **Digest:** they appear in a separate digest section, "From your alerts: needs full JD", ranked below verified matches.
- **Posting date:** the alert email's received time is the stub's posting-time proxy.

**Freshness window (my call):** the window runs from `last_successful_run` to now, capped at 36h. A late run then doesn't drop jobs, and a missed day is mostly recovered. The digest still describes jobs as "posted in the last day". On the first run, jobs without any posting date are recorded but not digested, which prevents a flood.

**Freshness:** keep a job only if it was posted within the window above. Each adapter maps its platform's real *posting* date, not its "updated" date. A spike measurement found Greenhouse's `updated_at` would mislead, so the builder must confirm the true posting field per platform. When no date exists, use "first seen by us" and label the job that way.

**Location:** South India means AP, Telangana, Karnataka, Tamil Nadu, Kerala and Puducherry, with explicit cities Hyderabad, Bengaluru, Chennai, Coimbatore and Vizag. Spelling variants are normalised. A multi-city posting passes if any city qualifies. Remote roles open to India pass (owner to confirm, §12).

**Filter (owner's rules; plain code decides, the LLM only extracts facts):**
- Skip if the minimum required experience is ≥5 years. A minimum of 4 is marked **stretch**.
- Skip frontend-only roles. Full-stack roles that are mainly backend pass.
- Skip if the core (must-have) stack is outside the owner's skills, e.g. .NET, PHP, Salesforce, SAP, mobile, pure DevOps/SRE, QA, or data science.
- Skip if posted >24h ago.
- The rules live in an editable `config/filters.yml`. Every skip records which rule fired.

**Order for cost:** cheap rules run on title, location and date first, and the LLM runs only on survivors. A measurement on 1,170 real postings from 6 companies left 16 (1.4%) after cheap rules. The median JD is about 1,400 tokens.

## 7. LLM providers

- One provider interface. Most providers sit behind an **OpenAI-compatible HTTP adapter** with a configurable base URL, model and key.
- **Cloud extraction uses a free-tier fallback chain**, configurable, e.g. Groq → Cloudflare Workers AI → Gemini. On 429 or quota exhaustion, try the next provider. If all are exhausted, the job is decided by rules only and labelled "not AI-checked" in the digest.
- **Tailoring on the laptop:** the default for users with a Claude subscription is the `claude` CLI in headless mode on that subscription, which is low volume. Freshers without Claude use any provider from the same interface.
- Extraction output is zod-validated, with one bounded retry, and is never stored if invalid. Responses are cached by content hash plus model.
- No provider is hard-coded. Experiential Labs is **not** used.

## 8. Fact bank and tailoring

**Fact bank** (`~/.chaijobs/factbank/`, never in any repo): an editable YAML/Markdown structure. It holds the profile (contact details, education, certifications), skills, and projects, each with problem, actions, and **metrics as discrete entries**. It also holds rules: the confidentiality denylist (client names, internal repo and product names, ticket ID patterns, customer brands), the displayed role and title policy, and style rules.

A user's fact bank is usually built from **several sources**: a long-form "everything I've done" document plus facts that appear only in past tailored resumes. The fact bank must hold their union. **Importer (product feature):** `chaijobs factbank import <file|paste>` takes resume or dossier text (PDF, DOCX, Markdown or plain text), drafts the YAML with an LLM, and marks every entry `unreviewed`. Tailoring refuses unreviewed entries until the user confirms them in the dashboard. Freshers need this too.

Source documents are saved verbatim under `~/.chaijobs/factbank/sources/` (outside every repo) before importing.

**Presentation rules are per-user config** (`factbank/rules.yml`), for example:
- The displayed roles and titles (a user may merge several titles at one employer into one role).
- Bullets follow the Google XYZ shape and are 20–30 words, at most 2 lines.
- Banned characters and phrases (e.g. no en or em dashes, no "Responsible for", "Helped with", "Powering").
- One page by default.
- The default template is a single column in this order:
  1. Name
  2. Title line ("<role> | <focus areas> | <city>")
  3. Contact line (phone, email, LinkedIn, GitHub, portfolio)
  4. PROFESSIONAL SUMMARY
  5. PROFESSIONAL EXPERIENCE
  6. TECHNICAL SKILLS (grouped lines)
  7. PROJECTS, ACHIEVEMENTS AND CERTIFICATIONS
  8. EDUCATION

  The look is navy section headings with a rule under each, and links in blue.

**Tailoring:** the JD's extracted requirements go to the LLM together with the fact bank. The LLM returns bullets, a summary and a skills selection, **each citing fact IDs**.

**Code-enforced checks before the owner sees a draft (failures block the PDF):**
1. Every number in the output appears in a cited fact.
2. Every cited fact ID exists.
3. No denylisted term appears.
4. **Claim terms trace (my call for v1):** every technology, tool or skill term in a bullet (matched against the skills taxonomy) must appear in a cited fact or in the fact bank's skills list. This catches "real fact, invented tech". Free-form claim wording isn't machine-checked in v1, which is why the owner's read-through before approval (status `approved`) stays mandatory, and an LLM judge is a possible later addition.
5. Style rules hold: word counts, banned characters and phrases.
5. Layout fits one page.
6. **ATS check:** text extracted from the rendered PDF contains every bullet, in order.

**Render:** a Typst template that reproduces the default layout above, using a single column and real text with no images or tables for content.

## 9. Applying and tracking

**Statuses:** `found → jd_captured → shortlisted → tailored → approved → draft_created → applied → replied / interview / rejected / offer / withdrawn`, plus `skipped(reason)`. Every transition is timestamped.

- A **Gmail draft** is created via IMAP APPEND to `[Gmail]/Drafts` with the PDF attached. The subject and body are templated with a short JD-specific note. **No mail is ever sent by the app** except the digest to the user's own address.
- **Applied detection:** the app watches the Sent folder for a message whose Message-ID or subject token matches a draft it created, then marks the job `applied` with the real send time.
- **Link-only jobs:** the dashboard shows the apply link next to the tailored PDF. The owner marks a job applied with one click.
- Each job keeps the exact PDF and the fact IDs used. These artifacts are immutable once applied.
- Reply classification (rejection, interview) is a later milestone and not required for v1 done.

## 10. Digest and dashboard

- **Digest** (daily, about 07:07 IST): new matches ranked by must-have coverage. Each shows title, company and type, city, posted time, matched and missing skills, fit band (strong/stretch), and links. Below that: counts of what was filtered and why, source health (which sources failed), and LLM quota status. Plain HTML that is readable on a phone.
- **Dashboard** (localhost only): job list with filters, job detail (JD, extracted facts, fit reasons), tailor/approve/draft buttons, the status trail, the filtered-out log with reasons, and fact bank validation errors.

## 11. Open-source quality bar

- MIT licence.
- README with a quickstart, an honest privacy and terms section, and what's rough.
- CONTRIBUTING with "add a source adapter" and "add a company" guides.
- **CLAUDE.md under 200 lines** with exact build, test and lint commands and the architecture rules that matter.
- CI on Ubuntu **and Windows** running lint, typecheck, tests and a fresh-install smoke test.
- A synthetic sample persona and fact bank for demos and tests. **No real JDs or personal data are committed.** Fixtures are synthetic or paraphrased.
- Conventional commits.
- `.gitignore` set up before the first commit to exclude the fact bank, resumes, `data/`, `.env` and any credentials.

## 12. Decided by the builder / still open

**Builder's calls:**
- Dashboard UI library, file and package layout, SQLite driver.
- The committed state format in the instance repo.
- Seed company list contents. Each entry must be verified live.
- Dedupe method across sources.
- Ranking details beyond must-have coverage.
- Exact digest layout.

**Open (owner):**
- ~~Final project name~~ **Decided: `chaijobs`** (npm name free, no GitHub repos with that name as of 2026-11-10).
- ~~Whether India-remote roles count~~ **Decided: yes.** Remote roles open to India pass the location rule. This is a config flag, on by default.
- ~~Labelling~~ **Decided:** the owner hand-labels at least 30 JDs as apply/skip once the first filter version runs, a few days into the build.

## 13. Evidence and acceptance

**Already proven (spike `SuryaSatyaNikhil503/digest-spike`, private, to be deleted after use):**
- An Actions run sends Gmail SMTP mail to self.
- The notification reached the owner's phone.
- State commits back to the repo between runs.
- The scheduled-run delay is being measured from 2026-11-11.

**v1 is done when:**
1. Seven consecutive daily digests arrive with ₹0 spent and source health visible.
2. Filter decisions on a hand-labelled set of at least 30 synthetic and paraphrased JDs match the owner's labels. Zero jobs the owner labels "apply" may be skipped.
3. Every generated resume passes all §8 checks. A test suite includes deliberate fabrication attempts (an invented number, a denylisted name) that must be blocked.
4. A draft created by the app, then sent by the owner, is auto-marked `applied`.
5. Windows CI install smoke test passes, and a fresher (a real person, not the author) gets to a first digest from the README alone.
