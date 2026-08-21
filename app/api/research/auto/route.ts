import { NextRequest, NextResponse } from "next/server";
import { autoResearchCategoryLabel, getAutoResearchSeeds } from "@/lib/auto-research";
import {
  getNaverApiHubCredentials,
  naverApiHubErrorMessage,
  naverApiHubHeaders,
  naverApiHubUrl,
  readNaverApiHubResponse,
} from "@/lib/naver-api-hub";
import { makeId, stripHtml } from "@/lib/research";
import type { Candidate, Signal, SignalKind } from "@/lib/types";

const SEARCH_TYPES = [
  { type: "kin", path: "kin", kind: "naver-kin" as SignalKind, display: 5, sort: "sim" },
  { type: "cafe", path: "cafearticle", kind: "naver-cafe" as SignalKind, display: 5, sort: "sim" },
  { type: "blog", path: "blog", kind: "naver-blog" as SignalKind, display: 4, sort: "sim" },
  { type: "news", path: "news", kind: "naver-news" as SignalKind, display: 4, sort: "date" },
  { type: "web", path: "webkr", kind: "naver-web" as SignalKind, display: 5 },
] as const;

type SearchItem = {
  title?: string;
  link?: string;
  originallink?: string;
  description?: string;
};

type TrendResult = {
  title?: string;
  data?: Array<{ period?: string; ratio?: number }>;
};

type AutoRequest = {
  offset?: number;
};

const PROBLEM_MARKERS = [
  "안됨",
  "안 돼",
  "안되",
  "안 빠",
  "안 나",
  "안 열",
  "안 켜",
  "왜",
  "갑자기",
  "계속",
  "했는데",
  "해도",
  "문제",
  "오류",
  "고장",
  "냄새",
  "소음",
  "막힘",
  "버리",
  "신청",
  "정리",
  "교체",
  "청소",
];

const OFFICIAL_HOSTS = [
  "gov.kr",
  "easylaw.go.kr",
  "safetykorea.kr",
  "kca.go.kr",
  "consumer.go.kr",
  "seoul.go.kr",
  "samsung.com",
  "lge.co.kr",
  "lg.com",
  "apple.com",
  "support.google.com",
  "microsoft.com",
  "meta.com",
  "facebook.com",
  "naver.com",
];

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function cleanUrl(item: SearchItem) {
  return item.originallink || item.link;
}

function hostnameOf(value?: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOfficialUrl(value?: string) {
  const hostname = hostnameOf(value);
  if (!hostname) return false;
  if (hostname.endsWith(".go.kr")) return true;
  return OFFICIAL_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function problemScore(title: string) {
  return PROBLEM_MARKERS.reduce((score, marker) => score + (title.includes(marker) ? 2 : 0), 0) + Math.min(4, Math.floor(title.length / 18));
}

function trendScore(result?: TrendResult) {
  const ratios = (result?.data || [])
    .map((point) => Number(point.ratio))
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) return 0;
  const recent = ratios.slice(-Math.min(4, ratios.length));
  return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
}

async function searchNaver(
  credentials: { clientId: string; clientSecret: string },
  query: string,
  config: (typeof SEARCH_TYPES)[number],
) {
  const endpoint = naverApiHubUrl(`/search/v1/${config.path}`);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("display", String(config.display));
  endpoint.searchParams.set("start", "1");
  endpoint.searchParams.set("format", "json");
  if ("sort" in config && config.sort) endpoint.searchParams.set("sort", config.sort);

  const response = await fetch(endpoint, {
    headers: naverApiHubHeaders(credentials),
    cache: "no-store",
  });
  const data = await readNaverApiHubResponse(response);

  if (!response.ok) {
    throw new Error(naverApiHubErrorMessage(data, `${config.type} 검색 실패`));
  }

  return Array.isArray(data.items) ? (data.items as SearchItem[]) : [];
}

async function fetchTrend(
  credentials: { clientId: string; clientSecret: string },
  keywords: string[],
) {
  const end = kstNow();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const endpoint = naverApiHubUrl("/search-trend/v1/search");
  const body = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    timeUnit: "week",
    keywordGroups: keywords.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...naverApiHubHeaders(credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await readNaverApiHubResponse(response);

  if (!response.ok) {
    throw new Error(naverApiHubErrorMessage(data, "검색어트렌드 조회 실패"));
  }

  return Array.isArray(data.results) ? (data.results as TrendResult[]) : [];
}

function makeSignal(
  kind: SignalKind,
  query: string,
  item: SearchItem,
  createdAt: string,
): Signal {
  const url = cleanUrl(item);
  return {
    id: makeId("signal"),
    kind,
    title: stripHtml(item.title || query),
    url,
    snippet: item.description ? stripHtml(item.description) : undefined,
    query,
    sourceLabel: kind === "official" ? "공식 자료 후보" : undefined,
    createdAt,
  };
}

export async function POST(request: NextRequest) {
  let body: AutoRequest = {};
  try {
    body = (await request.json()) as AutoRequest;
  } catch {
    body = {};
  }

  const credentials = getNaverApiHubCredentials();
  if (!credentials) {
    return NextResponse.json(
      {
        error: "NAVER_API_HUB_CLIENT_ID / NAVER_API_HUB_CLIENT_SECRET 환경변수가 없습니다.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const offset = Math.max(0, Math.min(20, Number(body.offset) || 0));
  const now = kstNow();
  const createdAt = new Date().toISOString();
  const seeds = getAutoResearchSeeds(now, offset, 5);
  const errors: string[] = [];

  const trendByQuery = new Map<string, number>();
  try {
    const trendResults = await fetchTrend(credentials, seeds.map((seed) => seed.query));
    for (const result of trendResults) {
      const title = typeof result.title === "string" ? result.title : "";
      if (title) trendByQuery.set(title, trendScore(result));
    }
  } catch (error) {
    errors.push(error instanceof Error ? `검색어트렌드: ${error.message}` : "검색어트렌드 조회 실패");
  }

  const allSignals: Signal[] = [];
  const allCandidates: Candidate[] = [];

  for (const seed of seeds) {
    const perType = new Map<string, SearchItem[]>();

    const settled = await Promise.allSettled(
      SEARCH_TYPES.map(async (config) => ({
        config,
        items: await searchNaver(credentials, seed.query, config),
      })),
    );

    settled.forEach((result, index) => {
      const config = SEARCH_TYPES[index];
      if (result.status === "fulfilled") {
        perType.set(config.type, result.value.items);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(`${seed.query} · ${config.type}: ${message}`);
      }
    });

    const seedSignals: Signal[] = [];

    const selectAndPush = (type: string, kind: SignalKind, count: number) => {
      const items = perType.get(type) || [];
      items.slice(0, count).forEach((item) => seedSignals.push(makeSignal(kind, seed.query, item, createdAt)));
    };

    selectAndPush("kin", "naver-kin", 2);
    selectAndPush("cafe", "naver-cafe", 2);
    selectAndPush("blog", "naver-blog", 2);
    selectAndPush("news", "naver-news", 1);

    const webItems = perType.get("web") || [];
    const officialWeb = webItems.filter((item) => isOfficialUrl(cleanUrl(item))).slice(0, 2);
    const generalWeb = webItems.filter((item) => !isOfficialUrl(cleanUrl(item))).slice(0, officialWeb.length ? 1 : 2);

    officialWeb.forEach((item) => seedSignals.push(makeSignal("official", seed.query, item, createdAt)));
    generalWeb.forEach((item) => seedSignals.push(makeSignal("naver-web", seed.query, item, createdAt)));

    const demand = trendByQuery.get(seed.query) ?? 0;
    seedSignals.push({
      id: makeId("signal"),
      kind: "naver-trends",
      title: `${seed.query} 검색 수요 신호`,
      query: seed.query,
      snippet: `최근 90일 주간 상대 검색지수의 최근 평균 ${demand}/100. 절대 검색량이 아니라 수요·시기 판단용 신호입니다.`,
      sourceLabel: "NAVER 검색어트렌드",
      createdAt,
      metrics: { trendScore: demand },
    });

    const communitySignals = seedSignals.filter((signal) => signal.kind === "naver-kin" || signal.kind === "naver-cafe");
    const problemSignal = [...communitySignals].sort((a, b) => problemScore(b.title) - problemScore(a.title))[0];
    const officialCount = seedSignals.filter((signal) => signal.kind === "official").length;
    const sourceKinds = new Set(seedSignals.map((signal) => signal.kind));
    const hasCommunity = communitySignals.length > 0;
    const hasNews = seedSignals.some((signal) => signal.kind === "naver-news");

    const candidate: Candidate = {
      id: makeId("candidate"),
      title: seed.query,
      problem: problemSignal?.title || `${seed.query}와 관련해 사용자가 실제로 막히는 조건과 확인 순서를 찾는다.`,
      audience: seed.audience,
      siteTheme: "생활 문제 해결 · 디지털 생활",
      contentMode: seed.contentMode,
      sourceSignalIds: seedSignals.map((signal) => signal.id),
      scoreInputs: {
        siteFit: 5,
        problemSpecificity: problemSignal ? 4 : 3,
        demand: demand >= 70 ? 5 : demand >= 40 ? 4 : demand >= 15 ? 3 : 2,
        officialEvidence: officialCount >= 2 ? 5 : officialCount === 1 ? 4 : 2,
        originalValue: sourceKinds.size >= 5 && hasCommunity ? 4 : 3,
        evergreen: seed.evergreen,
      },
      penalties: {
        ymyl: false,
        newsRewrite: false,
        duplicate: false,
        aiCommodity: officialCount === 0 || !hasCommunity,
        weakEvidence: officialCount === 0,
      },
      uniqueOutput: seed.uniqueOutput,
      verificationPlan: `${seed.verificationPlan}${hasNews ? " 뉴스 신호가 있으면 기사 자체를 다시 쓰지 않고 무엇이 바뀌었는지 원문에서 재확인한다." : ""}`,
      directEvidence: "직접 경험 자료 없음. 조사·검증 결과와 공개 사례를 직접 체험한 것처럼 서술하지 않는다.",
      createdAt,
      updatedAt: createdAt,
    };

    allSignals.push(...seedSignals);
    allCandidates.push(candidate);
  }

  return NextResponse.json({
    generatedAt: createdAt,
    offset,
    seeds: seeds.map((seed) => ({
      query: seed.query,
      category: autoResearchCategoryLabel(seed.category),
    })),
    signals: allSignals,
    candidates: allCandidates,
    errors: Array.from(new Set(errors)).slice(0, 12),
  });
}
