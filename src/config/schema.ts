import { z } from "zod";

export const CompanySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["product", "service", "startup", "gcc"]),
  ats: z.enum(["greenhouse", "lever", "ashby"]),
  slug: z.string().min(1),
});

export const DEFAULT_TITLE_EXCLUDE = [
  "frontend",
  "front end",
  "front-end",
  "ui engineer",
  "android",
  "ios",
  ".net",
  "php",
  "salesforce",
  "sap",
  "qa",
  "sdet",
  "test engineer",
  "devops",
  "sre",
  "data scientist",
  "intern",
  "manager",
  "director",
];

export const DEFAULT_TITLE_INCLUDE = [
  "engineer",
  "engineering",
  "developer",
  "sde",
  "programmer",
  "architect",
  "member of technical staff",
  "mts",
  "backend",
  "software",
  "platform",
];

export const FiltersSchema = z.object({
  titleInclude: z.array(z.string()).default(DEFAULT_TITLE_INCLUDE),
  maxMinYears: z.number().int().positive().default(5),
  stretchMinYears: z.number().int().nonnegative().default(4),
  skipRoleTypes: z.array(z.string()).default(["frontend", "mobile", "devops", "qa", "data"]),
  titleExclude: z.array(z.string()).default(DEFAULT_TITLE_EXCLUDE),
  allowRemoteIndia: z.boolean().default(true),
  windowCapHours: z.number().positive().default(36),
});

export const ProviderEntrySchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1),
});

export const SkillsFileSchema = z.object({
  skills: z
    .array(z.object({ name: z.string().min(1), aliases: z.array(z.string()).default([]) }))
    .default([]),
});

export const AlertsConfigSchema = z.object({
  senders: z
    .object({
      "alert-linkedin": z.array(z.string()).default([]),
      "alert-naukri": z.array(z.string()).default([]),
      "alert-indeed": z.array(z.string()).default([]),
    })
    .default({ "alert-linkedin": [], "alert-naukri": [], "alert-indeed": [] }),
});

export const SerpApiConfigSchema = z.object({
  enabled: z.boolean().default(false),
  queries: z.array(z.string()).default([]),
});

export type Company = z.infer<typeof CompanySchema>;
export type Filters = z.infer<typeof FiltersSchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type SkillsFile = z.infer<typeof SkillsFileSchema>;
export type AlertsConfig = z.infer<typeof AlertsConfigSchema>;

export interface Config {
  companies: Company[];
  filters: Filters;
  providers: ProviderEntry[];
  skills: SkillsFile;
  alerts: AlertsConfig;
  serpapi: { enabled: boolean; queries: string[] };
}
