#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";

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

program.command("run").description("Run the daily cycle for an instance").action(notImplemented);
program.command("init").description("Create a private instance folder").action(notImplemented);
program
  .command("companies")
  .description("Company watch-list tools")
  .command("verify")
  .description("Check every configured company board is live")
  .action(notImplemented);

program.parse();
