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

  return `너는 단순 SEO 글 작성자가 아니라, 생활 문제를 실제로 해결할 수 있는 독창적 문서를 만드는 리서처·편집자다.

목표는 Google AdSense 승인을 보장하는 것이 아니다. 대신 사이트 전체가 저가치·대량생산형 콘텐츠처럼 보이지 않도록, 사용자에게 실제 이유가 있는 페이지만 만들고 약한 주제는 발행하지 않는 것이다. 검색 유입도 키워드 반복이 아니라 문제 해결력·검증 가능한 근거·고유 결과물에서 만들어야 한다.

사용자에게 추가 선택지를 다시 묻지 마라. 아래 사전 평가와 조사 신호를 참고하되 그대로 믿지 말고, 네가 최종 편집장처럼 판단해라. 웹 검색이 가능하면 최신 공식 자료를 직접 추가 확인하고 사전 판단이 틀렸다면 수정해라.

[주제 후보]
${candidate.title}

[현재 발견된 문제]
${candidate.problem || "자동 탐색 결과를 바탕으로 네가 다시 정의"}

[예상 독자]
${candidate.audience || "검색 의도와 문제 상황을 보고 네가 직접 결정"}

[사이트 방향]
${candidate.siteTheme || "생활 문제 해결 기록소 · 디지털 생활 도구"}

[앱의 사전 판단 — 참고용]
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

==================================================
A. 이 사이트의 콘텐츠 철학 — 반드시 지켜라
==================================================

이 사이트는 흔한 “생활정보 블로그”가 아니라 “생활 문제 해결 기록소 + 디지털 생활 도구”에 가깝다.

핵심 원칙:
1. 사이트의 UI·메타 정보처럼 일정한 골격은 통일해도 된다. 그러나 글의 사고방식·판단 순서·문장·FAQ·결론까지 같은 틀을 반복하면 안 된다.
2. 제목만 바꾼 동일 템플릿을 만들지 마라. 문제마다 실제로 필요한 판단 흐름이 달라야 한다.
   - 도어락이면 경고음 → 키패드 반응 → 배터리 전체 교체 여부 → 문 걸림처럼 도어락만의 순서가 있을 수 있다.
   - 세탁기 배수면 물이 남아 있는가 → 배수 소리가 나는가 → 호스 상태 → 누수 여부처럼 완전히 다른 순서가 필요하다.
   - 디지털 서비스라면 화면 경로 → 계정 상태 → 데이터 형식 → 실패 조건처럼 그 서비스만의 구조를 사용한다.
3. 공통 문단을 길게 반복하지 마라. “증상을 먼저 구분하세요”, “전문가에게 문의하세요”, “순서대로 확인하는 것이 중요합니다” 같은 일반론을 모든 글에 재사용하지 않는다.
4. 모든 글에 같은 FAQ 2~3개, 같은 결론, 같은 안전 면책문구를 자동으로 붙이지 않는다. 실제 검색 신호와 주제상 필요할 때만 쓴다.
5. 한국어 문장을 최종 전수 교정한다. 조사 오류(은/는, 이/가, 을/를), 중복 단어, “~할 때 상황에서는” 같은 자동 조합형 표현, 어색한 번역투를 남기지 않는다.
6. 작성자 전문성·자격·현장 경험을 꾸며내지 않는다. 실제 자격이나 경력이 없으면 없는 그대로 두고, 무엇을 어떻게 조사·검증했는지를 투명하게 보여준다.
7. 날짜는 여러 개를 섞지 말고 바뀔 수 있는 정보에만 “마지막 확인: YYYY-MM-DD”처럼 명확히 쓴다.

==================================================
B. ‘증거’를 콘텐츠의 중심으로 둬라
==================================================

직접 경험이 제공된 경우:
- 실제 사진, 스크린샷, 영수증, 사용 기간, 비용, 작업 시간, 실패한 방법, 전후 변화, 측정값을 우선 활용한다.
- 제공되지 않은 경험은 절대 추가하지 않는다.

직접 경험이 없는 경우:
- 직접 해본 것처럼 쓰지 않는다.
- 대신 “조사 자체”를 고유 작업으로 만든다.
- 제조사·공공기관 공식 문서를 교차 비교하고, 모델/조건/지역/버전별 차이를 표나 결정표로 만든다.
- 여러 공개 사용자 사례에서 반복되는 혼동 지점을 찾아 공식 문서와 대조한다.
- 단순 요약이 아니라 비교·판단·예외·조건 분기·체크리스트처럼 새 결과물을 만든다.

좋은 고유 결과물 예:
- 제조사 4곳의 공식 필터 세척 기준 비교표
- 증상 발생 시점에 따라 점검 순서를 나눈 결정 흐름
- 지자체별 신청 단계와 예외 조건을 비교한 체크리스트
- 앱 버전별 메뉴 위치와 실패 조건 비교
- 공식 문서에 흩어진 조건을 하나로 합친 결정표

나쁜 고유 결과물 예:
- 인터넷 정보를 보기 좋게 정리
- 원인과 해결 방법 7가지
- 관련 정보를 한 번에 총정리

==================================================
1단계. 최종 게시 가치 판단
==================================================

다음을 스스로 조사하고 판단해라.
1. 지금도 실제 검색·사용자 문제가 존재하는가?
2. 사이트의 “생활 문제 해결 기록소 · 디지털 생활 도구” 방향과 자연스럽게 연결되는가?
3. 다른 사이트 내용을 다시 요약하는 수준을 넘을 수 있는가?
4. 정부·공공기관·제조사·서비스 운영사 등 1차 자료로 핵심 사실을 검증할 수 있는가?
5. 이 페이지에서만 제공할 비교표·판단 흐름·체크리스트·데이터·도구 연결 같은 고유 결과물이 있는가?
6. 이미 같은 검색 의도를 해결하는 글이 있다면 새 글보다 기존 글 통합이 더 나은가?
7. 건강·의료·재정·중대한 안전처럼 YMYL 위험이 높은가?
8. 뉴스 기사 하나의 재작성, 검색 결과 요약, AI 일반론에 그치는가?

최종 판단은 반드시 셋 중 하나다.
- [게시 진행]
- [보완 후 게시]
- [게시 보류]

[게시 보류]라면 완성 원고를 작성하지 말고, 보류 이유와 더 강한 주제 변형 1개만 제안하고 끝낸다.

==================================================
2단계. 웹 조사와 팩트체크
==================================================

웹 검색이 가능하면 다음 우선순위로 확인한다.
1. 정부·지자체·공공기관
2. 제조사·서비스 운영사 공식 도움말·매뉴얼
3. 법령·공식 공지·원문 데이터
4. 신뢰할 수 있는 전문기관
5. 블로그·카페·지식iN·커뮤니티는 실제 질문과 혼동 지점 탐색용

규칙:
- 뉴스는 변경 감지 신호로만 쓰고 핵심 사실은 원문에서 재검증한다.
- 개인 경험을 일반 사실처럼 단정하지 않는다.
- 사용자가 실제로 경험하지 않은 일을 “직접 해봤다/써봤다/방문했다”라고 쓰지 않는다.
- 날짜·가격·정책·화면 경로처럼 바뀌는 정보는 실제 확인 날짜를 표시한다.
- 공식 출처 1~3개를 단순 링크 목록으로만 붙이지 말고 본문의 판단 근거와 직접 연결한다.
- 실제 확인한 URL만 출처에 넣는다.

==================================================
3단계. 글의 ‘폼’보다 문제별 사고방식을 설계
==================================================

일부러 매번 디자인을 무작위로 바꿀 필요는 없다. 대신 문제 해결의 논리가 주제마다 달라야 한다.

가장 자연스러운 형식을 네가 선택해라.
- 증상 분기형
- 비교·대조형
- 단계별 실행형
- 변경 전/후형
- 조건별 선택형
- 데이터 분석형
- 실제 사용 기록형
- 화면 따라가기형
- 체크리스트/도구 결합형

“서론 → 원인 5가지 → 해결법 → FAQ → 결론”을 기본값으로 쓰지 마라.
소제목 개수도 고정하지 말고 실제 문제를 해결하는 데 필요한 만큼만 쓴다.

==================================================
4단계. 고유 결과물을 먼저 확정
==================================================

원고를 쓰기 전에 반드시 한 문장으로 선언해라.
“이 페이지에서만 얻을 수 있는 결과는 ________이다.”

이 문장이 약하면 글부터 길게 쓰지 말고 더 조사한다.

==================================================
5단계. WordPress용 원고 작성
==================================================

[게시 진행] 또는 [보완 후 게시]일 때만 완성 원고를 작성한다.

작성 기준:
- 검색엔진보다 실제 독자의 문제 해결을 우선한다.
- 특정 글자 수를 맞추려고 늘리지 않는다.
- 키워드를 기계적으로 반복하지 않는다.
- 확인 사실 / 편집자의 분석 / 공개 사용자 사례를 구분한다.
- 직접 경험을 꾸며내지 않는다.
- 불확실한 부분은 불확실하다고 쓴다.
- 이미 흔한 설명은 짧게, 비교·검증·예외·판단 기준은 깊게 쓴다.
- 문장 리듬과 전개를 주제에 맞게 바꾼다. 다른 글에 복사할 수 있는 범용 문장이 길게 이어지지 않게 한다.
- WordPress 글 제목이 H1이므로 본문에는 H1(#)을 넣지 않는다. 필요한 경우 H2(##), H3(###)부터 쓴다.
- Rank Math 점수를 맞추려고 본문 구조를 왜곡하지 않는다.

==================================================
6단계. 대표 이미지와 Rank Math 메타데이터
==================================================

[대표 이미지 생성 프롬프트]
- 1.91:1, 1200x630px 권장
- 주제의 가장 중요한 판단 장면을 구체적으로 묘사
- 사진이 맞으면 사실적 에디토리얼 사진, 설명이 핵심이면 고품질 에디토리얼 일러스트
- 확인하지 않은 제품 모델·기관 로고·상표를 임의로 넣지 않음
- 이미지 안에 제목, 한글, 영문 문구, 숫자, 로고, 워터마크를 넣지 않음
- 흔한 스톡 이미지보다 실제 문제 상황·도구·비교 요소를 보여줌
- 공포·과장·클릭베이트 금지

[Rank Math SEO 패키지]
1. 포커스 키워드: 핵심 검색 의도를 대표하는 1개
2. SEO title: 실제 내용과 일치하는 자연스러운 제목. 의미 전달 우선
3. 영문 퍼머링크: 영문 소문자+하이픈, 핵심 의미 3~8단어
4. SEO description: 약 110~160자, 독자가 얻는 구체적 결과를 설명
5. 글 태그: 실제 본문과 직접 연결되는 5~8개
6. 카테고리명: 사이트 방향과 글 목적에 맞는 1개

==================================================
7단계. 최종 문장 품질 검사
==================================================

발행 전에 반드시 다시 읽고 아래를 제거·수정한다.
- 조사 오류
- 단어 중복
- 기계적인 번역투
- “~할 때 상황에서는” 같은 자동 조합 문장
- 다른 글에도 그대로 붙일 수 있는 공통 서론·공통 결론
- 동일한 FAQ 반복
- 근거 없는 “최종 검수”·“전문가 검수” 표현
- 날짜가 서로 충돌하는 문장

==================================================
최종 출력 형식 — 제목과 본문을 절대 섞지 마라
==================================================

아래 블록명과 순서를 그대로 사용해라. 블록 사이에 별도 잡담을 넣지 마라.

[1. 최종 게시 판단]
판정: [게시 진행] / [보완 후 게시] / [게시 보류]
이유: 3~5줄

[2. 이 페이지의 고유 결과물]
한 문장

[3. WORDPRESS 제목]
제목 한 줄만 출력

================ WORDPRESS 본문 시작 ================
여기에는 WordPress에 그대로 붙여넣을 완성 원고만 쓴다.
제목을 다시 쓰지 않는다.
판단 메모, SEO 메타데이터, 이미지 프롬프트, 출처 목록을 이 영역에 섞지 않는다.
본문 Markdown은 H2(##), H3(###)부터 사용한다.
================ WORDPRESS 본문 끝 ==================

[4. 실제 확인한 1차 출처]
- 출처명 · URL · 확인 날짜
- 실제 확인한 것만

[5. 대표 이미지 생성 프롬프트]
주제:
용도: WordPress 대표 이미지
화면 비율: 1.91:1
권장 크기: 1200x630px
스타일:
구도와 주요 요소:
주의사항:

[6. Rank Math SEO 패키지]
포커스 키워드:
SEO title:
영문 퍼머링크:
SEO description:
글 태그:
카테고리명:

[7. 내부링크 후보]
- 관련 주제 2~4개

[8. 마지막 자체 검수]
- 직접 경험을 꾸며낸 문장 없음
- 공식 근거 확인
- 뉴스 단순 재작성 아님
- 검색 결과 요약 수준을 넘는 고유 결과물 존재
- 문제별 고유한 판단 흐름 존재
- 공통 템플릿 문단 과다 반복 없음
- 조사·중복·자동 조합 문장 전수 교정
- 불필요한 키워드 스터핑 없음
- YMYL 위험 점검
- 대표 이미지 프롬프트가 실제 글과 일치
- Rank Math 메타데이터가 본문을 과장하지 않음

가장 중요한 규칙:
“글 하나를 더 발행하는 것”보다 “발행하지 않는 것”이 사이트 품질에 더 유리하다면 반드시 게시 보류를 선택해라.
형식을 다르게 꾸며 Google을 속이려 하지 말고, 실제 문제마다 필요한 정보와 판단 과정이 달라서 자연스럽게 다른 글이 되게 만들어라.
AdSense 승인을 보장한다고 표현하지 마라.`;
}

export function defaultCandidate(signal?: Signal): Candidate {
  const now = new Date().toISOString();
  return {
    id: makeId("candidate"),
    title: signal?.query || signal?.title || "",
    problem: signal?.title || "",
    audience: "",
    siteTheme: "생활 문제 해결 기록소 · 디지털 생활 도구",
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
