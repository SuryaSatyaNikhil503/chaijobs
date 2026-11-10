# Contributing to chaijobs

Thanks for helping. A few rules keep this project trustworthy:

- Run `npm run lint && npm run typecheck && npm run build && npm test` before opening a PR.
- **Write the failing test first.** Every behaviour change comes with a test.
- **Never commit real job descriptions, real emails or personal data.** Fixtures keep the real
  _shape_ of a response, with made-up companies, titles and links.
- Conventional commit messages (`feat:`, `fix:`, `docs:` and so on).

## Add a source adapter

1. Check the source's terms. We use public, unauthenticated job feeds only. We never log in to or
   crawl LinkedIn, Naukri or Indeed.
2. Call the real endpoint once and find the field that holds the **first published** date. An
   "updated" field is not a posting date. If no posting date exists, map it to `postedAtKind: "first-seen"`.
3. Add `src/sources/<name>.ts` exporting `fetch<Name>(company, fetcher?) => Promise<RawJob[]>`.
   Validate the response with zod and throw `SourceError` on anything unexpected.
4. Add a synthetic fixture in `test/fixtures/sources/<name>.json` and a test using a fake `Fetcher`.
5. Register the adapter in `src/pipeline/run.ts` and document it in the README.

## Add a company to the watch list

Add it to `template/instance/config/companies.yml` (`name`, `type`, `ats`, `slug`), then run
`chaijobs companies verify --instance template/instance`. Only add companies that print `OK`.
