import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/** Async so a slow network push never blocks the dashboard's event loop. */
export type Git = (args: string[], cwd: string) => Promise<string>;

export interface SyncResult {
  synced: boolean;
  note: string;
}

const run = promisify(execFile);
const defaultGit: Git = async (args, cwd) =>
  (await run("git", args, { cwd, encoding: "utf8" })).stdout.trim();

const LOCAL_ONLY: SyncResult = { synced: false, note: "not a git clone: changes stay on this computer" };
const USER_STATE = "data/user-state.json";
const BACKOFF_MS = [2_000, 5_000];

/** True only when `dir` is itself the top of a git work tree (not a folder nested inside another repo). */
async function isInstanceClone(dir: string, git: Git): Promise<boolean> {
  try {
    return realpathSync(await git(["rev-parse", "--show-toplevel"], dir)) === realpathSync(dir);
  } catch {
    return false;
  }
}

const errorText = (e: unknown) =>
  e instanceof Error ? (e.message.split("\n")[0] ?? "git failed") : String(e);

/** Brings in the cloud run's latest state.json before the dashboard reads it. Never throws. */
export async function pullInstance(dir: string, git: Git = defaultGit): Promise<SyncResult> {
  if (!(await isInstanceClone(dir, git))) return LOCAL_ONLY;
  try {
    await git(["pull", "--rebase", "--autostash", "--quiet"], dir);
    return { synced: true, note: "up to date with your instance repo" };
  } catch (e) {
    await git(["rebase", "--abort"], dir).catch(() => "");
    return { synced: false, note: `could not pull: ${errorText(e)}` };
  }
}

/**
 * Commits ONLY data/user-state.json (never anything else the user staged) and pushes it. The cloud run writes
 * other files, so rebasing onto its latest push is clean; --autostash keeps unrelated local edits out of the way,
 * and a failed rebase is aborted so the clone is never left mid-rebase. Retried; never throws.
 */
export async function pushUserState(
  dir: string,
  git: Git = defaultGit,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SyncResult> {
  if (!(await isInstanceClone(dir, git))) return LOCAL_ONLY;
  if (!existsSync(join(dir, USER_STATE))) return { synced: true, note: "nothing to save yet" };
  try {
    await git(["add", "--", USER_STATE], dir);
    const staged = await git(["diff", "--cached", "--name-only", "--", USER_STATE], dir);
    if (staged) await git(["commit", "--quiet", "-m", "chore: update job statuses", "--", USER_STATE], dir);
  } catch (e) {
    return { synced: false, note: `could not commit: ${errorText(e)}` };
  }
  let last = "";
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      await git(["pull", "--rebase", "--autostash", "--quiet"], dir);
      await git(["push", "--quiet"], dir);
      return { synced: true, note: "saved to your instance repo" };
    } catch (e) {
      last = errorText(e);
      await git(["rebase", "--abort"], dir).catch(() => "");
    }
    const backoff = BACKOFF_MS[attempt];
    if (backoff !== undefined) await wait(backoff);
  }
  return { synced: false, note: `saved here, but push failed: ${last}` };
}
