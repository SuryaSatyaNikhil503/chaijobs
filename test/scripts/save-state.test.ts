import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/save-state.sh", import.meta.url));
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const identity = (cwd: string) => {
  git(cwd, "config", "user.name", "test");
  git(cwd, "config", "user.email", "test@example.com");
};

function setup() {
  const root = mkdtempSync(join(tmpdir(), "chaijobs-save-"));
  const origin = join(root, "origin.git");
  git(root, "init", "--bare", "-b", "main", origin);
  const seed = join(root, "seed");
  git(root, "clone", origin, seed);
  identity(seed);
  writeFileSync(join(seed, "README.md"), "instance\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "init");
  git(seed, "push", "origin", "main");
  const action = join(root, "action");
  const laptop = join(root, "laptop");
  git(root, "clone", origin, action);
  git(root, "clone", origin, laptop);
  identity(laptop);
  return { origin, action, laptop, root };
}

describe.skipIf(process.platform === "win32")("save-state.sh", () => {
  it("pushes the run's data even when the laptop pushed in between", () => {
    const { action, laptop, root } = setup();
    mkdirSync(join(laptop, "data"));
    writeFileSync(join(laptop, "data", "user-state.json"), '{"statuses":{}}\n');
    git(laptop, "add", "-A");
    git(laptop, "commit", "-m", "laptop");
    git(laptop, "push", "origin", "main");

    mkdirSync(join(action, "data"));
    writeFileSync(join(action, "data", "state.json"), "{}\n");
    execFileSync("bash", [script], { cwd: action });

    const check = join(root, "check");
    git(root, "clone", join(root, "origin.git"), check);
    expect(git(check, "ls-files", "data")).toBe("data/state.json\ndata/user-state.json");
  });

  it("succeeds with nothing to save when data/ does not exist", () => {
    const { action } = setup();
    expect(() => execFileSync("bash", [script], { cwd: action })).not.toThrow();
  });
});
