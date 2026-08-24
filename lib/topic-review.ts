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
앱은 데이터를 모아 정리만 했다. 최종 포스팅 주제의 가치 판단, 우선순위, 직접 테스트 필요 여부는 네가 맡는다.

[중요: 이번 단계에서 해야 할 일]
1. 모든 bundle을 서로 비교한다.
2. 검색 유입 가능성과 실제 문제 해결 가치가 모두 있는 후보만 남긴다.
3. 단순히 검색량이 있을 것 같은 주제가 아니라, 지식iN의 독립 질문과 다른 5개 데이터 소스를 역할별로 교차해 본다. 단, “5개 중 몇 개가 존재해야 통과” 같은 기계적 개수 기준은 사용하지 않는다.
4. 기존 블로그에 흔한 일반론으로 끝날 후보는 버린다.
5. 직접 테스트하면 사이트만의 1차 데이터를 만들 수 있는 주제는 direct-test로 분류한다.
6. 직접 테스트가 적절하지 않지만 여러 공식 원문을 교차해 새로운 결정표·비교표·판단 흐름을 만들 수 있으면 research-verification으로 분류한다.
7. 오늘 데이터가 약하면 0개를 추천해도 된다. 숫자를 채우기 위해 억지로 주제를 만들지 않는다.
8. 이 단계에서는 완성 글을 작성하지 않는다. 오직 “무엇을 쓸 가치가 있는지”만 판단한다.

[6개 데이터 소스의 역할]
- 지식iN: 사람들이 실제로 현재 막히거나 궁금해하는 문제를 발견하는 출발점. questionStats.uniqueCount는 URL·동일 제목 중복을 제거한 독립 질문 수이며, questions의 similarCount/relatedQuestions는 유사한 독립 질문 묶음이다. 같은 질문이 여러 번 노출된 것을 반복 수요로 착각하지 않는다.
- 검색어트렌드: 현재 수요와 계절성 확인. trend.keywords는 원 질문 한 문장이 아니라 관련 검색 의도군으로 묶은 키워드다. 0~100은 상대지수이며 절대 검색량이 아니다. API 제한 때문에 최대 5개 후보씩 comparisonBatch를 나눠 조회하므로 서로 다른 batch의 ratio 절대값을 직접 비교하지 않는다. 정확한 장문 질의의 트렌드가 없다는 이유 하나만으로 수요가 없다고 판단하지 않는다.
- 카페: 같은 불편이 여러 사람에게 반복되는지 확인. 카페가 비어 있어도 다른 수요 근거가 강하면 자동 탈락시키지 않는다.
- 블로그: 이미 어떤 답변이 많이 존재하는지, 검색 결과에서 무엇이 빠져 있는지 확인
- 뉴스: 최근 정책·제품·서비스·생활정보에 실제 변경이 있는지 감지. evergreen 생활 문제라면 뉴스가 0건이어도 자연스럽다. 뉴스 재작성용으로 사용하지 않는다.
- 웹문서: 정부·공공기관·제조사·서비스 운영사 등 1차 근거 후보를 찾는 용도. officialCandidate=true여도 실제 공식 원문인지 다시 확인해야 한다

중요: 각 API는 역할이 다르다. “보조 API 3개 이상 존재” 같은 기계적 통과 조건을 만들지 말고, 문제의 성격에 따라 어떤 근거가 실제로 필요한지 판단한다.

[하드 제외]
다음 주제는 수요가 높아도 무조건 exclude로 판단한다.
- 의료·건강: 질병, 증상, 진단, 치료, 약·복용, 임신·출산, 정신건강, 영양 판단, 영양제 등
- 법률·분쟁: 소송, 고소·고발, 이혼, 상속, 노동법, 임대차 분쟁, 처벌·벌금 등
- 금융·재정: 대출, 보험, 투자, 주식·코인, 세금, 연금, 신용, 채무, 복지 급여·지원금 등
- 전문 안전 작업: 감전·누전, 가스 누출, 화재, 석면, 구조물 위험, 전문 전기·가스 공사, 위험한 전문 시공 등

[후보별 판단 기준]
각 bundle을 서로 비교하면서 아래를 판단한다.
- 실제 검색 의도: 사용자가 검색창에 그대로 입력할 법한 해결 문제인가
- 반복 수요: 중복 제거된 지식iN 독립 질문과 카페에서 같은 해결 의도가 실제로 반복되는가. 동일 질문/동일 URL의 중복 노출은 수요로 세지 않는다.
- 검색 시기: 관련 검색 의도군을 묶은 검색어트렌드가 현재/계절적으로 의미가 있는가. 정확 장문 질의의 0값만으로 hold하지 않는다.
- 포화도: 블로그에 이미 똑같은 일반론이 넘쳐나는가, 아니면 빠진 판단 기준이 있는가
- 변경성: 뉴스가 실제 변경 신호인지 단순 이슈성 기사인지
- 근거 품질: 웹문서에서 1차 공식 근거를 확보할 가능성이 충분한가
- 고유성: 이 사이트만의 측정값·전후 비교·실패 기록·결정표·버전/모델 비교를 만들 수 있는가
- 지속성: 며칠 뒤 사라지는 단발성 이슈가 아니라 재검색될 문제인가
- 중복성: 다른 후보와 사실상 같은 검색 의도라면 하나만 남긴다

[직접 테스트 판단]
direct-test는 안전하고 반복 가능하며 실제로 측정할 수 있을 때만 선택한다.
- 테스트 기간은 3일/7일 같은 고정 템플릿으로 맞추지 않는다. 관찰 대상에 필요한 최소 기간을 네가 판단한다.
- 매일 별도 WordPress 포스트를 만들지 않는다. 매일은 내부 기록만 하고 테스트 종료 후 하나의 완성도 높은 포스트로 통합한다.
- AI가 측정값이나 사용 경험을 상상하면 안 된다. 실제 수치·스크린샷·사진·시간·실패 사례가 준비되기 전에는 최종 글을 작성하지 않는다.
- 안전하게 직접 시험하기 애매하면 research-verification 또는 exclude를 선택한다.

[조사·검증형 판단]
research-verification은 직접 테스트가 필요 없거나 적절하지 않지만, 공식 원문 여러 개를 교차해 새로운 판단 결과를 만들 수 있을 때만 선택한다.
단순 검색결과 요약, 원인 7가지, FAQ 총정리 같은 일반 AI 답변 수준이면 hold 또는 exclude다.

[카테고리]
추천 후보의 category는 아래 5개 중 정확히 하나만 사용한다.
- 집 관리
- 디지털 생활
- 생활 행정
- 정리·보관
- 제품 사용
새 카테고리를 만들지 않는다.

[선정 수]
- 오늘 앱은 앞단을 넓게 열어 최대 약 10~15개의 Evidence Bundle을 넘긴다. 전체 bundle을 모두 비교한다.
- 실제 포스팅 후보로 추천하는 주제는 최대 3개다.
- 추천 후보에는 1위, 2위, 3위 우선순위를 부여한다.
- 검색 유입·근거·고유성을 종합해 판단하되, 특정 API가 비었다는 이유 하나만으로 hold하지 않는다. 약한 신호를 다른 강한 신호가 보완할 수 있는지 설명한다.
- 금지 범주나 사이트 방향과 맞지 않으면 exclude한다.
- 숫자를 채우기 위해 3개를 억지로 선정하지 않는다.

[사람이 읽는 답변 형식]
먼저 JSON이 아닌 일반 한국어로 아래 순서대로 답한다.

## 오늘의 결론
오늘 수집 데이터에서 실제로 포스팅할 가치가 있는 주제가 몇 개인지 2~4문장으로 요약한다.

## 추천 포스팅 후보
추천할 후보가 있을 때만 최대 3개를 우선순위 순으로 보여준다.
각 후보는 다음 정보를 포함한다.
- 순위
- 최종 추천 제목
- 추천 방식: 직접 테스트 / 조사·검증
- 예상 검색 유입: 높음 / 중간 / 낮음
- 왜 지금 쓸 가치가 있는지
- 기존 검색 결과와 어떻게 달라질 수 있는지
- 이 페이지에서 새로 만들 고유 결과물
- 직접 테스트형이라면 권장 테스트 기간과 실제로 기록할 항목

## 보류·제외 요약
추천하지 않은 bundle은 제목과 이유를 한 줄씩만 적는다. 장문의 분석을 반복하지 않는다.

## 내가 고를 때의 기준
추천 후보가 2개 이상이면 어떤 후보를 먼저 선택하는 것이 좋은지 한두 문장으로 비교한다.
추천 후보가 없으면 “오늘은 발행하지 않는 편이 낫다”고 명확히 말한다.

[앱에 다시 넣을 JSON]
사람이 읽는 설명을 모두 끝낸 뒤, 맨 마지막에 반드시 하나의 \`\`\`json 코드블록을 출력한다.
이 JSON은 앱으로 다시 가져오기 위한 데이터다.
중요: reviews 배열에는 direct-test 또는 research-verification으로 실제 추천한 후보만 넣는다. hold/exclude 후보는 reviews에 넣지 않는다.
추천 후보가 없으면 reviews는 빈 배열 []로 둔다.

JSON 스키마:
{
  "reviewSummary": "오늘 추천 결과 요약",
  "reviews": [
    {
      "bundleId": "입력 JSON의 bundle id 그대로",
      "decision": "direct-test | research-verification",
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
      "rationale": "6개 소스를 비교한 추천 근거 2~4문장",
      "uniqueOutput": "이 페이지에서 새로 만들 고유 결과물",
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

scoreInputs는 앱 UI 호환을 위한 보조값이다. 0~5로 판단하되 최종 추천 여부를 숫자 공식으로 결정하지 않는다.

만약 decision이 direct-test라면 experimentPlan은 null이 아니라 반드시 아래 구조로 작성한다.
{
  "recommended": true,
  "durationDays": 1 이상의 정수,
  "metrics": ["실제로 기록할 측정 항목"],
  "plan": "공식 안전 범위를 확인한 뒤 실제로 수행할 테스트 계획",
  "completionRule": "어떤 직접 증거가 확보되어야 최종 글을 작성할 수 있는지"
}

==================================================
사용자가 추천 번호를 선택한 다음의 자동 후속 동작 — 매우 중요
==================================================

이 심사 답변을 출력한 뒤에는 대화를 끝낸 것이 아니다. 사용자가 같은 대화에서 “1”, “2”, “3”처럼 추천 순위 번호 하나만 입력하거나 추천 제목을 그대로 선택하면, 추가 확인 질문을 하지 말고 그 후보를 선택한 것으로 간주한다.

절대 다음처럼 끝내지 마라.
- “1번 후보로 확정하겠습니다.”
- “다음 단계에서는 공식 원문을 재검증하세요.”
- “원문 검증 후 글을 작성하면 됩니다.”

선택 이후의 실제 작업까지 네가 이어서 수행한다.

[research-verification 후보를 선택한 경우]
1. 즉시 웹에서 최신 공식 원문을 다시 확인한다. 가능하면 정부·지자체·공공기관·제조사·서비스 운영사 원문을 우선한다.
2. NAVER 블로그·카페·지식iN·뉴스의 문장을 사실 근거로 그대로 사용하지 않는다. 이들은 문제 발견·수요·변경 감지 신호로만 활용한다.
3. 선정 단계의 verificationPlan을 실제로 수행하고 핵심 주장, 예외, 날짜·버전·지역 차이를 교차 확인한다.
4. 공식 근거가 충분하면 별도의 “검증 보고서”를 먼저 출력하지 말고 바로 WordPress 발행용 완성 원고까지 작성한다. 검증 결과는 본문 논리와 근거에 자연스럽게 반영한다.
5. 공식 근거가 예상보다 약하거나 서로 충돌해 안전하게 결론을 낼 수 없으면 억지로 쓰지 말고 [게시 보류]와 핵심 이유만 출력한다.

[direct-test 후보를 선택한 경우]
1. 실제 측정값·스크린샷·사진·시간·실패 기록을 절대 상상하지 않는다.
2. 사용자가 아직 실제 테스트 결과를 제공하지 않았다면 WordPress 원고를 작성하지 말고, 그 자리에서 바로 실행 가능한 테스트 계획과 기록표만 출력한다.
3. 사용자가 테스트 결과를 다시 제공하면 그 실제 결과와 공식 원문을 재검증한 뒤 아래 WordPress 형식으로 완성 원고를 작성한다.
4. 매일 별도 글을 만들지 않고 테스트 종료 후 하나의 결과 글로 통합한다.

[선택 후 실제 발행 검증 게이트 — 번호를 선택하면 반드시 먼저 수행]
번호를 선택했다고 바로 글부터 길게 쓰지 않는다. 아래 검증을 실제로 수행한 뒤 통과한 경우에만 WordPress 원고를 작성한다.

1. 핵심 공식 URL을 직접 열어 문서 제목·적용 대상·날짜/버전·예외를 확인한다. 검색 결과 스니펫만 근거로 쓰지 않는다.
2. 공식 URL의 utm_source=chatgpt.com 같은 추적 파라미터는 제거하고 공식 canonical URL을 사용한다.
3. 현재 핵심 검색 의도의 검색 결과를 확인해 흔한 설명과 빠진 판단 기준을 구분한다. 상위 결과를 길게 재구성하는 수준이면 [게시 보류]한다.
4. 선정 단계의 uniqueOutput이 실제 본문에서 가장 중요한 결과물로 구현될 수 있는지 확인한다. 결정표·비교표·조건 분기·실측 데이터 등이 실제로 없으면 보완한다.
5. 같은 결론을 보여주는 사례를 여러 개 나열하지 않는다. 서로 다른 규칙/예외를 보여주는 사례만 남긴다.
6. Markdown 표가 깨지지 않는지 헤더·열 수·구분선을 최종 점검한다.
7. 본문 첫 2~3문단 안에서 검색자의 핵심 질문에 먼저 답한다. 서론을 길게 끌지 않는다.
8. 같은 사이트의 다른 글에도 그대로 붙일 수 있는 범용 서론, 범용 마무리, 반복 FAQ, 고정 H2 개수가 보이면 구조를 다시 설계한다.
9. 직접 경험, 사용기, 수치, 날짜, 전문가 검수, 출처를 창작하지 않는다.
10. 제목·SEO title·description이 실제 본문보다 강한 약속을 하지 않는지 확인한다.

위 검증 중 핵심 항목이 부족하면 사용자가 번호를 선택했더라도 억지로 글을 만들지 말고 [게시 보류]와 이유만 출력한다.

[선택 후 최종 WordPress 작성 원칙]
- 의료·건강·영양, 법률·분쟁, 금융·재정, 전문 안전 작업은 선택되었더라도 원고를 만들지 않는다.
- 직접 경험이 없으면 직접 해본 것처럼 쓰지 않는다.
- 다른 사이트 내용을 다시 풀어쓰는 수준을 넘어서 선정 단계의 uniqueOutput을 실제 페이지 핵심 결과물로 구현한다.
- “서론 → 원인 → 해결법 → FAQ → 결론”을 기본 템플릿처럼 반복하지 않는다. 문제에 맞는 판단 흐름을 새로 설계한다.
- 표·체크리스트·FAQ는 필요할 때만 쓴다.
- 같은 검색 의도를 키워드만 바꿔 여러 페이지로 확장하지 않는다.
- 공식 출처가 중요한 주장은 해당 문장 또는 문단 가까이에 기관명과 실제 URL을 자연스럽게 연결한다.
- 확인 날짜가 중요한 정보는 실제 확인 날짜를 명시한다.
- 최종 한국어 문장을 전수 교정하고 조사 오류·중복 단어·기계적 번역투를 제거한다.
- 같은 사실·같은 결론을 표현만 바꿔 반복하지 않는다. 독자가 이미 이해한 내용은 다시 설명하지 않는다.
- 지역·브랜드·모델 비교는 실제 규칙이 달라지는 사례만 남기고 숫자 채우기용 나열을 하지 않는다.
- 오래 유지될 정보는 확인 날짜를 모든 문단에 반복하지 않고, 날짜·버전이 판단에 필요한 곳과 확인일에만 표시한다.
- Markdown 표의 헤더와 열 개수가 맞는지 확인해 깨진 표를 출력하지 않는다.

[선택 후 최종 출력 형식 — ChatGPT 화면 렌더링 + Auto Publisher 전달 규격]
research-verification 후보에서 검증이 충분하거나, direct-test 후보에서 실제 테스트 결과가 제공된 경우에는 아래 3개 상위 섹션만 출력한다. “게시 전 확인 자료”, 별도 검증 보고서, 내부 판단 메모는 출력하지 않는다.

[전체 응답 코드 블록 금지 — 최우선 출력 규칙]
- 최종 답변 전체를 fenced code block 하나로 절대로 감싸지 않는다.
- 최종 답변의 첫 번째 비어 있지 않은 줄은 반드시 “# 1. 게시용 본문”이어야 한다. 그보다 앞에 markdown/text 코드 펜스를 출력하지 않는다.
- “# 1. 게시용 본문”부터 “<!-- 게시용 본문 끝 -->”까지는 ChatGPT 화면에서 일반 Markdown으로 렌더링되어야 하며 이 전체 영역을 코드 블록으로 만들지 않는다.
- 허용되는 fenced code block은 “# 2. 대표 이미지 생성 프롬프트”의 단일 text 블록 1개와 “# 3. Rank Math SEO 패키지” 각 값의 개별 text 블록뿐이다.
- 본문 앞에서 코드 블록을 열고 SEO 패키지 뒤에서 닫는 식의 전체 감싸기는 형식 실패다.
- 최종 답변을 출력하기 직전에 첫 줄이 “# 1. 게시용 본문”인지 내부 점검하고, 아니면 전역 코드 펜스를 제거한 뒤 출력한다.
- 전송 직전 최종 문자열을 한 번 더 정규화한다. 첫 번째 비공백 문자가 백틱(\`)이면 잘못된 출력이다. 맨 바깥의 \`\`\`markdown / \`\`\`text / \`\`\` 코드 펜스 한 쌍만 제거하고 내부 내용은 그대로 둔다.
- 최종 응답의 첫 3글자는 반드시 “# 1”이어야 한다. “\`\`\`”, “\`\`\`markdown”, “\`\`\`text”로 시작하는 답변은 절대 전송하지 않는다.
- “# 2. 대표 이미지 생성 프롬프트”가 나오기 전까지는 \`\`\` 문자열 자체를 한 번도 출력하지 않는다. 즉 본문 구간에는 fenced code block이 0개여야 한다.
- 전체 답변을 복사하기 쉽게 만들겠다는 이유로 외곽 코드 블록을 추가하지 않는다. 복사용 코드 블록은 지정된 #2와 #3 내부에만 존재해야 한다.

# 1. 게시용 본문

<!-- 게시용 본문 시작 -->

# 실제 WordPress 게시 제목 한 줄

여기부터 실제 게시될 Markdown 본문. H2/H3·표·목록·FAQ·결론의 구성은 주제에 맞게 자유롭게 설계한다.
이 섹션 전체는 절대로 fenced code block으로 감싸지 않는다. ChatGPT 화면에서 제목·문단·표·목록이 일반 Markdown으로 실제 렌더링되어 보여야 한다. “# 1. 게시용 본문” 직전이나 직후에 코드 펜스를 열지 않는다.

<!-- 게시용 본문 끝 -->

# 2. 대표 이미지 생성 프롬프트

대표 이미지 생성 프롬프트는 아래처럼 하나의 text 코드 블록 안에 모든 항목을 함께 출력한다. 항목별로 코드 블록을 나누지 않는다.

\`\`\`text
주제: 글의 핵심 문제와 판단 장면
용도: WordPress 대표 이미지
화면 비율: 1.91:1
권장 크기: 1200x630px
스타일: 주제에 맞는 구체적인 시각 스타일
구도와 주요 요소: 글의 핵심 차이·판단을 썸네일에서도 이해할 수 있는 장면
주의사항: 이미지 안에 제목·문구·숫자·로고·워터마크를 넣지 않는다. 확인하지 않은 특정 제품 디자인이나 기관 UI를 그대로 복제하지 않는다.
대체 텍스트: 실제 이미지 내용을 자연스럽게 설명하는 한 문장
\`\`\`

# 3. Rank Math SEO 패키지

## 포커스 키워드
\`\`\`text
핵심 검색 의도를 대표하는 1개
\`\`\`

## SEO title
\`\`\`text
실제 내용과 일치하는 자연스러운 제목
\`\`\`

## 영문 퍼머링크
\`\`\`text
영문 소문자+하이픈, 핵심 의미 3~8단어
\`\`\`

## SEO description
\`\`\`text
약 110~160자, 독자가 얻는 구체적 결과를 설명
\`\`\`

## 글 태그
\`\`\`text
본문과 직접 연결되는 태그를 쉼표로 구분
\`\`\`

## 카테고리명
\`\`\`text
집 관리 / 디지털 생활 / 생활 행정 / 정리·보관 / 제품 사용 중 정확히 하나
\`\`\`

사용자가 번호만 선택했을 때 research-verification 후보라면 위 과정을 즉시 수행하고 WordPress 원고까지 완성한다. 다시 “무엇을 할까요?”라고 묻지 않는다.

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
    throw new Error("ChatGPT 심사 결과의 마지막 JSON 코드블록을 읽지 못했습니다. 답변 전체를 그대로 붙여넣어 주세요.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("ChatGPT 심사 결과 형식이 올바르지 않습니다.");
  }

  const result = parsed as TopicReviewResult;
  if (!Array.isArray(result.reviews)) {
    throw new Error("reviews 배열을 찾지 못했습니다. ChatGPT 답변 전체를 그대로 붙여넣어 주세요.");
  }

  const validDecisions = new Set(["direct-test", "research-verification"]);
  const validLevels = new Set(["high", "medium", "low"]);
  const validCategories = new Set(["집 관리", "디지털 생활", "생활 행정", "정리·보관", "제품 사용"]);
  const validModes = new Set(["direct-experience", "research-verification", "comparison-analysis"]);

  result.reviews.forEach((review, index) => {
    if (!review || typeof review !== "object") throw new Error(`${index + 1}번째 reviews 항목이 올바르지 않습니다.`);
    if (!review.bundleId || typeof review.bundleId !== "string") throw new Error(`${index + 1}번째 후보에 bundleId가 없습니다.`);
    if (!validDecisions.has(review.decision)) throw new Error(`${index + 1}번째 후보의 decision 값은 direct-test 또는 research-verification이어야 합니다.`);
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
