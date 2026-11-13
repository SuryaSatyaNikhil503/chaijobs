# chaijobs

India-first daily job finder. One command (`chaijobs run`) fetches fresh jobs, filters them by the
user's rules and emails a morning digest. It runs on a schedule in each user's **private instance
repo**. This public repo holds only the code and the instance template.

Design: `docs/superpowers/specs/2026-11-10-india-job-hunter-design.md`
Current plan: `docs/superpowers/plans/2026-11-10-chaijobs-plan-1-daily-digest.md`

## Commands

```bash
npm ci                 # install (runs build via prepare)
npm run build          # tsc -> dist/
npm test               # vitest run (needs a build first: test/cli.test.ts runs dist/cli.js)
npx vitest run test/filter          # one folder
npm run lint           # biome check .
npm run format         # biome check --write .
npm run typecheck      # tsc --noEmit
node dist/cli.js run --instance test/fixtures/instance-min --dry-run   # full cycle, no send, no save
node dist/cli.js dashboard --instance <clone of your instance repo>   # local dashboard on 127.0.0.1:4567
```

Before you say a change is done: `npm run lint && npm run typecheck && npm run build && npm test`.
CI runs the same on Ubuntu and Windows, plus a fresh-install smoke test (`npm pack` -> install -> `--version`).

## Stack

- Node >= 24, TypeScript (strict, ESM, `NodeNext`). Use the global `fetch`, with no HTTP client libraries and no LLM SDKs.
- Libraries:
  - zod: validates everything that crosses a boundary (config files, API responses, LLM output).
  - `yaml`: config files.
  - `imapflow` + `mailparser`: alert emails.
  - `nodemailer`: the digest.
  - `html-to-text`: JD bodies.
  - `commander`: the CLI.
- Vitest for tests, Biome for lint and formatting (2-space indent, 110-column lines).

## Module map

| Path                  | Responsibility                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/types.ts`   | `RawJob`, `Job`, `Verdict`, `RuleId`, shared types                                                                                               |
| `src/config/`         | zod schemas and `loadConfig(instanceDir)` for `config/*.yml`                                                                                     |
| `src/sources/`        | one adapter per source, returning `RawJob[]`; `http.ts` has `fetchJson` and `SourceError`                                                        |
| `src/sources/alerts/` | IMAP fetch plus one parser per alert sender (LinkedIn, Naukri, Indeed)                                                                           |
| `src/pipeline/`       | `normalise.ts` (identity, dedupe) and `run.ts` (the whole cycle)                                                                                 |
| `src/filter/`         | `location.ts`, `freshness.ts`, `cheap.ts` (no LLM), `decide.ts` (rules on extracted facts, ranking)                                              |
| `src/llm/`            | OpenAI-compatible provider fallback chain, JD fact extraction, cache                                                                             |
| `src/state/`          | `data/state.json` (cloud-owned) and `data/user-state.json` (laptop-owned, read-only here)                                                        |
| `src/digest/`         | render (HTML + text) and send (Gmail SMTP to self)                                                                                               |
| `src/commands/`       | `init`, `companies verify`                                                                                                                       |
| `src/dashboard/`      | local dashboard: `model.ts` (view), `html.ts` (pages), `server.ts` (127.0.0.1, CSRF, Host check), `sync.ts` (git pull/push of `user-state.json`) |
| `template/instance/`  | what `chaijobs init` copies: the daily workflow and example config                                                                               |

## Architecture rules (do not break)

1. **The LLM extracts facts. Code decides.** The LLM only fills `JdFacts`. Skips, bands and ranking are
   plain functions in `src/filter/`, so the same input always gives the same verdict.
2. **Every skip has a `RuleId`.** No job disappears without a recorded reason.
3. **No provider is hard-coded.** Providers come from `providers.yml` as base URL + model + key env
   var. When a provider is rate-limited or broken, fall through to the next. If none work, decide by
   rules only and flag `aiChecked: false`.
4. **A source failure never stops the cycle.** Catch per source, record `SourceHealth`, and show it in
   the digest. A quiet day still sends a digest.
5. **The daily job never runs in this public repo**, only in a private instance repo.
6. **Never fetch LinkedIn, Naukri or Indeed directly.** Their jobs come only from alert emails or SerpApi.
7. **The only email sent is the digest, from the user's address to the same address.**
8. **State ownership:** the cycle writes `data/state.json`. The laptop app (a later plan) writes
   `data/user-state.json`. Never write the other side's file.
9. Inject network and time (`Fetcher`, `ChatCall`, `now: Date`) so tests never touch the network.
10. **Supply chain, for the instance workflow (`template/instance/.github/workflows/daily.yml`):**
    - Pin every action, and chaijobs itself, to a full commit SHA. Never use a tag.
    - Install with `npm ci --ignore-scripts` in a step that has **no secrets**.
    - Only the run step gets secrets.
11. **Compact state:** keep full records only for matches and stubs. Skipped jobs go in the compact `seen` map.
    Write one record per line. A real run leaves `state.json` around 2 MB (measured 1.8 MB with titles), never tens of MB.
12. **LLM output is untrusted:** `groundFacts` keeps only skills and emails that appear in the JD text.
    A years figure stated in the text overrides the model's.

## Tests and fixtures

- Test-driven: write the failing test, watch it fail, then implement.
- **Fixtures are synthetic or paraphrased.** Never commit a real job description, a real alert email,
  personal data, or API responses with personal data in them. Keep the real response _shape_;
  replace companies, titles and links.
- Test names describe behaviour (`"1-5 years not skipped"`), one behaviour per test.

## Privacy

Never commit `.env`, `data/`, `factbank/`, `*.pdf` or `*.eml` (`.gitignore` covers them). Secrets
live in the instance repo's GitHub secrets and reach the code only through `process.env`.

## Commits

Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), small and one concern each.
