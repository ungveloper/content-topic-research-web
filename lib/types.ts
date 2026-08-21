export type SignalKind =
  | "naver-blog"
  | "naver-cafe"
  | "naver-kin"
  | "naver-news"
  | "naver-web"
  | "naver-trends"
  | "google-trends"
  | "search-console"
  | "official"
  | "community"
  | "manual";

export type ContentMode =
  | "direct-experience"
  | "research-verification"
  | "comparison-analysis";

export type Signal = {
  id: string;
  kind: SignalKind;
  title: string;
  url?: string;
  snippet?: string;
  query?: string;
  sourceLabel?: string;
  createdAt: string;
  metrics?: {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    trendScore?: number;
  };
};

export type ScoreInputs = {
  siteFit: number;
  problemSpecificity: number;
  demand: number;
  officialEvidence: number;
  originalValue: number;
  evergreen: number;
};

export type Penalties = {
  ymyl: boolean;
  newsRewrite: boolean;
  duplicate: boolean;
  aiCommodity: boolean;
  weakEvidence: boolean;
};

export type Candidate = {
  id: string;
  title: string;
  problem: string;
  audience: string;
  siteTheme: string;
  contentMode: ContentMode;
  sourceSignalIds: string[];
  scoreInputs: ScoreInputs;
  penalties: Penalties;
  uniqueOutput: string;
  verificationPlan: string;
  directEvidence: string;
  createdAt: string;
  updatedAt: string;
};
