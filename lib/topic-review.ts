import type {
  ResearchEvidenceBundle,
  TopicReviewResult,
} from "@/lib/types";

type ReviewPromptContext = {
  generatedAt: string;
  seeds: Array<{ query: string; category: string }>;
  cooldown?: {
    usedDays: number;
    seenDays: number;
    usedCount: number;
    seenCount: number;
  };
};

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function buildTopicReviewPrompt(
  bundles: ResearchEvidenceBundle[],
  context: ReviewPromptContext,
) {
  const evidenceJson = compactJson({
    generatedAt: context.generatedAt,
    discoveryScopes: context.seeds,
    cooldown: context.cooldown || null,
    bundles,
  });

  return `너는 생활 문제 해결형 사이트의 수석 리서처이자 편집장이다. 지금은 글을 작성하는 단계가 아니다.

아래 JSON은 Content Topic Research 앱이 NAVER API HUB에서 직접 수집·정리한 오늘의 조사 데이터다.
앱의 역할은 API 호출, HTML 제거, 중복 제거, 최근 사용 주제 제외, 명백한 금지 주제 1차 차단, 출처 보존까지만이다.
최종 주제 선정과 의미 판단은 네가 맡는다.

[6개 데이터 소스의 역할]
1. 지식iN: 사람들이 실제로 현재 막히거나 궁금해하는 문제를 발견하는 출발점
2. 검색어트렌드: 현재 수요와 계절성 확인. 0~100은 상대지수이며 절대 검색량이 아니다
3. 카페: 같은 불편이 여러 사람에게 반복되는지 확인
4. 블로그: 이미 어떤 답변이 많이 존재하는지, 검색 결과에서 무엇이 빠져 있는지 확인
5. 뉴스: 최근 정책·제품·서비스·생활정보에 실제 변경이 있는지 감지. 뉴스 재작성용으로 사용하지 않는다
6. 웹문서: 정부·공공기관·제조사·서비스 운영사 등 1차 근거 후보를 찾는 용도. officialCandidate=true여도 실제 공식 원문인지 반드시 다시 확인한다

[최우선 목표]
- 검색 유입을 기대할 수 있으면서 실제 문제 해결 가치가 있는 소수의 주제만 엄선한다.
- AI가 제목만 바꿔 대량 발행하는 사이트처럼 보일 만한 주제·구조·변형은 적극적으로 버린다.
- 하루에 많은 글을 만들기 위해 후보를 억지로 살리지 않는다. 오늘 데이터가 약하면 0개를 선정해도 된다.
- 한 페이지가 하나의 검색 의도를 충분히 해결하게 하고, 같은 의도의 키워드 변형 글은 만들지 않는다.
- 가능하면 직접 테스트·측정으로 사이트만의 1차 데이터를 만들고, 그렇지 않은 주제는 공식 원문 교차검증으로 고유한 결정표·비교표·판단 흐름을 만든다.

[하드 제외]
다음은 수요가 높아도 무조건 exclude로 판단한다.
- 의료·건강: 질병, 증상, 진단, 치료, 약·복용, 임신·출산, 정신건강, 영양제 등
- 법률·분쟁: 소송, 고소·고발, 이혼, 상속, 노동법, 임대차 분쟁, 처벌·벌금 등
- 금융·재정: 대출, 보험, 투자, 주식·코인, 세금, 연금, 신용, 채무, 복지 급여·지원금 등
- 전문 안전 작업: 감전·누전, 가스 누출, 화재, 석면, 구조물 위험, 전문 전기·가스 공사, 위험한 전문 시공 등

[후보별 판단 기준]
각 bundle을 서로 비교하면서 아래를 판단한다.
- 실제 검색 의도: 사용자가 검색창에 그대로 입력할 법한 해결 문제인가
- 반복 수요: 지식iN과 카페에서 유사 문제가 여러 번 나타나는가
- 검색 시기: 검색어트렌드가 현재/계절적으로 의미가 있는가
- 포화도: 블로그에 이미 똑같은 일반론이 넘쳐나는가, 아니면 빠진 판단 기준이 있는가
- 변경성: 뉴스가 실제 변경 신호인지 단순 이슈성 기사인지
- 근거 품질: 웹문서에서 1차 공식 근거를 확보할 가능성이 충분한가
- 고유성: 이 사이트만의 측정값·전후 비교·실패 기록·결정표·버전/모델 비교를 만들 수 있는가
- 지속성: 며칠 뒤 사라지는 단발성 이슈가 아니라 재검색될 문제인가
- 중복성: 다른 후보와 사실상 같은 검색 의도라면 하나만 남긴다

[직접 테스트 판단]
직접 테스트는 안전하고 반복 가능하며 실제로 측정할 수 있을 때만 direct-test로 선택한다.
- 테스트 기간은 3일/7일 같은 고정 템플릿으로 맞추지 않는다. 관찰 대상에 필요한 최소 기간을 네가 판단한다.
- 매일 별도 WordPress 포스트를 만들지 않는다. 매일은 내부 기록만 하고 테스트 종료 후 하나의 완성도 높은 포스트로 통합한다.
- AI가 측정값이나 사용 경험을 상상하면 안 된다. 실제 수치·스크린샷·사진·시간·실패 사례가 준비되기 전에는 최종 글을 작성하지 않는다.
- 안전하게 직접 시험하기 애매하면 research-verification 또는 exclude를 선택한다.

[조사·검증형 판단]
research-verification은 직접 테스트가 필요 없거나 적절하지 않지만, 공식 원문 여러 개를 교차해 새로운 판단 결과를 만들 수 있을 때만 선택한다.
단순 검색결과 요약, 원인 7가지, FAQ 총정리 같은 일반 AI 답변 수준이면 hold 또는 exclude다.

[카테고리]
선정 후보의 category는 아래 5개 중 정확히 하나만 사용한다.
- 집 관리
- 디지털 생활
- 생활 행정
- 정리·보관
- 제품 사용
새 카테고리를 만들지 않는다.

[선정 수]
- 전체 bundle을 모두 검토한다.
- direct-test 또는 research-verification으로 선정하는 후보는 최대 3개다.
- 검색 유입·근거·고유성 중 하나라도 약하면 hold로 둔다.
- 금지 범주나 사이트 방향과 맞지 않으면 exclude한다.
- 숫자를 채우기 위해 3개를 억지로 선정하지 않는다.

[점수 입력 규칙]
scoreInputs는 기존 UI 호환을 위한 보조값일 뿐 최종 결론을 결정하는 공식이 아니다.
각 항목을 0~5로 네가 판단해 넣되 decision과 rationale이 우선한다.
- siteFit
- problemSpecificity
- demand
- officialEvidence
- originalValue
- evergreen

[출력 규칙]
설명 문장을 JSON 바깥에 쓰지 마라.
반드시 아래 스키마의 JSON 객체 하나만 출력한다.
모든 bundle에 대해 reviews 항목을 하나씩 만든다.

{
  "reviewSummary": "오늘 전체 데이터에 대한 2~4문장 요약",
  "reviews": [
    {
      "bundleId": "입력 JSON의 bundle id 그대로",
      "decision": "direct-test | research-verification | hold | exclude",
      "title": "실제 검색 의도가 드러나는 자연스러운 최종 주제 제목",
      "problem": "사용자가 해결하려는 문제 한 문장",
      "audience": "이 문제를 검색할 구체적인 사용자",
      "category": "집 관리 | 디지털 생활 | 생활 행정 | 정리·보관 | 제품 사용",
      "contentMode": "direct-experience | research-verification | comparison-analysis",
      "searchIntent": "검색자가 최종적으로 알고/결정/해결하려는 것 한 문장",
      "trafficPotential": "high | medium | low",
      "repeatedDemand": "high | medium | low",
      "contentSaturation": "high | medium | low",
      "evidenceQuality": "high | medium | low",
      "originalityPotential": "high | medium | low",
      "rationale": "6개 소스를 비교한 선정/보류/제외 근거 3~6문장",
      "uniqueOutput": "이 페이지에서 새로 만들 고유 결과물. 단순 요약은 금지",
      "verificationPlan": "최종 원고 전 확인할 공식자료·비교·예외 검증 계획",
      "scoreInputs": {
        "siteFit": 0,
        "problemSpecificity": 0,
        "demand": 0,
        "officialEvidence": 0,
        "originalValue": 0,
        "evergreen": 0
      },
      "experimentPlan": null
    }
  ]
}

만약 decision이 direct-test라면 experimentPlan은 null이 아니라 반드시 아래 구조로 작성한다.
{
  "recommended": true,
  "durationDays": 1 이상의 정수,
  "metrics": ["실제로 기록할 측정 항목"],
  "plan": "공식 안전 범위를 확인한 뒤 실제로 수행할 테스트 계획",
  "completionRule": "어떤 직접 증거가 확보되어야 최종 글을 작성할 수 있는지"
}

research-verification / hold / exclude는 experimentPlan을 null로 둔다.

==================================================
오늘의 Evidence Bundle JSON
==================================================
${evidenceJson}`;
}

function extractJsonBlock(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1).trim();
  return raw.trim();
}

function isNumberInRange(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5;
}

export function parseTopicReviewOutput(raw: string): TopicReviewResult {
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) throw new Error("ChatGPT 심사 결과가 비어 있습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("ChatGPT 심사 결과에서 JSON을 읽지 못했습니다. JSON 전체를 그대로 붙여넣어 주세요.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("ChatGPT 심사 결과 형식이 올바르지 않습니다.");
  }

  const result = parsed as TopicReviewResult;
  if (!Array.isArray(result.reviews)) {
    throw new Error("reviews 배열을 찾지 못했습니다. 주제 심사 프롬프트의 출력 형식을 유지해 주세요.");
  }

  const validDecisions = new Set(["direct-test", "research-verification", "hold", "exclude"]);
  const validLevels = new Set(["high", "medium", "low"]);
  const validCategories = new Set(["집 관리", "디지털 생활", "생활 행정", "정리·보관", "제품 사용"]);
  const validModes = new Set(["direct-experience", "research-verification", "comparison-analysis"]);

  result.reviews.forEach((review, index) => {
    if (!review || typeof review !== "object") throw new Error(`${index + 1}번째 reviews 항목이 올바르지 않습니다.`);
    if (!review.bundleId || typeof review.bundleId !== "string") throw new Error(`${index + 1}번째 후보에 bundleId가 없습니다.`);
    if (!validDecisions.has(review.decision)) throw new Error(`${index + 1}번째 후보의 decision 값이 올바르지 않습니다.`);
    if (!review.title || !review.problem) throw new Error(`${index + 1}번째 후보의 title/problem이 비어 있습니다.`);
    if (!validCategories.has(review.category)) throw new Error(`${index + 1}번째 후보의 category가 고정 5개 범위를 벗어났습니다.`);
    if (!validModes.has(review.contentMode)) throw new Error(`${index + 1}번째 후보의 contentMode가 올바르지 않습니다.`);
    [review.trafficPotential, review.repeatedDemand, review.contentSaturation, review.evidenceQuality, review.originalityPotential].forEach((level) => {
      if (!validLevels.has(level)) throw new Error(`${index + 1}번째 후보의 high/medium/low 평가값이 올바르지 않습니다.`);
    });
    const score = review.scoreInputs;
    if (!score || ![score.siteFit, score.problemSpecificity, score.demand, score.officialEvidence, score.originalValue, score.evergreen].every(isNumberInRange)) {
      throw new Error(`${index + 1}번째 후보의 scoreInputs는 0~5 숫자여야 합니다.`);
    }
    if (review.decision === "direct-test") {
      if (!review.experimentPlan?.recommended || !Number.isInteger(review.experimentPlan.durationDays) || review.experimentPlan.durationDays < 1) {
        throw new Error(`${index + 1}번째 직접 테스트 후보의 experimentPlan이 부족합니다.`);
      }
    }
  });

  return result;
}
