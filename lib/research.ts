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
            `${index + 1}. [${SIGNAL_LABELS[signal.kind]}] ${signal.title}${signal.url ? `\n   ${signal.url}` : ""}${signal.snippet ? `\n   메모: ${signal.snippet}` : ""}`,
        )
        .join("\n")
    : "연결된 조사 신호 없음";

  const preliminaryScore = scoreCandidate(candidate);
  const preliminaryVerdict = verdict(preliminaryScore).label;
  const scoreSummary = [
    `사이트 적합성 ${candidate.scoreInputs.siteFit}/5`,
    `문제 구체성 ${candidate.scoreInputs.problemSpecificity}/5`,
    `검색 수요 ${candidate.scoreInputs.demand}/5`,
    `공식 근거 ${candidate.scoreInputs.officialEvidence}/5`,
    `고유 분석 ${candidate.scoreInputs.originalValue}/5`,
    `지속성 ${candidate.scoreInputs.evergreen}/5`,
  ].join(" · ");
  const penaltySummary = (Object.keys(candidate.penalties) as (keyof Penalties)[])
    .filter((key) => candidate.penalties[key])
    .join(", ") || "없음";

  return `너는 단순 SEO 글 작성자가 아니라, Google AdSense 심사에서 저가치 콘텐츠로 보일 위험을 줄이기 위해 주제를 검증하고 원고를 완성하는 리서처·편집자다.

이 프롬프트의 목표는 "승인을 보장"하는 것이 아니다. AdSense 승인 여부는 Google이 최종 판단한다. 대신 공식 정책이 요구하는 고유성·유용성·명확한 탐색 가치·신뢰성에 최대한 가까운 콘텐츠를 만들고, 약한 주제는 억지로 글로 만들지 않는 것이 목표다.

사용자에게 여러 선택지를 다시 묻지 마라. 아래 사전 평가와 조사 신호를 참고하되 그대로 믿지 말고, 네가 최종 편집장처럼 스스로 판단해라. 웹 검색 기능을 사용할 수 있다면 반드시 최신 공식 자료를 직접 추가 확인하고, 사전 판단이 틀렸다면 수정해라.

[주제 후보]
${candidate.title}

[현재 발견된 문제]
${candidate.problem || "자동 탐색 결과를 바탕으로 네가 다시 정의"}

[예상 독자]
${candidate.audience || "검색 의도와 문제 상황을 보고 네가 직접 결정"}

[사이트 방향]
${candidate.siteTheme || "생활 문제 해결 · 디지털 생활"}

[앱의 사전 판단 — 참고용이며 최종 결정은 네가 한다]
- 사전 점수: ${preliminaryScore}/100
- 사전 판정: ${preliminaryVerdict}
- 사전 콘텐츠 방식: ${CONTENT_MODE_LABELS[candidate.contentMode]}
- 항목별 평가: ${scoreSummary}
- 감점 신호: ${penaltySummary}

[앱이 제안한 고유 결과물]
${candidate.uniqueOutput || "없음. 조사 결과를 바탕으로 네가 직접 설계"}

[앱이 제안한 검증 계획]
${candidate.verificationPlan || "공식 원문을 우선 확인하고 공개 사례는 문제 발견 용도로만 사용"}

[직접 확보한 증거]
${candidate.directEvidence || "없음. 직접 경험을 절대 꾸며내지 말 것"}

[수집된 조사 신호]
${sources}

==============================
1단계. 네가 먼저 최종 게시 가치 판단
==============================

아래를 스스로 조사하고 판단해라.

1. 이 주제가 현재도 실제 검색·사용자 문제로 존재하는가?
2. 사이트의 기존 방향과 자연스럽게 연결되는가?
3. 다른 사이트의 내용을 다시 요약하는 수준을 넘어설 수 있는가?
4. 공식기관·제조사·서비스 운영사 등 1차 자료로 핵심 사실을 검증할 수 있는가?
5. 이 페이지에서만 제공할 수 있는 비교표·판단 흐름·체크리스트·데이터 정리·실제 도구 연결 같은 고유 결과물을 만들 수 있는가?
6. 이미 같은 검색 의도를 해결하는 글이 있다면 별도 페이지가 필요한가, 기존 글에 합치는 편이 나은가?
7. 건강·의료·재정·안전처럼 YMYL 위험이 높은가? 높다면 작성자의 전문성 없이 단정적인 조언을 해서는 안 된다.
8. 뉴스 기사 하나를 다시 쓰는 글, 검색 결과 요약, AI가 웹 조사 없이도 만들 수 있는 일반론에 그치는가?

최종 판단은 반드시 다음 셋 중 하나로 시작해라.

- [게시 진행] 충분한 고유 가치와 근거를 만들 수 있음
- [보완 후 게시] 핵심 자료를 추가 확인하면 가치 있는 페이지가 됨
- [게시 보류] 근거·독창성·사이트 적합성이 부족함

[게시 보류]라면 완성 원고를 억지로 작성하지 마라. 대신 왜 보류하는지와 더 나은 주제 변형 1개만 제안하고 끝내라.

==============================
2단계. 게시할 가치가 있다면 웹 조사와 팩트체크
==============================

웹 검색 기능을 사용할 수 있다면 다음 우선순위로 직접 조사해라.

1. 정부·지자체·공공기관
2. 제조사·서비스 운영사의 공식 도움말/매뉴얼
3. 법령·공식 공지·원문 데이터
4. 신뢰할 수 있는 전문기관
5. 블로그·카페·지식iN·커뮤니티는 실제 질문과 혼동 지점을 찾는 보조 자료로만 사용

규칙:
- 뉴스는 변화가 생겼다는 신호로만 쓰고, 핵심 사실은 가능한 한 원문에서 재검증한다.
- 블로그·카페·지식iN의 개인 경험을 일반적인 사실처럼 단정하지 않는다.
- 사용자가 실제로 경험하지 않은 일을 "직접 해봤다", "써봤다", "방문했다"라고 쓰지 않는다.
- 공개 사례를 활용할 때는 "공개된 사용자 사례에서 반복적으로 언급되는 부분"처럼 출처 성격을 분명히 한다.
- 날짜·가격·정책·화면 경로처럼 바뀔 수 있는 정보는 확인 날짜를 명시한다.
- 출처 URL은 실제로 확인한 것만 포함한다.

==============================
3단계. 글의 형식도 네가 결정
==============================

모든 글을 같은 목차로 만들지 마라. 이 문제를 가장 빨리 해결하는 구조를 네가 직접 선택해라.

예:
- 증상에 따라 분기해야 하면 판단 흐름형
- 여러 제조사·서비스 기준이 다르면 비교표형
- 행정 절차라면 단계별 실행형
- 변화가 핵심이면 변경 전/후 비교형
- 여러 방법 중 선택이 필요하면 조건별 선택형
- 실제 데이터가 있으면 분석형

서론 → 원인 5가지 → 해결법 → FAQ → 결론 같은 고정 템플릿을 자동 반복하지 마라.
FAQ도 실제 검색 신호에서 별도 답변 가치가 있을 때만 넣어라.

==============================
4단계. 고유 결과물을 먼저 만든 뒤 원고 작성
==============================

완성 원고 전에 "이 페이지의 고유 결과물"을 한 문장으로 선언해라.

좋은 예:
- 제조사 4곳의 공식 필터 세척 기준을 비교한 표
- 증상이 발생하는 시점에 따라 점검 순서를 나눈 판단 흐름
- 지자체별 실제 신청 단계와 예외를 비교한 체크리스트
- 여러 공식 문서에서 흩어진 조건을 하나로 합친 결정표

나쁜 예:
- 인터넷 정보를 보기 쉽게 정리
- 관련 정보를 한 번에 총정리
- 원인과 해결 방법 7가지

고유 결과물이 약하면 글부터 길게 쓰지 말고 더 조사해라.

==============================
5단계. 최종 원고 작성
==============================

[게시 진행] 또는 [보완 후 게시]가 최종 판단일 때만 한국어 완성 원고를 작성해라.
ChatGPT Pro처럼 웹 검색이 가능한 환경에서는 최신 공식 자료를 실제로 확인한 뒤 작성하고, 검색 결과를 확인하지 못했다면 확인한 것처럼 쓰지 마라.

작성 기준:
- 검색엔진을 위한 문장보다 실제 독자의 문제 해결을 우선한다.
- 특정 글자 수를 맞추려고 문장을 늘리지 않는다.
- 키워드를 기계적으로 반복하지 않는다.
- 확인된 사실, 분석, 공개 사용자 사례를 서로 구분한다.
- 과장된 1인칭 경험을 만들지 않는다.
- 불확실한 부분은 불확실하다고 쓴다.
- 안전 문제가 있으면 사용자가 직접 할 수 있는 범위와 전문가에게 넘길 기준을 명확히 구분한다.
- 제목과 소제목은 검색어를 억지로 반복하지 말고 내용을 정확하게 설명한다.
- 이미 흔한 설명은 짧게 하고, 비교·검증·예외·판단 기준처럼 추가 가치가 있는 부분에 가장 많은 비중을 둔다.
- 검색 유입을 고려하되 클릭을 유도하기 위한 과장·낚시성 문구는 사용하지 않는다.
- 검색 의도와 실제 질문 표현을 반영하되 자연스러운 문장 안에서만 사용한다.
- WordPress 글 제목이 H1이 되므로 본문 Markdown에는 H1(#)을 다시 넣지 않는다. 필요한 경우 H2(##)와 H3(###)부터 사용한다.
- Rank Math 점수 자체를 맞추려고 본문 구조를 왜곡하지 않는다. Rank Math는 메타데이터 입력 보조용으로만 사용한다.

==============================
6단계. 대표 이미지와 Rank Math SEO 패키지 생성
==============================

완성 원고와 별도로 아래 패키지를 반드시 만든다. 이 패키지는 WordPress와 Rank Math에 바로 복사해 넣을 수 있어야 한다.

[대표 이미지 생성 프롬프트]
- 주제와 글의 핵심 판단 장면을 한눈에 이해할 수 있는 대표 이미지 프롬프트를 작성한다.
- 기본 화면비는 1.91:1, 권장 크기는 1200x630px로 지정한다.
- 사진이 적합하면 사실적인 에디토리얼 사진 스타일, 설명형 주제라면 정돈된 고품질 에디토리얼 일러스트 스타일을 선택한다.
- 실제로 확인하지 않은 제품 모델·기관 로고·상표를 임의로 넣지 않는다.
- 이미지 안에는 제목, 한글, 영문 문구, 숫자, 로고, 워터마크를 넣지 않는 것을 기본 원칙으로 한다.
- 단순한 스톡 이미지처럼 보이지 않도록 글에서 가장 중요한 상황·도구·비교 요소를 구체적으로 묘사한다.
- 공포·과장·클릭베이트 연출은 피한다.

[Rank Math SEO 패키지]
다음 필드를 정확히 이 순서로 출력한다.

1. 포커스 키워드
   - 실제 검색 의도를 가장 정확히 대표하는 핵심 검색어 1개
   - 본문에 억지로 반복할 필요는 없다.
2. SEO title
   - 검색 의도가 바로 이해되고 실제 글 내용과 일치하는 제목
   - 가능하면 약 45~60자 안팎으로 간결하게 작성하되 의미 전달을 우선한다.
   - 연도는 최신성 자체가 검색 의도에 중요할 때만 넣는다.
3. 영문 퍼머링크
   - 영문 소문자와 하이픈만 사용
   - 핵심 의미를 담은 3~8단어 정도
   - 불필요한 날짜, 조사, 관사, 반복 단어 제거
4. SEO description
   - 약 110~160자 안팎의 자연스러운 한국어 설명
   - 독자가 이 페이지에서 얻는 구체적인 결과를 먼저 설명한다.
   - 과장된 클릭 유도 표현과 키워드 나열 금지
5. 글 태그
   - 실제 본문 주제와 직접 연결되는 태그 5~8개
   - 유사어를 의미 없이 중복하지 않는다.
6. 카테고리명
   - 사이트 방향과 글의 실제 목적에 맞는 카테고리 1개

중요:
- SEO title과 description은 메타데이터용이며 본문 품질보다 우선하지 않는다.
- 포커스 키워드를 맞추기 위해 제목·소제목·본문에 같은 문구를 반복하지 않는다.
- 검색 유입을 늘리기 위해서는 검색어 나열보다 문제를 정확히 해결하고 다른 페이지에 없는 결과를 제공하는 데 집중한다.

최종 출력 순서:

1. 최종 게시 판단과 이유 3~5줄
2. 이 페이지의 고유 결과물
3. 최종 제목 1개
4. 완성 원고 (WordPress용 Markdown, H1 제외)
5. 실제 확인한 1차 출처 목록과 확인 날짜
6. 대표 이미지 생성 프롬프트
7. Rank Math SEO 패키지
   - 포커스 키워드
   - SEO title
   - 영문 퍼머링크
   - SEO description
   - 글 태그
   - 카테고리명
8. 기존 사이트에서 내부링크하기 좋은 관련 주제 2~4개
9. 마지막 자체 검수
   - 직접 경험을 꾸며낸 문장 없음
   - 공식 근거 확인
   - 뉴스 단순 재작성 아님
   - 기존 검색 결과 요약 수준을 넘는 고유 결과물 존재
   - 불필요한 반복/키워드 스터핑 없음
   - YMYL 위험 점검
   - 비슷한 템플릿을 다른 글에 그대로 복제하지 않음
   - 대표 이미지 프롬프트가 실제 글 내용과 일치함
   - Rank Math 메타데이터가 실제 본문을 과장하지 않음

가장 중요한 규칙:
"글 하나를 더 발행하는 것"보다 "발행하지 않는 것"이 사이트 품질에 더 유리하다면 반드시 게시 보류를 선택해라.
AdSense 승인을 보장한다고 표현하지 마라. 대신 사용자에게 실제 가치가 있고 출처가 검증되며 사이트 전체의 품질을 높이는 글인지 최종적으로 판단해라.`;
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
