#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { initInstance } from "./commands/init.js";
import { verifyCompanies } from "./commands/verifyCompanies.js";
import { loadConfig } from "./config/load.js";
import { defaultDeps, runCycle } from "./pipeline/run.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const program = new Command("chaijobs")
  .description("Your morning chai and today's jobs.")
  .version(pkg.version);

program
  .command("run")
  .description("Run the daily cycle for an instance: fetch, filter, email the digest")
  .requiredOption("--instance <dir>", "path to your private instance folder")
  .option("--dry-run", "print the digest instead of sending it; save nothing", false)
  .action(async (opts: { instance: string; dryRun: boolean }) => {
    const { digest, sent } = await runCycle({
      instanceDir: resolve(opts.instance),
      now: new Date(),
      env: process.env,
      dryRun: opts.dryRun,
    });
    if (opts.dryRun) console.log(digest.text);
    else console.log(sent ? `Digest sent: ${digest.subject}` : "Digest not sent");
  });
program
  .command("init <dir>")
  .description("Create your private instance folder from the template")
  .action((dir: string) => {
    initInstance(resolve(dir));
    console.log(
      `Created ${dir}. Next: push it as a PRIVATE GitHub repo and add your secrets (see its README).`,
    );
  });
program
  .command("companies")
  .description("Company watch-list tools")
  .command("verify")
  .description("Check every configured company board is live")
  .requiredOption("--instance <dir>", "path to your instance folder")
  .action(async (opts: { instance: string }) => {
    const { companies } = loadConfig(resolve(opts.instance));
    const results = await verifyCompanies(companies, defaultDeps.fetchCompany);
    for (const r of results) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.company}  ${r.detail}`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  });

await program.parseAsync();
