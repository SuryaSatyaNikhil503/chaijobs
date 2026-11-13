import { createHash } from "node:crypto";

interface Entry {
  v: unknown;
  at: string;
}

const PRUNE_DAYS = 30;
const isEntry = (e: unknown): e is Entry => typeof e === "object" && e !== null && "v" in e && "at" in e;

/** Extraction results keyed by sha256(model + text), each stamped so the file can be pruned. */
export class LlmCache {
  constructor(private readonly entries: Record<string, unknown>) {}

  private key(model: string, text: string): string {
    return createHash("sha256").update(`${model}\n${text}`).digest("hex");
  }

  get(model: string, text: string): unknown {
    const e = this.entries[this.key(model, text)];
    return isEntry(e) ? e.v : undefined;
  }

  set(model: string, text: string, value: unknown, nowIso: string): void {
    this.entries[this.key(model, text)] = { v: value, at: nowIso } satisfies Entry;
  }

  /** Drops entries older than 30 days, and legacy entries that carry no timestamp. */
  prune(now: Date): void {
    const cutoff = now.getTime() - PRUNE_DAYS * 86_400_000;
    for (const [k, e] of Object.entries(this.entries)) {
      if (!isEntry(e) || Date.parse(e.at) < cutoff) delete this.entries[k];
    }
  }

  toJSON(): Record<string, unknown> {
    return this.entries;
  }
}
