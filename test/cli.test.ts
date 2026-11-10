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
});
