import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AlertsConfig } from "../../config/schema.js";
import type { RawJob } from "../../core/types.js";
import { parseIndeedAlert, parseIndeedMatch } from "./indeed.js";
import { parseLinkedInAlert } from "./linkedin.js";
import { parseNaukriAlert } from "./naukri.js";

type AlertSource = keyof AlertsConfig["senders"];
const LOOKBACK_MS = 2 * 86_400_000;

/** The two mailbox operations the fetcher needs; ImapFlow in production, a fake in tests. */
export interface AlertMailbox {
  search(q: { from: string; since: Date }): Promise<number[]>;
  fetchHtml(uids: number[]): Promise<{ uid: number; html: string; date: string }[]>;
}

export function parseAlertEmail(source: AlertSource, html: string, receivedAt: string): RawJob[] {
  switch (source) {
    case "alert-naukri":
      return parseNaukriAlert(html, receivedAt);
    case "alert-indeed":
      // Alert and match emails anchor on different link patterns, so running both is safe.
      return [...parseIndeedAlert(html, receivedAt), ...parseIndeedMatch(html, receivedAt)];
    case "alert-linkedin":
      return parseLinkedInAlert(html, receivedAt);
  }
}

/** Reads only configured senders from the last 2 days, and only messages newer than `sinceUid`. */
export async function fetchAlerts(
  cfg: AlertsConfig,
  box: AlertMailbox,
  sinceUid: number,
  now: Date,
): Promise<{ jobs: RawJob[]; maxUid: number }> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const jobs: RawJob[] = [];
  let maxUid = sinceUid;
  for (const [source, senders] of Object.entries(cfg.senders) as [AlertSource, string[]][]) {
    for (const from of senders) {
      const uids = (await box.search({ from, since })).filter((u) => u > sinceUid);
      if (uids.length === 0) continue;
      for (const msg of await box.fetchHtml(uids)) {
        jobs.push(...parseAlertEmail(source, msg.html, new Date(msg.date).toISOString()));
        maxUid = Math.max(maxUid, msg.uid);
      }
    }
  }
  return { jobs, maxUid };
}

/** Opens Gmail INBOX read-only over IMAP; messages are never marked read, moved or deleted. */
export async function withGmailInbox<T>(
  auth: { user: string; pass: string },
  fn: (box: AlertMailbox) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    return await fn({
      search: async (q) => {
        const found = await client.search({ from: q.from, since: q.since }, { uid: true });
        return Array.isArray(found) ? found : [];
      },
      fetchHtml: async (uids) => {
        const out: { uid: number; html: string; date: string }[] = [];
        for await (const msg of client.fetch(uids, { source: true, internalDate: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const html = typeof parsed.html === "string" ? parsed.html : (parsed.textAsHtml ?? "");
          const date = (parsed.date ?? msg.internalDate ?? new Date()).toString();
          out.push({ uid: msg.uid, html, date: new Date(date).toISOString() });
        }
        return out;
      },
    });
  } finally {
    lock.release();
    await client.logout();
  }
}
