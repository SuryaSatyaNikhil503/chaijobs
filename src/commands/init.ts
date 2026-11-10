import { cpSync, existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE = fileURLToPath(new URL("../../template/instance", import.meta.url));

/** Copies the instance template into a new or empty folder. npm drops dotfile `.gitignore`, so it ships as `gitignore`. */
export function initInstance(target: string): void {
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} is not empty; choose a new folder`);
  }
  cpSync(TEMPLATE, target, { recursive: true });
  if (existsSync(join(target, "gitignore")))
    renameSync(join(target, "gitignore"), join(target, ".gitignore"));
}
