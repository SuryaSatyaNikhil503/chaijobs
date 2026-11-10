#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { runCycle } from "./pipeline/run.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const notImplemented = () => {
  console.error("not implemented");
  process.exitCode = 1;
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
program.command("init").description("Create a private instance folder").action(notImplemented);
program
  .command("companies")
  .description("Company watch-list tools")
  .command("verify")
  .description("Check every configured company board is live")
  .action(notImplemented);

await program.parseAsync();
