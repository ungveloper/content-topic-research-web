import type {
  Candidate,
  ContentMode,
  Penalties,
  ScoreInputs,
  Signal,
  SignalKind,
} from "@/lib/types";

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  "naver-blog": "네이버 블로그",
  "naver-cafe": "네이버 카페",
  "naver-kin": "네이버 지식iN",
  "naver-news": "네이버 뉴스",
  "naver-web": "네이버 웹문서",
  "naver-trends": "네이버 검색어트렌드",
  "google-trends": "Google Trends",
  "search-console": "Search Console",
  official: "공식 자료",
  community: "커뮤니티/Q&A",
  manual: "직접 메모",
};

export const CONTENT_MODE_LABELS: Record<ContentMode, string> = {
  "direct-experience": "직접 경험형",
  "research-verification": "조사·검증형",
  "comparison-analysis": "비교·분석형",
};

const POSITIVE_WEIGHTS: Record<keyof ScoreInputs, number> = {
  siteFit: 15,
  problemSpecificity: 20,
  demand: 15,
  officialEvidence: 15,
  originalValue: 25,
  evergreen: 10,
};

const PENALTY_POINTS: Record<keyof Penalties, number> = {
  ymyl: 15,
  newsRewrite: 18,
  duplicate: 15,
  aiCommodity: 12,
  weakEvidence: 12,
};

export function scoreCandidate(candidate: Candidate) {
  const positive = (Object.keys(POSITIVE_WEIGHTS) as (keyof ScoreInputs)[]).reduce(
    (sum, key) => sum + (candidate.scoreInputs[key] / 5) * POSITIVE_WEIGHTS[key],
    0,
  );

  const penalty = (Object.keys(PENALTY_POINTS) as (keyof Penalties)[]).reduce(
    (sum, key) => sum + (candidate.penalties[key] ? PENALTY_POINTS[key] : 0),
    0,
  );

  return Math.max(0, Math.min(100, Math.round(positive - penalty)));
}

export function verdict(score: number) {
  if (score >= 78) return { label: "우선 제작", tone: "good" as const };
  if (score >= 60) return { label: "보완 후 제작", tone: "warn" as const };
  return { label: "제작 보류", tone: "bad" as const };
}

export function makeId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

export function signalRole(kind: SignalKind) {
  switch (kind) {
    case "google-trends":
    case "naver-trends":
      return "수요와 발행 시기 판단";
    case "search-console":
      return "내 사이트가 이미 잡고 있는 검색 기회";
    case "naver-news":
      return "정책·제품·생활 정보의 변경 감지";
    case "official":
      return "사실 검증과 기준 확인";
    case "naver-cafe":
    case "naver-kin":
    case "community":
      return "사용자가 실제로 막히는 지점 탐색";
    case "naver-blog":
      return "표현·사례·문제 패턴 탐색";
    case "naver-web":
      return "공개 웹문서에서 추가 자료와 원문 후보 탐색";
    default:
      return "주제 가설과 관찰 기록";
  }
}

export function candidatePrompt(candidate: Candidate, signals: Signal[]) {
  const linked = signals.filter((signal) => candidate.sourceSignalIds.includes(signal.id));
  const sources = linked.length
    ? linked
        .map(
          (signal, index) =>
            `${index + 1}. [${SIGNAL_LABELS[signal.kind]}] ${signal.title}${signal.url ? `\n   ${signal.url}` : ""}`,
        )
        .join("\n")
    : "연결된 조사 신호 없음";

  const modeInstruction =
    candidate.contentMode === "direct-experience"
      ? "직접 경험형이다. 사용자가 실제로 제공한 경험·사진·수치만 1인칭으로 쓴다. 제공되지 않은 경험은 절대 만들어내지 않는다."
      : candidate.contentMode === "comparison-analysis"
        ? "비교·분석형이다. 여러 공식 자료와 사례의 공통점·차이·예외를 비교해 새로운 결과물을 만든다."
        : "조사·검증형이다. 웹 조사를 실제 작업으로 삼고, 공식자료와 공개 사례를 교차 확인한다. 직접 체험한 것처럼 쓰지 않는다.";

  return `너는 검색용 정보글을 대량 생산하는 작성자가 아니라, 증거 기반 콘텐츠 에디터다.

[주제]
${candidate.title}

[독자가 해결하려는 문제]
${candidate.problem || "아직 입력되지 않음"}

[대상 독자]
${candidate.audience || "아직 입력되지 않음"}

[사이트 주제]
${candidate.siteTheme || "아직 입력되지 않음"}

[콘텐츠 방식]
${CONTENT_MODE_LABELS[candidate.contentMode]}
${modeInstruction}

[이 글에서 반드시 만들어야 하는 고유 결과물]
${candidate.uniqueOutput || "기존 검색 결과를 재정리하는 수준을 넘는 비교표·판단 흐름·체크리스트·변경점·직접 자료 중 하나를 먼저 설계한다."}

[검증 계획]
${candidate.verificationPlan || "공식 원문을 우선 확인하고, 커뮤니티 사례는 문제 발견 용도로만 사용한다."}

[직접 확보한 증거]
${candidate.directEvidence || "없음. 직접 경험을 꾸며내지 않는다."}

[조사 신호]
${sources}

[핵심 원칙]
- 검색 트렌드는 WHAT이 아니라 WHEN 판단에 사용한다.
- 뉴스는 원문 재작성용이 아니라 변경 감지용으로 사용한다.
- 카페·지식iN·커뮤니티는 사실 근거가 아니라 실제 불편과 질문 표현을 찾는 데 사용한다.
- 사실은 공식기관·제조사·원문 자료로 검증한다.
- 한 키워드당 한 글을 기계적으로 만들지 않는다. 같은 문제는 하나의 완결된 페이지로 클러스터링한다.
- 사용자가 경험하지 않은 일을 “직접 해봤다”, “사용해봤다”, “방문했다”라고 쓰지 않는다.
- 동일한 목차와 결론을 다른 주제에 반복하지 않는다.
- 글자 수를 채우기 위한 문장을 쓰지 않는다.
- 건강·안전·재정 등 YMYL 주제는 전문성·출처가 부족하면 게시를 보류한다.

[작성 전 반드시 답할 질문]
1. 이 페이지에서 이 사이트만 제공할 수 있는 결과물은 무엇인가?
2. AI가 웹 검색 없이도 일반론으로 쓸 수 있는 수준은 아닌가?
3. 직접 경험과 조사 결과가 명확히 구분되는가?
4. 공식 근거를 확인할 수 있는가?
5. 기존 글과 검색 의도가 실질적으로 중복되지 않는가?

위 질문에 답한 뒤, 먼저 “게시 가능 / 보완 필요 / 게시 보류” 중 하나를 판단하고 근거를 제시한다. 게시 가능일 때만 글의 구조와 초안을 작성한다.`;
}

export function defaultCandidate(signal?: Signal): Candidate {
  const now = new Date().toISOString();
  return {
    id: makeId("candidate"),
    title: signal?.query || signal?.title || "",
    problem: signal?.title || "",
    audience: "",
    siteTheme: "생활 문제 해결 · 디지털 생활",
    contentMode: "research-verification",
    sourceSignalIds: signal ? [signal.id] : [],
    scoreInputs: {
      siteFit: 4,
      problemSpecificity: 3,
      demand: signal?.metrics?.impressions || signal?.metrics?.trendScore ? 4 : 3,
      officialEvidence: 3,
      originalValue: 3,
      evergreen: 4,
    },
    penalties: {
      ymyl: false,
      newsRewrite: signal?.kind === "naver-news",
      duplicate: false,
      aiCommodity: true,
      weakEvidence: false,
    },
    uniqueOutput: "",
    verificationPlan: "",
    directEvidence: "",
    createdAt: now,
    updatedAt: now,
  };
}
