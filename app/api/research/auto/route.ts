import { NextRequest, NextResponse } from "next/server";
import {
  autoResearchCategoryLabel,
  getAutoResearchSeeds,
  isSameTopicCluster,
  topicEntity,
  topicSimilarity,
  topicTheme,
  topicTokens,
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
  EditorialContext,
  ResearchEvidenceBundle,
  ResearchEvidenceItem,
  Signal,
  SignalKind,
  SiteContentRecord,
} from "@/lib/types";

const DISCOVERY_TYPES = [
  { type: "kin", path: "kin", kind: "naver-kin" as SignalKind, display: 30, sort: "sim" },
] as const;

const DISCOVERY_LANES = [
  // 최근 질문을 먼저 보되 날짜 기준을 하드 필터로 쓰지는 않습니다.
  // NAVER 지식iN 검색 API는 질문 날짜를 안정적으로 반환하지 않으므로 sort=date를 "최근성 힌트"로 사용합니다.
  { label: "recent", sort: "date" as const, display: 30, priorityBoost: 8 },
  // 오래됐더라도 반복 검색되는 에버그린 문제를 놓치지 않기 위한 제한된 관련도 회수 레인입니다.
  { label: "evergreen", sort: "sim" as const, display: 12, priorityBoost: 3 },
] as const;

const DETAIL_TYPES = [
  { type: "cafe", path: "cafearticle", kind: "naver-cafe" as SignalKind, display: 10, sort: "sim" },
  { type: "blog", path: "blog", kind: "naver-blog" as SignalKind, display: 10, sort: "sim" },
  { type: "news", path: "news", kind: "naver-news" as SignalKind, display: 6, sort: "date" },
  { type: "web", path: "webkr", kind: "naver-web" as SignalKind, display: 12 },
] as const;

const MAX_REVIEW_BUNDLES = 12;
const TREND_GROUP_BATCH_SIZE = 5;
const MAX_TREND_KEYWORDS_PER_GROUP = 5;

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

type TrendKeywordGroup = {
  groupName: string;
  keywords: string[];
};

type KinQuestionGroup = {
  representative: SearchItem;
  related: SearchItem[];
};

type TopicHistory = {
  title?: string;
  problem?: string;
  usedAt?: string;
  updatedAt?: string;
};

type SearchPerformanceInput = {
  query?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type AutoRequest = {
  offset?: number;
  sourceUrl?: string;
  usedTopics?: TopicHistory[];
  siteUrl?: string;
  siteContents?: SiteContentRecord[];
  searchPerformance?: SearchPerformanceInput[];
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
  "support.microsoft.com",
  "learn.microsoft.com",
  "meta.com",
  "facebook.com",
  // naver.com 전체를 공식으로 보지 않습니다. 운영 주체의 도움말·정책·개발 문서만 후보로 인정합니다.
  "help.naver.com",
  "policy.naver.com",
  "developers.naver.com",
  "searchadvisor.naver.com",
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


type KinSourceQuestion = {
  url: string;
  title: string;
  description?: string;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim();
  }
  return "";
}

function normalizeKinSourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("올바른 네이버 지식iN 원문 URL을 입력해주세요.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "kin.naver.com" && hostname !== "m.kin.naver.com") {
    throw new Error("네이버 지식iN(kin.naver.com) 원문 URL만 사용할 수 있습니다.");
  }
  if (!url.searchParams.get("docId") && !/\/qna\//i.test(url.pathname)) {
    throw new Error("지식iN 질문 원문 URL을 확인해주세요. 질문 상세 페이지 주소가 필요합니다.");
  }
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "query", "sm", "where", "from"].forEach((key) => url.searchParams.delete(key));
  return url.toString();
}

async function fetchKinSourceQuestion(sourceUrl: string): Promise<KinSourceQuestion> {
  const url = normalizeKinSourceUrl(sourceUrl);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`지식iN 원문을 열지 못했습니다. HTTP ${response.status}`);
  }
  const html = await response.text();
  const rawTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title") || decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const rawDescription = metaContent(html, "og:description") || metaContent(html, "description") || metaContent(html, "twitter:description");
  const title = stripHtml(rawTitle)
    .replace(/\s*[:|\-]\s*(네이버\s*)?지식iN.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const description = stripHtml(rawDescription).replace(/\s+/g, " ").trim();
  if (!title || title.length < 2) {
    throw new Error("지식iN 원문에서 질문 제목을 확인하지 못했습니다. 원문이 공개 상태인지 확인해주세요.");
  }
  return { url, title, description: description || undefined };
}

function anchorCoreQueries(title: string) {
  const cleaned = cleanProblemTitle(title);
  const tokens = topicTokens(cleaned).slice(0, 4);
  const variants = [cleaned, tokens.join(" ")]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 2);
  return Array.from(new Set(variants)).slice(0, 2);
}

function chooseAnchorSeed(title: string, seeds: AutoResearchSeed[]) {
  const sorted = [...seeds].sort((a, b) => {
    const scoreA = topicSimilarity(title, `${a.query} ${a.audience}`);
    const scoreB = topicSimilarity(title, `${b.query} ${b.audience}`);
    return scoreB - scoreA;
  });
  return sorted[0] || seeds[0];
}

function inferInternalCategoryLabel(text: string) {
  const value = text.toLowerCase();
  if (/(아이폰|갤럭시|스마트폰|휴대폰|컴퓨터|노트북|윈도우|맥북|앱|계정|백업|복원|동기화|와이파이|블루투스|파일|사진|저장공간|데이터)/.test(value)) return "디지털 생활";
  if (/(대형폐기물|폐가전|쓰레기|배출|신청|신고|주민센터|구청|시청|공공시설|서류|주소 변경|이사.*절차)/.test(value)) return "생활 행정";
  if (/(정리|수납|보관|옷장|이불|주방|식품|공간|습기|곰팡이.*보관)/.test(value)) return "정리·보관";
  if (/(사용법|사용 방법|제품|기기|설정|설치|조립|소모품|필터 교체|충전기|리모컨)/.test(value)) return "제품 사용";
  return "집 관리";
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isRevalidationDue(item: SiteContentRecord) {
  const reference = item.modifiedAt || item.publishedAt;
  const time = reference ? new Date(reference).getTime() : Number.NaN;
  if (!Number.isFinite(time)) return true;
  const ageDays = Math.max(0, (Date.now() - time) / 86_400_000);
  return ageDays >= item.revalidationWindowDays;
}

function buildEditorialContext(
  bundles: ResearchEvidenceBundle[],
  siteUrl: string | undefined,
  siteContents: SiteContentRecord[],
  searchPerformance: SearchPerformanceInput[],
): EditorialContext {
  const normalizedSiteContents = siteContents
    .filter((item) => item && typeof item.title === "string" && item.title.trim() && typeof item.url === "string" && item.url.trim())
    .slice(0, 500);
  const normalizedPerformance = searchPerformance
    .filter((item) => typeof item?.query === "string" && item.query.trim())
    .slice(0, 500);

  const bundleContexts = bundles.map((bundle) => {
    const existingContentMatches = normalizedSiteContents
      .map((item) => ({
        item,
        similarity: topicSimilarity(`${bundle.query} ${bundle.discoveredProblem}`, item.title),
      }))
      .filter((entry) => entry.similarity >= 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ item, similarity }) => ({
        title: item.title,
        url: item.url,
        similarity: Math.round(similarity * 100) / 100,
        modifiedAt: item.modifiedAt,
        revalidationWindowDays: item.revalidationWindowDays,
        revalidationDue: isRevalidationDue(item),
      }));

    const searchConsoleMatches = normalizedPerformance
      .map((item) => ({
        item,
        similarity: topicSimilarity(`${bundle.query} ${bundle.discoveredProblem}`, item.query || ""),
      }))
      .filter((entry) => entry.similarity >= 0.16)
      .sort((a, b) => {
        const similarityDiff = b.similarity - a.similarity;
        if (Math.abs(similarityDiff) > 0.05) return similarityDiff;
        return (safeNumber(b.item.impressions) || 0) - (safeNumber(a.item.impressions) || 0);
      })
      .slice(0, 6)
      .map(({ item, similarity }) => ({
        query: item.query || "",
        similarity: Math.round(similarity * 100) / 100,
        clicks: safeNumber(item.clicks),
        impressions: safeNumber(item.impressions),
        ctr: safeNumber(item.ctr),
        position: safeNumber(item.position),
      }));

    const strongest = existingContentMatches[0]?.similarity || 0;
    const currentEntity = topicEntity(bundle.query);
    const currentTheme = topicTheme(bundle.query);
    const likelyDuplicate = strongest >= 0.72 || existingContentMatches.some((match) => {
      const existingEntity = topicEntity(match.title);
      const existingTheme = topicTheme(match.title);
      return Boolean(currentEntity && currentEntity === existingEntity && currentTheme && currentTheme === existingTheme && match.similarity >= 0.48);
    });

    return {
      bundleId: bundle.id,
      existingContentMatches,
      searchConsoleMatches,
      likelyDuplicate,
    };
  });

  return {
    siteUrl: siteUrl?.trim() || undefined,
    syncedAt: new Date().toISOString(),
    totalPublishedPosts: normalizedSiteContents.length,
    revalidationDue90: normalizedSiteContents.filter((item) => item.revalidationWindowDays === 90 && isRevalidationDue(item)).length,
    revalidationDue180: normalizedSiteContents.filter((item) => item.revalidationWindowDays === 180 && isRevalidationDue(item)).length,
    searchConsoleQueryCount: normalizedPerformance.length,
    bundles: bundleContexts,
  };
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
  // 30일 일별 흐름 중 최근 7일을 "현재 수요" 힌트로 사용합니다.
  // 이 값 하나로 후보를 탈락시키지 않고, 장기 지속성은 전체 30일 패턴을 ChatGPT Pro가 별도로 판단합니다.
  const recent = ratios.slice(-Math.min(7, ratios.length));
  return Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length);
}

function trendDurabilityNote(result?: TrendResult) {
  const ratios = (result?.data || [])
    .map((point) => Number(point.ratio))
    .filter((value) => Number.isFinite(value));
  if (!ratios.length) return "30일 트렌드 데이터가 없어도 에버그린 후보를 자동 탈락시키지 않습니다.";

  const activeDays = ratios.filter((value) => value > 0).length;
  const activeRate = Math.round((activeDays / ratios.length) * 100);
  const midpoint = Math.max(1, Math.floor(ratios.length / 2));
  const first = ratios.slice(0, midpoint);
  const second = ratios.slice(midpoint);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const firstAvg = average(first);
  const secondAvg = average(second);
  const baseline = Math.max(1, (firstAvg + secondAvg) / 2);
  const shift = Math.round((Math.abs(secondAvg - firstAvg) / baseline) * 100);

  return `최근 30일 중 상대지수가 0보다 큰 날 ${activeRate}% · 전/후반 평균 변동폭 약 ${shift}%. 이 수치는 절대 검색량이 아니라 지속성 판단용 보조 힌트입니다.`;
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


function normalizeQuestionTitle(value: string) {
  return cleanProblemTitle(value)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalQuestionUrl(item: SearchItem) {
  const raw = cleanUrl(item);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    ["query", "sm", "where", "from", "utm_source", "utm_medium", "utm_campaign"].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

function dedupeKinQuestions(items: Array<{ kind: SignalKind; item: SearchItem }>) {
  const exactSeenUrls = new Set<string>();
  const exactSeenTitles = new Set<string>();
  const unique: SearchItem[] = [];

  for (const { item } of items) {
    const titleKey = normalizeQuestionTitle(item.title || "");
    const urlKey = canonicalQuestionUrl(item);
    if (!titleKey) continue;
    if (urlKey && exactSeenUrls.has(urlKey)) continue;
    if (exactSeenTitles.has(titleKey)) continue;
    if (urlKey) exactSeenUrls.add(urlKey);
    exactSeenTitles.add(titleKey);
    unique.push(item);
  }

  const groups: KinQuestionGroup[] = [];
  for (const item of unique) {
    const title = normalizeQuestionTitle(item.title || "");
    const existing = groups.find((group) => {
      const other = normalizeQuestionTitle(group.representative.title || "");
      return isSameTopicCluster(title, other) || topicSimilarity(title, other) >= 0.78;
    });
    if (existing) {
      existing.related.push(item);
    } else {
      groups.push({ representative: item, related: [] });
    }
  }

  return {
    rawCount: items.length,
    uniqueCount: unique.length,
    groups,
  };
}


function dedupeSearchItems(items: SearchItem[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return items.filter((item) => {
    const title = normalizeQuestionTitle(item.title || "");
    const url = canonicalQuestionUrl(item);
    if (!title && !url) return false;
    if (url && seenUrls.has(url)) return false;
    if (title && seenTitles.has(title)) return false;
    if (url) seenUrls.add(url);
    if (title) seenTitles.add(title);
    return true;
  });
}

function cleanTrendPhrase(value: string) {
  return stripHtml(value)
    .replace(/[?？!！]/g, " ")
    .replace(/\b(질문|문의)\b/gi, " ")
    .replace(/(궁금합니다|궁금해요|알려주세요|문의드립니다|어떻게 해야 하나요|어떻게 하나요|가능한가요|가능할까요|되나요|될까요|인가요|일까요|맞나요|하나요|할까요)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTrendKeywords(cluster: ProblemCluster) {
  const title = cleanTrendPhrase(cluster.title);
  const entity = topicEntity(cluster.title);
  const theme = topicTheme(cluster.title);
  const tokens = topicTokens(cluster.title)
    .map((token) => token.replace(/(으로|에서|에게|까지|부터|보다|처럼|하고|하면|인데|인데요|은|는|이|가|을|를|에|도|만)$/g, ""))
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
  const core = tokens.slice(0, 4).join(" ");
  const shortCore = tokens.slice(0, 3).join(" ");
  const variants: string[] = [];

  if (entity && theme) variants.push(`${entity} ${theme}`);
  if (shortCore) variants.push(shortCore);
  if (core && core !== shortCore) variants.push(core);
  if (title) variants.push(title);

  const intentBase = entity || tokens.slice(0, 2).join(" ");
  if (intentBase) {
    if (/버리|폐기/.test(cluster.title)) variants.push(`${intentBase} 버리기`, `${intentBase} 폐기`);
    if (/청소|세척/.test(cluster.title)) variants.push(`${intentBase} 청소`, `${intentBase} 세척`);
    if (/보관|정리|수납/.test(cluster.title)) variants.push(`${intentBase} 보관`, `${intentBase} 정리`);
    if (/삭제|저장공간|용량/.test(cluster.title)) variants.push(`${intentBase} 저장공간`, `${intentBase} 삭제`);
    if (/신청|신고/.test(cluster.title)) variants.push(`${intentBase} 신청`, `${intentBase} 신고`);
    if (/냄새|소음|누수|배수|충전|오류|안됨|안 돼/.test(cluster.title) && theme) variants.push(`${intentBase} ${theme}`);
  }

  for (const raw of cluster.rawTitles.slice(0, 4)) {
    const cleaned = cleanTrendPhrase(cleanProblemTitle(raw));
    if (cleaned && cleaned.length <= 35) variants.push(cleaned);
  }

  const seen = new Set<string>();
  return variants
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 2 && value.length <= 40)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TREND_KEYWORDS_PER_GROUP);
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
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
  options?: { sort?: "sim" | "date"; display?: number },
) {
  const endpoint = naverApiHubUrl(`/search/v1/${config.path}`);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("display", String(options?.display ?? config.display));
  endpoint.searchParams.set("start", "1");
  endpoint.searchParams.set("format", "json");
  const sort = options?.sort ?? ("sort" in config ? config.sort : undefined);
  if (sort) endpoint.searchParams.set("sort", sort);

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

async function fetchTrendGroups(
  credentials: { clientId: string; clientSecret: string },
  groups: TrendKeywordGroup[],
) {
  if (!groups.length) return [] as TrendResult[];
  const end = kstNow();
  const start = new Date(end);
  // 하루 1~3개 후보 선별에 맞춰 최근 흐름을 더 민감하게 보되, 이 30일은 하드 탈락 기준이 아닙니다.
  start.setUTCDate(start.getUTCDate() - 30);
  const endpoint = naverApiHubUrl("/search-trend/v1/search");
  const results: TrendResult[] = [];

  // NAVER 검색어트렌드는 한 요청의 keywordGroups 수가 제한되므로 5개씩 나눠 조회합니다.
  for (const batch of chunk(groups, TREND_GROUP_BATCH_SIZE)) {
    const body = {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      timeUnit: "date",
      keywordGroups: batch.map((group) => ({
        groupName: group.groupName,
        keywords: group.keywords.slice(0, MAX_TREND_KEYWORDS_PER_GROUP),
      })),
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

    if (Array.isArray(data.results)) results.push(...(data.results as TrendResult[]));
  }

  return results;
}

function dedupeDiscoveredProblems(problems: DiscoveredProblem[]) {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  return problems.filter((problem) => {
    const titleKey = `${problem.category}::${normalizeQuestionTitle(problem.rawTitle || problem.title)}`;
    const url = canonicalQuestionUrl(problem.item);
    const urlKey = url ? `${problem.category}::${url}` : "";
    if (urlKey && seenUrls.has(urlKey)) return false;
    if (seenTitles.has(titleKey)) return false;
    if (urlKey) seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    return true;
  });
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
  // 앞단은 넓게 열어 두되 한 영역이 전부를 차지하지 않도록 영역당 최대 3개까지만 우선 담습니다.
  for (const cluster of byPriority) {
    if ((categoryCounts.get(cluster.category) || 0) >= 3) continue;
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

  // 중첩 async 함수에서도 TypeScript가 NAVER 자격증명의 null 가능성을 다시 추론하지 않도록
  // 가드 이후의 non-null 값을 별도 상수로 고정합니다.
  const naverCredentials: { clientId: string; clientSecret: string } = credentials;

  const offset = Math.max(0, Math.min(20, Number(body.offset) || 0));
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const siteContents = (Array.isArray(body.siteContents) ? body.siteContents : []).slice(0, 500);
  const searchPerformance = (Array.isArray(body.searchPerformance) ? body.searchPerformance : []).slice(0, 500);
  const now = kstNow();
  const createdAt = new Date().toISOString();
  const rotatingSeeds = getAutoResearchSeeds(now, offset, 5);
  const errors: string[] = [];

  const usedTopics = (Array.isArray(body.usedTopics) ? body.usedTopics : [])
    .filter((entry) => withinDays(entry.usedAt || entry.updatedAt, 60))
    .slice(-100);

  let sourceQuestion: KinSourceQuestion | undefined;
  let anchorSeed: AutoResearchSeed | undefined;
  if (sourceUrl) {
    try {
      sourceQuestion = await fetchKinSourceQuestion(sourceUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "지식iN 원문을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    if (isExcludedContentTopic(`${sourceQuestion.title} ${sourceQuestion.description || ""}`)) {
      return NextResponse.json(
        { error: "이 질문은 의료·법률·금융·전문 안전 등 자동 콘텐츠 조사 제외 범위에 해당합니다." },
        { status: 422 },
      );
    }
    anchorSeed = chooseAnchorSeed(sourceQuestion.title, rotatingSeeds);
  }

  const seeds = sourceQuestion && anchorSeed ? [anchorSeed] : rotatingSeeds;
  const seedSummary = sourceQuestion
    ? [{ query: sourceQuestion.title, category: inferInternalCategoryLabel(`${sourceQuestion.title} ${sourceQuestion.description || ""}`) }]
    : seeds.map((seed) => ({ query: seed.query, category: autoResearchCategoryLabel(seed.category) }));

  // 1) 지식iN은 문제 발견만 담당합니다.
  // 원문 URL이 있으면 해당 질문을 반드시 기준점으로 넣고, 주변의 독립 질문만 추가로 찾습니다.
  // 일반 자동 탐색은 최신순 + 제한적 관련도순을 병행해 최근성과 에버그린성을 함께 봅니다.
  const discovered: DiscoveredProblem[] = [];
  const config = DISCOVERY_TYPES[0];

  if (sourceQuestion && anchorSeed) {
    const anchorTitle = cleanProblemTitle(sourceQuestion.title) || sourceQuestion.title;
    const anchorItem: SearchItem = {
      title: sourceQuestion.title,
      link: sourceQuestion.url,
      description: sourceQuestion.description,
    };
    discovered.push({
      category: anchorSeed.category,
      seed: anchorSeed,
      title: anchorTitle,
      rawTitle: sourceQuestion.title,
      kind: config.kind,
      item: anchorItem,
      discoveryPriority: 100,
    });

    for (const relatedQuery of anchorCoreQueries(anchorTitle)) {
      const settled = await Promise.allSettled(
        DISCOVERY_LANES.map(async (lane) => ({
          lane,
          items: await searchNaver(naverCredentials, relatedQuery, config, { sort: lane.sort, display: lane.display }),
        })),
      );
      settled.forEach((result, index) => {
        const lane = DISCOVERY_LANES[index];
        if (result.status === "rejected") {
          const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
          errors.push(`원문 연관 질문 · kin/${lane.label}: ${message}`);
          return;
        }
        result.value.items.forEach((item) => {
          const rawTitle = stripHtml(item.title || "").trim();
          const title = cleanProblemTitle(rawTitle);
          if (isExcludedContentTopic(`${rawTitle} ${item.description || ""}`)) return;
          if (!isUsefulProblemTitle(title, relatedQuery)) return;
          if (!(isSameTopicCluster(anchorTitle, title) || topicSimilarity(anchorTitle, title) >= 0.3)) return;
          discovered.push({
            category: anchorSeed!.category,
            seed: anchorSeed!,
            title,
            rawTitle,
            kind: config.kind,
            item,
            discoveryPriority: problemSignalPriority(rawTitle) + lane.priorityBoost,
          });
        });
      });
    }
  } else {
    for (const seed of seeds) {
      const settled = await Promise.allSettled(
        DISCOVERY_LANES.map(async (lane) => ({
          lane,
          items: await searchNaver(naverCredentials, seed.query, config, { sort: lane.sort, display: lane.display }),
        })),
      );

      settled.forEach((result, index) => {
        const lane = DISCOVERY_LANES[index];
        if (result.status === "rejected") {
          const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
          errors.push(`${autoResearchCategoryLabel(seed.category)} · kin/${lane.label}: ${message}`);
          return;
        }

        result.value.items.forEach((item) => {
          const rawTitle = stripHtml(item.title || "").trim();
          const title = cleanProblemTitle(rawTitle);
          if (isExcludedContentTopic(`${rawTitle} ${item.description || ""}`)) return;
          if (!isUsefulProblemTitle(title, seed.query)) return;
          if (blockedByHistory(title, usedTopics, true)) return;

          discovered.push({
            category: seed.category,
            seed,
            title,
            rawTitle,
            kind: config.kind,
            item,
            discoveryPriority: problemSignalPriority(rawTitle) + lane.priorityBoost,
          });
        });
      });
    }
  }

  let reviewClusters: ProblemCluster[];
  if (sourceQuestion && anchorSeed) {
    const deduped = dedupeDiscoveredProblems(discovered);
    const anchorTitle = cleanProblemTitle(sourceQuestion.title) || sourceQuestion.title;
    const anchorProblems = deduped.filter((problem) =>
      canonicalQuestionUrl(problem.item) === normalizeKinSourceUrl(sourceQuestion!.url)
      || isSameTopicCluster(anchorTitle, problem.title)
      || topicSimilarity(anchorTitle, problem.title) >= 0.3,
    );
    reviewClusters = [{
      category: anchorSeed.category,
      seed: anchorSeed,
      title: anchorTitle,
      rawTitles: Array.from(new Set(anchorProblems.map((problem) => problem.rawTitle))),
      items: anchorProblems.map((problem) => ({ kind: problem.kind, item: problem.item })),
      discoveryPriority: anchorProblems.reduce((sum, problem) => sum + Math.max(1, problem.discoveryPriority), 0),
    }];
  } else {
    const clusters = clusterProblems(dedupeDiscoveredProblems(discovered))
      .filter((cluster) => !blockedByHistory(cluster.title, usedTopics, true));
    reviewClusters = selectReviewClusters(clusters, MAX_REVIEW_BUNDLES);
  }

  const cooldown = {
    usedDays: 60,
    seenDays: 0,
    usedCount: usedTopics.length,
    seenCount: 0,
  };

  if (!reviewClusters.length) {
    return NextResponse.json({
      generatedAt: createdAt,
      offset,
      seeds: seedSummary,
      signals: [],
      evidenceBundles: [],
      reviewPrompt: "",
      editorialContext: buildEditorialContext([], body.siteUrl, siteContents, searchPerformance),
      errors: [
        ...Array.from(new Set(errors)),
        `지식iN 검색은 완료됐지만 독립 질문 후보가 남지 않았습니다. 원시 발견 ${discovered.length}건 중 중복·금지 분야·실제 사용한 최근 주제만 제외했습니다. 단순 노출 이력은 더 이상 차단하지 않습니다.`,
      ].slice(0, 12),
      cooldown,
      sourceQuestion,
    });
  }

  // 2) 지식iN에서 발견한 각 문제에 대해 나머지 5개 API 데이터를 붙입니다.
  // 여기서 앱은 데이터를 넓게 수집·정리할 뿐 "좋은 주제"인지 최종 판정하지 않습니다.
  const trendKeywordsByQuery = new Map<string, string[]>();
  const trendBatchByQuery = new Map<string, number>();
  const trendResultByQuery = new Map<string, TrendResult>();
  const trendGroups = reviewClusters.map((cluster, index) => {
    const keywords = buildTrendKeywords(cluster);
    trendKeywordsByQuery.set(cluster.title, keywords);
    trendBatchByQuery.set(cluster.title, Math.floor(index / TREND_GROUP_BATCH_SIZE) + 1);
    return { groupName: cluster.title, keywords: keywords.length ? keywords : [cluster.title] };
  });

  try {
    const trendResults = await fetchTrendGroups(naverCredentials, trendGroups);
    for (const result of trendResults) {
      if (typeof result.title === "string" && result.title) trendResultByQuery.set(result.title, result);
    }
  } catch (error) {
    errors.push(error instanceof Error ? `검색어트렌드: ${error.message}` : "검색어트렌드 조회 실패");
  }

  const allSignals: Signal[] = [];
  const evidenceBundles: ResearchEvidenceBundle[] = [];

  async function enrichCluster(cluster: ProblemCluster) {
    const bundleSignals: Signal[] = [];
    const questionData = dedupeKinQuestions(cluster.items);
    const questions = questionData.groups.slice(0, 5).map((group) => {
      const representative = makeEvidenceItem("naver-kin", group.representative);
      const relatedQuestions = group.related.slice(0, 4).map((item) => ({
        title: clipText(item.title, 160) || "제목 없음",
        url: cleanUrl(item),
      }));
      return {
        ...representative,
        similarCount: 1 + group.related.length,
        relatedQuestions: relatedQuestions.length ? relatedQuestions : undefined,
      };
    });

    // 실제 독립 질문만 신호로 저장합니다. 같은 질문/URL의 중복 결과는 반복 수요로 부풀리지 않습니다.
    const uniqueKinItems = questionData.groups.flatMap((group) => [group.representative, ...group.related]).slice(0, 10);
    uniqueKinItems.forEach((item) => {
      bundleSignals.push(makeSignal("naver-kin", cluster.title, item, createdAt));
    });

    const trendKeywords = trendKeywordsByQuery.get(cluster.title) || [cluster.title];
    const supportQuery = trendKeywords.find((keyword) => keyword.length <= 28) || trendKeywords[0] || cluster.title;
    const detailSettled = await Promise.allSettled(
      DETAIL_TYPES.map(async (config) => {
        const query = config.type === "web" ? `${supportQuery} 공식` : supportQuery;
        return { config, items: await searchNaver(naverCredentials, query, config) };
      }),
    );

    const detailByType = new Map<string, SearchItem[]>();
    detailSettled.forEach((result, index) => {
      const config = DETAIL_TYPES[index];
      if (result.status === "fulfilled") {
        detailByType.set(config.type, dedupeSearchItems(result.value.items));
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "검색 실패";
        errors.push(`${cluster.title} · ${config.type}: ${message}`);
      }
    });

    const cafeItems = (detailByType.get("cafe") || []).slice(0, 4);
    const blogItems = (detailByType.get("blog") || []).slice(0, 4);
    const newsItems = (detailByType.get("news") || []).slice(0, 3);
    const webItems = (detailByType.get("web") || []).slice(0, 5);

    cafeItems.forEach((item) => bundleSignals.push(makeSignal("naver-cafe", supportQuery, item, createdAt)));
    blogItems.forEach((item) => bundleSignals.push(makeSignal("naver-blog", supportQuery, item, createdAt)));
    newsItems.forEach((item) => bundleSignals.push(makeSignal("naver-news", supportQuery, item, createdAt)));
    webItems.forEach((item) => {
      bundleSignals.push(makeSignal(isOfficialUrl(cleanUrl(item)) ? "official" : "naver-web", supportQuery, item, createdAt));
    });

    const trendResult = trendResultByQuery.get(cluster.title);
    const recentAverage = trendScore(trendResult);
    const trendSeries = (trendResult?.data || [])
      .filter((point) => point.period && Number.isFinite(Number(point.ratio)))
      .slice(-30)
      .map((point) => ({ period: String(point.period), ratio: Number(point.ratio) }));
    const durabilityNote = trendDurabilityNote(trendResult);

    const trendSignal: Signal = {
      id: makeId("signal"),
      kind: "naver-trends",
      title: `${cluster.title} 검색 의도군 수요 신호`,
      query: trendKeywords.join(" | "),
      snippet: `관련 검색어군 ${trendKeywords.map((keyword) => `“${keyword}”`).join(", ")}을 묶어 본 최근 30일 일별 상대 검색지수의 최근 7일 평균 ${recentAverage}/100. ${durabilityNote} 정확한 장문 질의 하나의 0값을 곧바로 수요 없음으로 해석하지 않습니다.`,
      sourceLabel: "NAVER 검색어트렌드",
      createdAt,
      metrics: { trendScore: recentAverage },
    };
    bundleSignals.push(trendSignal);

    const discoveredProblem = Array.from(new Set(cluster.rawTitles.map((title) => stripHtml(title).trim()).filter(Boolean)))
      .slice(0, 3)
      .join(" / ") || cluster.title;

    const bundle: ResearchEvidenceBundle = {
      id: makeId("bundle"),
      query: cluster.title,
      discoveryCategory: sourceQuestion
        ? inferInternalCategoryLabel(`${sourceQuestion.title} ${sourceQuestion.description || ""}`)
        : autoResearchCategoryLabel(cluster.category),
      discoveredProblem,
      sourceSignalIds: bundleSignals.map((signal) => signal.id),
      questions,
      questionStats: {
        rawCount: questionData.rawCount,
        uniqueCount: questionData.uniqueCount,
        groupedCount: questionData.groups.length,
      },
      trend: {
        query: cluster.title,
        keywords: trendKeywords,
        comparisonBatch: trendBatchByQuery.get(cluster.title) || 1,
        recentAverage,
        series: trendSeries,
        note: `NAVER 검색어트렌드의 0~100 상대지수입니다. 최근 30일을 일 단위로 보고 최근 7일 평균은 현재 수요 힌트로만 사용합니다. ${durabilityNote} 원 질문 한 문장이 아니라 관련 검색 의도군을 묶어 확인합니다. API 제한 때문에 최대 5개 후보씩 나눠 조회하므로 서로 다른 comparisonBatch의 ratio 절대값은 직접 비교하지 않습니다. 최근성이 약하거나 트렌드가 없다는 이유 하나만으로 에버그린 후보를 탈락시키지 않습니다.`,
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
    };

    return { bundleSignals, bundle };
  }

  // 후보 10~15개를 전부 직렬 조회하면 느려질 수 있어 3개씩 병렬로 보조 API를 수집합니다.
  for (const batch of chunk(reviewClusters, 3)) {
    const enriched = await Promise.all(batch.map((cluster) => enrichCluster(cluster)));
    enriched.forEach(({ bundleSignals, bundle }) => {
      allSignals.push(...bundleSignals);
      evidenceBundles.push(bundle);
    });
  }

  const editorialContext = buildEditorialContext(
    evidenceBundles,
    body.siteUrl,
    siteContents,
    searchPerformance,
  );
  const reviewPrompt = buildTopicReviewPrompt(evidenceBundles, {
    generatedAt: createdAt,
    seeds: seedSummary,
    cooldown,
    editorialContext,
    focusedSourceQuestion: sourceQuestion,
  });

  return NextResponse.json({
    generatedAt: createdAt,
    offset,
    seeds: seedSummary,
    signals: allSignals,
    evidenceBundles,
    reviewPrompt,
    editorialContext,
    errors: Array.from(new Set(errors)).slice(0, 12),
    cooldown,
    sourceQuestion,
  });
}
