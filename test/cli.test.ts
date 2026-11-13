import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("cli", () => {
  it("prints version", () => {
    const out = execFileSync(process.execPath, ["dist/cli.js", "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe(pkg.version);
  });

  it("dashboard --help lists --instance, --port and --no-sync", () => {
    const out = execFileSync(process.execPath, ["dist/cli.js", "dashboard", "--help"], { encoding: "utf8" });
    expect(out).toContain("--instance");
    expect(out).toContain("--port");
    expect(out).toContain("--no-sync");
  });
});
