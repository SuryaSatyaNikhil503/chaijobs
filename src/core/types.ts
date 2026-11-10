export type SourceId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "serpapi"
  | "alert-linkedin"
  | "alert-naukri"
  | "alert-indeed";

export type PostedAtKind = "posted" | "email-received" | "first-seen";

export interface RawJob {
  source: SourceId;
  sourceJobId: string;
  company: string;
  title: string;
  locations: string[];
  url: string;
  postedAt: string | null;
  postedAtKind: PostedAtKind;
  descriptionText: string | null;
}

export interface Job extends RawJob {
  id: string;
  companyKey: string;
  cities: string[];
  southIndia: boolean;
  remoteIndia: boolean;
  isStub: boolean;
  firstSeenAt: string;
}

export type Band = "strong" | "stretch";

export type RuleId =
  | "location"
  | "stale"
  | "title-excluded"
  | "min-years"
  | "role-type"
  | "core-stack"
  | "already-seen";

export type MatchVerdict = {
  kind: "match";
  band: Band;
  aiChecked: boolean;
  matched: string[];
  missing: string[];
  score: number;
};

export type Verdict = { kind: "skip"; rule: RuleId; detail: string } | MatchVerdict | { kind: "stub" };
