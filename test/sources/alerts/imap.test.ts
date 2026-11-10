import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AlertsConfigSchema } from "../../../src/config/schema.js";
import { type AlertMailbox, fetchAlerts, parseAlertEmail } from "../../../src/sources/alerts/imap.js";

const naukri = readFileSync(new URL("../../fixtures/alerts/naukri.html", import.meta.url), "utf8");
const indeed = readFileSync(new URL("../../fixtures/alerts/indeed-alert.html", import.meta.url), "utf8");
const cfg = AlertsConfigSchema.parse({
  senders: {
    "alert-naukri": ["naukrialerts@naukri.com"],
    "alert-indeed": ["donotreply@jobalert.indeed.com"],
  },
});
const now = new Date("2026-11-11T01:37:00Z");

function fakeMailbox(messages: { uid: number; from: string; html: string; date: string }[]) {
  const searches: { from: string; since: Date }[] = [];
  const box: AlertMailbox = {
    search: async (q) => {
      searches.push(q);
      return messages.filter((m) => m.from === q.from).map((m) => m.uid);
    },
    fetchHtml: async (uids) =>
      messages.filter((m) => uids.includes(m.uid)).map((m) => ({ uid: m.uid, html: m.html, date: m.date })),
  };
  return { box, searches };
}

describe("fetchAlerts", () => {
  it("searches only configured senders in the last 2 days and parses each email", async () => {
    const { box, searches } = fakeMailbox([
      { uid: 10, from: "naukrialerts@naukri.com", html: naukri, date: "2026-11-10T04:36:02Z" },
      { uid: 11, from: "donotreply@jobalert.indeed.com", html: indeed, date: "2026-11-10T05:00:00Z" },
    ]);
    const r = await fetchAlerts(cfg, box, 0, now);
    expect(searches.map((s) => s.from).sort()).toEqual([
      "donotreply@jobalert.indeed.com",
      "naukrialerts@naukri.com",
    ]);
    expect(searches[0]?.since.toISOString()).toBe("2026-11-09T01:37:00.000Z");
    expect(r.jobs.filter((j) => j.source === "alert-naukri")).toHaveLength(3);
    expect(r.jobs.filter((j) => j.source === "alert-indeed")).toHaveLength(2);
    expect(r.maxUid).toBe(11);
  });

  it("skips messages already processed", async () => {
    const { box } = fakeMailbox([
      { uid: 10, from: "naukrialerts@naukri.com", html: naukri, date: "2026-11-10T04:36:02Z" },
    ]);
    const r = await fetchAlerts(cfg, box, 10, now);
    expect(r.jobs).toEqual([]);
    expect(r.maxUid).toBe(10);
  });
});

describe("parseAlertEmail", () => {
  it("routes by source", () => {
    expect(parseAlertEmail("alert-naukri", naukri, "2026-11-10T04:36:02.000Z")).toHaveLength(3);
    expect(parseAlertEmail("alert-indeed", indeed, "2026-11-10T04:36:02.000Z")).toHaveLength(2);
    expect(parseAlertEmail("alert-linkedin", naukri, "2026-11-10T04:36:02.000Z")).toEqual([]);
  });
});
