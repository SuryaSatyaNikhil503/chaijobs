import { describe, expect, it } from "vitest";
import { freshnessWindow, isFresh, parseRelativePosted } from "../../src/filter/freshness.js";

const now = new Date("2026-11-11T01:37:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("freshnessWindow", () => {
  it("starts at the last successful run when recent", () => {
    const w = freshnessWindow(hoursAgo(10).toISOString(), now, 36);
    expect(w.from.toISOString()).toBe(hoursAgo(10).toISOString());
    expect(w.firstRun).toBe(false);
  });

  it("is capped at 36 hours", () => {
    const w = freshnessWindow(hoursAgo(72).toISOString(), now, 36);
    expect(w.from.toISOString()).toBe(hoursAgo(36).toISOString());
  });

  it("first run looks back 24 hours", () => {
    const w = freshnessWindow(null, now, 36);
    expect(w.from.toISOString()).toBe(hoursAgo(24).toISOString());
    expect(w.firstRun).toBe(true);
  });
});

describe("parseRelativePosted", () => {
  it.each([
    ["5 hours ago", hoursAgo(5)],
    ["1 day ago", hoursAgo(24)],
    ["30+ days ago", hoursAgo(30 * 24)],
    ["just posted", now],
    ["today", now],
  ])("parses %s", (text, expected) => {
    expect(parseRelativePosted(text, now)).toBe(expected.toISOString());
  });

  it("returns null for gibberish", () => {
    expect(parseRelativePosted("gibberish", now)).toBeNull();
  });
});

describe("isFresh", () => {
  const firstRun = { from: hoursAgo(24), firstRun: true };
  const later = { from: hoursAgo(24), firstRun: false };

  it("first-seen jobs are not fresh on the first run", () => {
    expect(isFresh({ postedAt: null, postedAtKind: "first-seen" }, firstRun)).toBe(false);
  });

  it("first-seen jobs are fresh after the first run", () => {
    expect(isFresh({ postedAt: null, postedAtKind: "first-seen" }, later)).toBe(true);
  });

  it("posted inside the window is fresh, outside is not", () => {
    expect(isFresh({ postedAt: hoursAgo(3).toISOString(), postedAtKind: "posted" }, later)).toBe(true);
    expect(isFresh({ postedAt: hoursAgo(30).toISOString(), postedAtKind: "posted" }, later)).toBe(false);
  });
});
