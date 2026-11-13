# ☕ chaijobs

**Your morning chai and today's jobs.** chaijobs is an India-first job finder that runs free every
morning. It looks at company career sites, Google job search and your LinkedIn, Naukri and Indeed
alert emails. It keeps only fresh backend roles in the cities you choose, filters them by your own
rules, and emails you a short ranked list at about 7 AM.

> Status: early. Plan 1 (the daily digest) is being built. Resume tailoring, Gmail drafts and the
> application tracker come in later plans.

## How it works

- **This repo** holds the code. It never runs your daily job.
- **Your private instance repo**, created with `chaijobs init`, holds your settings and secrets.
  GitHub Actions runs `chaijobs run` there on a schedule and commits a small state file.
- **Plain code makes every decision.** A free-tier LLM only reads job descriptions to pull out facts
  (years required, must-have skills). Every skipped job is logged with the rule that skipped it.

## Privacy and terms, plainly

- Your job history and settings live in **your own private repo**. Nothing is sent to us, because
  there is no "us".
- chaijobs **never logs in to or crawls LinkedIn, Naukri or Indeed**. Jobs from those sites arrive
  only through your own alert emails or Google job search (SerpApi, optional, your key).
- The only email chaijobs sends is your digest, from your address to your address.
- Your Gmail app password gives full access to that mailbox, so the daily workflow is hardened around it:
  - chaijobs and every GitHub Action are pinned to exact commits.
  - Dependencies install from the lockfile with install scripts disabled, in a step that has no secrets.
  - Only the final run step can read your secrets.
- **GitHub Actions terms:** GitHub asks that hosted runners be used for the software project in
  the repo. A small daily run of this project's own code in its instance repo is a reasonable
  reading, but it is a grey area. If GitHub objects, the same `chaijobs run` command works on your
  laptop or any other scheduler.

## Quickstart

You need Node 24+, a GitHub account, and the GitHub CLI (`gh`).

```bash
npx --yes github:SuryaSatyaNikhil503/chaijobs init my-chaijobs   # creates your instance folder
cd my-chaijobs
git init -b main && git add -A && git commit -m "chore: my chaijobs instance"
gh repo create my-chaijobs --private --source=. --push          # PRIVATE: it will hold your job history
```

Then follow `my-chaijobs/README.md`: add your secrets (Gmail app password and one free LLM key),
put your skills in `config/skills.yml`, and press **Run workflow** once in the Actions tab.
After that the digest arrives every morning at about 07:07 IST.

`init` pins your workflow to the exact chaijobs commit of the release you installed, and never to a
movable tag. To upgrade later, run `npx --yes github:SuryaSatyaNikhil503/chaijobs#<new-tag> init new-folder`
and copy the new `ref:` line into your `daily.yml`. Or edit the `ref:` line yourself after reviewing the changes.

To test your AI keys without touching your inbox: Actions > chaijobs-daily > **Run workflow** >
mode **check-providers**. It sends one made-up job description to each configured provider and reports
`ok`, `failed` or `no key` for each.

Try it without sending anything:

```bash
npx --yes github:SuryaSatyaNikhil503/chaijobs run --instance my-chaijobs --dry-run
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licence: [MIT](LICENSE).
