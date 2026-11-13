import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  AlertsConfigSchema,
  CompanySchema,
  type Config,
  FiltersSchema,
  ProviderEntrySchema,
  SerpApiConfigSchema,
  SkillsFileSchema,
} from "./schema.js";

function readYaml<T extends z.ZodType>(dir: string, file: string, schema: T): z.output<T> {
  const path = join(dir, "config", file);
  const raw: unknown = existsSync(path) ? (parse(readFileSync(path, "utf8")) ?? {}) : {};
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${file}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function loadConfig(instanceDir: string): Config {
  return {
    companies: readYaml(
      instanceDir,
      "companies.yml",
      z.object({ companies: z.array(CompanySchema).default([]) }),
    ).companies,
    filters: readYaml(instanceDir, "filters.yml", FiltersSchema),
    providers: readYaml(
      instanceDir,
      "providers.yml",
      z.object({ providers: z.array(ProviderEntrySchema).default([]) }),
    ).providers,
    skills: readYaml(instanceDir, "skills.yml", SkillsFileSchema),
    alerts: readYaml(instanceDir, "alerts.yml", AlertsConfigSchema),
    serpapi: readYaml(instanceDir, "serpapi.yml", SerpApiConfigSchema),
  };
}
export type { AlertsConfig, Company, Config, Filters, ProviderEntry, SkillsFile } from "./schema.js";
