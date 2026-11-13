import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Job } from "../../src/core/types.js";
import { emptyState, loadState, loadUserState, type State, saveState } from "../../src/state/store.js";

const dir = () => mkdtempSync(join(tmpdir(), "chaijobs-state-"));
const now = new Date("2026-11-11T01:37:00Z");
const record = (id: string, firstSeenAt: string) => ({
  job: { id, firstSeenAt } as Job,
  verdict: { kind: "stub" } as const,
  facts: null,
  digestedAt: null,
});

describe("state store", () => {
  it("missing files give empty state", () => {
    expect(loadState(dir())).toEqual(emptyState());
  });

  it("round-trips", () => {
    const d = dir();
    const s: State = { ...emptyState(), lastSuccessfulRun: now.toISOString(), imapMaxUid: 42 };
    s.jobs.a = record("a", now.toISOString());
    saveState(d, s, now);
    expect(loadState(d)).toEqual(s);
  });

  it("prunes records older than 30 days", () => {
    const d = dir();
    const s = emptyState();
    s.jobs.old = record("old", "2026-10-01T00:00:00Z");
    s.jobs.new = record("new", "2026-11-10T00:00:00Z");
    saveState(d, s, now);
    expect(Object.keys(loadState(d).jobs)).toEqual(["new"]);
  });

  it("user-state applied ids are readable", () => {
    const d = dir();
    mkdirSync(join(d, "data"), { recursive: true });
    writeFileSync(join(d, "data", "user-state.json"), JSON.stringify({ statuses: { abc: "applied" } }));
    expect(loadUserState(d)).toEqual({ statuses: { abc: "applied" }, extraCompanies: [], history: [] });
  });

  it("missing user-state is empty", () => {
    expect(loadUserState(dir())).toEqual({ statuses: {}, extraCompanies: [], history: [] });
  });
});
