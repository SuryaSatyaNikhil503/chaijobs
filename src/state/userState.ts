import { join } from "node:path";
import { type JobStatus, linesObject, loadUserState, type UserState, writeAtomic } from "./store.js";

/** One line per status, one line per history event: small, readable diffs in the instance repo. */
function stringifyUserState(u: UserState): string {
  const history = u.history.length
    ? `[\n${u.history.map((e) => `    ${JSON.stringify(e)}`).join(",\n")}\n  ]`
    : "[]";
  return [
    "{",
    `  "statuses": ${linesObject(u.statuses)},`,
    `  "extraCompanies": ${JSON.stringify(u.extraCompanies)},`,
    `  "history": ${history}`,
    "}",
    "",
  ].join("\n");
}

/** Sets the job's current status and appends it to the history. Laptop-owned file: the cloud only reads it. */
export function recordStatus(dir: string, id: string, status: JobStatus, now: Date): UserState {
  const u = loadUserState(dir);
  const next: UserState = {
    ...u,
    statuses: { ...u.statuses, [id]: status },
    history: [...u.history, { id, status, at: now.toISOString() }],
  };
  writeAtomic(join(dir, "data", "user-state.json"), stringifyUserState(next));
  return next;
}
