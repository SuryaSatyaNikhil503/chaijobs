import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

export type Git = (args: string[], cwd: string) => string;

export interface SyncResult {
  synced: boolean;
  note: string;
}

const defaultGit: Git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const LOCAL_ONLY: SyncResult = { synced: false, note: "not a git clone: changes stay on this computer" };
const BACKOFF_MS = [2_000, 5_000];

/** True only when `dir` is itself the top of a git work tree (not a folder nested inside another repo). */
function isInstanceClone(dir: string, git: Git): boolean {
  try {
    return realpathSync(git(["rev-parse", "--show-toplevel"], dir)) === realpathSync(dir);
  } catch {
    return false;
  }
}

const errorText = (e: unknown) =>
  e instanceof Error ? (e.message.split("\n")[0] ?? "git failed") : String(e);

/** Brings in the cloud run's latest state.json before the dashboard reads it. Never throws. */
export function pullInstance(dir: string, git: Git = defaultGit): SyncResult {
  if (!isInstanceClone(dir, git)) return LOCAL_ONLY;
  try {
    git(["pull", "--rebase", "--autostash", "--quiet"], dir);
    return { synced: true, note: "up to date with your instance repo" };
  } catch (e) {
    return { synced: false, note: `could not pull: ${errorText(e)}` };
  }
}

/**
 * Commits data/user-state.json and pushes it. The cloud run writes other files (state.json), so a rebase
 * onto its latest push is always clean; retried because both sides may push at the same moment. Never throws.
 */
export async function pushUserState(
  dir: string,
  git: Git = defaultGit,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SyncResult> {
  if (!isInstanceClone(dir, git)) return LOCAL_ONLY;
  if (!existsSync(join(dir, "data", "user-state.json"))) return { synced: true, note: "nothing to save yet" };
  try {
    git(["add", "--", "data/user-state.json"], dir);
    const staged = git(["diff", "--cached", "--name-only"], dir);
    if (staged) git(["commit", "--quiet", "-m", "chore: update job statuses"], dir);
  } catch (e) {
    return { synced: false, note: `could not commit: ${errorText(e)}` };
  }
  let last = "";
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      git(["pull", "--rebase", "--quiet"], dir);
      git(["push", "--quiet"], dir);
      return { synced: true, note: "saved to your instance repo" };
    } catch (e) {
      last = errorText(e);
    }
    const backoff = BACKOFF_MS[attempt];
    if (backoff !== undefined) await wait(backoff);
  }
  return { synced: false, note: `saved here, but push failed: ${last}` };
}
