import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pullInstance, pushUserState } from "../../src/dashboard/sync.js";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const identity = (cwd: string) => {
  git(cwd, "config", "user.name", "test");
  git(cwd, "config", "user.email", "test@example.com");
};
const noWait = async () => {};

function setup() {
  const root = mkdtempSync(join(tmpdir(), "chaijobs-sync-"));
  const origin = join(root, "origin.git");
  git(root, "init", "--bare", "-b", "main", origin);
  const seed = join(root, "seed");
  git(root, "clone", origin, seed);
  identity(seed);
  mkdirSync(join(seed, "data"));
  writeFileSync(join(seed, "data", "state.json"), "{}\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "init");
  git(seed, "push", "origin", "main");
  const laptop = join(root, "laptop");
  git(root, "clone", origin, laptop);
  identity(laptop);
  return { root, origin, seed, laptop };
}

describe.skipIf(process.platform === "win32")("instance sync", () => {
  it("pushes user-state even when the cloud run pushed state.json in between", async () => {
    const { root, seed, laptop } = setup();
    writeFileSync(join(seed, "data", "state.json"), '{"cloud":1}\n');
    git(seed, "commit", "-am", "cloud run");
    git(seed, "push", "origin", "main");

    writeFileSync(join(laptop, "data", "user-state.json"), '{"statuses":{"a":"applied"}}\n');
    const r = await pushUserState(laptop, undefined, noWait);
    expect(r.synced).toBe(true);

    const check = join(root, "check");
    git(root, "clone", join(root, "origin.git"), check);
    expect(git(check, "ls-files", "data")).toBe("data/state.json\ndata/user-state.json");
  });

  it("pull brings in the cloud's latest state", () => {
    const { seed, laptop } = setup();
    writeFileSync(join(seed, "data", "state.json"), '{"cloud":2}\n');
    git(seed, "commit", "-am", "cloud run");
    git(seed, "push", "origin", "main");
    expect(pullInstance(laptop).synced).toBe(true);
    expect(git(laptop, "log", "-1", "--format=%s")).toBe("cloud run");
  });

  it("nothing to commit is reported as synced", async () => {
    const { laptop } = setup();
    expect((await pushUserState(laptop, undefined, noWait)).synced).toBe(true);
  });
});

describe("not a git clone", () => {
  it("reports local-only and does not throw", async () => {
    const d = mkdtempSync(join(tmpdir(), "chaijobs-nogit-"));
    expect(pullInstance(d)).toEqual({
      synced: false,
      note: "not a git clone: changes stay on this computer",
    });
    expect(await pushUserState(d, undefined, noWait)).toEqual({
      synced: false,
      note: "not a git clone: changes stay on this computer",
    });
  });
});
