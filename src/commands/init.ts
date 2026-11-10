import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE = fileURLToPath(new URL("../../template/instance", import.meta.url));
export const REPO_URL = "https://github.com/SuryaSatyaNikhil503/chaijobs";
const FULL_SHA = /^[0-9a-f]{40}$/;
const PLACEHOLDER = "__CHAIJOBS_REF__";

/**
 * Resolves a release tag to its commit once, at init time. The instance workflow then pins that
 * commit, so a moved tag can never change the code that runs with the user's secrets.
 */
export function resolveReleaseRef(
  version: string,
  lsRemote: (tagRef: string) => string = (tagRef) =>
    execFileSync("git", ["ls-remote", REPO_URL, tagRef], { encoding: "utf8" }),
): string {
  const tagRef = `refs/tags/v${version}`;
  const lines = lsRemote(tagRef).trim().split("\n").filter(Boolean);
  // An annotated tag also lists "<tag>^{}" pointing at the commit; prefer that line.
  const line = lines.find((l) => l.endsWith(`${tagRef}^{}`)) ?? lines.find((l) => l.endsWith(tagRef));
  const sha = line?.split(/\s+/)[0];
  if (!sha || !FULL_SHA.test(sha)) {
    throw new Error(`Release tag v${version} not found on ${REPO_URL}; pass --ref <40-character commit sha>`);
  }
  return sha;
}

/** Copies the instance template into a new or empty folder and pins the daily workflow to `ref`. */
export function initInstance(target: string, ref: string): void {
  if (!FULL_SHA.test(ref)) throw new Error(`--ref must be a full 40-character commit sha, got "${ref}"`);
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} is not empty; choose a new folder`);
  }
  cpSync(TEMPLATE, target, { recursive: true });
  // npm drops dotfile `.gitignore` from packages, so the template ships it as `gitignore`.
  if (existsSync(join(target, "gitignore")))
    renameSync(join(target, "gitignore"), join(target, ".gitignore"));
  const workflow = join(target, ".github", "workflows", "daily.yml");
  writeFileSync(workflow, readFileSync(workflow, "utf8").replaceAll(PLACEHOLDER, ref));
}
