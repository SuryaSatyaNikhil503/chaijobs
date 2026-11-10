import { createHash } from "node:crypto";

/** Extraction results keyed by sha256(model + text); persisted by the state store as data/llm-cache.json. */
export class LlmCache {
  constructor(private readonly entries: Record<string, unknown>) {}

  private key(model: string, text: string): string {
    return createHash("sha256").update(`${model}\n${text}`).digest("hex");
  }

  get(model: string, text: string): unknown {
    return this.entries[this.key(model, text)];
  }

  set(model: string, text: string, value: unknown): void {
    this.entries[this.key(model, text)] = value;
  }

  toJSON(): Record<string, unknown> {
    return this.entries;
  }
}
