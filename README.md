# ☕ chaijobs

**Your morning chai and today's jobs.** chaijobs is a free, India-first job finder. Every morning it checks
company career sites, Google job search, and your Naukri, Indeed and LinkedIn alert emails. It keeps only
fresh roles in the cities you choose, filters them by your own rules, and emails you a short ranked list at
about 7:07 AM IST. A dashboard on your laptop lets you read each job and track what you've applied to.

It runs on your own GitHub account and free tiers. Nothing is hosted by us, and there is no "us" to send
your data to.

## What it does today (v0.2.0)

|                           |                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finds jobs**            | 34 verified company boards (Greenhouse, Lever, Ashby), Google job search via SerpApi (optional), and your Naukri / Indeed / LinkedIn alert emails, read-only over IMAP |
| **Keeps only fresh jobs** | Posted since the last digest (capped at 36 hours), so nothing is old news                                                                                              |
| **Filters by your rules** | South-India cities and remote-India, your skills, experience (skips 5+ years, flags 4 as a stretch), backend roles only. Every skipped job records why.                |
| **Reads each job**        | A free AI model pulls out years, must-have and nice-to-have skills. Plain code makes every decision, and the AI's answers are checked against the job text.            |
| **Morning email**         | Ranked matches with matched ✓ and missing ✗ skills, jobs that need a full description, filter counts and source health                                                 |
| **Dashboard**             | A local page with today's matches, a page per job, why jobs were filtered, and status buttons (applied, interview, …) that sync to your repo                           |
| **On time**               | An optional free Cloudflare trigger starts the run at 07:07 sharp. GitHub's own schedule is a guarded backup.                                                          |
| **Never repeats**         | A job you've seen, applied to or skipped never comes back as "new", even from another source                                                                           |

Not yet: tailored resumes, Gmail drafts, a browser extension, and Workday / service-company boards. See
[Roadmap](#roadmap).

## How it works

```
 your PRIVATE instance repo (GitHub)                 your laptop
 ┌──────────────────────────────────┐               ┌────────────────────────────┐
 │ config/   your skills and rules  │  git pull     │ chaijobs dashboard         │
 │ data/     job history (JSON)     │ ◀───────────▶ │ 127.0.0.1:4567             │
 │ Actions:  daily run, 07:07 IST   │  git push     │ (status changes)           │
 └──────────────┬───────────────────┘               └────────────────────────────┘
   started by   │  Cloudflare cron (on time) or GitHub schedule (backup)
                ▼
   fetch boards + alerts → filter → free AI reads JDs → rank → email to yourself
```

- **This public repo** is only the code. It never runs your job hunt.
- **Your private instance repo**, created by `chaijobs init`, holds your settings, secrets and history.

## Before you start

| You need                                                                        | Why                                                                                                       | Cost      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| A GitHub account and the [GitHub CLI](https://cli.github.com) (`gh auth login`) | Hosts your private instance repo and runs the daily job                                                   | Free      |
| [Node.js 24+](https://nodejs.org)                                               | Runs `chaijobs` on your laptop                                                                            | Free      |
| Gmail with **2-Step Verification on**                                           | An [app password](https://myaccount.google.com/apppasswords) sends the digest and reads your alert emails | Free      |
| A [Groq](https://console.groq.com) API key                                      | The free AI that reads job descriptions. Gemini also works.                                               | Free tier |
| _(Optional)_ a [SerpApi](https://serpapi.com) key                               | Google job search, which also covers many LinkedIn, Naukri and Indeed postings                            | Free tier |
| _(Optional)_ a [Cloudflare](https://dash.cloudflare.com) account                | On-time 07:07 delivery                                                                                    | Free      |

Setup takes about 20 minutes. Use your **personal** email for every account. A college or work email can be
switched off later, and your digest would stop with it.

## Set up for yourself

### 1. Create your instance

```bash
npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.2.0 init my-chaijobs
cd my-chaijobs
```

`init` copies the template and pins the daily workflow to the **exact commit** of the release you installed,
never to a movable tag.

### 2. Make the settings yours

| File                   | What to change                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/skills.yml`    | **Your** skills: names plus spellings, e.g. `{ name: Spring Boot, aliases: [springboot] }`. List only skills you really have. The filter skips jobs whose core stack isn't here. |
| `config/filters.yml`   | Experience limit (`maxMinYears: 5`), stretch level, role types to skip, remote-India on or off                                                                                   |
| `config/companies.yml` | Company boards to watch. Add one with `name`, `type`, `ats` (greenhouse / lever / ashby) and `slug`.                                                                             |
| `config/alerts.yml`    | Alert senders to read. The defaults cover Naukri, Indeed and LinkedIn.                                                                                                           |
| `config/serpapi.yml`   | Google job search queries, e.g. `backend developer Hyderabad`                                                                                                                    |

Check your company list and try a full run without sending anything:

```bash
npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.2.0 companies verify --instance .
npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.2.0 run --instance . --dry-run
```

### 3. Push it as a **private** repo

```bash
git init -b main && git add -A && git commit -m "chore: my chaijobs instance"
gh repo create my-chaijobs --private --source=. --push
```

### 4. Add your secrets

On GitHub, open your repo, then **Settings → Secrets and variables → Actions → New repository secret**. Use
**repository** secrets, not environment secrets.

| Secret               | Value                                   |
| -------------------- | --------------------------------------- |
| `GMAIL_ADDRESS`      | your Gmail address                      |
| `GMAIL_APP_PASSWORD` | the 16-character app password           |
| `GROQ_API_KEY`       | your Groq key (and/or `GEMINI_API_KEY`) |
| `SERPAPI_KEY`        | optional                                |

Type secrets **only** into GitHub's web form. Never paste them into a terminal command, a chat or a file.

### 5. Test your AI key (no email is sent)

Go to **Actions → chaijobs-daily → Run workflow**, choose mode **check-providers**, and run it. The log
should show `ok groq (...) extracted minYears=3, mustHave=Java,REST APIs`.

### 6. Send your first digest

Run the workflow again with mode **digest**. The email arrives within a couple of minutes. From now on it
runs every day.

### 7. Make it arrive on time (recommended)

GitHub's own schedule is best-effort. In our testing it started runs **6–7 hours late**. The `trigger/` folder
in your instance holds a tiny Cloudflare Worker that starts the run at exactly 07:07 IST. GitHub's schedule
stays as a backup and skips itself if the digest already went out.

1. Create a **fine-grained** token at GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens.
   - **Repository access:** only your instance repo.
   - **Permissions:** **Actions: Read and write**. Nothing else.
   - **Expiry:** 1 year.
2. In `trigger/wrangler.toml`, set `GITHUB_REPO = "your-username/my-chaijobs"`.
3. Open **https://dash.cloudflare.com → Workers & Pages** once. This creates the account subdomain that cron
   triggers need.
4. From the `trigger/` folder:

   ```bash
   npx --yes wrangler@4.156.0 login
   npx --yes wrangler@4.156.0 deploy
   npx --yes wrangler@4.156.0 secret put GITHUB_TOKEN
   ```

   For the last command, type it **exactly as shown**, press Enter, and paste the token only at the
   `Enter a secret value:` prompt.

The deploy output should list `schedule: 37 1 * * *`. New cron schedules can take a few minutes to start.

### 8. Use the dashboard

```bash
git clone https://github.com/<you>/my-chaijobs.git ~/my-chaijobs
npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.2.0 dashboard --instance ~/my-chaijobs
```

Open **http://127.0.0.1:4567**. Mark jobs as applied, skipped, interview and so on. Each change is pushed to
your repo, so the morning email never shows that job again. Add `--no-sync` to keep changes on your laptop.

## Set up with your AI agent

Agents like Claude Code, Codex or Cursor can do most of the setup. You keep anything secret:

- **You** create accounts and tokens and type secrets into GitHub's and Wrangler's prompts.
- **The agent** runs commands, edits your config and verifies each step.
- **Never** paste a password, app password or token into the agent's chat.

Open your agent in an empty folder and give it [docs/setup-with-an-agent.md](docs/setup-with-an-agent.md).
The prompt and the rules it must follow are in that file.

## Troubleshooting

| Symptom                                                     | Cause and fix                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The digest arrives in the afternoon                         | GitHub's schedule is late. Set up step 7.                                                                                                                                 |
| `wrangler deploy` says "You need a workers.dev subdomain"   | Open Cloudflare → Workers & Pages once, then deploy again.                                                                                                                |
| `wrangler secret list` shows a name starting `github_pat_…` | The token was pasted where the name goes. Delete that secret, **revoke the token on GitHub**, make a new one, then run `secret put GITHUB_TOKEN` and paste at the prompt. |
| The digest says "not AI-checked"                            | No AI key, or the free quota is used up. Run mode **check-providers** to see which.                                                                                       |
| Gmail login fails in the workflow                           | Turn on 2-Step Verification, create a new app password, and update `GMAIL_APP_PASSWORD`.                                                                                  |
| A source shows ✗ in the email                               | That company's board moved or closed. Run `companies verify` and remove or fix it.                                                                                        |
| The dashboard says "push failed"                            | Your status is saved on your laptop. Run `git pull` in your clone and save the status again.                                                                              |
| The dashboard says "Forbidden"                              | Reload the page. Each dashboard start issues a new form token.                                                                                                            |

## Privacy, safety and terms

- Your settings, history and secrets live **only** in your private repo and on your laptop.
- chaijobs **never logs in to or crawls LinkedIn, Naukri or Indeed**. Their jobs arrive only through your own
  alert emails or SerpApi.
- The only email chaijobs sends is your digest, from your address to your address. The inbox is read
  read-only, only from the alert senders you configure.
- **Supply chain:** the daily workflow pins chaijobs and every GitHub Action to exact commits. It installs with
  scripts disabled, in a step that has no secrets, and only the final step can read your secrets.
- **Dashboard:** it listens on `127.0.0.1` only. It is protected against cross-site requests and DNS
  rebinding, and job text is always shown as plain text.
- **GitHub Actions terms:** hosted runners are meant for the repo's own software project. A small daily run
  of this project's code in its instance repo is a reasonable reading, but it is a grey area. The same
  command works on any scheduler.

## Updating

Pin your instance to a new release by changing the `ref:` line in `.github/workflows/daily.yml` to that
release's commit. Or run `init` from the new tag into a new folder and copy the line across. Read the
release notes first.

## Roadmap

- **Plan 2:** Workday, Google Careers and SmartRecruiters boards (service companies); matching alert-email
  jobs to their full description; checking the filter against 30 hand-labelled jobs.
- **Plan 3b:** a fact bank built from your resume; tailored one-page resumes with code-enforced honesty
  checks; Gmail drafts; a browser extension to capture a job from any page.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Project conventions for AI coding agents are in
[CLAUDE.md](CLAUDE.md). Licence: [MIT](LICENSE).
