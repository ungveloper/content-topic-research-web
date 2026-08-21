import type { ContentMode } from "@/lib/types";

export type AutoResearchCategory =
  | "home-care"
  | "digital-life"
  | "living-admin"
  | "organization"
  | "seasonal-living";

export type AutoResearchSeed = {
  query: string;
  category: AutoResearchCategory;
  audience: string;
  evergreen: number;
  contentMode: ContentMode;
  uniqueOutput: string;
  verificationPlan: string;
};

const EVERGREEN_SEEDS: AutoResearchSeed[] = [
  {
    query: "세탁기 배수 안됨",
    category: "home-care",
    audience: "세탁기 안에 물이 남거나 배수가 늦어져 직접 확인 범위를 알고 싶은 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "제조사 공식 기준과 실제 질문 사례를 대조한 ‘소리는 남/안 남 → 물이 남는 위치 → 호스 확인 → 점검 중단 기준’ 판단 흐름",
    verificationPlan: "제조사 고객지원·사용설명서의 배수 관련 항목을 우선 확인하고, 지식iN·카페는 사용자가 어떤 조건에서 막히는지 찾는 용도로만 사용한다.",
  },
  {
    query: "냉장고 소음 원인",
    category: "home-care",
    audience: "냉장고에서 평소와 다른 소리가 나지만 정상 작동음인지 점검이 필요한지 구분하고 싶은 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "압축기·팬·성에·수평 상태처럼 소리 유형별로 ‘정상 가능성/확인할 것/서비스 문의 기준’을 나눈 비교표",
    verificationPlan: "제조사 공식 고객지원 문서에서 정상 작동음과 서비스 점검 기준을 확인하고 공개 사례와 차이를 비교한다.",
  },
  {
    query: "매트리스 버리는 법",
    category: "living-admin",
    audience: "매트리스를 직접 배출해야 하지만 신고 방법·스티커·수거 조건이 헷갈리는 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "지자체 공식 안내를 기준으로 온라인 신고·수수료·배출 위치·수거 전 준비를 비교한 실행 체크리스트",
    verificationPlan: "지자체·구청·공공 폐기물 안내 원문을 우선 확인하고, 블로그·카페는 실제로 자주 놓치는 준비사항을 찾는 데만 사용한다.",
  },
  {
    query: "대형폐기물 온라인 신청",
    category: "living-admin",
    audience: "가구·생활용품을 버리기 위해 온라인 대형폐기물 신고 절차를 빠르게 확인하려는 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "지역별 신청 흐름에서 공통되는 단계와 달라지는 항목을 분리한 ‘신청 전 준비물 → 결제 → 배출번호 → 배출’ 체크리스트",
    verificationPlan: "정부·지자체 공식 배출 안내를 기준으로 절차를 검증하고, 뉴스는 제도 변경이 있는지 확인하는 용도로만 사용한다.",
  },
  {
    query: "아이폰 사진 정리",
    category: "digital-life",
    audience: "사진이 너무 많아 저장공간을 줄이거나 분류·백업 순서를 정하고 싶은 아이폰 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "Apple 공식 도움말을 기준으로 iCloud 사진·중복 항목·저장공간 최적화·백업 전 확인사항을 순서도로 정리한 체크리스트",
    verificationPlan: "Apple 공식 지원 문서를 우선 검증하고, 커뮤니티에서는 실제로 자주 혼동하는 설정과 데이터 손실 우려를 찾는다.",
  },
  {
    query: "스마트폰 저장공간 부족",
    category: "digital-life",
    audience: "앱을 지우기 전에 무엇이 용량을 차지하는지 안전하게 확인하고 싶은 스마트폰 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "사진·동영상·앱 캐시·다운로드 파일·메신저 데이터 등 원인별로 ‘확인 위치/지워도 되는 범위/백업 필요 여부’를 나눈 표",
    verificationPlan: "Apple·Google·Samsung 등 공식 도움말을 기준으로 삭제와 백업 범위를 검증하고, 공개 사례는 혼동 포인트만 수집한다.",
  },
  {
    query: "인스타그램 데이터 내보내기",
    category: "digital-life",
    audience: "Instagram 데이터를 내려받아 백업하거나 팔로워·게시물 데이터를 확인하려는 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "Meta 공식 안내를 기준으로 내보내기 위치·형식·기간·다운로드 후 파일 구조를 단계별로 설명한 실무 가이드",
    verificationPlan: "Meta 공식 도움말과 실제 공개된 내보내기 파일 구조 설명을 교차 확인하고, 화면 경로 변경 가능성을 날짜와 함께 표시한다.",
  },
  {
    query: "냉장고 정리 방법",
    category: "organization",
    audience: "냉장고 안 식품을 찾기 어렵고 같은 물건을 반복 구매하는 문제를 줄이고 싶은 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "보관 위치·사용 빈도·개봉 여부를 기준으로 정리법을 비교하고 바로 적용할 수 있는 15분 정리 체크리스트",
    verificationPlan: "식품 보관 안전과 관련된 내용은 공공기관·제조사 자료로 검증하고, 정리 방식 자체는 여러 사례를 비교해 조건별 장단점을 정리한다.",
  },
  {
    query: "에어컨 필터 청소",
    category: "home-care",
    audience: "에어컨 필터를 직접 청소하려는데 물세척 가능 여부와 건조 방법이 헷갈리는 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "제조사별 필터 분리·물세척 가능 여부·건조 주의사항을 공식 문서로 비교한 표",
    verificationPlan: "삼성·LG 등 제조사 고객지원 문서와 모델별 사용설명서를 우선 확인하고, 공개 사례는 자주 하는 실수 탐색에만 사용한다.",
  },
  {
    query: "가습기 세척 방법",
    category: "home-care",
    audience: "가습기를 다시 사용하기 전에 세척 가능한 부품과 피해야 할 세척 방법을 확인하려는 사용자",
    evergreen: 4,
    contentMode: "comparison-analysis",
    uniqueOutput: "가열식·초음파식·기화식별로 세척 부위와 금지사항을 나눈 비교 체크리스트",
    verificationPlan: "제조사 사용설명서와 공공 안전자료를 우선 확인하고, 임의의 세척제 사용을 권하지 않는다.",
  },
  {
    query: "공기청정기 필터 교체",
    category: "home-care",
    audience: "필터 교체 알림이 떴거나 냄새·풍량 변화 때문에 교체 시점을 판단하고 싶은 사용자",
    evergreen: 5,
    contentMode: "comparison-analysis",
    uniqueOutput: "교체 알림·사용시간·필터 상태·세척 가능 여부를 기준으로 모델별 확인 항목을 정리한 판단표",
    verificationPlan: "제조사 공식 필터 교체 기준과 모델별 설명서를 확인하고, 호환 필터 정보는 별도로 구분한다.",
  },
  {
    query: "노트북 배터리 수명 확인",
    category: "digital-life",
    audience: "노트북 배터리가 빨리 닳아 교체가 필요한지 상태를 확인하려는 사용자",
    evergreen: 5,
    contentMode: "research-verification",
    uniqueOutput: "Windows·macOS에서 배터리 상태를 확인하는 공식 경로와 ‘사이클/최대 용량/경고 상태’를 해석하는 체크리스트",
    verificationPlan: "Microsoft·Apple·제조사 공식 문서를 우선 확인하고 배터리 교체 판단을 임의 수치 하나로 단정하지 않는다.",
  },
];

const SEASONAL_SEEDS: Record<number, AutoResearchSeed[]> = {
  1: [
    {
      query: "겨울철 결로 제거",
      category: "seasonal-living",
      audience: "창문·벽 결로를 줄이기 위해 환기·난방·습도 관리 순서를 알고 싶은 사용자",
      evergreen: 3,
      contentMode: "research-verification",
      uniqueOutput: "결로가 생기는 위치와 생활 조건별로 확인할 순서를 나눈 체크리스트",
      verificationPlan: "공공 주거·건축 안내와 제조사 자료를 우선 확인하고 곰팡이·건강 관련 단정은 피한다.",
    },
    {
      query: "수도 계량기 동파 예방",
      category: "seasonal-living",
      audience: "한파 전에 수도계량기와 배관 동파를 예방하려는 사용자",
      evergreen: 3,
      contentMode: "research-verification",
      uniqueOutput: "기온 단계별 예방 행동과 동파 시 신고·복구 순서를 공공기관 기준으로 정리한 표",
      verificationPlan: "지자체·상수도사업본부 공식 안내를 기준으로 작성한다.",
    },
  ],
  2: [
    {
      query: "이사 전 체크리스트",
      category: "living-admin",
      audience: "이사 전후에 주소·공과금·폐기물·인터넷 같은 일을 빠뜨리지 않으려는 사용자",
      evergreen: 4,
      contentMode: "comparison-analysis",
      uniqueOutput: "D-30·D-7·D-1·당일·이사 후 단계별 실행 체크리스트",
      verificationPlan: "정부24·공공서비스·통신사 등 공식 안내를 기준으로 절차를 검증한다.",
    },
  ],
  3: [
    {
      query: "에어컨 사전점검",
      category: "seasonal-living",
      audience: "여름 전에 에어컨을 켜보기 전 직접 확인할 항목을 알고 싶은 사용자",
      evergreen: 3,
      contentMode: "research-verification",
      uniqueOutput: "전원·리모컨·필터·실외기 주변·냉방 반응을 순서대로 확인하는 사전점검표",
      verificationPlan: "제조사 공식 사전점검 캠페인과 사용설명서를 기준으로 작성한다.",
    },
  ],
  4: [
    {
      query: "봄 옷 정리",
      category: "organization",
      audience: "겨울옷을 보관하고 봄옷을 꺼내면서 옷장 공간을 정리하려는 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "세탁 여부·소재·보관 기간별로 압축/걸이/접기 방식을 나눈 정리 체크리스트",
      verificationPlan: "의류 관리 정보는 세탁표시·제조사 안내를 우선 확인하고 정리법은 여러 방법을 비교한다.",
    },
  ],
  5: [
    {
      query: "여름 이불 보관",
      category: "seasonal-living",
      audience: "계절 이불을 꺼내거나 겨울 이불을 장기 보관하려는 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "소재별 세탁·건조·압축보관 가능 여부와 장기보관 주의사항을 비교한 표",
      verificationPlan: "제품 세탁표시와 제조사 관리 안내를 우선 확인한다.",
    },
  ],
  6: [
    {
      query: "장마철 빨래 냄새",
      category: "seasonal-living",
      audience: "습한 날 빨래가 늦게 마르거나 쉰내가 나는 문제를 줄이고 싶은 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "건조 시간·환기·세탁조 상태·빨래 양을 기준으로 원인을 좁히는 체크리스트",
      verificationPlan: "세탁기 제조사 관리 안내와 생활환경 자료를 확인하고 과장된 민간요법은 제외한다.",
    },
  ],
  7: [
    {
      query: "에어컨 냄새",
      category: "seasonal-living",
      audience: "에어컨을 켤 때·냉방 중·송풍 중 냄새가 나서 확인 순서를 알고 싶은 사용자",
      evergreen: 4,
      contentMode: "comparison-analysis",
      uniqueOutput: "냄새가 나는 시점별로 필터·열교환기·배수·송풍건조를 확인하는 판단 흐름",
      verificationPlan: "제조사 공식 청소·건조 안내를 우선 확인하고 전문 세척이 필요한 범위를 구분한다.",
    },
  ],
  8: [
    {
      query: "에어컨 냄새",
      category: "seasonal-living",
      audience: "여름 후반 에어컨 냄새가 심해져 청소·건조·점검 순서를 알고 싶은 사용자",
      evergreen: 4,
      contentMode: "comparison-analysis",
      uniqueOutput: "냄새 발생 시점별 원인 후보와 사용자가 확인 가능한 범위를 제조사 공식 기준으로 나눈 판단표",
      verificationPlan: "제조사 공식 청소·자동건조 안내와 사용설명서를 확인하고, 커뮤니티는 반복되는 증상 표현만 수집한다.",
    },
    {
      query: "가을 옷 정리",
      category: "organization",
      audience: "여름옷을 정리하고 가을옷을 꺼내며 옷장 구성을 바꾸려는 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "세탁·수선·보관·기부/폐기 네 단계로 나눈 30분 옷장 전환 체크리스트",
      verificationPlan: "의류별 세탁표시를 우선하고 정리 방식은 여러 공개 사례를 비교한다.",
    },
    {
      query: "추석 대형마트 휴무일",
      category: "seasonal-living",
      audience: "추석 전후 장보기를 위해 실제 영업일과 점포별 예외를 확인하려는 사용자",
      evergreen: 2,
      contentMode: "research-verification",
      uniqueOutput: "대형마트 공식 점포 공지를 직접 확인해 지역·점포별 휴무와 예외를 구분한 최신 표",
      verificationPlan: "대형마트 공식 점포 페이지와 지자체 공지를 기준으로 날짜를 확인하고 뉴스는 변경 감지용으로만 사용한다.",
    },
    {
      query: "추석 쓰레기 배출",
      category: "living-admin",
      audience: "추석 연휴 중 일반·음식물·재활용 쓰레기 배출 가능 날짜를 확인하려는 사용자",
      evergreen: 2,
      contentMode: "research-verification",
      uniqueOutput: "지자체 공식 연휴 수거 공지를 기준으로 배출 중단일·재개일·품목별 유의사항을 정리한 표",
      verificationPlan: "각 지자체 공식 공지와 환경·청소 부서 안내를 우선 확인하고 기사 재작성으로 끝내지 않는다.",
    },
  ],
  9: [
    {
      query: "보일러 사전점검",
      category: "seasonal-living",
      audience: "추워지기 전에 보일러를 처음 켜기 전 확인할 항목을 알고 싶은 사용자",
      evergreen: 3,
      contentMode: "research-verification",
      uniqueOutput: "전원·압력·에러코드·배기구 주변·난방 반응을 순서대로 확인하는 사전점검표",
      verificationPlan: "보일러 제조사 공식 고객지원과 사용설명서를 기준으로 직접 점검 가능한 범위와 기사 방문 기준을 구분한다.",
    },
  ],
  10: [
    {
      query: "가습기 세척",
      category: "seasonal-living",
      audience: "가습기를 다시 꺼내 쓰기 전에 안전하게 세척·건조하려는 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "가습 방식별 세척 부위·주기·사용하면 안 되는 세척제를 구분한 표",
      verificationPlan: "제조사 사용설명서와 공공 안전자료를 기준으로 작성한다.",
    },
  ],
  11: [
    {
      query: "겨울 이불 정리",
      category: "organization",
      audience: "두꺼운 이불과 침구를 꺼내면서 여름 침구를 보관하려는 사용자",
      evergreen: 3,
      contentMode: "comparison-analysis",
      uniqueOutput: "소재·부피·사용 빈도에 따른 세탁·완전건조·압축보관 선택표",
      verificationPlan: "제품 세탁표시와 제조사 관리 안내를 우선 확인한다.",
    },
  ],
  12: [
    {
      query: "수도 동파 예방",
      category: "seasonal-living",
      audience: "한파 예보 전에 수도 배관·계량기 동파를 예방하고 싶은 사용자",
      evergreen: 3,
      contentMode: "research-verification",
      uniqueOutput: "기온 단계별 예방 행동과 동파 발생 시 신고 순서를 공공기관 기준으로 정리한 표",
      verificationPlan: "지자체·상수도사업본부의 최신 공식 안내를 기준으로 작성한다.",
    },
  ],
};

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000);
}

function dedupeSeeds(seeds: AutoResearchSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = seed.query.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getAutoResearchSeeds(date = new Date(), offset = 0, count = 5) {
  const month = date.getUTCMonth() + 1;
  const pool = dedupeSeeds([...(SEASONAL_SEEDS[month] || []), ...EVERGREEN_SEEDS]);
  if (!pool.length) return [];

  const rotation = Math.max(0, offset) * count;
  const startIndex = (dayOfYear(date) + rotation) % pool.length;
  const selected: AutoResearchSeed[] = [];

  for (let index = 0; selected.length < Math.min(count, pool.length); index += 1) {
    selected.push(pool[(startIndex + index) % pool.length]);
  }

  return selected;
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
