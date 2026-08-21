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
  defaultCandidate,
  makeId,
  scoreCandidate,
  signalRole,
  stripHtml,
  verdict,
} from "@/lib/research";
import { createSampleData } from "@/lib/sample-data";
import type {
  Candidate,
  ContentMode,
  Penalties,
  ScoreInputs,
  Signal,
  SignalKind,
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

const STORAGE_SIGNALS = "content-topic-research:signals:v1";
const STORAGE_CANDIDATES = "content-topic-research:candidates:v1";

const SCORE_FIELDS: Array<{
  key: keyof ScoreInputs;
  label: string;
  hint: string;
}> = [
  { key: "siteFit", label: "사이트 주제 적합성", hint: "내 사이트의 기존 독자와 연결되는가" },
  { key: "problemSpecificity", label: "문제의 구체성", hint: "‘했는데/갑자기/계속’처럼 막힌 지점이 분명한가" },
  { key: "demand", label: "검색 수요", hint: "실제 수요 신호가 확인되는가" },
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
  return (
    <article className={classNames("group rounded-2xl border bg-white p-4 transition", active ? "border-zinc-900 shadow-sm" : "border-zinc-200 hover:border-zinc-300")}> 
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone={result.tone}>{result.label}</Badge>
              <Badge>{CONTENT_MODE_LABELS[candidate.contentMode]}</Badge>
            </div>
            <h3 className="font-semibold leading-6 text-zinc-900">{candidate.title || "제목 없는 후보"}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{candidate.problem || "해결하려는 문제를 입력하세요."}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-[-0.04em] text-zinc-900">{score}</div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">score</div>
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
      if (storedSignals) setSignals(JSON.parse(storedSignals));
      if (storedCandidates) setCandidates(JSON.parse(storedCandidates));
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === activeCandidateId) || null,
    [candidates, activeCandidateId],
  );

  const dashboard = useMemo(() => {
    const approved = candidates.filter((candidate) => scoreCandidate(candidate) >= 78).length;
    const hold = candidates.filter((candidate) => scoreCandidate(candidate) < 60).length;
    const official = signals.filter((signal) => signal.kind === "official").length;
    return { approved, hold, official };
  }, [candidates, signals]);

  function loadSample() {
    const sample = createSampleData();
    setSignals(sample.signals);
    setCandidates(sample.candidates);
    setActiveCandidateId(sample.candidates[0].id);
    setSelectedSignalIds([]);
    setToast("샘플 리서치를 불러왔습니다.");
  }

  function resetAll() {
    if (!window.confirm("저장된 신호와 후보를 모두 지울까요?")) return;
    setSignals([]);
    setCandidates([]);
    setSelectedSignalIds([]);
    setActiveCandidateId(null);
    setNaverItems([]);
    window.localStorage.removeItem(STORAGE_SIGNALS);
    window.localStorage.removeItem(STORAGE_CANDIDATES);
    setToast("로컬 데이터를 초기화했습니다.");
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

    setSignals((current) => [...imported, ...current]);
    setToast(`Search Console 검색어 ${imported.length}개를 불러왔습니다.`);
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

  function createBlankCandidate() {
    const candidate = defaultCandidate();
    setCandidates((current) => [candidate, ...current]);
    setActiveCandidateId(candidate.id);
    setTab("candidates");
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

  async function copyPrompt() {
    if (!activeCandidate) return;
    const text = candidatePrompt(activeCandidate, signals);
    await navigator.clipboard.writeText(text);
    setPromptCopied(true);
    setToast("콘텐츠 제작 프롬프트를 복사했습니다.");
    window.setTimeout(() => setPromptCopied(false), 1500);
  }

  const activePrompt = activeCandidate ? candidatePrompt(activeCandidate, signals) : "";

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-zinc-900">
      {toast ? (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-zinc-200 bg-zinc-950 px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-[#f7f7f5]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <SparkIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.02em]">Content Topic Research</div>
              <div className="hidden text-[11px] text-zinc-400 sm:block">생산 자동화보다 선별 자동화</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadSample} className="hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:block">샘플 불러오기</button>
            <button type="button" onClick={resetAll} className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">초기화</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-5 lg:mb-0">
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:block lg:space-y-1">
            {([
              ["discover", "탐색", SearchIcon],
              ["candidates", "주제 후보", LayersIcon],
              ["prompt", "제작 프롬프트", FileTextIcon],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={classNames(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition lg:w-full",
                  tab === value ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-white hover:text-zinc-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {value === "candidates" && candidates.length ? (
                  <span className={classNames("ml-auto rounded-full px-1.5 text-[10px]", tab === value ? "bg-white/15" : "bg-zinc-200 text-zinc-500")}>{candidates.length}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mt-6 hidden rounded-2xl border border-zinc-200 bg-white p-4 lg:block">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">판단 원칙</div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-500">
              <li>트렌드 = 언제 쓸지</li>
              <li>뉴스 = 무엇이 바뀌었는지</li>
              <li>커뮤니티 = 어디서 막히는지</li>
              <li>공식자료 = 무엇이 사실인지</li>
              <li>60점 미만 = 제작 보류</li>
            </ul>
          </div>
        </aside>

        <main className="min-w-0">
          {tab === "discover" ? (
            <div className="space-y-6">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["수집 신호", signals.length, "수요·불편·근거"],
                  ["주제 후보", candidates.length, "평가 대기 포함"],
                  ["우선 제작", dashboard.approved, "78점 이상"],
                  ["공식 근거", dashboard.official, "검증 가능한 원문"],
                ].map(([label, value, note]) => (
                  <div key={String(label)} className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-xs text-zinc-400">{label}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-zinc-900">{value}</div>
                    <div className="mt-1 text-[11px] text-zinc-400">{note}</div>
                  </div>
                ))}
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                <SectionTitle
                  eyebrow="Signal 01"
                  title="네이버에서 ‘키워드’보다 ‘막힌 지점’을 찾기"
                  description="블로그·카페·지식iN은 사실을 베끼는 소스가 아니라 사람들이 어떤 조건에서 막히는지 찾는 문제 탐지기로 사용합니다. 뉴스는 날짜순으로 보며 변경 감지에만 사용하세요."
                />
                <div className="grid gap-3 lg:grid-cols-[170px_minmax(0,1fr)_120px_110px]">
                  <select value={naverType} onChange={(event) => setNaverType(event.target.value as NaverType)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none focus:border-zinc-400">
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

              <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
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
                <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
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

                <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
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
                  </div>
                  <button type="button" onClick={createBlankCandidate} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-800" aria-label="새 후보"><PlusIcon className="h-4 w-4" /></button>
                </div>
                <div className="space-y-3">
                  {candidates.length ? candidates.map((candidate) => (
                    <CandidateCard key={candidate.id} candidate={candidate} active={activeCandidateId === candidate.id} onOpen={() => setActiveCandidateId(candidate.id)} onDelete={() => deleteCandidate(candidate.id)} />
                  )) : <EmptyState title="후보가 없습니다" description="탐색 탭에서 여러 신호를 선택해 하나의 문제 클러스터로 묶거나 새 후보를 직접 만드세요." />}
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
                    onOpenPrompt={() => setTab("prompt")}
                  />
                ) : (
                  <div className="sticky top-20"><EmptyState title="검토할 후보를 선택하세요" description="왼쪽 목록에서 후보를 선택하면 게시 가치 점수, 감점 요인, 고유 결과물과 검증 계획을 편집할 수 있습니다." /></div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "prompt" ? (
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <section>
                <SectionTitle eyebrow="Final Gate" title="프롬프트 대상 선택" description="60점 미만 후보는 원칙적으로 글을 생성하지 않고 무엇이 부족한지만 확인합니다." />
                <div className="space-y-2">
                  {candidates.length ? candidates.map((candidate) => (
                    <button key={candidate.id} type="button" onClick={() => setActiveCandidateId(candidate.id)} className={classNames("w-full rounded-2xl border p-4 text-left transition", activeCandidateId === candidate.id ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:border-zinc-300")}> 
                      <div className="flex items-center justify-between gap-3">
                        <span className="line-clamp-2 text-sm font-medium text-zinc-800">{candidate.title || "제목 없는 후보"}</span>
                        <span className="text-lg font-semibold">{scoreCandidate(candidate)}</span>
                      </div>
                    </button>
                  )) : <EmptyState title="후보가 없습니다" description="먼저 탐색 탭에서 주제 후보를 만들어주세요." />}
                </div>
              </section>

              <section className="min-w-0">
                {activeCandidate ? (
                  <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <Badge tone={verdict(scoreCandidate(activeCandidate)).tone}>{verdict(scoreCandidate(activeCandidate)).label}</Badge>
                          <Badge>{scoreCandidate(activeCandidate)}점</Badge>
                        </div>
                        <h2 className="text-xl font-semibold tracking-[-0.02em]">증거 기반 콘텐츠 제작 프롬프트</h2>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">직접 경험을 꾸며내지 않고 웹 조사를 비교·검증 결과물로 바꾸도록 설계되어 있습니다.</p>
                      </div>
                      <button type="button" onClick={() => void copyPrompt()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-800">{promptCopied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />} {promptCopied ? "복사됨" : "프롬프트 복사"}</button>
                    </div>
                    {scoreCandidate(activeCandidate) < 60 ? (
                      <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                        현재 후보는 60점 미만입니다. 프롬프트도 먼저 “게시 보류”를 판단하도록 되어 있으므로, 고유 결과물·공식 근거·문제 구체성을 보강한 뒤 제작하는 편이 좋습니다.
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
  onOpenPrompt,
}: {
  candidate: Candidate;
  signals: Signal[];
  onChange: (patch: Partial<Candidate>) => void;
  onScore: (key: keyof ScoreInputs, value: number) => void;
  onPenalty: (key: keyof Penalties, value: boolean) => void;
  onOpenPrompt: () => void;
}) {
  const score = scoreCandidate(candidate);
  const result = verdict(score);
  const linkedSignals = signals.filter((signal) => candidate.sourceSignalIds.includes(signal.id));

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone={result.tone}>{result.label}</Badge>
              <Badge>{CONTENT_MODE_LABELS[candidate.contentMode]}</Badge>
            </div>
            <input value={candidate.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="주제 제목" className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-[-0.04em] outline-none placeholder:text-zinc-300" />
          </div>
          <ScoreRing score={score} />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">해결하려는 문제</span>
            <textarea value={candidate.problem} onChange={(event) => onChange({ problem: event.target.value })} rows={3} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" placeholder="사용자가 정확히 어디서 막히는가" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">대상 독자</span>
            <textarea value={candidate.audience} onChange={(event) => onChange({ audience: event.target.value })} rows={3} className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-zinc-400" placeholder="누가 이 글을 필요로 하는가" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">사이트 주제</span>
            <input value={candidate.siteTheme} onChange={(event) => onChange({ siteTheme: event.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">콘텐츠 방식</span>
            <select value={candidate.contentMode} onChange={(event) => onChange({ contentMode: event.target.value as ContentMode })} className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400">
              {(Object.keys(CONTENT_MODE_LABELS) as ContentMode[]).map((mode) => <option key={mode} value={mode}>{CONTENT_MODE_LABELS[mode]}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <SectionTitle eyebrow="Quality Score" title="게시 가치 평가" description="검색량 하나가 아니라 사이트 적합성·문제 구체성·공식 근거·고유 결과물을 함께 봅니다. 60점 미만이면 제작을 보류합니다." />
        <div className="space-y-5">
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
          <div className="mb-3 text-xs font-semibold text-zinc-700">감점 요인</div>
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
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <SectionTitle eyebrow="Original Value" title="‘이 사이트에서만 얻는 결과물’을 먼저 설계" description="검색 결과를 보기 좋게 다시 쓰는 것으로는 부족합니다. 글을 쓰기 전에 비교표·판단 흐름·체크리스트·직접 데이터·도구 중 무엇을 새로 만들지 정하세요." />
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">고유 결과물</span>
            <textarea value={candidate.uniqueOutput} onChange={(event) => onChange({ uniqueOutput: event.target.value })} rows={3} placeholder="예: 6개 제조사의 필터 물세척 기준을 공식 매뉴얼로 비교한 표" className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-3 text-sm leading-6 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">검증 계획</span>
            <textarea value={candidate.verificationPlan} onChange={(event) => onChange({ verificationPlan: event.target.value })} rows={3} placeholder="어떤 공식 원문으로 사실을 확인하고, 커뮤니티 사례는 무엇을 찾는 데만 쓸지" className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-3 text-sm leading-6 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">직접 확보한 증거 (없으면 비워도 됨)</span>
            <textarea value={candidate.directEvidence} onChange={(event) => onChange({ directEvidence: event.target.value })} rows={2} placeholder="직접 찍은 사진, 사용 모델, 실제 비용, 직접 처리한 날짜 등. 없으면 경험을 꾸며내지 않습니다." className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-3 text-sm leading-6 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle eyebrow="Evidence Set" title={`연결된 조사 신호 ${linkedSignals.length}개`} description="트렌드·불편·공식 근거가 한쪽으로 치우치지 않았는지 확인하세요." />
          <button type="button" onClick={onOpenPrompt} className="mb-5 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-800"><FileTextIcon className="h-4 w-4" /> 제작 프롬프트 보기</button>
        </div>
        {linkedSignals.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {linkedSignals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="mb-1 flex gap-2"><Badge>{SIGNAL_LABELS[signal.kind]}</Badge></div>
                <div className="text-xs font-medium leading-5 text-zinc-700">{signal.title}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-400">연결된 신호가 없습니다. 탐색 탭에서 신호를 묶어 새 후보를 만드는 것을 권장합니다.</p>}
      </section>
    </div>
  );
}
