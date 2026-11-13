# My chaijobs instance (keep this repo PRIVATE)

This repo runs the chaijobs daily digest for one person. It holds your settings (`config/`),
your job history (`data/`, committed by the daily run) and, in GitHub secrets, your credentials.

## Setup

1. Repo settings > Secrets and variables > Actions > **New repository secret**:
   - `GMAIL_ADDRESS`: your Gmail address
   - `GMAIL_APP_PASSWORD`: a Gmail app password (https://myaccount.google.com/apppasswords, needs 2-Step Verification)
   - `GROQ_API_KEY` and/or `GEMINI_API_KEY`: at least one free LLM key
   - `SERPAPI_KEY` (optional): Google job search
2. Edit `config/skills.yml` (your skills), `config/filters.yml` (your rules) and `config/companies.yml`.
3. Actions tab > chaijobs-daily > **Run workflow** to test. After that it runs every day at about 07:07 IST.

## On-time delivery (recommended)

GitHub's own schedule is best-effort and has recently started runs **hours** late. The `trigger/` folder
holds a tiny Cloudflare Worker (free plan) that starts this workflow at exactly 07:07 IST through GitHub's
API. GitHub's schedule stays as a backup and skips itself if the trigger already sent today's digest.

1. **GitHub token:** Settings > Developer settings > Personal access tokens > Fine-grained tokens >
   Generate new token.
   - **Repository access:** only this repo.
   - **Permissions:** Actions: Read and write. Nothing else.
   - **Expiry:** 1 year.
2. Set `GITHUB_REPO` in `trigger/wrangler.toml` to `your-username/this-repo`.
3. From `trigger/`, in your own terminal:

   ```bash
   npx --yes wrangler@4.156.0 login                  # opens a browser; free Cloudflare account
   npx --yes wrangler@4.156.0 deploy
   npx --yes wrangler@4.156.0 secret put GITHUB_TOKEN  # paste the token when asked
   ```
4. **Check it:** the next morning, the Actions tab shows a `workflow_dispatch` run at about 07:07 IST.

The token can only start, re-run or cancel this repo's workflows. It cannot read your secrets or code.
Revoke it any time on the same GitHub page.
