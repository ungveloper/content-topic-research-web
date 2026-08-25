"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckIcon,
  CopyIcon,
  ExternalIcon,
  FileTextIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import {
  CONTENT_MODE_LABELS,
  SIGNAL_LABELS,
  candidatePrompt,
  candidateTestPlanPrompt,
  defaultCandidate,
  hasDirectTestEvidence,
  isExcludedContentTopic,
  makeId,
  scoreCandidate,
  signalRole,
  stripHtml,
  verdict,
} from "@/lib/research";
import { buildTopicReviewPrompt, parseTopicReviewOutput } from "@/lib/topic-review";
import { createSampleData } from "@/lib/sample-data";
import type {
  Candidate,
  ContentMode,
  EditorialContext,
  Penalties,
  ResearchEvidenceBundle,
  ScoreInputs,
  Signal,
  SignalKind,
  SiteContentRecord,
  TopicReviewItem,
} from "@/lib/types";

type Tab = "discover" | "candidates" | "prompt";
type NaverType = "blog" | "cafe" | "kin" | "news" | "web";

type NaverItem = {
  title: string;
  link?: string;
  originallink?: string;
  description?: string;
  bloggername?: string;
  postdate?: string;
  pubDate?: string;
};

type NaverTrendPoint = {
  period: string;
  ratio: number;
};

type NaverTrendResult = {
  title: string;
  keywords: string[];
  data: NaverTrendPoint[];
};

type AutoResearchSeedSummary = {
  query: string;
  category: string;
};

type UsedTopicHistory = {
  title: string;
  problem?: string;
  usedAt: string;
};

type AutoResearchResponse = {
  generatedAt: string;
  offset: number;
  seeds: AutoResearchSeedSummary[];
  signals: Signal[];
  evidenceBundles: ResearchEvidenceBundle[];
  reviewPrompt: string;
  editorialContext?: EditorialContext;
  sourceQuestion?: {
    url: string;
    title: string;
    description?: string;
  };
  errors?: string[];
  cooldown?: {
    usedDays: number;
    usedCount: number;
  };
};

type SiteContentSyncResponse = {
  siteUrl: string;
  syncedAt: string;
  total: number;
  revalidationDue90: number;
  revalidationDue180: number;
  contents: SiteContentRecord[];
  error?: string;
};

const STORAGE_SIGNALS = "content-topic-research:signals:v1";
const STORAGE_CANDIDATES = "content-topic-research:candidates:v1";
const STORAGE_USED_TOPICS = "content-topic-research:used-topics:v1";
const LEGACY_STORAGE_SEEN_TOPICS = "content-topic-research:seen-topics:v1";
const STORAGE_SITE_URL = "content-topic-research:wordpress-site-url:v1";
const STORAGE_SITE_CONTENTS = "content-topic-research:wordpress-site-contents:v1";
const STORAGE_SITE_SYNCED_AT = "content-topic-research:wordpress-site-synced-at:v1";

const SCORE_FIELDS: Array<{
  key: keyof ScoreInputs;
  label: string;
  hint: string;
}> = [
  { key: "siteFit", label: "사이트 주제 적합성", hint: "내 사이트의 기존 독자와 연결되는가" },
  { key: "problemSpecificity", label: "문제의 구체성", hint: "‘했는데/갑자기/계속’처럼 막힌 지점이 분명한가" },
  { key: "demand", label: "검색 유입 가능성", hint: "검색어트렌드와 반복 질문에서 실제 수요가 확인되는가" },
  { key: "officialEvidence", label: "공식 근거", hint: "원문·제조사·공공기관으로 검증 가능한가" },
  { key: "originalValue", label: "고유 분석 가능성", hint: "비교표·판단 흐름·도구·데이터를 새로 만들 수 있는가" },
  { key: "evergreen", label: "지속성", hint: "일회성 이슈가 아니라 계속 검색될 문제인가" },
];

const PENALTY_FIELDS: Array<{
  key: keyof Penalties;
  label: string;
  hint: string;
}> = [
  { key: "ymyl", label: "YMYL 위험", hint: "건강·안전·재정처럼 높은 신뢰가 필요한 주제" },
  { key: "newsRewrite", label: "뉴스 재작성형", hint: "뉴스 내용을 다시 쓰는 것이 핵심이면 감점" },
  { key: "duplicate", label: "기존 글과 중복", hint: "검색 의도가 사실상 같은 페이지가 이미 있음" },
  { key: "aiCommodity", label: "AI 일반론형", hint: "웹 조사 없이도 AI가 쉽게 쓸 수 있는 주제" },
  { key: "weakEvidence", label: "공식 근거 부족", hint: "사실 검증에 쓸 1차 자료가 부족함" },
];

const SOURCE_OPTIONS: Array<{ kind: SignalKind; label: string }> = [
  { kind: "official", label: "공식 자료" },
  { kind: "community", label: "커뮤니티/Q&A" },
  { kind: "google-trends", label: "Google Trends" },
  { kind: "manual", label: "직접 메모" },
];

const NAVER_TYPES: Array<{ value: NaverType; label: string; kind: SignalKind }> = [
  { value: "blog", label: "블로그", kind: "naver-blog" },
  { value: "cafe", label: "카페", kind: "naver-cafe" },
  { value: "kin", label: "지식iN", kind: "naver-kin" },
  { value: "news", label: "뉴스", kind: "naver-news" },
  { value: "web", label: "웹문서", kind: "naver-web" },
];

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function reviewLevelLabel(value: "high" | "medium" | "low") {
  return value === "high" ? "높음" : value === "medium" ? "중간" : "낮음";
}

function needsDirectTest(candidate: Candidate) {
  return Boolean(candidate.experimentPlan?.recommended) && !hasDirectTestEvidence(candidate);
}

function promptForCandidate(candidate: Candidate, signals: Signal[]) {
  return needsDirectTest(candidate)
    ? candidateTestPlanPrompt(candidate, signals)
    : candidatePrompt(candidate, signals);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/,/g, "").replace(/%/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isUsableCandidate(candidate: Candidate) {
  return Boolean(
    candidate &&
    candidate.title?.trim() &&
    !isExcludedContentTopic(`${candidate.title} ${candidate.problem || ""}`) &&
    Array.isArray(candidate.sourceSignalIds) &&
    candidate.sourceSignalIds.length > 0,
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "blue" }) {
  const toneClass = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-600",
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
  }[tone];

  return <span className={classNames("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass)}>{children}</span>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{eyebrow}</div>
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-900">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white px-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
        <LayersIcon className="h-5 w-5" />
      </div>
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 78 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
      <div className="absolute inset-1 rounded-full bg-white" />
      <span className={classNames("relative text-xl font-semibold", tone)}>{score}</span>
    </div>
  );
}

function SignalCard({
  signal,
  selected,
  onToggle,
  onDelete,
}: {
  signal: Signal;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={classNames("group rounded-2xl border bg-white p-4 transition", selected ? "border-zinc-900 shadow-sm" : "border-zinc-200 hover:border-zinc-300")}> 
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onToggle}
          className={classNames(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
            selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-transparent",
          )}
          aria-label="신호 선택"
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={signal.kind === "official" ? "good" : signal.kind === "naver-news" ? "warn" : signal.kind === "search-console" ? "blue" : "neutral"}>{SIGNAL_LABELS[signal.kind]}</Badge>
            {signal.metrics?.impressions !== undefined ? <Badge>{signal.metrics.impressions.toLocaleString()} 노출</Badge> : null}
            {signal.metrics?.trendScore !== undefined ? <Badge>{signal.metrics.trendScore} 트렌드</Badge> : null}
          </div>
          <h3 className="text-sm font-semibold leading-6 text-zinc-900">{signal.title}</h3>
          {signal.snippet ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">{signal.snippet}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-zinc-400">
            <span>{signalRole(signal.kind)}</span>
            <span>·</span>
            <span>{formatDate(signal.createdAt)}</span>
            {signal.url ? (
              <a href={signal.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900">
                원문 <ExternalIcon className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={onDelete} className="h-8 w-8 rounded-lg text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-rose-500 group-hover:opacity-100" aria-label="삭제">
          <TrashIcon className="mx-auto h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function CandidateCard({ candidate, active, onOpen, onDelete }: { candidate: Candidate; active: boolean; onOpen: () => void; onDelete: () => void }) {
  const score = scoreCandidate(candidate);
  const result = verdict(score);
  const aiReview = candidate.aiReview;
  return (
    <article className={classNames("group rounded-2xl border bg-white p-4 transition", active ? "border-zinc-900 shadow-sm" : "border-zinc-200 hover:border-zinc-300")}> 
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              {aiReview ? <Badge tone="good">ChatGPT Pro 선정</Badge> : <Badge tone={result.tone}>{result.label}</Badge>}
              <Badge>{candidate.experimentPlan?.recommended ? `직접 테스트 · ${candidate.experimentPlan.durationDays}일` : CONTENT_MODE_LABELS[candidate.contentMode]}</Badge>
            </div>
            <h3 className="font-semibold leading-6 text-zinc-900">{candidate.title || "제목 없는 후보"}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{candidate.problem || "해결하려는 문제를 입력하세요."}</p>
          </div>
          <div className="shrink-0 text-right">
            {aiReview ? (
              <>
                <div className="text-sm font-semibold text-zinc-900">{reviewLevelLabel(aiReview.trafficPotential)}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">유입 기대</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">{score}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400">score</div>
              </>
            )}
          </div>
        </div>
      </button>
      <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">
        <span>신호 {candidate.sourceSignalIds.length}개 · {formatDate(candidate.updatedAt)}</span>
        <button type="button" onClick={onDelete} className="opacity-0 transition hover:text-rose-500 group-hover:opacity-100">삭제</button>
      </div>
    </article>
  );
}

export function ResearchWorkbench() {
  const [tab, setTab] = useState<Tab>("discover");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [naverQuery, setNaverQuery] = useState("");
  const [naverType, setNaverType] = useState<NaverType>("kin");
  const [naverSort, setNaverSort] = useState<"sim" | "date">("sim");
  const [naverItems, setNaverItems] = useState<NaverItem[]>([]);
  const [naverLoading, setNaverLoading] = useState(false);
  const [naverError, setNaverError] = useState<string | null>(null);

  const [naverTrendKeywords, setNaverTrendKeywords] = useState("");
  const [naverTrendRange, setNaverTrendRange] = useState<"90d" | "1y">("90d");
  const [naverTrendResults, setNaverTrendResults] = useState<NaverTrendResult[]>([]);
  const [naverTrendLoading, setNaverTrendLoading] = useState(false);
  const [naverTrendError, setNaverTrendError] = useState<string | null>(null);

  const [autoResearchLoading, setAutoResearchLoading] = useState(false);
  const [autoResearchError, setAutoResearchError] = useState<string | null>(null);
  const [autoResearchOffset, setAutoResearchOffset] = useState(0);
  const [autoResearchSeeds, setAutoResearchSeeds] = useState<AutoResearchSeedSummary[]>([]);
  const [autoResearchWarnings, setAutoResearchWarnings] = useState<string[]>([]);
  const [autoResearchCooldown, setAutoResearchCooldown] = useState<AutoResearchResponse["cooldown"] | null>(null);
  const [autoEvidenceBundles, setAutoEvidenceBundles] = useState<ResearchEvidenceBundle[]>([]);
  const [autoReviewPrompt, setAutoReviewPrompt] = useState("");
  const [autoReviewOutput, setAutoReviewOutput] = useState("");
  const [autoReviewPromptCopied, setAutoReviewPromptCopied] = useState(false);
  const [kinSourceUrl, setKinSourceUrl] = useState("");
  const [kinUrlResearchLoading, setKinUrlResearchLoading] = useState(false);
  const [kinUrlResearchError, setKinUrlResearchError] = useState<string | null>(null);
  const [autoSourceQuestion, setAutoSourceQuestion] = useState<AutoResearchResponse["sourceQuestion"] | null>(null);
  const [usedTopics, setUsedTopics] = useState<UsedTopicHistory[]>([]);
  const [autoEditorialContext, setAutoEditorialContext] = useState<EditorialContext | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteContents, setSiteContents] = useState<SiteContentRecord[]>([]);
  const [siteContentSyncedAt, setSiteContentSyncedAt] = useState("");
  const [siteContentLoading, setSiteContentLoading] = useState(false);
  const [siteContentError, setSiteContentError] = useState<string | null>(null);

  const [manualKind, setManualKind] = useState<SignalKind>("official");
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualTrendScore, setManualTrendScore] = useState("70");

  const [promptCopied, setPromptCopied] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const storedSignals = window.localStorage.getItem(STORAGE_SIGNALS);
      const storedCandidates = window.localStorage.getItem(STORAGE_CANDIDATES);
      const storedUsedTopics = window.localStorage.getItem(STORAGE_USED_TOPICS);
      const storedSiteUrl = window.localStorage.getItem(STORAGE_SITE_URL);
      const storedSiteContents = window.localStorage.getItem(STORAGE_SITE_CONTENTS);
      const storedSiteSyncedAt = window.localStorage.getItem(STORAGE_SITE_SYNCED_AT);
      if (storedSignals) setSignals(JSON.parse(storedSignals));
      if (storedCandidates) {
        const parsed = JSON.parse(storedCandidates) as Candidate[];
        setCandidates(Array.isArray(parsed) ? parsed.filter(isUsableCandidate) : []);
      }
      if (storedUsedTopics) setUsedTopics(JSON.parse(storedUsedTopics));
      if (storedSiteUrl) setSiteUrl(storedSiteUrl);
      if (storedSiteContents) {
        const parsed = JSON.parse(storedSiteContents) as SiteContentRecord[];
        if (Array.isArray(parsed)) setSiteContents(parsed);
      }
      if (storedSiteSyncedAt) setSiteContentSyncedAt(storedSiteSyncedAt);
      // 이전 버전의 14일 노출 차단 기록은 더 이상 사용하지 않습니다.
      window.localStorage.removeItem(LEGACY_STORAGE_SEEN_TOPICS);
    } catch {
      // 손상된 로컬 데이터가 있어도 앱은 빈 상태로 시작합니다.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_SIGNALS, JSON.stringify(signals));
  }, [signals, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_CANDIDATES, JSON.stringify(candidates));
  }, [candidates, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const cutoff = Date.now() - 90 * 86_400_000;
    const recent = usedTopics.filter((item) => {
      const time = new Date(item.usedAt).getTime();
      return Number.isFinite(time) && time >= cutoff;
    });
    window.localStorage.setItem(STORAGE_USED_TOPICS, JSON.stringify(recent));
  }, [usedTopics, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_SITE_URL, siteUrl);
    window.localStorage.setItem(STORAGE_SITE_CONTENTS, JSON.stringify(siteContents));
    if (siteContentSyncedAt) window.localStorage.setItem(STORAGE_SITE_SYNCED_AT, siteContentSyncedAt);
  }, [siteUrl, siteContents, siteContentSyncedAt, hydrated]);


  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!autoReviewPromptCopied) return;
    const timer = window.setTimeout(() => setAutoReviewPromptCopied(false), 2600);
    return () => window.clearTimeout(timer);
  }, [autoReviewPromptCopied]);

  const sortedCandidates = useMemo(
    () =>
      [...candidates].sort((a, b) => {
        const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [candidates],
  );

  const visibleCandidates = useMemo(() => {
    const usedKeys = new Set(
      usedTopics
        .flatMap((item) => [item.title, item.problem || ""])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );

    return sortedCandidates.filter((candidate) => {
      if (!isUsableCandidate(candidate)) return false;
      if (!candidate.aiReview && scoreCandidate(candidate) < 60) return false;
      const titleKey = candidate.title.trim().toLowerCase();
      const problemKey = (candidate.problem || "").trim().toLowerCase();
      return !usedKeys.has(titleKey) && (!problemKey || !usedKeys.has(problemKey));
    });
  }, [sortedCandidates, usedTopics]);

  const activeCandidate = useMemo(
    () => visibleCandidates.find((candidate) => candidate.id === activeCandidateId) || null,
    [visibleCandidates, activeCandidateId],
  );

  const revalidationDueContents = useMemo(
    () =>
      [...siteContents]
        .filter((item) => item.revalidationDue)
        .sort((a, b) => new Date(a.modifiedAt || a.publishedAt || 0).getTime() - new Date(b.modifiedAt || b.publishedAt || 0).getTime())
        .slice(0, 6),
    [siteContents],
  );

  function loadSample() {
    const sample = createSampleData();
    setSignals(sample.signals);
    setCandidates(sample.candidates);
    const topSample = [...sample.candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
    setActiveCandidateId(topSample?.id || null);
    setSelectedSignalIds([]);
    setToast("샘플 리서치를 불러왔습니다.");
  }


  function hasWorkspaceWork() {
    return Boolean(
      signals.length ||
      candidates.length ||
      selectedSignalIds.length ||
      naverQuery.trim() ||
      naverItems.length ||
      naverTrendKeywords.trim() ||
      naverTrendResults.length ||
      autoResearchSeeds.length ||
      autoEvidenceBundles.length ||
      autoReviewPrompt.trim() ||
      autoReviewOutput.trim() ||
      manualTitle.trim() ||
      manualUrl.trim() ||
      manualNote.trim(),
    );
  }

  function clearWorkspaceForHome() {
    setTab("discover");
    setSignals([]);
    setCandidates([]);
    setSelectedSignalIds([]);
    setActiveCandidateId(null);
    setNaverQuery("");
    setNaverItems([]);
    setNaverError(null);
    setNaverTrendKeywords("");
    setNaverTrendResults([]);
    setNaverTrendError(null);
    setAutoResearchSeeds([]);
    setAutoResearchWarnings([]);
    setAutoResearchCooldown(null);
    setAutoEvidenceBundles([]);
    setAutoReviewPrompt("");
    setAutoReviewOutput("");
    setAutoReviewPromptCopied(false);
    setAutoEditorialContext(null);
    setAutoResearchError(null);
    setAutoResearchOffset(0);
    setManualTitle("");
    setManualUrl("");
    setManualNote("");
    window.localStorage.removeItem(STORAGE_SIGNALS);
    window.localStorage.removeItem(STORAGE_CANDIDATES);
  }

  function handleBrandHome() {
    if (hasWorkspaceWork()) {
      const confirmed = window.confirm(
        "현재 입력하거나 작업 중인 내용이 있습니다. 홈으로 이동하면 작업 내용을 잃을 수 있습니다. 계속할까요?",
      );
      if (!confirmed) return;
    }

    clearWorkspaceForHome();
    window.location.assign("/");
  }

  function addSignal(signal: Signal) {
    const duplicate = signals.some(
      (item) => item.kind === signal.kind && item.title === signal.title && item.url === signal.url,
    );
    if (duplicate) {
      setToast("이미 저장된 신호입니다.");
      return;
    }
    setSignals((current) => [signal, ...current]);
    setToast("리서치 신호를 저장했습니다.");
  }

  function addManualSignal() {
    if (!manualTitle.trim()) {
      setToast("신호 내용을 입력해주세요.");
      return;
    }
    addSignal({
      id: makeId("signal"),
      kind: manualKind,
      title: manualTitle.trim(),
      url: manualUrl.trim() || undefined,
      snippet: manualNote.trim() || undefined,
      sourceLabel: SIGNAL_LABELS[manualKind],
      createdAt: new Date().toISOString(),
      metrics:
        manualKind === "google-trends"
          ? { trendScore: Math.max(0, Math.min(100, Number(manualTrendScore) || 0)) }
          : undefined,
    });
    setManualTitle("");
    setManualUrl("");
    setManualNote("");
  }

  async function writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function candidateFromTopicReview(review: TopicReviewItem, bundle: ResearchEvidenceBundle): Candidate {
    const createdAt = new Date().toISOString();
    return {
      id: makeId("candidate"),
      title: review.title.trim(),
      problem: review.problem.trim(),
      audience: review.audience.trim(),
      siteTheme: "생활 문제 해결 기록소 · 디지털 생활 도구",
      contentMode: review.contentMode,
      validationStrategy: review.decision === "direct-test" ? "direct-test" : "research-verification",
      experimentPlan:
        review.decision === "direct-test" && review.experimentPlan
          ? { ...review.experimentPlan, recommended: true }
          : undefined,
      sourceSignalIds: bundle.sourceSignalIds,
      scoreInputs: review.scoreInputs,
      penalties: {
        ymyl: false,
        newsRewrite: false,
        duplicate: false,
        aiCommodity: false,
        weakEvidence: review.evidenceQuality === "low",
      },
      uniqueOutput: review.uniqueOutput.trim(),
      verificationPlan: review.verificationPlan.trim(),
      directEvidence: "",
      editorialContext: autoEditorialContext?.bundles.find((item) => item.bundleId === bundle.id),
      aiReview: {
        decision: review.decision === "direct-test" ? "direct-test" : "research-verification",
        reviewedAt: createdAt,
        category: review.category,
        searchIntent: review.searchIntent.trim(),
        trafficPotential: review.trafficPotential,
        repeatedDemand: review.repeatedDemand,
        contentSaturation: review.contentSaturation,
        evidenceQuality: review.evidenceQuality,
        originalityPotential: review.originalityPotential,
        rationale: review.rationale.trim(),
      },
      createdAt,
      updatedAt: createdAt,
    };
  }

  async function syncWordPressContent() {
    if (!siteUrl.trim()) {
      setSiteContentError("WordPress 사이트 URL을 입력해주세요.");
      return;
    }
    setSiteContentLoading(true);
    setSiteContentError(null);
    try {
      const response = await fetch("/api/site-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: siteUrl.trim(), maxPosts: 500 }),
      });
      const data = (await response.json()) as SiteContentSyncResponse;
      if (!response.ok) throw new Error(data.error || "WordPress 글 목록을 가져오지 못했습니다.");
      setSiteUrl(data.siteUrl);
      setSiteContents(Array.isArray(data.contents) ? data.contents : []);
      setSiteContentSyncedAt(data.syncedAt || new Date().toISOString());
      setToast(`WordPress 게시글 ${data.total}개를 사이트 중복 검사 기준으로 동기화했습니다.`);
    } catch (error) {
      setSiteContentError(error instanceof Error ? error.message : "WordPress 글 목록을 가져오지 못했습니다.");
    } finally {
      setSiteContentLoading(false);
    }
  }

  async function executeResearch(offset = 0, sourceUrl?: string) {
    setAutoResearchWarnings([]);
    setAutoResearchCooldown(null);
    setAutoEvidenceBundles([]);
    setAutoReviewPrompt("");
    setAutoReviewOutput("");
    setAutoReviewPromptCopied(false);
    setAutoSourceQuestion(null);

    const response = await fetch("/api/research/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset,
        sourceUrl: sourceUrl || undefined,
        usedTopics: usedTopics.map((item) => ({
          title: item.title,
          problem: item.problem,
          usedAt: item.usedAt,
        })),
        siteUrl: siteUrl.trim() || undefined,
        siteContents: siteContents.slice(0, 500),
        searchPerformance: signals
          .filter((signal) => signal.kind === "search-console" && (signal.query || signal.title))
          .slice(0, 500)
          .map((signal) => ({
            query: signal.query || signal.title,
            clicks: signal.metrics?.clicks,
            impressions: signal.metrics?.impressions,
            ctr: signal.metrics?.ctr,
            position: signal.metrics?.position,
          })),
      }),
    });
    const data = (await response.json()) as AutoResearchResponse & { error?: string };

    if (!response.ok) {
      throw new Error(data.error || "조사 데이터 수집에 실패했습니다.");
    }

    const incomingSignals = Array.isArray(data.signals) ? data.signals : [];
    const incomingBundles = Array.isArray(data.evidenceBundles) ? data.evidenceBundles : [];
    const signalIdMap = new Map<string, string>();
    const existingByKey = new Map(
      signals.map((signal) => [
        `${signal.kind}::${signal.title}::${signal.url || ""}`,
        signal.id,
      ]),
    );
    const freshSignals: Signal[] = [];

    incomingSignals.forEach((signal) => {
      const key = `${signal.kind}::${signal.title}::${signal.url || ""}`;
      const existingId = existingByKey.get(key);
      if (existingId) {
        signalIdMap.set(signal.id, existingId);
        return;
      }
      existingByKey.set(key, signal.id);
      signalIdMap.set(signal.id, signal.id);
      freshSignals.push(signal);
    });

    const normalizedBundles = incomingBundles.map((bundle) => ({
      ...bundle,
      sourceSignalIds: bundle.sourceSignalIds.map((id) => signalIdMap.get(id) || id),
    }));

    setSignals((current) => [...freshSignals, ...current]);
    setAutoResearchOffset(offset);
    setAutoResearchSeeds(Array.isArray(data.seeds) ? data.seeds : []);
    setAutoResearchWarnings(Array.isArray(data.errors) ? data.errors : []);
    setAutoResearchCooldown(data.cooldown || null);
    setAutoEvidenceBundles(normalizedBundles);
    setAutoReviewPrompt(typeof data.reviewPrompt === "string" ? data.reviewPrompt : "");
    setAutoEditorialContext(data.editorialContext || null);
    setAutoSourceQuestion(data.sourceQuestion || null);

    if (normalizedBundles.length && data.reviewPrompt) {
      window.setTimeout(() => {
        document.getElementById("topic-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }

    return { data, normalizedBundles };
  }

  async function runAutoResearch(offset = 0) {
    setAutoResearchLoading(true);
    setAutoResearchError(null);
    setKinUrlResearchError(null);
    try {
      const { normalizedBundles } = await executeResearch(offset);
      if (!normalizedBundles.length) {
        setToast("조사는 완료됐지만 이번 검색에서 중복·제외 기준을 통과한 독립 질문을 찾지 못했습니다. 이전에 보기만 한 후보는 더 이상 차단하지 않으므로 다시 조회해도 됩니다.");
      }
    } catch (error) {
      setAutoResearchError(error instanceof Error ? error.message : "조사 데이터 수집에 실패했습니다.");
    } finally {
      setAutoResearchLoading(false);
    }
  }

  async function runKinUrlResearch() {
    const sourceUrl = kinSourceUrl.trim();
    if (!sourceUrl) {
      setKinUrlResearchError("네이버 지식iN 원문 URL을 입력해주세요.");
      return;
    }
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.hostname !== "kin.naver.com" && parsed.hostname !== "m.kin.naver.com") {
        setKinUrlResearchError("kin.naver.com 지식iN 질문 URL만 입력할 수 있습니다.");
        return;
      }
    } catch {
      setKinUrlResearchError("올바른 URL 형식인지 확인해주세요.");
      return;
    }

    setKinUrlResearchLoading(true);
    setKinUrlResearchError(null);
    setAutoResearchError(null);
    try {
      const { normalizedBundles, data } = await executeResearch(0, sourceUrl);
      if (!normalizedBundles.length || !data.reviewPrompt) {
        setKinUrlResearchError(
          (Array.isArray(data.errors) && data.errors[0]) || "원문은 확인했지만 심사에 넘길 Evidence Bundle을 만들지 못했습니다.",
        );
      }
    } catch (error) {
      setKinUrlResearchError(error instanceof Error ? error.message : "지식iN 원문 조사를 시작하지 못했습니다.");
    } finally {
      setKinUrlResearchLoading(false);
    }
  }

  async function copyAutoReviewPrompt() {
    if (!autoReviewPrompt) return;
    await writeClipboard(autoReviewPrompt);
    setAutoReviewPromptCopied(true);
    setToast("심사 프롬프트를 복사했습니다. ChatGPT Pro에 붙여넣으세요.");
  }

  function reviewPromptForBundles(bundles: ResearchEvidenceBundle[]) {
    const bundleIds = new Set(bundles.map((bundle) => bundle.id));
    const editorialContext = autoEditorialContext
      ? {
          ...autoEditorialContext,
          bundles: autoEditorialContext.bundles.filter((item) => bundleIds.has(item.bundleId)),
        }
      : undefined;
    return buildTopicReviewPrompt(bundles, {
      generatedAt: new Date().toISOString(),
      seeds: autoResearchSeeds,
      cooldown: {
        usedDays: autoResearchCooldown?.usedDays ?? 60,
        seenDays: 0,
        usedCount: autoResearchCooldown?.usedCount ?? 0,
        seenCount: 0,
      },
      editorialContext,
    });
  }

  async function copyEvidenceBundlePrompt(bundle: ResearchEvidenceBundle) {
    const prompt = reviewPromptForBundles([bundle]);
    await writeClipboard(prompt);

    const remainingBundles = autoEvidenceBundles.filter((item) => item.id !== bundle.id);
    setAutoEvidenceBundles(remainingBundles);
    setAutoReviewPrompt(remainingBundles.length ? reviewPromptForBundles(remainingBundles) : "");
    setAutoReviewPromptCopied(false);
    setToast(`“${bundle.query}” 프롬프트를 복사했고 현재 결과 목록에서 숨겼습니다.`);
  }

  async function copyEvidenceJson() {
    if (!autoEvidenceBundles.length) return;
    await writeClipboard(JSON.stringify({ evidenceBundles: autoEvidenceBundles }, null, 2));
    setToast("오늘의 Evidence Bundle JSON을 복사했습니다.");
  }

  function importTopicReview() {
    try {
      const result = parseTopicReviewOutput(autoReviewOutput);
      const bundleById = new Map(autoEvidenceBundles.map((bundle) => [bundle.id, bundle]));
      const selectedReviews = result.reviews
        .filter((review) => review.decision === "direct-test" || review.decision === "research-verification")
        .slice(0, 3);

      const imported = selectedReviews.flatMap((review) => {
        const bundle = bundleById.get(review.bundleId);
        if (!bundle) return [];
        if (isExcludedContentTopic(`${review.title} ${review.problem}`)) return [];
        return [candidateFromTopicReview(review, bundle)];
      });

      if (!imported.length) {
        setToast("ChatGPT Pro가 제작 대상으로 선정한 후보가 없습니다. 오늘은 억지로 발행하지 않는 편이 좋습니다.");
        return;
      }

      setCandidates((current) => {
        const incomingTitles = new Set(imported.map((candidate) => candidate.title.trim().toLowerCase()));
        return [...imported, ...current.filter((candidate) => !incomingTitles.has(candidate.title.trim().toLowerCase()))];
      });
      setActiveCandidateId(imported[0]?.id || null);
      setTab("candidates");
      setToast(`ChatGPT Pro가 선정한 후보 ${imported.length}개를 불러왔습니다. 직접 테스트형은 결과를 기록한 뒤 최종 글로 넘어갑니다.`);
      window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }), 0);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "ChatGPT Pro 심사 결과를 읽지 못했습니다.");
    }
  }

  async function searchNaver() {
    if (!naverQuery.trim()) {
      setNaverError("검색어를 입력해주세요.");
      return;
    }
    setNaverLoading(true);
    setNaverError(null);
    try {
      const params = new URLSearchParams({
        q: naverQuery.trim(),
        type: naverType,
        display: "30",
        sort: naverSort,
      });
      const response = await fetch(`/api/naver/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");
      setNaverItems(data.items || []);
    } catch (error) {
      setNaverItems([]);
      setNaverError(error instanceof Error ? error.message : "검색에 실패했습니다.");
    } finally {
      setNaverLoading(false);
    }
  }

  function saveNaverItem(item: NaverItem) {
    const typeInfo = NAVER_TYPES.find((entry) => entry.value === naverType) || NAVER_TYPES[0];
    addSignal({
      id: makeId("signal"),
      kind: typeInfo.kind,
      title: stripHtml(item.title || "제목 없음"),
      url: item.originallink || item.link,
      snippet: item.description ? stripHtml(item.description) : undefined,
      query: naverQuery.trim(),
      sourceLabel: typeInfo.label,
      createdAt: new Date().toISOString(),
    });
  }

  function recentTrendScore(result: NaverTrendResult) {
    const ratios = (result.data || [])
      .map((point) => Number(point.ratio))
      .filter((value) => Number.isFinite(value));
    if (!ratios.length) return 0;
    const recent = ratios.slice(-Math.min(4, ratios.length));
    return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
  }

  async function searchNaverTrend() {
    const keywords = naverTrendKeywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (!keywords.length) {
      setNaverTrendError("검색어를 하나 이상 입력해주세요.");
      return;
    }

    setNaverTrendLoading(true);
    setNaverTrendError(null);

    try {
      const response = await fetch("/api/naver/trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, range: naverTrendRange }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "검색어 트렌드 조회에 실패했습니다.");
      setNaverTrendResults(Array.isArray(data.results) ? data.results : []);
    } catch (error) {
      setNaverTrendResults([]);
      setNaverTrendError(error instanceof Error ? error.message : "검색어 트렌드 조회에 실패했습니다.");
    } finally {
      setNaverTrendLoading(false);
    }
  }

  function saveNaverTrend(result: NaverTrendResult) {
    const trendScore = recentTrendScore(result);
    addSignal({
      id: makeId("signal"),
      kind: "naver-trends",
      title: `${result.title} 검색 수요 신호`,
      query: result.title,
      snippet: `${naverTrendRange === "1y" ? "최근 1년 월간" : "최근 90일 주간"} 상대 검색지수의 최근 평균 ${trendScore}/100. 절대 검색량이 아니라 같은 요청 안에서 정규화된 수요·시기 신호로만 사용합니다.`,
      sourceLabel: "NAVER 검색어트렌드",
      createdAt: new Date().toISOString(),
      metrics: { trendScore },
    });
  }

  async function importSearchConsole(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setToast("CSV에서 데이터를 찾지 못했습니다.");
      return;
    }
    const headers = rows[0].map((value) => value.toLowerCase().trim());
    const findHeader = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === name || header.includes(name)));
    const queryIndex = findHeader("query", "검색어", "쿼리");
    const clicksIndex = findHeader("clicks", "클릭수", "클릭");
    const impressionsIndex = findHeader("impressions", "노출수", "노출");
    const ctrIndex = findHeader("ctr");
    const positionIndex = findHeader("position", "게재순위", "평균 게재순위");

    if (queryIndex < 0) {
      setToast("검색어(Query) 열을 찾지 못했습니다.");
      return;
    }

    const imported = rows
      .slice(1)
      .filter((row) => row[queryIndex])
      .slice(0, 300)
      .map<Signal>((row) => ({
        id: makeId("signal"),
        kind: "search-console",
        title: row[queryIndex],
        query: row[queryIndex],
        snippet: "Search Console에서 실제로 노출된 검색어",
        sourceLabel: file.name,
        createdAt: new Date().toISOString(),
        metrics: {
          clicks: clicksIndex >= 0 ? parseNumber(row[clicksIndex]) : undefined,
          impressions: impressionsIndex >= 0 ? parseNumber(row[impressionsIndex]) : undefined,
          ctr: ctrIndex >= 0 ? parseNumber(row[ctrIndex]) : undefined,
          position: positionIndex >= 0 ? parseNumber(row[positionIndex]) : undefined,
        },
      }));

    // Search Console은 누적 로그가 아니라 현재 사이트 성과 스냅샷으로 사용합니다.
    // 새 CSV를 가져오면 이전 Search Console 신호는 교체하고 다른 조사 신호만 유지합니다.
    setSignals((current) => [...imported, ...current.filter((signal) => signal.kind !== "search-console")]);
    setToast(`Search Console 검색어 ${imported.length}개를 최신 성과 스냅샷으로 불러왔습니다.`);
  }

  function toggleSignal(id: string) {
    setSelectedSignalIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function createCandidateFromSelection() {
    const selected = signals.filter((signal) => selectedSignalIds.includes(signal.id));
    if (!selected.length) {
      setToast("후보로 묶을 신호를 하나 이상 선택해주세요.");
      return;
    }
    const seed = selected.find((signal) => signal.query) || selected[0];
    const candidate = defaultCandidate(seed);
    candidate.sourceSignalIds = selected.map((signal) => signal.id);
    candidate.title = seed.query || seed.title;
    candidate.problem = selected
      .filter((signal) => ["community", "naver-cafe", "naver-kin"].includes(signal.kind))
      .map((signal) => signal.title)
      .slice(0, 2)
      .join(" / ") || seed.title;

    const trendScores = selected
      .filter((signal) => ["naver-trends", "google-trends"].includes(signal.kind))
      .map((signal) => signal.metrics?.trendScore)
      .filter((value): value is number => typeof value === "number");
    const maxTrendScore = trendScores.length ? Math.max(...trendScores) : null;
    const hasSearchConsoleDemand = selected.some((signal) => (signal.metrics?.impressions || 0) > 0);
    if (maxTrendScore !== null) {
      candidate.scoreInputs.demand = maxTrendScore >= 70 ? 5 : maxTrendScore >= 35 ? 4 : 3;
    } else if (hasSearchConsoleDemand) {
      candidate.scoreInputs.demand = 4;
    }

    candidate.penalties.newsRewrite = selected.length === 1 && selected[0].kind === "naver-news";
    candidate.penalties.aiCommodity = !selected.some((signal) => signal.kind === "official") || !selected.some((signal) => ["community", "naver-cafe", "naver-kin", "search-console"].includes(signal.kind));
    setCandidates((current) => [candidate, ...current]);
    setActiveCandidateId(candidate.id);
    setSelectedSignalIds([]);
    setTab("candidates");
    setToast("주제 후보를 만들었습니다. 점수와 고유 결과물을 보완하세요.");
  }

  function updateCandidate(id: string, patch: Partial<Candidate>) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? { ...candidate, ...patch, updatedAt: new Date().toISOString() }
          : candidate,
      ),
    );
  }

  function updateScore(id: string, key: keyof ScoreInputs, value: number) {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    updateCandidate(id, {
      scoreInputs: { ...candidate.scoreInputs, [key]: value },
    });
  }

  function updatePenalty(id: string, key: keyof Penalties, value: boolean) {
    const candidate = candidates.find((item) => item.id === id);
    if (!candidate) return;
    updateCandidate(id, {
      penalties: { ...candidate.penalties, [key]: value },
    });
  }

  function deleteCandidate(id: string) {
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
    if (activeCandidateId === id) setActiveCandidateId(null);
  }

  async function copyCandidatePrompt(candidate: Candidate) {
    if (!isUsableCandidate(candidate) || (!candidate.aiReview && scoreCandidate(candidate) < 60)) {
      setToast("ChatGPT Pro가 선정했거나 수동 검토를 통과한 실제 질문 기반 후보만 프롬프트로 만들 수 있습니다.");
      return;
    }
    const testRequired = needsDirectTest(candidate);
    const text = promptForCandidate(candidate, signals);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    if (testRequired) {
      setActiveCandidateId(candidate.id);
      setPromptCopied(true);
      setToast(`“${candidate.title}” ${candidate.experimentPlan?.durationDays || 3}일 테스트 계획을 복사했습니다. 실제 결과를 ‘직접 확보한 증거’에 입력하기 전까지 후보는 유지됩니다.`);
      window.setTimeout(() => setPromptCopied(false), 1500);
      return;
    }

    setUsedTopics((current) => {
      const next: UsedTopicHistory = {
        title: candidate.title || candidate.problem || "제목 없는 후보",
        problem: candidate.problem || undefined,
        usedAt: new Date().toISOString(),
      };
      const filtered = current.filter((item) => item.title !== next.title);
      return [...filtered, next].slice(-120);
    });

    setCandidates((current) => current.filter((item) => item.id !== candidate.id));
    const nextCandidate = visibleCandidates.find((item) => item.id !== candidate.id) || null;
    setActiveCandidateId(nextCandidate?.id || null);
    setPromptCopied(true);
    setToast(`“${candidate.title || "제목 없는 후보"}” 프롬프트를 복사했고 후보 목록에서 숨겼습니다.`);
    window.setTimeout(() => setPromptCopied(false), 1500);
  }

  async function copyPrompt() {
    if (!activeCandidate) return;
    await copyCandidatePrompt(activeCandidate);
  }

  const activePrompt = activeCandidate ? promptForCandidate(activeCandidate, signals) : "";

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f7f7f5] text-zinc-900">
      {toast ? (
        <div className="fixed left-1/2 top-5 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 break-words rounded-full border border-zinc-200 bg-zinc-950 px-4 py-2 text-center text-xs font-medium text-white shadow-lg [overflow-wrap:anywhere]">
          {toast}
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-[#f7f7f5]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full min-w-0 max-w-[1500px] items-center justify-start px-4 sm:px-6">
          <button
            type="button"
            onClick={handleBrandHome}
            className="flex min-w-0 items-center gap-3 rounded-xl text-left outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            aria-label="홈으로 이동하고 작업 초기화"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <SparkIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.02em]">Content Topic Research</div>
              <div className="hidden text-[11px] text-zinc-400 sm:block">생산 자동화보다 선별 자동화</div>
            </div>
          </button>
        </div>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-[1280px] overflow-x-hidden px-4 py-5 sm:px-6">
        <main className="w-full min-w-0 max-w-full overflow-x-hidden">
          {tab === "discover" ? (
            <div className="space-y-6">
              <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950 p-5 text-white sm:p-6">
                <div className="grid min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-end">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">One-click Research</div>
                    <h2 className="text-2xl font-semibold tracking-[-0.04em]">NAVER 데이터를 모으고 ChatGPT Pro에게 주제 심사를 맡기기</h2>
                    <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">
                      앱은 지식iN에서 실제 질문을 넓게 찾고, 동일 URL·동일 질문은 제거한 뒤 유사 질문을 묶습니다. 그중 서로 다른 문제를 최대 10~15개 수준으로 추려 검색어트렌드·카페·블로그·뉴스·웹문서 데이터를 Evidence Bundle JSON으로 붙입니다. 검색어트렌드는 원 질문 한 문장만 보지 않고 관련 검색 의도군을 함께 조회합니다. 스크립트는 수집·정리만 하고 최종 주제를 결정하지 않습니다. 수집이 끝나면 ChatGPT Pro 주제 심사 프롬프트를 화면에 준비하며, 내가 직접 복사해 심사 결과를 확인한 뒤 선정 후보를 불러옵니다. 의료·법률·금융·재정·전문 안전 주제는 앞단과 심사 프롬프트에서 이중으로 제외합니다.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">지식iN · 실제 질문</span>
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">카페 · 반복 불편</span>
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">블로그 · 표현/사례</span>
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">뉴스 · 변경 감지</span>
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">웹문서 · 공식 근거 후보</span>
                      <span className="rounded-full border border-zinc-800 px-2.5 py-1">검색어트렌드 · 수요/시기</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    {!autoResearchLoading && autoReviewPrompt ? (
                      <>
                        <div className="text-xs font-medium text-zinc-300">프롬프트 복사하기</div>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">NAVER 6개 API 증거 수집이 끝났습니다. 아래 프롬프트를 복사해 ChatGPT Pro에 붙여넣고 추천 순위를 확인한 뒤 번호만 선택하면 됩니다.</p>
                        <div className="mt-2 text-[11px] leading-5 text-zinc-500">
                          최근 프롬프트 사용 {usedTopics.filter((item) => Date.now() - new Date(item.usedAt).getTime() <= 60 * 86_400_000).length}개 · 60일 중복 방지
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => void copyAutoReviewPrompt()}
                            className={classNames(
                              "flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition",
                              autoReviewPromptCopied
                                ? "border-emerald-700 bg-emerald-950/30 text-emerald-300"
                                : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                            )}
                          >
                            {autoReviewPromptCopied ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <CopyIcon className="h-3.5 w-3.5 shrink-0" />}
                            <span className="min-w-0 truncate">{autoReviewPromptCopied ? "복사 완료" : "프롬프트 복사"}</span>
                          </button>
                          <div aria-live="polite" className="min-h-5 pt-1.5 text-center text-[10px] leading-4 text-zinc-500">
                            {autoReviewPromptCopied ? "클립보드에 복사되었습니다. ChatGPT Pro에 붙여넣으세요." : "추천 번호를 선택하면 조사·검증형은 공식 원문 검증 후 WordPress 원고 작성까지 이어집니다."}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-medium text-zinc-300">오늘 할 일</div>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">버튼을 누르면 NAVER 6개 API 데이터를 수집·정리하고 ChatGPT Pro 심사 프롬프트를 만듭니다. 최종 주제 판단은 ChatGPT Pro가 하고, 내가 추천 번호를 선택합니다.</p>
                        <div className="mt-2 text-[11px] leading-5 text-zinc-500">
                          최근 프롬프트 사용 {usedTopics.filter((item) => Date.now() - new Date(item.usedAt).getTime() <= 60 * 86_400_000).length}개 · 60일 중복 방지
                        </div>
                        <button
                          type="button"
                          onClick={() => void runAutoResearch(0)}
                          disabled={autoResearchLoading}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {autoResearchLoading ? (
                            <>
                              <span
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950"
                              />
                              NAVER 6개 API 증거 수집 중...
                            </>
                          ) : (
                            <>
                              <SparkIcon className="h-4 w-4" />
                              오늘의 자동 탐색 시작
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {autoResearchError ? (
                  <div className="mt-4 rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-xs leading-5 text-rose-200">
                    {autoResearchError}
                  </div>
                ) : null}

                {autoResearchSeeds.length ? (
                  <div className="mt-5 border-t border-zinc-800 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-zinc-300">이번 조사 범위</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {autoResearchSeeds.map((seed) => (
                            <span key={seed.query} className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300">
                              {seed.query} · {seed.category}
                            </span>
                          ))}
                        </div>
                        {autoResearchCooldown ? (
                          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                            실제로 콘텐츠 제작에 사용한 최근 주제 {autoResearchCooldown.usedCount}개만 {autoResearchCooldown.usedDays}일 동안 유사 주제 추천에서 제외합니다. 단순 조사·노출만으로는 후보를 차단하지 않습니다.
                          </p>
                        ) : null}
                      </div>

                    </div>
                    {autoResearchWarnings.length ? (
                      <details className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
                        <summary className="cursor-pointer font-medium">일부 API 결과를 가져오지 못했습니다 ({autoResearchWarnings.length})</summary>
                        <ul className="mt-2 space-y-1 text-amber-300/80">
                          {autoResearchWarnings.map((warning) => <li key={warning}>· {warning}</li>)}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Focused Research"
                  title="지식iN 원문으로 바로 조사"
                  description="Notion에서 괜찮은 질문을 골랐거나 직접 발견한 지식iN 질문이 있다면 원문 URL 하나만 붙여넣으세요. 해당 질문을 고정 출발점으로 삼아 유사 독립 질문·검색어트렌드·카페·블로그·뉴스·웹문서를 다시 수집하고 기존 WordPress 글·Search Console 신호까지 같은 심사 로직에 연결합니다."
                />
                <form
                  className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runKinUrlResearch();
                  }}
                >
                  <div className="relative min-w-0">
                    <ExternalIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="url"
                      value={kinSourceUrl}
                      onChange={(event) => {
                        setKinSourceUrl(event.target.value);
                        if (kinUrlResearchError) setKinUrlResearchError(null);
                      }}
                      placeholder="https://kin.naver.com/qna/detail.naver?..."
                      className="w-full min-w-0 rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={kinUrlResearchLoading || !kinSourceUrl.trim()}
                    className="flex min-w-0 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {kinUrlResearchLoading ? (
                      <>
                        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white" />
                        원문 조사 중...
                      </>
                    ) : (
                      <>
                        <SparkIcon className="h-4 w-4 shrink-0" />
                        이 질문 조사하기
                      </>
                    )}
                  </button>
                </form>
                <p className="mt-2 break-words text-[11px] leading-5 text-zinc-400 [overflow-wrap:anywhere]">
                  URL을 넣었다고 바로 글을 만들지는 않습니다. 원문 질문을 먼저 확인하고, 같은 문제를 묻는 다른 질문과 최근 수요·에버그린성·공식 근거·기존 글 중복 가능성을 다시 조사한 뒤 ChatGPT Pro가 발행/보류/기존 글 업데이트 여부를 판단합니다.
                </p>
                {kinUrlResearchError ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
                    {kinUrlResearchError}
                  </div>
                ) : null}
                {autoSourceQuestion ? (
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700">원문 기준 조사</span>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{autoSourceQuestion.title}</span>
                    <a href={autoSourceQuestion.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-zinc-500 hover:text-zinc-900">
                      원문 <ExternalIcon className="h-3 w-3" />
                    </a>
                  </div>
                ) : null}
              </section>

              {autoReviewPrompt || autoEvidenceBundles.length ? (
                <section id="topic-review-panel" className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                  <SectionTitle
                    eyebrow="ChatGPT Pro Topic Review"
                    title={autoSourceQuestion ? "선택한 지식iN 질문을 ChatGPT Pro에서 최종 심사" : "오늘의 데이터가 담긴 프롬프트를 ChatGPT Pro에서 직접 심사"}
                    description={autoSourceQuestion ? "입력한 지식iN 원문을 기준점으로 주변 독립 질문과 NAVER 5개 보조 신호를 다시 수집했습니다. 프롬프트를 ChatGPT Pro에 입력해 신규 글 가치, 기존 글 업데이트 여부, 공식 원문 검증 가능성을 최종 판단합니다." : "Evidence Bundle이 포함된 심사 프롬프트를 ChatGPT Pro에 입력하면 최대 3개의 주제를 추천합니다. 그 대화에서 1·2·3 중 하나만 선택하면 조사·검증형은 별도 확인 요청 없이 공식 원문 재검증부터 Auto Publisher용 WordPress 원고 작성까지 이어서 진행합니다. 직접 테스트형만 실제 테스트 결과가 필요합니다."}
                  />

                  <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-700">ChatGPT Pro에 입력할 주제 심사 프롬프트</div>
                        <p className="mt-1 text-[11px] leading-5 text-zinc-400">{autoSourceQuestion ? "선택한 원문 질문과 유사 독립 질문, 검색어트렌드·카페·블로그·뉴스·웹문서 Evidence JSON이 포함되어 있습니다." : "오늘 수집한 지식iN 질문과 검색어트렌드·카페·블로그·뉴스·웹문서 Evidence JSON이 포함되어 있습니다."} 앱은 이 프롬프트를 만들기만 하며, 실제 주제 선정은 ChatGPT Pro가 합니다.</p>
                      </div>
                      <button type="button" onClick={() => void copyAutoReviewPrompt()} className={classNames("inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition", autoReviewPromptCopied ? "bg-emerald-700 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800")}>
                        {autoReviewPromptCopied ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <CopyIcon className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{autoReviewPromptCopied ? "복사 완료" : "프롬프트 복사"}</span>
                      </button>
                    </div>
                    <textarea
                      value={autoReviewPrompt}
                      readOnly
                      rows={14}
                      className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-white p-4 font-mono text-[11px] leading-5 text-zinc-600 outline-none"
                    />
                  </div>

                  <div className="grid min-w-0 max-w-full gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <div className="text-xs font-semibold text-zinc-700">오늘의 Evidence Bundle</div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        지식iN 원시 결과의 중복을 제거하고 유사 질문을 묶은 뒤, 서로 다른 문제 {autoEvidenceBundles.length}개를 Evidence Bundle로 만들었습니다. 각 후보에는 관련 검색어군 트렌드와 카페·블로그·뉴스·웹문서 원문 URL/스니펫이 포함되며 최종 판단은 ChatGPT Pro가 합니다.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void copyAutoReviewPrompt()} className={classNames("inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition", autoReviewPromptCopied ? "bg-emerald-700 text-white" : "bg-zinc-900 text-white hover:bg-zinc-800")}>
                          {autoReviewPromptCopied ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <CopyIcon className="h-3.5 w-3.5 shrink-0" />}
                          <span className="truncate">{autoReviewPromptCopied ? "복사 완료" : "프롬프트 다시 복사"}</span>
                        </button>
                        <button type="button" onClick={() => void copyEvidenceJson()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900">
                          <FileTextIcon className="h-3.5 w-3.5" /> Evidence JSON 복사
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">수동 제어 흐름</div>
                      <ol className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-600">
                        <li>1. NAVER 데이터 수집</li>
                        <li>2. 생성된 프롬프트를 내가 확인·복사</li>
                        <li>3. ChatGPT Pro가 주제를 비교·추천</li>
                        <li>4. 내가 1·2·3 중 하나만 선택</li>
                        <li>5. 조사·검증형은 공식 원문 재검증 후 바로 WordPress 원고 작성</li>
                        <li>6. 직접 테스트형만 실제 결과를 기록한 뒤 원고 작성</li>
                      </ol>
                    </div>
                  </div>

                  <div className="mt-5 grid min-w-0 max-w-full gap-3 lg:grid-cols-2">
                    {autoEvidenceBundles.map((bundle) => (
                      <article
                        key={bundle.id}
                        role="button"
                        tabIndex={0}
                        title="클릭하면 이 후보만 담은 프롬프트를 복사하고 현재 목록에서 숨깁니다."
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("a,button")) return;
                          void copyEvidenceBundlePrompt(bundle);
                        }}
                        onKeyDown={(event) => {
                          if ((event.target as HTMLElement).closest("a,button")) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          void copyEvidenceBundlePrompt(bundle);
                        }}
                        className="min-w-0 max-w-full cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 p-4 transition hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-zinc-400">{bundle.discoveryCategory}</div>
                            <h3 className="mt-1 break-words font-semibold leading-6 text-zinc-800 [overflow-wrap:anywhere]">{bundle.query}</h3>
                          </div>
                          <div className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500">지식iN 독립 질문 {bundle.questionStats?.uniqueCount ?? bundle.questions.length}건</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
                          <span className={classNames("rounded-full px-2 py-1", bundle.coverage.trend ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100")}>트렌드 {bundle.coverage.trend ? "있음" : "없음"}</span>
                          <span className={classNames("rounded-full px-2 py-1", bundle.coverage.cafe ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100")}>카페 {bundle.cafe.length}</span>
                          <span className={classNames("rounded-full px-2 py-1", bundle.coverage.blog ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100")}>블로그 {bundle.blog.length}</span>
                          <span className={classNames("rounded-full px-2 py-1", bundle.coverage.news ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100")}>뉴스 {bundle.news.length}</span>
                          <span className={classNames("rounded-full px-2 py-1", bundle.coverage.web ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100")}>웹문서 {bundle.web.length}</span>
                        </div>
                        {bundle.trend.keywords?.length ? (
                          <p className="mt-2 break-words text-[10px] leading-4 text-zinc-400 [overflow-wrap:anywhere]">트렌드 검색어군 · {bundle.trend.keywords.join(" · ")} · 비교 배치 {bundle.trend.comparisonBatch || 1}</p>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {bundle.questions.slice(0, 3).map((question, index) => (
                            <div key={`${bundle.id}-q-${index}`} className="rounded-xl bg-zinc-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="break-words text-xs leading-5 text-zinc-700 [overflow-wrap:anywhere]">{question.title}</p>
                                  {(question.similarCount || 1) > 1 ? (
                                    <p className="mt-1 text-[10px] font-medium text-emerald-700">유사한 독립 질문 {question.similarCount}건 묶음</p>
                                  ) : null}
                                </div>
                                {question.url ? (
                                  <a href={question.url} target="_blank" rel="noreferrer" className="shrink-0 text-[10px] font-medium text-zinc-400 hover:text-zinc-900">
                                    원문 <ExternalIcon className="ml-0.5 inline h-3 w-3" />
                                  </a>
                                ) : null}
                              </div>
                              {question.relatedQuestions?.length ? (
                                <div className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2">
                                  {question.relatedQuestions.slice(0, 3).map((related, relatedIndex) => (
                                    <div key={`${bundle.id}-q-${index}-related-${relatedIndex}`} className="flex items-start justify-between gap-2 text-[10px] leading-4 text-zinc-500">
                                      <span className="min-w-0 break-words line-clamp-1 [overflow-wrap:anywhere]">↳ {related.title}</span>
                                      {related.url ? (
                                        <a href={related.url} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-zinc-400 hover:text-zinc-900">원문</a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 border-t border-zinc-100 pt-3 text-[10px] font-medium text-zinc-400">카드 빈 영역을 클릭하면 이 후보만 담은 프롬프트를 복사하고 현재 목록에서 숨깁니다.</p>
                      </article>
                    ))}
                  </div>

                  <details className="mt-5 rounded-2xl border border-zinc-200 p-4">
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-600">Evidence Bundle JSON 미리보기</summary>
                    <pre className="mt-3 max-h-72 w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-xl bg-zinc-950 p-4 text-[10px] leading-5 text-zinc-300">{JSON.stringify(autoEvidenceBundles, null, 2)}</pre>
                  </details>

                  <div className="mt-5 border-t border-zinc-100 pt-5">
                    <label className="block">
                      <span className="text-xs font-semibold text-zinc-700">선택 사항 · ChatGPT Pro 심사 결과를 앱에 보관</span>
                      <span className="mt-1 block text-[11px] leading-5 text-zinc-400">WordPress 글 작성만 원하면 ChatGPT Pro에서 추천 번호를 선택하면 됩니다. 후보 큐에 저장하거나 직접 테스트 기록을 관리하고 싶을 때만 추천 보고서와 마지막 ```json 코드블록을 포함한 답변 전체를 여기에 붙여넣으세요.</span>
                      <textarea
                        value={autoReviewOutput}
                        onChange={(event) => setAutoReviewOutput(event.target.value)}
                        rows={10}
                        placeholder='{"reviewSummary":"...","reviews":[...]}'
                        className="mt-2 w-full min-w-0 max-w-full resize-y rounded-2xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-5 outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={importTopicReview}
                      disabled={!autoReviewOutput.trim()}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      <CheckIcon className="h-4 w-4" /> ChatGPT Pro 선정 후보 불러오기
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Manual Search"
                  title="직접 찾고 싶은 주제가 있을 때만 검색"
                  description="자동 탐색에서 빠진 주제를 더 조사하고 싶을 때만 사용합니다. 블로그·카페·지식iN은 문제 탐지, 뉴스는 변경 감지, 웹문서는 근거 후보 탐색에 사용합니다."
                />
                <div className="grid gap-3 lg:grid-cols-[170px_minmax(0,1fr)_120px_110px]">
                  <select value={naverType} onChange={(event) => setNaverType(event.target.value as NaverType)} className="min-w-0 max-w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none focus:border-zinc-400">
                    {NAVER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={naverQuery}
                      onChange={(event) => setNaverQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void searchNaver(); }}
                      placeholder="예: 세탁기 배수, 에어컨 냄새, 매트리스 버리기"
                      className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                    />
                  </div>
                  <select value={naverSort} onChange={(event) => setNaverSort(event.target.value as "sim" | "date")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none">
                    <option value="sim">관련도순</option>
                    <option value="date">날짜순</option>
                  </select>
                  <button type="button" onClick={() => void searchNaver()} disabled={naverLoading} className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50">
                    {naverLoading ? "검색 중" : "검색"}
                  </button>
                </div>
                {naverError ? <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{naverError} <span className="text-rose-500">(.env.local에 NAVER API HUB 인증정보가 필요합니다.)</span></div> : null}
                {naverItems.length ? (
                  <div className="mt-5 grid max-h-[480px] gap-2 overflow-y-auto pr-1 scrollbar-thin md:grid-cols-2">
                    {naverItems.map((item, index) => (
                      <div key={`${item.link}-${index}`} className="rounded-xl border border-zinc-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-5 text-zinc-800">{stripHtml(item.title)}</p>
                            {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{stripHtml(item.description)}</p> : null}
                          </div>
                          <button type="button" onClick={() => saveNaverItem(item)} className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50">저장</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Signal 02"
                  title="NAVER 검색어트렌드로 수요와 시기 확인"
                  description="검색어트렌드는 글 주제를 자동 결정하는 도구가 아니라 수요가 실제로 움직이는지와 발행 시점을 확인하는 보조 신호로 사용합니다. 최대 5개 검색어를 쉼표로 비교할 수 있습니다."
                />
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_110px]">
                  <input
                    value={naverTrendKeywords}
                    onChange={(event) => setNaverTrendKeywords(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void searchNaverTrend(); }}
                    placeholder="예: 에어컨 냄새, 에어컨 쉰내, 에어컨 필터 청소"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                  />
                  <select value={naverTrendRange} onChange={(event) => setNaverTrendRange(event.target.value as "90d" | "1y")} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none">
                    <option value="90d">최근 90일</option>
                    <option value="1y">최근 1년</option>
                  </select>
                  <button type="button" onClick={() => void searchNaverTrend()} disabled={naverTrendLoading} className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50">
                    {naverTrendLoading ? "조회 중" : "조회"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">NAVER의 ratio는 절대 검색량이 아니라 요청한 기간·검색어 집합 안에서 0~100으로 정규화된 상대 지수입니다.</p>
                {naverTrendError ? <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">{naverTrendError}</div> : null}
                {naverTrendResults.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {naverTrendResults.map((result) => {
                      const score = recentTrendScore(result);
                      return (
                        <div key={result.title} className="rounded-xl border border-zinc-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-zinc-800">{result.title}</p>
                              <p className="mt-1 text-xs text-zinc-400">최근 상대지수 평균 <span className="font-semibold text-zinc-700">{score}/100</span></p>
                            </div>
                            <button type="button" onClick={() => saveNaverTrend(result)} className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50">저장</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <div className="grid gap-6 xl:grid-cols-2">
                <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                  <SectionTitle
                    eyebrow="Signal 03"
                    title="수동 조사 신호 추가"
                    description="Google Trends는 발행 시기, 공식자료는 사실 검증, 커뮤니티는 실제 불편 탐색처럼 신호마다 역할을 분리합니다."
                  />
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {SOURCE_OPTIONS.map((option) => (
                        <button key={option.kind} type="button" onClick={() => setManualKind(option.kind)} className={classNames("rounded-xl border px-3 py-2 text-xs font-medium transition", manualKind === option.kind ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50")}>{option.label}</button>
                      ))}
                    </div>
                    <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder={manualKind === "google-trends" ? "트렌드 키워드" : "관찰한 문제 / 공식 문서 제목"} className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
                    {manualKind === "google-trends" ? (
                      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                        <span className="text-xs text-zinc-500">관찰 점수</span>
                        <input type="range" min="0" max="100" value={manualTrendScore} onChange={(event) => setManualTrendScore(event.target.value)} className="flex-1 accent-zinc-900" />
                        <span className="w-8 text-right text-xs font-semibold">{manualTrendScore}</span>
                      </div>
                    ) : (
                      <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="원문 URL (선택)" className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
                    )}
                    <textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} placeholder="어떤 점이 중요한지 메모하세요. 예: ‘청소했는데도’, ‘소리는 나는데’라는 표현이 반복됨" rows={3} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-3 text-sm leading-6 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
                    <button type="button" onClick={addManualSignal} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-800"><PlusIcon className="h-4 w-4" /> 신호 저장</button>
                  </div>
                </section>

                <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                  <SectionTitle
                    eyebrow="Signal 04"
                    title="Search Console 실제 기회 가져오기"
                    description="세상 전체의 트렌드보다 Google이 이미 내 사이트와 연결한 검색어를 우선합니다. Performance CSV를 올리면 검색어별 노출·클릭·순위를 신호로 저장합니다."
                  />
                  <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSearchConsole(file); event.currentTarget.value = ""; }} />
                  <button type="button" onClick={() => csvInputRef.current?.click()} className="flex min-h-40 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 text-center transition hover:border-zinc-400 hover:bg-zinc-100/60">
                    <UploadIcon className="mb-3 h-6 w-6 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-700">Search Console CSV 선택</span>
                    <span className="mt-1 text-xs text-zinc-400">Query / Clicks / Impressions / CTR / Position 자동 인식</span>
                  </button>
                </section>
              </div>

              <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Site Guard"
                  title="기존 WordPress 글과 신규 후보 중복 검사"
                  description="공개 WordPress REST API에서 현재 발행된 글 제목·URL·수정일을 가져와 신규 후보와 검색 의도를 비교합니다. 앱/서비스·생활 행정처럼 변경 가능성이 높은 글은 90일, 안정적인 에버그린 글은 180일을 재검증 힌트로 사용하며 날짜만으로 글을 폐기하지 않습니다."
                />
                <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <input
                    value={siteUrl}
                    onChange={(event) => setSiteUrl(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void syncWordPressContent(); }}
                    placeholder="https://example.com"
                    className="min-w-0 rounded-xl border border-zinc-200 px-3 py-3 text-sm outline-none placeholder:text-zinc-300 focus:border-zinc-400"
                  />
                  <button type="button" onClick={() => void syncWordPressContent()} disabled={siteContentLoading} className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50">
                    {siteContentLoading ? "동기화 중" : "기존 글 동기화"}
                  </button>
                </div>
                {siteContentError ? <div className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">{siteContentError}</div> : null}
                {siteContents.length ? (
                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3">
                    <div className="min-w-0 rounded-xl bg-zinc-50 p-3">
                      <div className="text-[10px] font-medium text-zinc-400">동기화된 기존 글</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-800">{siteContents.length}개</div>
                    </div>
                    <div className="min-w-0 rounded-xl bg-amber-50 p-3">
                      <div className="text-[10px] font-medium text-amber-700">90일 재검증 힌트</div>
                      <div className="mt-1 text-lg font-semibold text-amber-900">{siteContents.filter((item) => item.revalidationWindowDays === 90 && item.revalidationDue).length}개</div>
                    </div>
                    <div className="min-w-0 rounded-xl bg-zinc-50 p-3">
                      <div className="text-[10px] font-medium text-zinc-400">180일 재검증 힌트</div>
                      <div className="mt-1 text-lg font-semibold text-zinc-800">{siteContents.filter((item) => item.revalidationWindowDays === 180 && item.revalidationDue).length}개</div>
                    </div>
                  </div>
                ) : null}
                {revalidationDueContents.length ? (
                  <div className="mt-4 min-w-0 rounded-xl border border-zinc-200 p-3">
                    <div className="text-[11px] font-semibold text-zinc-700">재검증 우선 기존 글</div>
                    <div className="mt-2 space-y-2">
                      {revalidationDueContents.map((item) => (
                        <div key={item.id} className="flex min-w-0 items-start justify-between gap-3 text-[11px] leading-5">
                          <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 break-words text-zinc-600 hover:text-zinc-900 [overflow-wrap:anywhere]">{item.title}</a>
                          <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">{item.revalidationWindowDays}일</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {siteContentSyncedAt ? <p className="mt-3 break-words text-[11px] leading-5 text-zinc-400">마지막 동기화 {formatDate(siteContentSyncedAt)} · 신규 글을 무조건 막는 기준이 아니라 기존 글 업데이트/통합 여부를 ChatGPT Pro가 판단하는 편집 맥락으로 사용합니다.</p> : null}
              </section>

              <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <SectionTitle eyebrow="Research Inbox" title="수집된 신호" description="관련된 신호들을 선택해 하나의 ‘문제 클러스터’로 묶으세요. 한 키워드당 한 글을 만들지 않습니다." />
                  <div className="mb-5 flex gap-2">
                    {selectedSignalIds.length ? <Badge tone="blue">{selectedSignalIds.length}개 선택</Badge> : null}
                    <button type="button" onClick={createCandidateFromSelection} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-800"><LayersIcon className="h-4 w-4" /> 후보로 묶기</button>
                  </div>
                </div>
                {signals.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {signals.map((signal) => (
                      <SignalCard
                        key={signal.id}
                        signal={signal}
                        selected={selectedSignalIds.includes(signal.id)}
                        onToggle={() => toggleSignal(signal.id)}
                        onDelete={() => { setSignals((current) => current.filter((item) => item.id !== signal.id)); setSelectedSignalIds((current) => current.filter((id) => id !== signal.id)); }}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="아직 수집한 신호가 없습니다" description="네이버 검색, Google Trends 메모, Search Console CSV, 공식 문서 중 하나부터 추가해보세요." action={<button type="button" onClick={loadSample} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600">샘플 흐름 보기</button>} />
                )}
              </section>
            </div>
          ) : null}

          {tab === "candidates" ? (
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Topic Queue</div>
                    <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em]">주제 후보</h2>
                    <p className="mt-1 text-[11px] text-zinc-400">자동 조사 후보는 ChatGPT Pro에서 direct-test 또는 research-verification으로 선정된 것만 표시합니다. 직접 테스트형은 실제 결과가 입력될 때까지 후보를 유지합니다.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {visibleCandidates.length ? visibleCandidates.map((candidate) => (
                    <CandidateCard key={candidate.id} candidate={candidate} active={activeCandidateId === candidate.id} onOpen={() => void copyCandidatePrompt(candidate)} onDelete={() => deleteCandidate(candidate.id)} />
                  )) : <EmptyState title="표시할 제작 후보가 없습니다" description="탐색 탭에서 NAVER 데이터를 수집한 뒤 ChatGPT Pro 심사 JSON을 붙여넣고 선정 후보를 불러오세요. hold/exclude 후보는 표시하지 않습니다." />}
                </div>
              </section>

              <section className="min-w-0">
                {activeCandidate ? (
                  <CandidateEditor
                    candidate={activeCandidate}
                    signals={signals}
                    onChange={(patch) => updateCandidate(activeCandidate.id, patch)}
                    onScore={(key, value) => updateScore(activeCandidate.id, key, value)}
                    onPenalty={(key, value) => updatePenalty(activeCandidate.id, key, value)}
                    onCopyPrompt={() => void copyCandidatePrompt(activeCandidate)}
                  />
                ) : (
                  <div className="sticky top-20"><EmptyState title="검토할 후보를 선택하세요" description="왼쪽 목록에서 후보를 선택하면 ChatGPT Pro 심사 근거, 연결된 실제 질문, 고유 결과물과 테스트·검증 계획을 확인할 수 있습니다." /></div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "prompt" ? (
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <section>
                <SectionTitle eyebrow="Final Gate" title="ChatGPT Pro 심사 후 최종 작성 후보" description="NAVER 6개 API Evidence Bundle을 ChatGPT Pro가 비교해 선정한 후보만 사용합니다. 직접 테스트형은 실제 증거가 입력된 뒤에만 최종 글 프롬프트로 전환합니다." />
                <div className="space-y-2">
                  {visibleCandidates.length ? visibleCandidates.map((candidate) => (
                    <button key={candidate.id} type="button" onClick={() => void copyCandidatePrompt(candidate)} className={classNames("w-full rounded-2xl border p-4 text-left transition", activeCandidateId === candidate.id ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:border-zinc-300")}> 
                      <div className="flex items-center justify-between gap-3">
                        <span className="line-clamp-2 text-sm font-medium text-zinc-800">{candidate.title || "제목 없는 후보"}</span>
                        <span className="text-xs font-semibold text-zinc-500">{candidate.aiReview ? `유입 ${reviewLevelLabel(candidate.aiReview.trafficPotential)}` : `${scoreCandidate(candidate)}점`}</span>
                      </div>
                    </button>
                  )) : <EmptyState title="표시할 제작 후보가 없습니다" description="ChatGPT Pro 심사에서 선정된 후보를 먼저 불러오세요. 이미 최종 프롬프트를 복사한 후보는 목록에서 숨깁니다." />}
                </div>
              </section>

              <section className="min-w-0">
                {activeCandidate ? (
                  <div className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          {activeCandidate.aiReview ? <Badge tone="good">ChatGPT Pro 선정</Badge> : <Badge tone={verdict(scoreCandidate(activeCandidate)).tone}>{verdict(scoreCandidate(activeCandidate)).label}</Badge>}
                          <Badge>{activeCandidate.aiReview ? `유입 ${reviewLevelLabel(activeCandidate.aiReview.trafficPotential)}` : `${scoreCandidate(activeCandidate)}점`}</Badge>
                        </div>
                        <h2 className="text-xl font-semibold tracking-[-0.02em]">{needsDirectTest(activeCandidate) ? `${activeCandidate.experimentPlan?.durationDays || 3}일 테스트 계획 프롬프트` : "ChatGPT 최종 작성 프롬프트"}</h2>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">{needsDirectTest(activeCandidate) ? "실제 결과를 만들기 전에는 원고를 쓰지 않습니다. 안전한 테스트 범위와 기록 항목만 설계하고 후보를 유지합니다." : "직접 테스트 증거 또는 조사·검증 근거가 준비된 후보만 최종 원고로 넘깁니다. 저가치·대량생산형 패턴을 피하도록 최종 게이트를 적용합니다."}</p>
                      </div>
                      <button type="button" onClick={() => void copyPrompt()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-800">{promptCopied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />} {promptCopied ? "복사됨" : needsDirectTest(activeCandidate) ? "테스트 계획 복사" : "최종 글 프롬프트 복사"}</button>
                    </div>
                    {!activeCandidate.aiReview && scoreCandidate(activeCandidate) < 60 ? (
                      <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                        수동 후보의 보조 점수가 낮습니다. 공식 근거와 고유 결과물을 확보하지 못하면 글을 작성하지 않고 보류하세요.
                      </div>
                    ) : null}
                    <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap rounded-2xl bg-zinc-950 p-5 text-xs leading-6 text-zinc-200 scrollbar-thin">{activePrompt}</pre>
                  </div>
                ) : <EmptyState title="프롬프트를 만들 후보를 선택하세요" description="왼쪽에서 주제 후보를 선택하면 지금까지 연결한 조사 신호와 평가 내용을 반영한 프롬프트가 만들어집니다." />}
              </section>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function CandidateEditor({
  candidate,
  signals,
  onChange,
  onScore,
  onPenalty,
  onCopyPrompt,
}: {
  candidate: Candidate;
  signals: Signal[];
  onChange: (patch: Partial<Candidate>) => void;
  onScore: (key: keyof ScoreInputs, value: number) => void;
  onPenalty: (key: keyof Penalties, value: boolean) => void;
  onCopyPrompt: () => void;
}) {
  const score = scoreCandidate(candidate);
  const result = verdict(score);
  const linkedSignals = signals.filter((signal) => candidate.sourceSignalIds.includes(signal.id));
  const questionSignals = linkedSignals.filter((signal) => signal.kind === "naver-kin");
  const activePenalties = PENALTY_FIELDS.filter((field) => candidate.penalties[field.key]);

  return (
    <div className="space-y-5">
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              {candidate.aiReview ? <Badge tone="good">ChatGPT Pro 심사 선정</Badge> : <Badge tone={result.tone}>{result.label}</Badge>}
              <Badge>{candidate.experimentPlan?.recommended ? `직접 테스트 추천 · ${candidate.experimentPlan.durationDays}일` : `${CONTENT_MODE_LABELS[candidate.contentMode]}${candidate.aiReview ? " · ChatGPT Pro 판단" : ""}`}</Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">{candidate.title || "제목 없는 후보"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{candidate.problem || "자동 탐색 신호를 바탕으로 해결하려는 문제를 다시 판단합니다."}</p>
          </div>
          {candidate.aiReview ? (
            <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-right">
              <div className="text-sm font-semibold text-zinc-800">유입 {reviewLevelLabel(candidate.aiReview.trafficPotential)}</div>
              <div className="mt-1 text-[10px] text-zinc-400">ChatGPT Pro 주제 심사</div>
            </div>
          ) : <ScoreRing score={score} />}
        </div>

        {candidate.aiReview ? (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="good">반복 수요 {reviewLevelLabel(candidate.aiReview.repeatedDemand)}</Badge>
              <Badge tone="blue">근거 {reviewLevelLabel(candidate.aiReview.evidenceQuality)}</Badge>
              <Badge tone="warn">포화도 {reviewLevelLabel(candidate.aiReview.contentSaturation)}</Badge>
              <Badge tone="good">고유성 {reviewLevelLabel(candidate.aiReview.originalityPotential)}</Badge>
              <Badge>{candidate.aiReview.category}</Badge>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-600">{candidate.aiReview.rationale}</p>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500"><span className="font-semibold text-zinc-600">검색 의도:</span> {candidate.aiReview.searchIntent}</p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">대상 독자</div>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{candidate.audience || "ChatGPT가 문제와 검색 의도를 보고 자동 결정"}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">사이트 방향</div>
            <p className="mt-2 text-xs leading-5 text-zinc-600">{candidate.siteTheme || "생활 문제 해결 기록소 · 디지털 생활 도구"}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">연결 근거</div>
            <p className="mt-2 text-xs leading-5 text-zinc-600">조사 신호 {linkedSignals.length}개 · 공식 근거 {linkedSignals.filter((signal) => signal.kind === "official").length}개</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCopyPrompt}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 sm:w-auto"
        >
          <CopyIcon className="h-4 w-4" /> {needsDirectTest(candidate) ? `${candidate.experimentPlan?.durationDays || 3}일 테스트 계획 복사` : "최종 글 프롬프트 다시 복사"}
        </button>
      </section>

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <SectionTitle
          eyebrow="Review Rubric"
          title={candidate.aiReview ? "ChatGPT Pro 심사의 보조 평가값" : "수동 후보의 보조 평가값"}
          description={candidate.aiReview ? "아래 0~5 값은 ChatGPT Pro가 JSON으로 함께 반환한 UI 호환용 보조값입니다. 후보 선정은 숫자 공식이 아니라 위의 심사 근거와 decision을 기준으로 이뤄졌습니다." : "수동으로 만든 후보에만 기존 점수표를 참고합니다. 자동 NAVER 조사 결과는 이제 스크립트 점수로 후보를 확정하지 않습니다."}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SCORE_FIELDS.map((field) => (
            <div key={field.key} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-zinc-700">{field.label}</div>
                <div className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">{candidate.scoreInputs[field.key]}/5</div>
              </div>
              <div className="mt-1 text-[11px] leading-4 text-zinc-400">{field.hint}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-5">
          <div className="text-xs font-semibold text-zinc-700">보조 감점 진단</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {activePenalties.length ? activePenalties.map((field) => <Badge key={field.key} tone="bad">{field.label}</Badge>) : <Badge tone="good">감점 요인 없음</Badge>}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-zinc-400">이 값은 정렬·표시를 위한 참고 정보입니다. 실제 발행 여부는 공식 근거 확인, 직접 테스트 결과, 고유 결과물의 존재를 다시 확인한 뒤 결정합니다.</p>
        </div>
      </section>

      {candidate.experimentPlan?.recommended ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
          <SectionTitle
            eyebrow="Direct Test Gate"
            title={`직접 테스트 추천 · ${candidate.experimentPlan.durationDays}일`}
            description="매일 별도 글을 발행하지 않고 내부 기록을 모은 뒤, 실제 증거가 준비됐을 때 하나의 결과 글로 통합합니다."
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">테스트 방향</div>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{candidate.experimentPlan.plan}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">기록할 지표</div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-zinc-700">
                {candidate.experimentPlan.metrics.map((metric) => <li key={metric}>• {metric}</li>)}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-amber-800">{candidate.experimentPlan.completionRule}</p>
          {!hasDirectTestEvidence(candidate) ? <p className="mt-2 text-xs font-medium text-amber-900">아직 실제 결과가 입력되지 않았습니다. 아래 고급 설정의 ‘직접 확보한 증거’에 테스트 결과를 붙여 넣으면 최종 글 프롬프트로 전환됩니다.</p> : <p className="mt-2 text-xs font-medium text-emerald-700">직접 증거가 입력되어 최종 글 작성 단계로 전환할 수 있습니다.</p>}
        </section>
      ) : null}

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <SectionTitle eyebrow="Original Value" title={candidate.aiReview ? "ChatGPT Pro가 선정 단계에서 설계한 고유 결과물" : "고유 결과물과 검증 방식"} description="일반적인 SEO 글이 아니라 비교표·판단 흐름·체크리스트·공식자료 대조처럼 실제 추가 가치를 만드는 방향인지 최종 글 작성 전 다시 확인합니다." />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">고유 결과물</div>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{candidate.uniqueOutput || "ChatGPT가 조사 결과를 보고 가장 강한 고유 결과물을 직접 결정"}</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">검증 계획</div>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{candidate.verificationPlan || "공식 원문을 우선 확인하고 공개 사례는 문제 발견 용도로만 사용"}</p>
          </div>
        </div>
        {candidate.directEvidence ? (
          <div className="mt-3 rounded-2xl border border-zinc-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">직접 확보한 증거</div>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{candidate.directEvidence}</p>
          </div>
        ) : null}
      </section>

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <SectionTitle
          eyebrow="Question Sources"
          title={`실제 문제 발견 출처 ${questionSignals.length}개`}
          description="최종 후보는 지식iN 질문에서 먼저 발견합니다. 카페·블로그는 이후 교차 검증 신호이며, 원문 URL이 있는 항목은 클릭해 직접 확인할 수 있습니다."
        />
        {questionSignals.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {questionSignals.map((signal) => (
              <article key={signal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={signal.kind === "naver-kin" ? "blue" : "neutral"}>{SIGNAL_LABELS[signal.kind]}</Badge>
                  {signal.url ? (
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
                    >
                      {signal.kind === "naver-kin" ? "질문 원문 열기" : signal.kind === "naver-cafe" ? "게시글 원문 열기" : "원문 열기"}
                      <ExternalIcon className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <p className="text-xs font-medium leading-5 text-zinc-700">{signal.title}</p>
                {signal.snippet ? <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-zinc-500">{signal.snippet}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">연결된 실제 질문 출처가 없습니다. 자동 탐색을 다시 실행해 실제 질문 기반 후보를 우선 사용하는 것을 권장합니다.</p>
        )}
      </section>

      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle eyebrow="Evidence Set" title={`연결된 조사 신호 ${linkedSignals.length}개`} description="사용자가 별도로 고를 필요는 없습니다. 자동 탐색이 연결한 신호를 ChatGPT가 참고하고, 부족한 근거는 웹 검색으로 추가 확인하도록 프롬프트에 포함합니다." />
        </div>
        {linkedSignals.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {linkedSignals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge>{SIGNAL_LABELS[signal.kind]}</Badge>
                  {signal.url ? (
                    <a href={signal.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900">
                      원문 <ExternalIcon className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <div className="text-xs font-medium leading-5 text-zinc-700">{signal.title}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-400">연결된 신호가 없습니다. 자동 탐색을 먼저 실행하는 것을 권장합니다.</p>}
      </section>

      <details className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-700">고급 설정 · 심사 결과를 직접 수정할 때만 열기</summary>
        <p className="mt-2 text-xs leading-5 text-zinc-400">일반 사용에서는 건드리지 않아도 됩니다. 자동 평가가 명백히 잘못된 경우에만 보정하세요.</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">주제 제목</span>
            <input value={candidate.title} onChange={(event) => onChange({ title: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">콘텐츠 방식</span>
            <select value={candidate.contentMode} onChange={(event) => onChange({ contentMode: event.target.value as ContentMode })} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400">
              {(Object.keys(CONTENT_MODE_LABELS) as ContentMode[]).map((mode) => <option key={mode} value={mode}>{CONTENT_MODE_LABELS[mode]}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">해결하려는 문제</span>
            <textarea value={candidate.problem} onChange={(event) => onChange({ problem: event.target.value })} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">대상 독자</span>
            <textarea value={candidate.audience} onChange={(event) => onChange({ audience: event.target.value })} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">사이트 주제</span>
            <input value={candidate.siteTheme} onChange={(event) => onChange({ siteTheme: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">고유 결과물</span>
            <textarea value={candidate.uniqueOutput} onChange={(event) => onChange({ uniqueOutput: event.target.value })} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">검증 계획</span>
            <textarea value={candidate.verificationPlan} onChange={(event) => onChange({ verificationPlan: event.target.value })} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">직접 확보한 증거</span>
            <textarea value={candidate.directEvidence} onChange={(event) => onChange({ directEvidence: event.target.value })} rows={2} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" />
          </label>
        </div>

        <div className="mt-6 space-y-5 border-t border-zinc-100 pt-5">
          {SCORE_FIELDS.map((field) => (
            <div key={field.key} className="grid gap-2 sm:grid-cols-[210px_minmax(0,1fr)_34px] sm:items-center">
              <div>
                <div className="text-sm font-medium text-zinc-700">{field.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">{field.hint}</div>
              </div>
              <input type="range" min="0" max="5" step="1" value={candidate.scoreInputs[field.key]} onChange={(event) => onScore(field.key, Number(event.target.value))} className="w-full accent-zinc-900" />
              <div className="rounded-lg bg-zinc-100 py-1.5 text-center text-xs font-semibold text-zinc-700">{candidate.scoreInputs[field.key]}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-5">
          <div className="mb-3 text-xs font-semibold text-zinc-700">감점 요인 직접 수정</div>
          <div className="grid gap-2 md:grid-cols-2">
            {PENALTY_FIELDS.map((field) => (
              <label key={field.key} className={classNames("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", candidate.penalties[field.key] ? "border-rose-200 bg-rose-50" : "border-zinc-200 bg-white")}>
                <input type="checkbox" checked={candidate.penalties[field.key]} onChange={(event) => onPenalty(field.key, event.target.checked)} className="mt-0.5 h-4 w-4 accent-zinc-900" />
                <span>
                  <span className="block text-xs font-medium text-zinc-700">{field.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-zinc-400">{field.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
