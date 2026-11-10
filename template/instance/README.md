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
