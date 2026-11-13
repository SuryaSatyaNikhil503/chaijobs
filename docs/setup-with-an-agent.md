# Set up chaijobs with an AI coding agent

Paste the prompt below into your agent (Claude Code, Codex, Cursor or similar), opened in an **empty
folder**. The agent does the commands and checking. You do everything that involves an account or a
secret.

## The rules (the agent must follow these)

1. **The human handles every secret.** Never ask for, accept, print or store a password, Gmail app password,
   API key or token. If the human pastes one into the chat, stop. Tell them to revoke and replace it, then
   continue.
2. Secrets are entered only in **GitHub's web form** (repo → Settings → Secrets and variables → Actions,
   *repository* secrets) or at **Wrangler's hidden `Enter a secret value:` prompt**, typed by the human.
3. The instance repo must be **private**. Check with `gh repo view --json visibility`.
4. Use only the released tag (`#v0.2.0` or newer) and never edit the pinned `ref:` without saying why.
5. Verify each step with the command's own output before moving on, and say what you saw.

## The prompt

```text
Set up chaijobs (https://github.com/SuryaSatyaNikhil503/chaijobs) for me, following its README section
"Set up for yourself", one step at a time. Follow the rules in docs/setup-with-an-agent.md: I enter every
secret myself; you never ask for one or print one.

About me (edit these):
- Cities: Hyderabad, Bengaluru, Chennai (South India + remote-India is the default)
- My skills (only real ones): Java, Spring Boot, PostgreSQL, AWS, REST APIs
- Skip jobs asking for 5+ years
- My GitHub username: <you>

Steps:
1. Check Node 24+ and that `gh auth status` is logged in.
2. Run `npx --yes github:SuryaSatyaNikhil503/chaijobs#v0.2.0 init my-chaijobs`.
3. Put my skills in config/skills.yml (names plus common spellings, nothing I didn't list), then run
   `companies verify` and `run --dry-run` and show me the digest text.
4. Create a PRIVATE GitHub repo from the folder and push it.
5. Tell me exactly which repository secrets to add and where, then wait while I add them.
6. Trigger the workflow in mode check-providers, then in mode digest, and show me the results.
7. Walk me through the Cloudflare on-time trigger: you edit trigger/wrangler.toml and run login and
   deploy; I run `secret put GITHUB_TOKEN` and paste the token at the prompt myself. Then check
   `wrangler secret list` shows the name GITHUB_TOKEN.
8. Clone the repo, start `chaijobs dashboard`, and open it for me.
```

## After setup

Ask your agent to **check today's run**. It can read your instance repo's Actions runs
(`gh run list`, `gh run view --log`) and your `data/state.json` to tell you whether the digest went out on
time and why jobs were filtered. It never needs your secrets to do that.
