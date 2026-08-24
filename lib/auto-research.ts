import type { ContentMode } from "@/lib/types";

export type AutoResearchCategory =
  | "home-care"
  | "digital-life"
  | "living-admin"
  | "organization"
  | "seasonal-living";

/**
 * 자동 탐색에서 사용하는 값은 '완성된 글 주제'가 아니라 넓은 탐색 범위입니다.
 * NAVER 지식iN의 실제 질문에서 최종 문제를 먼저 발견하기 위한 출발점으로만 사용합니다. 이후 다른 5개 API로 교차 검증합니다.
 */
export type AutoResearchSeed = {
  query: string;
  category: AutoResearchCategory;
  audience: string;
  evergreen: number;
  contentMode: ContentMode;
  uniqueOutput: string;
  verificationPlan: string;
};

type DiscoveryScope = {
  category: AutoResearchCategory;
  queries: string[];
  audience: string;
  evergreen: number;
  contentMode: ContentMode;
  uniqueOutput: string;
  verificationPlan: string;
};

const BASE_SCOPES: DiscoveryScope[] = [
  {
    category: "home-care",
    queries: ["생활가전 문제 해결", "집안 가전 불편", "가전 관리 고민", "집 관리 문제", "생활기기 오류"],
    audience: "집에서 사용하는 가전·생활기기의 구체적인 문제를 직접 확인 가능한 범위부터 해결하려는 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "실제 질문에서 증상 분기를 뽑고 제조사 공식 문서와 대조한 문제별 판단 흐름",
    verificationPlan: "제조사 고객지원·사용설명서를 우선 확인하고 지식iN·카페는 사용자가 막히는 지점을 찾는 용도로만 사용한다.",
  },
  {
    category: "digital-life",
    queries: ["스마트폰 사용 문제", "앱 설정 오류", "디지털 생활 불편", "휴대폰 데이터 문제", "컴퓨터 사용 고민"],
    audience: "스마트폰·컴퓨터·온라인 서비스의 설정, 저장공간, 계정, 데이터 문제를 안전하게 해결하려는 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "공식 도움말과 실제 사용자 질문을 교차해 화면 경로·실패 조건·데이터 손실 위험을 분리한 실무 가이드",
    verificationPlan: "서비스·OS·제조사 공식 도움말을 기준으로 확인하고 공개 사례는 혼동 지점 탐색에만 사용한다.",
  },
  {
    category: "living-admin",
    queries: ["대형폐기물 신청", "주민센터 서류 발급", "공공시설 이용 방법", "이사 생활 서비스", "주소 변경 생활 절차"],
    audience: "폐기물·서류 발급·공공시설·이사처럼 비의료·비법률·비재정 생활 행정 절차를 정확히 완료하려는 사용자",
    evergreen: 4,
    contentMode: "research-verification",
    uniqueOutput: "공식 신청 페이지를 기준으로 준비물·진행 단계·예외·완료 확인을 다시 배열한 실행 체크리스트",
    verificationPlan: "정부·지자체·공공기관 원문을 기준으로 절차와 날짜를 검증한다. 의료·법률·세금·연금·보험·투자·대출 등 고위험 주제는 후보에서 제외하고 뉴스는 변경 감지용으로만 사용한다.",
  },
  {
    category: "organization",
    queries: ["집 정리 보관 고민", "생활용품 정리 문제", "주방 정리 보관", "옷 정리 보관", "공간 정리 불편"],
    audience: "집안 물건·식품·옷을 실제 생활 동선과 보관 조건에 맞게 정리하고 유지하려는 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "보관 조건·사용 빈도·공간 제약을 기준으로 여러 정리법의 장단점을 나눈 선택표",
    verificationPlan: "안전·식품·세탁 관련 사실은 공식 자료로 확인하고 정리 방식은 여러 공개 사례를 비교해 조건별 차이를 만든다.",
  },
];

const SEASONAL_QUERIES: Record<number, string[]> = {
  1: ["한파 생활 불편", "겨울 집 관리", "겨울 가전 문제", "결로 동파 생활"],
  2: ["이사철 생활 준비", "겨울 끝 집 정리", "봄 준비 생활", "이사 생활 서비스"],
  3: ["봄철 집 관리", "환절기 생활 불편", "여름 전 가전 점검", "봄 정리 보관"],
  4: ["봄 생활 정리", "여름 준비 집 관리", "계절 옷 보관", "봄철 생활 문제"],
  5: ["초여름 생활 불편", "여름 가전 준비", "계절 이불 보관", "집안 습도 관리"],
  6: ["장마 생활 불편", "여름 빨래 문제", "습기 집 관리", "여름 가전 관리"],
  7: ["폭염 생활 불편", "여름 가전 문제", "냉방 생활 고민", "장마 후 집 관리"],
  8: ["여름 생활 불편", "폭염 집 관리", "여름 가전 관리", "가을 준비 생활", "8월 생활 문제"],
  9: ["가을 생활 준비", "환절기 집 관리", "난방 전 점검", "가을 정리 보관"],
  10: ["가을 집 관리", "겨울 준비 생활", "난방 생활 문제", "가습 생활 관리"],
  11: ["초겨울 생활 불편", "겨울 가전 관리", "계절 이불 정리", "난방 집 관리"],
  12: ["한파 생활 준비", "겨울 집 관리", "연말 정리 보관", "동파 생활 문제"],
};

function dayOfYear(date: Date) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 0);
  return Math.floor((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
}

function pickRotating<T>(items: T[], index: number) {
  if (!items.length) throw new Error("탐색 범위가 비어 있습니다.");
  return items[((index % items.length) + items.length) % items.length];
}

export function getAutoResearchSeeds(date: Date, offset = 0, count = 5): AutoResearchSeed[] {
  const day = dayOfYear(date);
  const month = date.getUTCMonth() + 1;
  const rotation = Math.max(0, offset);

  const seasonal: DiscoveryScope = {
    category: "seasonal-living",
    queries: SEASONAL_QUERIES[month] || ["계절 생활 불편"],
    audience: "지금 계절에 반복해서 생기는 생활 문제를 최신 공식 기준으로 확인하려는 사용자",
    evergreen: 3,
    contentMode: "research-verification",
    uniqueOutput: "현재 시점의 질문·변경 신호와 공식 기준을 교차해 만든 계절 문제 해결표",
    verificationPlan: "현재 연도와 날짜를 명시하고 제조사·지자체·공공기관의 최신 원문을 우선 확인한다.",
  };

  const scopes = [...BASE_SCOPES, seasonal];
  const selected = scopes.map((scope, scopeIndex) => ({
    query: pickRotating(scope.queries, day + rotation * 3 + scopeIndex * 2),
    category: scope.category,
    audience: scope.audience,
    evergreen: scope.evergreen,
    contentMode: scope.contentMode,
    uniqueOutput: scope.uniqueOutput,
    verificationPlan: scope.verificationPlan,
  }));

  return selected.slice(0, Math.max(1, Math.min(count, selected.length)));
}

export function autoResearchCategoryLabel(category: AutoResearchCategory) {
  const labels: Record<AutoResearchCategory, string> = {
    "home-care": "생활기기·집 관리",
    "digital-life": "디지털 생활",
    "living-admin": "생활 행정",
    organization: "정리·보관",
    "seasonal-living": "계절 생활",
  };
  return labels[category];
}

const STOP_WORDS = new Set([
  "방법", "관련", "문의", "질문", "궁금", "궁금해요", "궁금합니다", "알려주세요", "알려", "어떻게",
  "되나요", "될까요", "인가요", "할까요", "해주세요", "추천", "추천해주세요", "정도", "혹시", "문의드립니다",
  "때", "경우", "문제", "해결", "사용", "가능", "확인", "평균",
]);

const STRONG_THEME_WORDS = [
  "필터", "배터리", "저장공간", "사진", "청소", "세척", "정리", "보관", "폐기물", "신청", "신고",
  "냄새", "소음", "누수", "배수", "충전", "데이터", "계정", "건조", "교체", "수명", "비용",
];

const ENTITY_WORDS = [
  "에어컨", "공기청정기", "세탁기", "건조기", "냉장고", "가습기", "보일러", "전자레인지", "도어락",
  "노트북", "스마트폰", "아이폰", "갤럭시", "인스타그램", "카카오톡", "구글", "윈도우", "맥북",
  "매트리스", "소파", "옷", "이불", "냉장고", "대형폐기물", "쓰레기",
];

export function topicTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function topicSimilarity(a: string, b: string) {
  const left = new Set(topicTokens(a));
  const right = new Set(topicTokens(b));
  if (!left.size || !right.size) return 0;

  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  const jaccard = union ? intersection / union : 0;

  const compactA = [...left].join("");
  const compactB = [...right].join("");
  const containment = Math.min(left.size, right.size) > 0
    ? intersection / Math.min(left.size, right.size)
    : 0;
  const contains = compactA.includes(compactB) || compactB.includes(compactA) ? 0.18 : 0;

  return Math.min(1, jaccard * 0.65 + containment * 0.35 + contains);
}

export function topicEntity(value: string) {
  return ENTITY_WORDS.find((word) => value.includes(word)) || "";
}

export function topicTheme(value: string) {
  return STRONG_THEME_WORDS.find((word) => value.includes(word)) || "";
}

export function isSameTopicCluster(a: string, b: string) {
  const similarity = topicSimilarity(a, b);
  if (similarity >= 0.5) return true;

  const entityA = topicEntity(a);
  const entityB = topicEntity(b);
  const themeA = topicTheme(a);
  const themeB = topicTheme(b);
  return Boolean(entityA && entityA === entityB && themeA && themeA === themeB);
}
