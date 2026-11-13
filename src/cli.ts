#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { initInstance, resolveReleaseRef } from "./commands/init.js";
import { checkProviders } from "./commands/providers.js";
import { verifyCompanies } from "./commands/verifyCompanies.js";
import { loadConfig } from "./config/load.js";
import { startDashboard } from "./dashboard/server.js";
import { pullInstance } from "./dashboard/sync.js";
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
  .option(
    "--min-gap-hours <n>",
    "skip if a digest was sent less than n hours ago (for late fallback runs)",
    Number,
  )
  .action(async (opts: { instance: string; dryRun: boolean; minGapHours?: number }) => {
    const result = await runCycle({
      instanceDir: resolve(opts.instance),
      now: new Date(),
      env: process.env,
      dryRun: opts.dryRun,
      ...(opts.minGapHours !== undefined ? { minGapHours: opts.minGapHours } : {}),
    });
    if (result.skipped) console.log(`Skipped: ${result.skipped}`);
    else if (opts.dryRun) console.log(result.digest?.text ?? "");
    else console.log(result.sent ? `Digest sent: ${result.digest?.subject}` : "Digest not sent");
  });
program
  .command("init <dir>")
  .description("Create your private instance folder from the template")
  .option("--ref <sha>", "chaijobs commit to pin (default: the commit of this version's release tag)")
  .action((dir: string, opts: { ref?: string }) => {
    const ref = opts.ref ?? resolveReleaseRef(pkg.version);
    initInstance(resolve(dir), ref);
    console.log(`Created ${dir}, pinned to chaijobs ${ref.slice(0, 12)}.`);
    console.log("Next: push it as a PRIVATE GitHub repo and add your secrets (see its README).");
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

program
  .command("providers")
  .description("AI provider tools")
  .command("check")
  .description("Send one synthetic job description to each configured AI provider and report the result")
  .requiredOption("--instance <dir>", "path to your instance folder")
  .action(async (opts: { instance: string }) => {
    const { providers } = loadConfig(resolve(opts.instance));
    const results = await checkProviders(providers, process.env);
    for (const r of results) console.log(`${r.status.padEnd(7)} ${r.provider} (${r.model})  ${r.detail}`);
    if (!results.some((r) => r.status === "ok")) process.exitCode = 1;
  });

program
  .command("dashboard")
  .description("Open your job dashboard on this computer (127.0.0.1 only)")
  .requiredOption("--instance <dir>", "path to your local clone of your private instance repo")
  .option("--port <n>", "port to listen on", Number, 4567)
  .option("--no-sync", "do not pull from or push to the instance repo")
  .action(async (opts: { instance: string; port: number; sync: boolean }) => {
    const dir = resolve(opts.instance);
    const pulled = opts.sync ? (await pullInstance(dir)).note : null;
    if (pulled) console.log(pulled);
    const { url } = await startDashboard({
      instanceDir: dir,
      port: opts.port,
      sync: opts.sync,
      initialSyncNote: pulled,
    });
    console.log(`chaijobs dashboard: ${url}  (Ctrl+C to stop)`);
  });

await program.parseAsync();
