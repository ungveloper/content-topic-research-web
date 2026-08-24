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

export type ValidationStrategy = "direct-test" | "research-verification";

export type ExperimentPlan = {
  recommended: boolean;
  durationDays: number;
  metrics: string[];
  plan: string;
  completionRule: string;
};

export type ReviewLevel = "high" | "medium" | "low";

export type FixedContentCategory =
  | "집 관리"
  | "디지털 생활"
  | "생활 행정"
  | "정리·보관"
  | "제품 사용";

export type ResearchEvidenceItem = {
  source: "naver-kin" | "naver-cafe" | "naver-blog" | "naver-news" | "naver-web";
  title: string;
  snippet?: string;
  url?: string;
  publishedAt?: string;
  officialCandidate?: boolean;
  similarCount?: number;
  relatedQuestions?: Array<{
    title: string;
    url?: string;
  }>;
};

export type ResearchEvidenceBundle = {
  id: string;
  query: string;
  discoveryCategory: string;
  discoveredProblem: string;
  sourceSignalIds: string[];
  questions: ResearchEvidenceItem[];
  questionStats: {
    rawCount: number;
    uniqueCount: number;
    groupedCount: number;
  };
  trend: {
    query: string;
    keywords: string[];
    comparisonBatch: number;
    recentAverage: number;
    series: Array<{ period: string; ratio: number }>;
    note: string;
  };
  cafe: ResearchEvidenceItem[];
  blog: ResearchEvidenceItem[];
  news: ResearchEvidenceItem[];
  web: ResearchEvidenceItem[];
  coverage: {
    trend: boolean;
    cafe: boolean;
    blog: boolean;
    news: boolean;
    web: boolean;
  };
};


export type SiteContentRecord = {
  id: string;
  title: string;
  url: string;
  slug?: string;
  publishedAt?: string;
  modifiedAt?: string;
  revalidationWindowDays: 90 | 180;
  revalidationDue: boolean;
};

export type ExistingContentMatch = {
  title: string;
  url: string;
  similarity: number;
  modifiedAt?: string;
  revalidationWindowDays: 90 | 180;
  revalidationDue: boolean;
};

export type SearchPerformanceMatch = {
  query: string;
  similarity: number;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type EditorialBundleContext = {
  bundleId: string;
  existingContentMatches: ExistingContentMatch[];
  searchConsoleMatches: SearchPerformanceMatch[];
  likelyDuplicate: boolean;
};

export type EditorialContext = {
  siteUrl?: string;
  syncedAt?: string;
  totalPublishedPosts: number;
  revalidationDue90: number;
  revalidationDue180: number;
  searchConsoleQueryCount: number;
  bundles: EditorialBundleContext[];
};

export type TopicReviewDecision =
  | "direct-test"
  | "research-verification"
  | "hold"
  | "exclude";

export type TopicReviewItem = {
  bundleId: string;
  decision: TopicReviewDecision;
  title: string;
  problem: string;
  audience: string;
  category: FixedContentCategory;
  contentMode: ContentMode;
  searchIntent: string;
  trafficPotential: ReviewLevel;
  repeatedDemand: ReviewLevel;
  contentSaturation: ReviewLevel;
  evidenceQuality: ReviewLevel;
  originalityPotential: ReviewLevel;
  rationale: string;
  uniqueOutput: string;
  verificationPlan: string;
  scoreInputs: ScoreInputs;
  experimentPlan?: ExperimentPlan | null;
};

export type TopicReviewResult = {
  reviewSummary?: string;
  reviews: TopicReviewItem[];
};

export type CandidateAiReview = {
  decision: "direct-test" | "research-verification";
  reviewedAt: string;
  category: FixedContentCategory;
  searchIntent: string;
  trafficPotential: ReviewLevel;
  repeatedDemand: ReviewLevel;
  contentSaturation: ReviewLevel;
  evidenceQuality: ReviewLevel;
  originalityPotential: ReviewLevel;
  rationale: string;
};

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
  validationStrategy?: ValidationStrategy;
  experimentPlan?: ExperimentPlan;
  sourceSignalIds: string[];
  scoreInputs: ScoreInputs;
  penalties: Penalties;
  uniqueOutput: string;
  verificationPlan: string;
  directEvidence: string;
  editorialContext?: EditorialBundleContext;
  aiReview?: CandidateAiReview;
  createdAt: string;
  updatedAt: string;
};
