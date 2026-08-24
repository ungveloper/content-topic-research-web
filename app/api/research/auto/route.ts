import { NextRequest, NextResponse } from "next/server";
import {
  autoResearchCategoryLabel,
  getAutoResearchSeeds,
  isSameTopicCluster,
  topicEntity,
  topicSimilarity,
  topicTheme,
  type AutoResearchCategory,
  type AutoResearchSeed,
} from "@/lib/auto-research";
import {
  getNaverApiHubCredentials,
  naverApiHubErrorMessage,
  naverApiHubHeaders,
  naverApiHubUrl,
  readNaverApiHubResponse,
} from "@/lib/naver-api-hub";
import { isExcludedContentTopic, makeId, stripHtml } from "@/lib/research";
import { buildTopicReviewPrompt } from "@/lib/topic-review";
import type {
  ResearchEvidenceBundle,
  ResearchEvidenceItem,
  Signal,
  SignalKind,
} from "@/lib/types";

const DISCOVERY_TYPES = [
  { type: "kin", path: "kin", kind: "naver-kin" as SignalKind, display: 30, sort: "sim" },
] as const;

const DETAIL_TYPES = [
  { type: "cafe", path: "cafearticle", kind: "naver-cafe" as SignalKind, display: 10, sort: "sim" },
  { type: "blog", path: "blog", kind: "naver-blog" as SignalKind, display: 10, sort: "sim" },
  { type: "news", path: "news", kind: "naver-news" as SignalKind, display: 6, sort: "date" },
  { type: "web", path: "webkr", kind: "naver-web" as SignalKind, display: 12 },
] as const;

const MAX_REVIEW_BUNDLES = 5;

type SearchConfig = (typeof DISCOVERY_TYPES)[number] | (typeof DETAIL_TYPES)[number];

type SearchItem = {
  title?: string;
  link?: string;
  originallink?: string;
  description?: string;
  postdate?: string;
  pubDate?: string;
};

type TrendResult = {
  title?: string;
  data?: Array<{ period?: string; ratio?: number }>;
};

type TopicHistory = {
  title?: string;
  problem?: string;
  usedAt?: string;
  updatedAt?: string;
};

type AutoRequest = {
  offset?: number;
  usedTopics?: TopicHistory[];
  seenTopics?: TopicHistory[];
};

type DiscoveredProblem = {
  category: AutoResearchCategory;
  seed: AutoResearchSeed;
  title: string;
  rawTitle: string;
  kind: SignalKind;
  item: SearchItem;
  discoveryPriority: number;
};

type ProblemCluster = {
  category: AutoResearchCategory;
  seed: AutoResearchSeed;
  title: string;
  rawTitles: string[];
  items: Array<{ kind: SignalKind; item: SearchItem }>;
  discoveryPriority: number;
};

const PROBLEM_MARKERS = [
  "안됨", "안 돼", "안되", "안 빠", "안 나", "안 열", "안 켜", "왜", "갑자기", "계속", "했는데", "해도",
  "문제", "오류", "고장", "냄새", "소음", "막힘", "버리", "신청", "신고", "정리", "교체", "청소", "세척",
  "수명", "부족", "느림", "꺼짐", "뜨거", "새는", "비용", "가격", "기간", "설정", "삭제", "복구", "보관",
];

const COMMERCIAL_NOISE = [
  "업체 추천", "렌탈 추천", "견적 업체", "광고", "협찬", "체험단", "구매대행", "최저가", "이벤트", "쿠폰",
];

const PERSONAL_ADVICE_NOISE = [
  "남편", "아내", "부부", "시댁", "처가", "남친", "여친", "연애", "이별", "친구 관계", "직장 상사",
];

const OFFICIAL_HOSTS = [
  "gov.kr",
  "safetykorea.kr",
  "kca.go.kr",
  "consumer.go.kr",
  "seoul.go.kr",
  "samsung.com",
  "samsungsvc.co.kr",
  "lge.co.kr",
  "lg.com",
  "apple.com",
  "support.google.com",
  "microsoft.com",
  "meta.com",
  "facebook.com",
  "naver.com",
];

const DIVERSITY_THEMES = new Set([
  "필터", "배터리", "저장공간", "사진", "청소", "세척", "정리", "폐기물", "신청", "냄새", "소음", "배수", "충전", "데이터",
]);

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

function problemSignalPriority(title: string) {
  const markerScore = PROBLEM_MARKERS.reduce((score, marker) => score + (title.includes(marker) ? 3 : 0), 0);
  const questionScore = /[?？]|나요|까요|인가요|해요|합니다|되나요|왜|어떻게/.test(title) ? 4 : 0;
  const lengthScore = title.length >= 10 && title.length <= 44 ? 4 : title.length <= 60 ? 2 : 0;
  const excludedPenalty = isExcludedContentTopic(title) ? 100 : 0;
  const noisePenalty = COMMERCIAL_NOISE.some((word) => title.includes(word)) ? 24 : 0;
  const personalAdvicePenalty = PERSONAL_ADVICE_NOISE.some((word) => title.includes(word)) ? 30 : 0;
  return markerScore + questionScore + lengthScore - excludedPenalty - noisePenalty - personalAdvicePenalty;
}

function trendScore(result?: TrendResult) {
  const ratios = (result?.data || [])
    .map((point) => Number(point.ratio))
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) return 0;
  const recent = ratios.slice(-Math.min(4, ratios.length));
  return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
}

function cleanProblemTitle(value: string) {
  let text = stripHtml(value)
    .replace(/^\s*\[[^\]]+\]\s*/g, "")
    .replace(/^\s*(질문|문의)\s*[:：-]?\s*/g, "")
    .replace(/\([^)]{0,40}\)/g, " ")
    .replace(/\[[^\]]{0,40}\]/g, " ")
    .replace(/[!?？！]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const endings = [
    /\s*(궁금합니다|궁금해요|궁금합니다만|알려주세요|알고 싶어요|알고싶어요|문의드립니다)\.?$/,
    /\s*(어떻게 해야 하나요|어떻게 하나요|어떻게 해야 할까요|어떻게 할까요)\.?$/,
    /\s*(가능한가요|가능할까요|되나요|될까요|인가요|일까요|맞나요|하나요|할까요)\.?$/,
    /\s*(추천 부탁드립니다|추천해주세요)\.?$/,
  ];
  endings.forEach((pattern) => {
    text = text.replace(pattern, "").trim();
  });

  text = text
    .replace(/^(Re\s*:|답변\s*:)/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (text.length > 48) {
    const shortened = text.slice(0, 48);
    const lastSpace = shortened.lastIndexOf(" ");
    text = (lastSpace >= 24 ? shortened.slice(0, lastSpace) : shortened).trim();
  }

  return text;
}

function isUsefulProblemTitle(title: string, scopeQuery: string) {
  if (title.length < 7 || title.length > 60) return false;
  if (isExcludedContentTopic(title)) return false;
  if (COMMERCIAL_NOISE.some((word) => title.includes(word))) return false;
  if (PERSONAL_ADVICE_NOISE.some((word) => title.includes(word))) return false;
  if (topicSimilarity(title, scopeQuery) > 0.9 && title.length <= scopeQuery.length + 4) return false;
  return problemSignalPriority(title) >= 4;
}

function withinDays(value: string | undefined, days: number) {
  if (!value) return true;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time <= days * 86_400_000;
}

function blockedByHistory(title: string, history: TopicHistory[], strict: boolean) {
  return history.some((entry) => {
    const combined = [entry.title, entry.problem].filter(Boolean).join(" ");
    if (!combined) return false;
    if (isSameTopicCluster(title, combined)) return true;
    return topicSimilarity(title, combined) >= (strict ? 0.43 : 0.56);
  });
}

function sourceLabelForKind(kind: SignalKind) {
  const labels: Partial<Record<SignalKind, string>> = {
    "naver-kin": "네이버 지식iN",
    "naver-cafe": "네이버 카페",
    "naver-blog": "네이버 블로그",
    "naver-news": "네이버 뉴스",
    "naver-web": "네이버 웹문서",
    official: "공식 자료 후보",
  };
  return labels[kind];
}

function makeSignal(kind: SignalKind, query: string, item: SearchItem, createdAt: string): Signal {
  const url = cleanUrl(item);
  return {
    id: makeId("signal"),
    kind,
    title: stripHtml(item.title || query),
    url,
    snippet: item.description ? stripHtml(item.description) : undefined,
    query,
    sourceLabel: sourceLabelForKind(kind),
    createdAt,
  };
}

function clipText(value?: string, max = 360) {
  const text = value ? stripHtml(value).replace(/\s+/g, " ").trim() : "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function makeEvidenceItem(
  source: ResearchEvidenceItem["source"],
  item: SearchItem,
  officialCandidate = false,
): ResearchEvidenceItem {
  return {
    source,
    title: clipText(item.title, 160) || "제목 없음",
    snippet: clipText(item.description) || undefined,
    url: cleanUrl(item),
    publishedAt: item.postdate || item.pubDate || undefined,
    officialCandidate: source === "naver-web" ? officialCandidate : undefined,
  };
}

async function searchNaver(
  credentials: { clientId: string; clientSecret: string },
  query: string,
  config: SearchConfig,
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
  if (!keywords.length) return [] as TrendResult[];
  const end = kstNow();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const endpoint = naverApiHubUrl("/search-trend/v1/search");
  const body = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    timeUnit: "week",
    keywordGroups: keywords.slice(0, MAX_REVIEW_BUNDLES).map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
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

function clusterProblems(problems: DiscoveredProblem[]) {
  const clusters: ProblemCluster[] = [];
  const sorted = [...problems].sort((a, b) => b.discoveryPriority - a.discoveryPriority);

  for (const problem of sorted) {
    const existing = clusters.find(
      (cluster) =>
        cluster.category === problem.category &&
        (isSameTopicCluster(cluster.title, problem.title) || topicSimilarity(cluster.title, problem.title) >= 0.58),
    );

    if (existing) {
      existing.rawTitles.push(problem.rawTitle);
      existing.items.push({ kind: problem.kind, item: problem.item });
      existing.discoveryPriority += Math.max(1, Math.round(problem.discoveryPriority / 4));
      if (problemSignalPriority(problem.title) > problemSignalPriority(existing.title)) existing.title = problem.title;
      continue;
    }

    clusters.push({
      category: problem.category,
      seed: problem.seed,
      title: problem.title,
      rawTitles: [problem.rawTitle],
      items: [{ kind: problem.kind, item: problem.item }],
      discoveryPriority: problem.discoveryPriority,
    });
  }

  return clusters.map((cluster) => ({
    ...cluster,
    discoveryPriority: cluster.discoveryPriority + Math.min(12, (cluster.items.length - 1) * 3),
  }));
}

function isDiverseFromBatch(candidate: ProblemCluster, selected: ProblemCluster[]) {
  const entity = topicEntity(candidate.title);
  const theme = topicTheme(candidate.title);

  return !selected.some((item) => {
    if (topicSimilarity(candidate.title, item.title) >= 0.42) return true;
    const otherEntity = topicEntity(item.title);
    if (entity && otherEntity && entity === otherEntity) return true;
    const otherTheme = topicTheme(item.title);
    if (theme && otherTheme && theme === otherTheme && DIVERSITY_THEMES.has(theme)) return true;
    return false;
  });
}

function selectReviewClusters(clusters: ProblemCluster[], count: number) {
  const selected: ProblemCluster[] = [];
  const byPriority = [...clusters].sort((a, b) => b.discoveryPriority - a.discoveryPriority);
  const categoryCounts = new Map<AutoResearchCategory, number>();

  // 이 단계는 최종 주제 선정이 아니라 프롬프트 크기를 제한하기 위한 샘플링입니다.
  // 한 영역에서 최대 2개만 담아 ChatGPT Pro가 서로 다른 문제를 직접 비교할 수 있게 합니다.
  for (const cluster of byPriority) {
    if ((categoryCounts.get(cluster.category) || 0) >= 2) continue;
    if (!isDiverseFromBatch(cluster, selected)) continue;
    selected.push(cluster);
    categoryCounts.set(cluster.category, (categoryCounts.get(cluster.category) || 0) + 1);
    if (selected.length >= count) break;
  }

  for (const cluster of byPriority) {
    if (selected.includes(cluster)) continue;
    if (selected.some((item) => isSameTopicCluster(item.title, cluster.title) || topicSimilarity(item.title, cluster.title) >= 0.5)) continue;
    selected.push(cluster);
    if (selected.length >= count) break;
  }

  return selected.slice(0, count);
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
  const seedSummary = seeds.map((seed) => ({ query: seed.query, category: autoResearchCategoryLabel(seed.category) }));
  const errors: string[] = [];

  const usedTopics = (Array.isArray(body.usedTopics) ? body.usedTopics : [])
    .filter((entry) => withinDays(entry.usedAt || entry.updatedAt, 60))
    .slice(-100);
  const seenTopics = (Array.isArray(body.seenTopics) ? body.seenTopics : [])
    .filter((entry) => withinDays(entry.updatedAt || entry.usedAt, 14))
    .slice(-120);

  // 1) 지식iN은 문제 발견만 담당합니다. 여기서는 명백한 잡음/금지 분야/최근 중복만 기계적으로 제거합니다.
  const discovered: DiscoveredProblem[] = [];
  for (const seed of seeds) {
    const settled = await Promise.allSettled(
      DISCOVERY_TYPES.map(async (config) => ({ config, items: await searchNaver(credentials, seed.query, config) })),
    );

    settled.forEach((result, index) => {
      const config = DISCOVERY_TYPES[index];
      if (result.status === "rejected") {
        const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(`${autoResearchCategoryLabel(seed.category)} · ${config.type}: ${message}`);
        return;
      }

      result.value.items.forEach((item) => {
        const rawTitle = stripHtml(item.title || "").trim();
        const title = cleanProblemTitle(rawTitle);
        if (isExcludedContentTopic(`${rawTitle} ${item.description || ""}`)) return;
        if (!isUsefulProblemTitle(title, seed.query)) return;
        if (blockedByHistory(title, usedTopics, true)) return;
        if (blockedByHistory(title, seenTopics, false)) return;

        discovered.push({
          category: seed.category,
          seed,
          title,
          rawTitle,
          kind: config.kind,
          item,
          discoveryPriority: problemSignalPriority(rawTitle) + 5,
        });
      });
    });
  }

  const clusters = clusterProblems(discovered)
    .filter((cluster) => !blockedByHistory(cluster.title, usedTopics, true))
    .filter((cluster) => !blockedByHistory(cluster.title, seenTopics, false));
  const reviewClusters = selectReviewClusters(clusters, MAX_REVIEW_BUNDLES);

  const cooldown = {
    usedDays: 60,
    seenDays: 14,
    usedCount: usedTopics.length,
    seenCount: seenTopics.length,
  };

  if (!reviewClusters.length) {
    return NextResponse.json({
      generatedAt: createdAt,
      offset,
      seeds: seedSummary,
      signals: [],
      evidenceBundles: [],
      reviewPrompt: "",
      errors: [
        ...Array.from(new Set(errors)),
        "최근 사용·노출 주제와 겹치지 않는 새 지식iN 문제를 충분히 찾지 못했습니다. ‘다른 조사 범위로 다시 찾기’를 눌러보세요.",
      ].slice(0, 12),
      cooldown,
    });
  }

  // 2) 지식iN에서 발견한 각 문제에 대해 나머지 5개 API 데이터를 붙입니다.
  // 여기서 앱은 coverage를 기록만 하고 "좋은 주제"인지 최종 판정하지 않습니다.
  const trendResultByQuery = new Map<string, TrendResult>();
  try {
    const trendResults = await fetchTrend(credentials, reviewClusters.map((cluster) => cluster.title));
    for (const result of trendResults) {
      if (typeof result.title === "string" && result.title) trendResultByQuery.set(result.title, result);
    }
  } catch (error) {
    errors.push(error instanceof Error ? `검색어트렌드: ${error.message}` : "검색어트렌드 조회 실패");
  }

  const allSignals: Signal[] = [];
  const evidenceBundles: ResearchEvidenceBundle[] = [];

  for (const cluster of reviewClusters) {
    const bundleSignals: Signal[] = [];
    const questions = cluster.items.slice(0, 5).map(({ item }) => makeEvidenceItem("naver-kin", item));

    cluster.items.slice(0, 5).forEach(({ item }) => {
      bundleSignals.push(makeSignal("naver-kin", cluster.title, item, createdAt));
    });

    const detailSettled = await Promise.allSettled(
      DETAIL_TYPES.map(async (config) => {
        const query = config.type === "web" ? `${cluster.title} 공식` : cluster.title;
        return { config, items: await searchNaver(credentials, query, config) };
      }),
    );

    const detailByType = new Map<string, SearchItem[]>();
    detailSettled.forEach((result, index) => {
      const config = DETAIL_TYPES[index];
      if (result.status === "fulfilled") {
        detailByType.set(config.type, result.value.items);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(`${cluster.title} · ${config.type}: ${message}`);
      }
    });

    const cafeItems = (detailByType.get("cafe") || []).slice(0, 4);
    const blogItems = (detailByType.get("blog") || []).slice(0, 4);
    const newsItems = (detailByType.get("news") || []).slice(0, 3);
    const webItems = (detailByType.get("web") || []).slice(0, 5);

    cafeItems.forEach((item) => bundleSignals.push(makeSignal("naver-cafe", cluster.title, item, createdAt)));
    blogItems.forEach((item) => bundleSignals.push(makeSignal("naver-blog", cluster.title, item, createdAt)));
    newsItems.forEach((item) => bundleSignals.push(makeSignal("naver-news", cluster.title, item, createdAt)));
    webItems.forEach((item) => {
      bundleSignals.push(makeSignal(isOfficialUrl(cleanUrl(item)) ? "official" : "naver-web", cluster.title, item, createdAt));
    });

    const trendResult = trendResultByQuery.get(cluster.title);
    const recentAverage = trendScore(trendResult);
    const trendSeries = (trendResult?.data || [])
      .filter((point) => point.period && Number.isFinite(Number(point.ratio)))
      .slice(-16)
      .map((point) => ({ period: String(point.period), ratio: Number(point.ratio) }));

    const trendSignal: Signal = {
      id: makeId("signal"),
      kind: "naver-trends",
      title: `${cluster.title} 검색 수요 신호`,
      query: cluster.title,
      snippet: `최근 90일 주간 상대 검색지수의 최근 평균 ${recentAverage}/100. 절대 검색량이 아니라 수요·시기 비교용 데이터입니다.`,
      sourceLabel: "NAVER 검색어트렌드",
      createdAt,
      metrics: { trendScore: recentAverage },
    };
    bundleSignals.push(trendSignal);

    allSignals.push(...bundleSignals);
    evidenceBundles.push({
      id: makeId("bundle"),
      query: cluster.title,
      discoveryCategory: autoResearchCategoryLabel(cluster.category),
      discoveredProblem: cluster.rawTitles.slice(0, 3).join(" / ") || cluster.title,
      sourceSignalIds: bundleSignals.map((signal) => signal.id),
      questions,
      trend: {
        query: cluster.title,
        recentAverage,
        series: trendSeries,
        note: "NAVER 검색어트렌드의 0~100 상대지수이며 절대 검색량이 아닙니다.",
      },
      cafe: cafeItems.map((item) => makeEvidenceItem("naver-cafe", item)),
      blog: blogItems.map((item) => makeEvidenceItem("naver-blog", item)),
      news: newsItems.map((item) => makeEvidenceItem("naver-news", item)),
      web: webItems.map((item) => makeEvidenceItem("naver-web", item, isOfficialUrl(cleanUrl(item)))),
      coverage: {
        trend: trendSeries.length > 0,
        cafe: cafeItems.length > 0,
        blog: blogItems.length > 0,
        news: newsItems.length > 0,
        web: webItems.length > 0,
      },
    });
  }

  const reviewPrompt = buildTopicReviewPrompt(evidenceBundles, {
    generatedAt: createdAt,
    seeds: seedSummary,
    cooldown,
  });

  return NextResponse.json({
    generatedAt: createdAt,
    offset,
    seeds: seedSummary,
    signals: allSignals,
    evidenceBundles,
    reviewPrompt,
    errors: Array.from(new Set(errors)).slice(0, 12),
    cooldown,
  });
}
