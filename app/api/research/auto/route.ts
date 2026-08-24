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
import { makeId, stripHtml } from "@/lib/research";
import type { Candidate, ContentMode, Signal, SignalKind } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

const DISCOVERY_TYPES = [
  {
    type: "kin",
    path: "kin",
    kind: "naver-kin" as SignalKind,
    display: 12,
    sort: "sim",
  },
  {
    type: "cafe",
    path: "cafearticle",
    kind: "naver-cafe" as SignalKind,
    display: 12,
    sort: "sim",
  },
  {
    type: "blog",
    path: "blog",
    kind: "naver-blog" as SignalKind,
    display: 8,
    sort: "sim",
  },
] as const;

const DETAIL_TYPES = [
  {
    type: "blog",
    path: "blog",
    kind: "naver-blog" as SignalKind,
    display: 4,
    sort: "sim",
  },
  {
    type: "news",
    path: "news",
    kind: "naver-news" as SignalKind,
    display: 3,
    sort: "date",
  },
  { type: "web", path: "webkr", kind: "naver-web" as SignalKind, display: 8 },
] as const;

type SearchConfig =
  | (typeof DISCOVERY_TYPES)[number]
  | (typeof DETAIL_TYPES)[number];

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
  score: number;
};

type ProblemCluster = {
  category: AutoResearchCategory;
  seed: AutoResearchSeed;
  title: string;
  rawTitles: string[];
  items: Array<{ kind: SignalKind; item: SearchItem }>;
  preliminaryScore: number;
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
  "신고",
  "정리",
  "교체",
  "청소",
  "세척",
  "수명",
  "부족",
  "느림",
  "꺼짐",
  "뜨거",
  "새는",
  "비용",
  "가격",
  "기간",
  "설정",
  "삭제",
  "복구",
  "보관",
];

const YMYL_OR_OFFTOPIC = [
  "암",
  "당뇨",
  "혈압",
  "약",
  "병원",
  "치료",
  "증상",
  "임신",
  "예방접종",
  "다이어트",
  "영양제",
  "대출",
  "보험",
  "주식",
  "코인",
  "투자",
  "세금",
  "소송",
  "법률",
  "이혼",
  "성인",
  "도박",
];

const COMMERCIAL_NOISE = [
  "업체 추천",
  "렌탈 추천",
  "견적 업체",
  "광고",
  "협찬",
  "체험단",
  "구매대행",
  "최저가",
  "이벤트",
  "쿠폰",
];

const OFFICIAL_HOSTS = [
  "gov.kr",
  "easylaw.go.kr",
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
  "필터",
  "배터리",
  "저장공간",
  "사진",
  "청소",
  "세척",
  "정리",
  "폐기물",
  "신청",
  "냄새",
  "소음",
  "배수",
  "충전",
  "데이터",
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
  return OFFICIAL_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function problemScore(title: string) {
  const markerScore = PROBLEM_MARKERS.reduce(
    (score, marker) => score + (title.includes(marker) ? 3 : 0),
    0,
  );
  const questionScore =
    /[?？]|나요|까요|인가요|해요|합니다|되나요|왜|어떻게/.test(title) ? 4 : 0;
  const lengthScore =
    title.length >= 10 && title.length <= 44 ? 4 : title.length <= 60 ? 2 : 0;
  const ymylPenalty = YMYL_OR_OFFTOPIC.some((word) => title.includes(word))
    ? 50
    : 0;
  const noisePenalty = COMMERCIAL_NOISE.some((word) => title.includes(word))
    ? 24
    : 0;
  return markerScore + questionScore + lengthScore - ymylPenalty - noisePenalty;
}

function trendScore(result?: TrendResult) {
  const ratios = (result?.data || [])
    .map((point) => Number(point.ratio))
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) return 0;
  const recent = ratios.slice(-Math.min(4, ratios.length));
  return Math.round(
    recent.reduce((sum, value) => sum + value, 0) / recent.length,
  );
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
  if (YMYL_OR_OFFTOPIC.some((word) => title.includes(word))) return false;
  if (COMMERCIAL_NOISE.some((word) => title.includes(word))) return false;
  if (
    topicSimilarity(title, scopeQuery) > 0.9 &&
    title.length <= scopeQuery.length + 4
  )
    return false;
  return problemScore(title) >= 4;
}

function withinDays(value: string | undefined, days: number) {
  if (!value) return true;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time <= days * 86_400_000;
}

function blockedByHistory(
  title: string,
  history: TopicHistory[],
  strict: boolean,
) {
  return history.some((entry) => {
    const combined = [entry.title, entry.problem].filter(Boolean).join(" ");
    if (!combined) return false;
    if (isSameTopicCluster(title, combined)) return true;
    return topicSimilarity(title, combined) >= (strict ? 0.43 : 0.56);
  });
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
  if ("sort" in config && config.sort)
    endpoint.searchParams.set("sort", config.sort);

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
    keywordGroups: keywords
      .slice(0, 5)
      .map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
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
  const sorted = [...problems].sort((a, b) => b.score - a.score);

  for (const problem of sorted) {
    const existing = clusters.find(
      (cluster) =>
        cluster.category === problem.category &&
        (isSameTopicCluster(cluster.title, problem.title) ||
          topicSimilarity(cluster.title, problem.title) >= 0.58),
    );

    if (existing) {
      existing.rawTitles.push(problem.rawTitle);
      existing.items.push({ kind: problem.kind, item: problem.item });
      existing.preliminaryScore += Math.max(1, Math.round(problem.score / 4));
      if (problemScore(problem.title) > problemScore(existing.title))
        existing.title = problem.title;
      continue;
    }

    clusters.push({
      category: problem.category,
      seed: problem.seed,
      title: problem.title,
      rawTitles: [problem.rawTitle],
      items: [{ kind: problem.kind, item: problem.item }],
      preliminaryScore: problem.score,
    });
  }

  return clusters.map((cluster) => ({
    ...cluster,
    preliminaryScore:
      cluster.preliminaryScore + Math.min(12, (cluster.items.length - 1) * 3),
  }));
}

function isDiverseFromBatch(
  candidate: ProblemCluster,
  selected: ProblemCluster[],
) {
  const entity = topicEntity(candidate.title);
  const theme = topicTheme(candidate.title);

  return !selected.some((item) => {
    if (topicSimilarity(candidate.title, item.title) >= 0.42) return true;
    const otherEntity = topicEntity(item.title);
    if (entity && otherEntity && entity === otherEntity) return true;
    const otherTheme = topicTheme(item.title);
    if (
      theme &&
      otherTheme &&
      theme === otherTheme &&
      DIVERSITY_THEMES.has(theme)
    )
      return true;
    return false;
  });
}

function selectDiverseClusters(clusters: ProblemCluster[], count: number) {
  const selected: ProblemCluster[] = [];
  const byScore = [...clusters].sort(
    (a, b) => b.preliminaryScore - a.preliminaryScore,
  );
  const categories: AutoResearchCategory[] = [
    "home-care",
    "digital-life",
    "living-admin",
    "organization",
    "seasonal-living",
  ];

  for (const category of categories) {
    const match = byScore.find(
      (cluster) =>
        cluster.category === category &&
        !selected.includes(cluster) &&
        isDiverseFromBatch(cluster, selected),
    );
    if (match) selected.push(match);
    if (selected.length >= count) return selected;
  }

  for (const cluster of byScore) {
    if (selected.includes(cluster)) continue;
    if (!isDiverseFromBatch(cluster, selected)) continue;
    selected.push(cluster);
    if (selected.length >= count) break;
  }

  // 너무 엄격한 다양성 때문에 5개를 못 채우는 경우 카테고리 중복만 허용하되 동일 주제 클러스터는 계속 막습니다.
  for (const cluster of byScore) {
    if (selected.includes(cluster)) continue;
    if (
      selected.some(
        (item) =>
          isSameTopicCluster(item.title, cluster.title) ||
          topicSimilarity(item.title, cluster.title) >= 0.5,
      )
    )
      continue;
    selected.push(cluster);
    if (selected.length >= count) break;
  }

  return selected.slice(0, count);
}

function contentModeFor(title: string, fallback: ContentMode): ContentMode {
  if (/비교|차이|비용|가격|교체|종류|선택|수명/.test(title))
    return "comparison-analysis";
  if (/오류|안됨|안 돼|갑자기|신청|신고|설정|삭제|복구/.test(title))
    return "research-verification";
  return fallback;
}

function uniqueOutputFor(
  title: string,
  category: AutoResearchCategory,
  fallback: string,
) {
  if (/비용|가격/.test(title))
    return "공식 가격·서비스 기준과 실제 비용이 달라지는 조건을 분리한 비용 판단표";
  if (/필터|배터리|교체|수명/.test(title))
    return "교체·관리 시점을 단일 숫자로 단정하지 않고 상태·사용 조건·공식 기준으로 나눈 결정표";
  if (/안됨|안 돼|오류|갑자기|느림|꺼짐|누수|배수/.test(title))
    return "실제 질문에서 증상 분기를 추출해 사용자가 먼저 확인할 것과 중단 기준을 나눈 문제 해결 흐름";
  if (/신청|신고|발급|변경|폐기/.test(title))
    return "공식 절차를 준비물 → 신청 → 예외 → 완료 확인 순서로 재구성한 실행 체크리스트";
  if (/정리|보관/.test(title))
    return "보관 조건·사용 빈도·공간 제약을 기준으로 여러 방법을 비교한 조건별 선택표";
  if (/청소|세척|건조/.test(title))
    return "세척 가능한 범위·금지 항목·건조 조건·교체 판단을 공식 자료로 분리한 관리표";
  if (category === "digital-life")
    return "공식 화면 경로·데이터 보존 여부·실패 조건을 묶은 디지털 문제 해결 체크리스트";
  return fallback;
}

function audienceFor(title: string, fallback: string) {
  return `${title}와 관련해 인터넷의 일반론보다 실제 확인 순서와 예외 조건을 빠르게 알고 싶은 사용자. ${fallback}`;
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
        error:
          "NAVER_API_HUB_CLIENT_ID / NAVER_API_HUB_CLIENT_SECRET 환경변수가 없습니다.",
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

  const usedTopics = (Array.isArray(body.usedTopics) ? body.usedTopics : [])
    .filter((entry) => withinDays(entry.usedAt || entry.updatedAt, 60))
    .slice(-100);
  const seenTopics = (Array.isArray(body.seenTopics) ? body.seenTopics : [])
    .filter((entry) => withinDays(entry.updatedAt || entry.usedAt, 14))
    .slice(-120);

  // 1) 완성된 주제 키워드를 검색하지 않고, 5개 생활 영역의 넓은 탐색어로 실제 질문을 수집합니다.
  const discovered: DiscoveredProblem[] = [];
  for (const seed of seeds) {
    const settled = await Promise.allSettled(
      DISCOVERY_TYPES.map(async (config) => ({
        config,
        items: await searchNaver(credentials, seed.query, config),
      })),
    );

    settled.forEach((result, index) => {
      const config = DISCOVERY_TYPES[index];
      if (result.status === "rejected") {
        const message =
          result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(
          `${autoResearchCategoryLabel(seed.category)} · ${config.type}: ${message}`,
        );
        return;
      }

      result.value.items.forEach((item) => {
        const rawTitle = stripHtml(item.title || "").trim();
        const title = cleanProblemTitle(rawTitle);
        if (!isUsefulProblemTitle(title, seed.query)) return;
        if (blockedByHistory(title, usedTopics, true)) return;
        if (blockedByHistory(title, seenTopics, false)) return;

        const kindBonus =
          config.kind === "naver-kin"
            ? 5
            : config.kind === "naver-cafe"
              ? 4
              : 2;
        discovered.push({
          category: seed.category,
          seed,
          title,
          rawTitle,
          kind: config.kind,
          item,
          score: problemScore(rawTitle) + kindBonus,
        });
      });
    });
  }

  const clusters = clusterProblems(discovered)
    .filter((cluster) => !blockedByHistory(cluster.title, usedTopics, true))
    .filter((cluster) => !blockedByHistory(cluster.title, seenTopics, false));
  const selectedClusters = selectDiverseClusters(clusters, 5);

  if (!selectedClusters.length) {
    return NextResponse.json({
      generatedAt: createdAt,
      offset,
      seeds: seeds.map((seed) => ({
        query: seed.query,
        category: autoResearchCategoryLabel(seed.category),
      })),
      signals: [],
      candidates: [],
      errors: [
        ...Array.from(new Set(errors)),
        "최근 사용·노출 주제와 겹치지 않는 새 문제를 충분히 찾지 못했습니다. ‘다른 주제 5개 찾기’를 누르면 탐색 범위를 바꿉니다.",
      ].slice(0, 12),
      cooldown: {
        usedDays: 60,
        seenDays: 14,
        usedCount: usedTopics.length,
        seenCount: seenTopics.length,
      },
    });
  }

  // 2) 실제 질문에서 뽑힌 새 문제만 다시 정확히 검색해 공식 근거·변경 신호·검색 수요를 확인합니다.
  const trendByQuery = new Map<string, number>();
  try {
    const trendResults = await fetchTrend(
      credentials,
      selectedClusters.map((cluster) => cluster.title),
    );
    for (const result of trendResults) {
      const title = typeof result.title === "string" ? result.title : "";
      if (title) trendByQuery.set(title, trendScore(result));
    }
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `검색어트렌드: ${error.message}`
        : "검색어트렌드 조회 실패",
    );
  }

  const allSignals: Signal[] = [];
  const allCandidates: Candidate[] = [];

  for (const cluster of selectedClusters) {
    const candidateSignals: Signal[] = [];

    // 최초 문제 발견에 사용된 지식iN/카페/블로그 신호를 최대 4개 보존합니다.
    cluster.items.slice(0, 4).forEach(({ kind, item }) => {
      candidateSignals.push(makeSignal(kind, cluster.title, item, createdAt));
    });

    const detailSettled = await Promise.allSettled(
      DETAIL_TYPES.map(async (config) => {
        const query =
          config.type === "web" ? `${cluster.title} 공식` : cluster.title;
        return { config, items: await searchNaver(credentials, query, config) };
      }),
    );

    const detailByType = new Map<string, SearchItem[]>();
    detailSettled.forEach((result, index) => {
      const config = DETAIL_TYPES[index];
      if (result.status === "fulfilled") {
        detailByType.set(config.type, result.value.items);
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(`${cluster.title} · ${config.type}: ${message}`);
      }
    });

    (detailByType.get("blog") || [])
      .slice(0, 2)
      .forEach((item) =>
        candidateSignals.push(
          makeSignal("naver-blog", cluster.title, item, createdAt),
        ),
      );
    (detailByType.get("news") || [])
      .slice(0, 1)
      .forEach((item) =>
        candidateSignals.push(
          makeSignal("naver-news", cluster.title, item, createdAt),
        ),
      );

    const webItems = detailByType.get("web") || [];
    const officialWeb = webItems
      .filter((item) => isOfficialUrl(cleanUrl(item)))
      .slice(0, 3);
    const generalWeb = webItems
      .filter((item) => !isOfficialUrl(cleanUrl(item)))
      .slice(0, officialWeb.length ? 1 : 2);
    officialWeb.forEach((item) =>
      candidateSignals.push(
        makeSignal("official", cluster.title, item, createdAt),
      ),
    );
    generalWeb.forEach((item) =>
      candidateSignals.push(
        makeSignal("naver-web", cluster.title, item, createdAt),
      ),
    );

    const demand = trendByQuery.get(cluster.title) ?? 0;
    candidateSignals.push({
      id: makeId("signal"),
      kind: "naver-trends",
      title: `${cluster.title} 검색 수요 신호`,
      query: cluster.title,
      snippet: `최근 90일 주간 상대 검색지수의 최근 평균 ${demand}/100. 절대 검색량이 아니라 수요·시기 판단용 신호입니다.`,
      sourceLabel: "NAVER 검색어트렌드",
      createdAt,
      metrics: { trendScore: demand },
    });

    const officialCount = candidateSignals.filter(
      (signal) => signal.kind === "official",
    ).length;
    const communityCount = candidateSignals.filter(
      (signal) => signal.kind === "naver-kin" || signal.kind === "naver-cafe",
    ).length;
    const sourceKinds = new Set(candidateSignals.map((signal) => signal.kind));
    const hasNews = candidateSignals.some(
      (signal) => signal.kind === "naver-news",
    );
    const evidenceScore = officialCount >= 2 ? 5 : officialCount === 1 ? 4 : 2;
    const problemSpecificity =
      problemScore(cluster.rawTitles[0] || cluster.title) >= 12 ? 5 : 4;

    const candidate: Candidate = {
      id: makeId("candidate"),
      title: cluster.title,
      problem:
        cluster.rawTitles.slice(0, 2).join(" / ") ||
        `${cluster.title} 문제를 구체적인 조건별로 좁혀 해결한다.`,
      audience: audienceFor(cluster.title, cluster.seed.audience),
      siteTheme: "생활 문제 해결 기록소 · 디지털 생활 도구",
      contentMode: contentModeFor(cluster.title, cluster.seed.contentMode),
      sourceSignalIds: candidateSignals.map((signal) => signal.id),
      scoreInputs: {
        siteFit: 5,
        problemSpecificity,
        demand: demand >= 70 ? 5 : demand >= 40 ? 4 : demand >= 15 ? 3 : 2,
        officialEvidence: evidenceScore,
        originalValue:
          sourceKinds.size >= 5 && communityCount >= 1
            ? 5
            : sourceKinds.size >= 4
              ? 4
              : 3,
        evergreen: cluster.seed.evergreen,
      },
      penalties: {
        ymyl: YMYL_OR_OFFTOPIC.some((word) => cluster.title.includes(word)),
        newsRewrite: false,
        duplicate: false,
        aiCommodity: officialCount === 0 || communityCount === 0,
        weakEvidence: officialCount === 0,
      },
      uniqueOutput: uniqueOutputFor(
        cluster.title,
        cluster.category,
        cluster.seed.uniqueOutput,
      ),
      verificationPlan: `${cluster.seed.verificationPlan}${hasNews ? " 뉴스는 내용 재작성용이 아니라 실제 변경 여부를 원문에서 확인하는 신호로만 사용한다." : ""}`,
      directEvidence:
        "직접 경험 자료 없음. 웹 조사 결과를 직접 체험한 것처럼 서술하지 않고, 조사·비교·검증 자체를 고유 결과물로 만든다.",
      createdAt,
      updatedAt: createdAt,
    };

    allSignals.push(...candidateSignals);
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
    cooldown: {
      usedDays: 60,
      seenDays: 14,
      usedCount: usedTopics.length,
      seenCount: seenTopics.length,
    },
  });
}
