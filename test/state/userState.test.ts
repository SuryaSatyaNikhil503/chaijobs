import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadUserState } from "../../src/state/store.js";
import { recordStatus } from "../../src/state/userState.js";

const dir = () => mkdtempSync(join(tmpdir(), "chaijobs-us-"));
const t1 = new Date("2026-11-13T06:00:00Z");
const t2 = new Date("2026-11-14T06:00:00Z");

describe("recordStatus", () => {
  it("records a status and appends history", () => {
    const d = dir();
    const u = recordStatus(d, "job1", "applied", t1);
    expect(u.statuses).toEqual({ job1: "applied" });
    expect(u.history).toEqual([{ id: "job1", status: "applied", at: t1.toISOString() }]);
  });

  it("second status for the same job keeps both history events and the latest status", () => {
    const d = dir();
    recordStatus(d, "job1", "applied", t1);
    const u = recordStatus(d, "job1", "interview", t2);
    expect(u.statuses.job1).toBe("interview");
    expect(u.history.map((e) => e.status)).toEqual(["applied", "interview"]);
  });

  it("creates data/ when missing and writes one event per line", () => {
    const d = dir();
    recordStatus(d, "job1", "skipped", t1);
    const path = join(d, "data", "user-state.json");
    expect(existsSync(path)).toBe(true);
    expect(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.includes('"at"')),
    ).toHaveLength(1);
  });

  it("the cloud loader still reads statuses from a file that has history", () => {
    const d = dir();
    recordStatus(d, "job1", "applied", t1);
    expect(loadUserState(d).statuses).toEqual({ job1: "applied" });
  });
});
