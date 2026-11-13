import type { Company } from "../config/schema.js";
import type { RawJob } from "../core/types.js";

export interface VerifyResult {
  company: string;
  ok: boolean;
  detail: string;
}

export async function verifyCompanies(
  companies: Company[],
  fetchCompany: (c: Company) => Promise<RawJob[]>,
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (const c of companies) {
    const company = `${c.ats}:${c.slug}`;
    try {
      const jobs = await fetchCompany(c);
      results.push({ company, ok: true, detail: `${jobs.length} jobs` });
    } catch (e) {
      results.push({ company, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
