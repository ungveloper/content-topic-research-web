const NAVER_BASE_URL = process.env.NAVER_API_HUB_BASE_URL || "https://naverapihub.apigw.ntruss.com";
const NOTION_VERSION = "2026-03-11";
const SCORE_THRESHOLD = numberEnv("MONITOR_SCORE_THRESHOLD", 8);
const MAX_PAGES_PER_RUN = integerEnv("MONITOR_MAX_PAGES_PER_RUN", 5, 1, 20);
const SEEDS_PER_RUN = integerEnv("MONITOR_SEEDS_PER_RUN", 8, 1, 20);
const SEARCH_DISPLAY = 50;
const MAX_DEDUPE_CHECKS = 14;

const seeds = [
  ["휴대폰 백업 복원 데이터 이전", "디지털 생활"],
  ["아이폰 사진 파일 옮기기 백업", "디지털 생활"],
  ["갤럭시 백업 복원 Smart Switch", "디지털 생활"],
  ["앱 데이터 계정 동기화 초기화", "디지털 생활"],
  ["컴퓨터 파일 백업 복구 저장", "디지털 생활"],
  ["와이파이 블루투스 연결 설정 안됨", "디지털 생활"],
  ["카카오톡 대화 백업 복원 PC", "디지털 생활"],
  ["클라우드 사진 파일 동기화 문제", "디지털 생활"],

  ["대형폐기물 신청 배출 수거", "생활 행정"],
  ["분리수거 재활용 버리는 방법", "생활 행정"],
  ["주민센터 온라인 민원 신청 방법", "생활 행정"],
  ["전입신고 주소변경 생활 민원", "생활 행정"],
  ["우편 택배 반송 수령 생활", "생활 행정"],
  ["공공서비스 신청 준비물 생활", "생활 행정"],

  ["세탁기 청소 필터 배수 사용", "집 관리"],
  ["에어컨 필터 청소 관리", "집 관리"],
  ["냉장고 냉동실 보관 정리", "집 관리"],
  ["집 곰팡이 습기 환기 관리", "집 관리"],
  ["욕실 주방 청소 보관 관리", "집 관리"],

  ["이불 옷 보관 정리 방법", "정리·보관"],
  ["식재료 냉장 냉동 보관 방법", "정리·보관"],
  ["이사 짐 정리 보관 방법", "정리·보관"],
  ["서류 사진 파일 정리 보관", "정리·보관"],

  ["제품 사용법 설정 초기화", "제품 사용"],
  ["제품 연결 설치 사용 안됨", "제품 사용"],
  ["충전 배터리 설정 사용 방법", "제품 사용"],
  ["기기 교체 이전 초기 설정", "제품 사용"],
  ["설명서 없이 설정 사용 방법", "제품 사용"],
];

const hardExcludeGroups = {
  "의료·건강": [
    "병원", "의사", "약사", "약 ", "약물", "복용", "처방", "증상", "진단", "치료", "질환", "질병",
    "수술", "통증", "혈압", "혈당", "임신", "생리", "영양제", "다이어트", "칼로리", "건강검진",
  ],
  "법률·분쟁": [
    "고소", "고발", "소송", "변호사", "법률", "법적", "처벌", "형사", "민사", "합의금", "손해배상",
    "내용증명", "벌금", "징역", "전과", "노동법", "근로기준법", "해고", "산재",
  ],
  "금융·재정": [
    "대출", "주식", "코인", "투자", "재테크", "보험", "연금", "세금", "절세", "신용점수", "카드론",
    "이자", "채무", "채권", "파산", "회생", "청약", "증권",
  ],
  "전문 안전 작업": [
    "가스 누출", "가스누출", "누전", "감전", "배선 작업", "전기공사", "분전반", "차단기 교체", "석면",
    "보일러 분해", "가스 배관", "구조 균열", "화재 진압",
  ],
};

const areaTerms = {
  "디지털 생활": [
    "휴대폰", "스마트폰", "아이폰", "갤럭시", "안드로이드", "컴퓨터", "노트북", "pc", "윈도우", "앱", "계정",
    "백업", "복원", "동기화", "클라우드", "icloud", "파일", "사진", "데이터", "카카오톡", "와이파이", "블루투스",
  ],
  "생활 행정": [
    "대형폐기물", "폐기물", "분리수거", "재활용", "배출", "수거", "주민센터", "민원", "전입신고", "주소변경",
    "신고", "신청", "우편", "택배", "공공", "구청", "시청", "동사무소",
  ],
  "집 관리": [
    "세탁기", "냉장고", "에어컨", "청소", "필터", "배수", "욕실", "주방", "환기", "습기", "곰팡이", "건조",
    "세척", "집안", "가전",
  ],
  "정리·보관": [
    "보관", "정리", "수납", "냉장", "냉동", "이불", "옷", "식재료", "서류", "짐", "보관함", "정리함",
  ],
  "제품 사용": [
    "사용법", "사용 방법", "설정", "초기화", "설치", "연결", "교체", "충전", "업데이트", "오류", "안됨", "안 돼",
    "작동", "기기", "제품", "설명서",
  ],
};

const problemTerms = [
  "어떻게", "방법", "왜", "언제", "얼마나", "가능", "안됨", "안돼", "안 돼", "없어", "사라", "오류", "문제",
  "복구", "복원", "백업", "옮기", "이전", "버리", "배출", "수거", "보관", "청소", "세척", "설정", "초기화",
  "연결", "설치", "교체", "삭제", "변경", "준비", "확인", "차이", "되나요", "인가요", "할까요", "인가",
];

const evergreenStrongTerms = [
  "방법", "차이", "언제", "가능", "백업", "복원", "이전", "옮기", "보관", "버리", "배출", "수거", "청소", "세척",
  "설정", "초기화", "연결", "설치", "교체", "준비물", "확인", "사용법", "오류", "안됨",
];

const ephemeralTerms = [
  "오늘", "지금 실시간", "실시간", "방금", "속보", "이벤트", "쿠폰", "할인", "특가", "프로모션", "당첨", "오픈런",
  "서버 터짐", "먹통", "장애 발생", "오늘만",
];

const shoppingNoiseTerms = ["최저가", "구매 추천", "뭐 살까요", "추천해주세요", "판매처", "가격 비교", "중고 가격"];
const htmlEntityPattern = /&(?:amp|lt|gt|quot|apos|#39);/g;

main().catch((error) => {
  console.error(`[KIN monitor] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  requireEnv("NAVER_API_HUB_CLIENT_ID");
  requireEnv("NAVER_API_HUB_CLIENT_SECRET");
  requireEnv("NOTION_API_KEY");
  requireEnv("NOTION_DATA_SOURCE_ID");

  const schema = await retrieveNotionDataSource();
  const notionProperties = resolveNotionProperties(schema.properties || {});
  if (!notionProperties.url) {
    throw new Error(
      "Notion 데이터 소스에 URL 속성이 필요합니다. `원문 URL`(URL 타입)을 추가하거나 Repository Variable `NOTION_URL_PROPERTY`에 실제 URL 속성명을 지정하세요.",
    );
  }

  const selectedSeeds = rotatingSeedBatch();
  console.log(`[KIN monitor] ${selectedSeeds.length}개 탐색어 조회 · 기준점수 ${SCORE_THRESHOLD}`);

  const raw = [];
  for (const [query, area] of selectedSeeds) {
    try {
      const items = await searchKin(query);
      items.forEach((item, index) => raw.push({ ...item, seedQuery: query, seedArea: area, dateRank: index + 1 }));
    } catch (error) {
      console.warn(`[KIN monitor] 검색 실패: ${query} · ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const unique = dedupeByUrlAndTitle(raw)
    .map(analyzeQuestion)
    .filter((item) => !item.excluded)
    .filter((item) => item.scopeScore >= 2 && item.problemScore >= 1);

  const clustered = clusterQuestions(unique)
    .map(scoreCluster)
    .filter((item) => item.totalScore >= SCORE_THRESHOLD)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, MAX_DEDUPE_CHECKS);

  if (!clustered.length) {
    console.log(`[KIN monitor] 등록 후보 없음 · 원시 ${raw.length}건 / 중복·제외 후 ${unique.length}건`);
    return;
  }

  let created = 0;
  for (const candidate of clustered) {
    if (created >= MAX_PAGES_PER_RUN) break;
    if (await notionHasUrl(candidate.link, notionProperties.url.name)) {
      console.log(`[KIN monitor] 이미 등록됨: ${candidate.title}`);
      await sleep(360);
      continue;
    }

    await createNotionPage(candidate, notionProperties);
    created += 1;
    console.log(`[KIN monitor] Notion 등록: ${candidate.title} · ${candidate.totalScore.toFixed(1)}점`);
    await sleep(360);
  }

  console.log(
    `[KIN monitor] 완료 · 원시 ${raw.length}건 / 1차 통과 ${unique.length}건 / 점수 통과 ${clustered.length}건 / 신규 등록 ${created}건`,
  );
}

function rotatingSeedBatch() {
  const batches = Math.ceil(seeds.length / SEEDS_PER_RUN);
  const tenMinuteSlot = Math.floor(Date.now() / 600_000);
  const batchIndex = tenMinuteSlot % batches;
  const start = batchIndex * SEEDS_PER_RUN;
  return seeds.slice(start, start + SEEDS_PER_RUN);
}

async function searchKin(query) {
  const url = new URL(`${NAVER_BASE_URL}/search/v1/kin`);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(SEARCH_DISPLAY));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "date");

  const response = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_API_HUB_CLIENT_ID,
      "X-NCP-APIGW-API-KEY": process.env.NAVER_API_HUB_CLIENT_SECRET,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`NAVER ${response.status}: ${text.slice(0, 300)}`);
  const data = safeJson(text);
  return Array.isArray(data?.items) ? data.items : [];
}

function analyzeQuestion(item) {
  const title = cleanText(item.title || "");
  const description = cleanText(item.description || "");
  const combined = `${title} ${description}`.toLowerCase();
  const excludedBy = findExcludedGroup(combined);
  if (excludedBy) return { ...item, title, description, excluded: true, excludedBy };

  const areaScores = Object.entries(areaTerms).map(([area, terms]) => [area, countMatches(combined, terms)]);
  areaScores.sort((a, b) => b[1] - a[1]);
  const [bestArea, areaHits] = areaScores[0] || [item.seedArea || "생활 가이드", 0];
  const scopeScore = Math.min(4, areaHits >= 4 ? 4 : areaHits >= 2 ? 3 : areaHits === 1 ? 2 : 0);

  const problemHits = countMatches(combined, problemTerms);
  const hasQuestionMark = title.includes("?");
  const problemScore = Math.min(3, problemHits >= 3 ? 3 : problemHits >= 1 ? 2 : hasQuestionMark ? 1 : 0);

  const evergreenHits = countMatches(combined, evergreenStrongTerms);
  const ephemeralHits = countMatches(combined, ephemeralTerms);
  let evergreenScore = evergreenHits >= 3 ? 3 : evergreenHits >= 1 ? 2 : 1;
  if (ephemeralHits > 0) evergreenScore = Math.max(0, evergreenScore - 2);

  const noisePenalty = countMatches(combined, shoppingNoiseTerms) * 1.5 + (title.length < 8 ? 1 : 0);
  const recencyHint = item.dateRank <= 10 ? 1.5 : item.dateRank <= 25 ? 1 : 0.5;

  return {
    ...item,
    title,
    description,
    excluded: false,
    area: bestArea || item.seedArea || "생활 가이드",
    scopeScore,
    problemScore,
    evergreenScore,
    recencyHint,
    noisePenalty,
    tokens: importantTokens(`${title} ${description}`),
  };
}

function clusterQuestions(items) {
  const clusters = [];
  for (const item of items) {
    let best = null;
    let bestSimilarity = 0;
    for (const cluster of clusters) {
      const similarity = tokenJaccard(item.tokens, cluster.tokens);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        best = cluster;
      }
    }
    if (best && bestSimilarity >= 0.48) {
      best.items.push(item);
      best.tokens = unionTokens(best.tokens, item.tokens);
    } else {
      clusters.push({ items: [item], tokens: item.tokens });
    }
  }
  return clusters;
}

function scoreCluster(cluster) {
  const representative = [...cluster.items].sort((a, b) => {
    const scoreA = a.scopeScore + a.problemScore + a.evergreenScore + a.recencyHint - a.noisePenalty;
    const scoreB = b.scopeScore + b.problemScore + b.evergreenScore + b.recencyHint - b.noisePenalty;
    return scoreB - scoreA;
  })[0];

  const independentLinks = new Set(cluster.items.map((item) => normalizeUrl(item.link)).filter(Boolean));
  const seedQueries = [...new Set(cluster.items.map((item) => item.seedQuery))];
  const repeatedDemandScore = Math.min(3, Math.max(0, independentLinks.size - 1) * 0.8 + Math.max(0, seedQueries.length - 1) * 0.4);
  const totalScore =
    representative.scopeScore +
    representative.problemScore +
    representative.evergreenScore +
    representative.recencyHint +
    repeatedDemandScore -
    representative.noisePenalty;

  return {
    ...representative,
    totalScore,
    repeatedDemandScore,
    independentQuestionCount: independentLinks.size,
    relatedTitles: cluster.items
      .filter((item) => item.link !== representative.link)
      .map((item) => item.title)
      .filter(Boolean)
      .slice(0, 5),
    matchedSeeds: seedQueries.slice(0, 6),
  };
}

function dedupeByUrlAndTitle(items) {
  const urls = new Set();
  const titles = new Set();
  const out = [];
  for (const item of items) {
    const url = normalizeUrl(item.link);
    const title = normalizeText(cleanText(item.title || ""));
    if (!url || !title || urls.has(url) || titles.has(title)) continue;
    urls.add(url);
    titles.add(title);
    out.push({ ...item, link: url });
  }
  return out;
}

function findExcludedGroup(text) {
  for (const [group, terms] of Object.entries(hardExcludeGroups)) {
    if (terms.some((term) => text.includes(term.toLowerCase()))) return group;
  }
  return "";
}

function countMatches(text, terms) {
  return terms.reduce((sum, term) => sum + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function importantTokens(text) {
  const stopwords = new Set([
    "질문", "문의", "관련", "궁금", "해주세요", "합니다", "하는", "하고", "있나요", "되나요", "인가요", "어떻게", "제가",
    "이거", "저거", "정도", "때문", "대해서", "경우", "방법", "좀", "수", "것", "거", "요",
  ]);
  return [...new Set(normalizeText(text).split(" ").filter((token) => token.length >= 2 && !stopwords.has(token)))].slice(0, 30);
}

function tokenJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) if (bSet.has(token)) intersection += 1;
  return intersection / (aSet.size + bSet.size - intersection);
}

function unionTokens(a, b) {
  return [...new Set([...a, ...b])].slice(0, 40);
}

async function retrieveNotionDataSource() {
  return notionFetch(`/v1/data_sources/${encodeURIComponent(process.env.NOTION_DATA_SOURCE_ID)}`);
}

function resolveNotionProperties(properties) {
  const entries = Object.values(properties || {});
  const title = entries.find((prop) => prop.type === "title");
  const requestedUrl = process.env.NOTION_URL_PROPERTY?.trim();
  const url = requestedUrl
    ? entries.find((prop) => prop.name === requestedUrl && prop.type === "url")
    : findProperty(entries, ["원문 URL", "지식iN URL", "URL", "링크", "Source URL"], "url");

  return {
    title,
    url,
    foundAt: findProperty(entries, ["발견일", "발견 일시", "수집일", "Created"], "date"),
    score: findProperty(entries, ["점수", "우선순위 점수", "Score"], "number"),
    evergreen: findProperty(entries, ["에버그린", "Evergreen"], "number"),
    demand: findProperty(entries, ["유사 질문", "독립 질문", "반복 수요"], "number"),
    summary: findProperty(entries, ["질문 요약", "요약", "Summary"], "rich_text"),
    category: findProperty(entries, ["카테고리", "Category"], "select"),
    area: findProperty(entries, ["내부 분류", "주제 영역", "Topic Area"], "select"),
    status: findProperty(entries, ["상태", "Status"], ["select", "status"]),
  };
}

function findProperty(entries, aliases, types) {
  const allowedTypes = Array.isArray(types) ? types : [types];
  return entries.find((prop) => aliases.includes(prop.name) && allowedTypes.includes(prop.type));
}

async function notionHasUrl(url, propertyName) {
  const result = await notionFetch(`/v1/data_sources/${encodeURIComponent(process.env.NOTION_DATA_SOURCE_ID)}/query`, {
    method: "POST",
    body: {
      page_size: 1,
      filter: {
        property: propertyName,
        url: { equals: url },
      },
    },
  });
  return Array.isArray(result?.results) && result.results.length > 0;
}

async function createNotionPage(candidate, props) {
  if (!props.title) throw new Error("Notion 데이터 소스에서 Title 속성을 찾지 못했습니다.");
  const properties = {
    [props.title.name]: { title: richText(candidate.title, 180) },
    [props.url.name]: { url: candidate.link },
  };

  if (props.foundAt) properties[props.foundAt.name] = { date: { start: new Date().toISOString() } };
  if (props.score) properties[props.score.name] = { number: round1(candidate.totalScore) };
  if (props.evergreen) properties[props.evergreen.name] = { number: candidate.evergreenScore };
  if (props.demand) properties[props.demand.name] = { number: candidate.independentQuestionCount };
  if (props.summary) properties[props.summary.name] = { rich_text: richText(candidate.description || candidate.title, 800) };
  setExistingSelect(properties, props.category, "생활 가이드");
  setExistingSelect(properties, props.area, candidate.area);
  setExistingSelect(properties, props.status, "검토 전");

  const bodyLines = [
    `**공개 카테고리:** 생활 가이드`,
    `**내부 분류:** ${candidate.area}`,
    `**스크립트 검토 점수:** ${candidate.totalScore.toFixed(1)} / 참고용`,
    `**에버그린 힌트:** ${candidate.evergreenScore}/3`,
    `**반복 수요 힌트:** 독립 URL ${candidate.independentQuestionCount}건`,
    `**최신성 힌트:** 지식iN 최신순 결과 ${candidate.dateRank}위에서 신규 발견`,
    `**탐색어:** ${candidate.matchedSeeds.join(" · ")}`,
    "",
    `**질문 요약**`,
    candidate.description || "설명 없음",
    "",
    `**원문**`,
    candidate.link,
  ];
  if (candidate.relatedTitles.length) {
    bodyLines.push("", "**유사 독립 질문**", ...candidate.relatedTitles.map((title) => `- ${title}`));
  }
  bodyLines.push(
    "",
    "**판단 주의**",
    "이 페이지는 GitHub Actions의 규칙 기반 1차 필터를 통과한 ‘검토 후보’입니다. 최종 주제 선정·공식 원문 검증·중복 콘텐츠 검사는 기존 content-topic-research-web + ChatGPT Pro 단계에서 다시 수행하세요.",
  );

  await notionFetch("/v1/pages", {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: process.env.NOTION_DATA_SOURCE_ID },
      properties,
      children: bodyLines.filter((line) => line !== "").map((line) => ({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText(line, 1800) },
      })),
    },
  });
}

function setExistingSelect(properties, prop, value) {
  if (!prop || !value) return;
  if (prop.type === "select") {
    const options = prop.select?.options || [];
    if (options.some((option) => option.name === value)) properties[prop.name] = { select: { name: value } };
  } else if (prop.type === "status") {
    const options = prop.status?.options || [];
    if (options.some((option) => option.name === value)) properties[prop.name] = { status: { name: value } };
  }
}

async function notionFetch(path, options = {}) {
  const response = await fetch(`https://api.notion.com${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Notion ${response.status}: ${text.slice(0, 700)}`);
  return safeJson(text);
}

function richText(content, maxLength) {
  const text = String(content || "").slice(0, maxLength);
  const bold = text.match(/^\*\*(.+)\*\*$/);
  if (bold) {
    return [{ type: "text", text: { content: bold[1] }, annotations: { bold: true } }];
  }
  return [{ type: "text", text: { content: text } }];
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(htmlEntityPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString();
  } catch {
    return String(value).trim();
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function integerEnv(name, fallback, min, max) {
  const value = Math.floor(Number(process.env[name]));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function requireEnv(name) {
  if (!process.env[name]?.trim()) throw new Error(`필수 환경변수 ${name}가 없습니다.`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
