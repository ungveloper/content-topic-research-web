# content-topic-research-web

네이버 검색·NAVER 검색어트렌드·Google Trends·Search Console·뉴스·커뮤니티·공식자료에서 얻은 신호를 한곳에 모아, **검색량이 아니라 게시 가치**를 기준으로 콘텐츠 주제를 선별하는 Next.js 도구입니다.

## 핵심 원칙

- 네이버 검색 API: 키워드 생산기가 아니라 **사용자가 실제로 묻는 문제 탐지기**로 사용
- NAVER 검색어트렌드 / Google Trends: WHAT보다 **WHEN(수요·발행 시기)** 판단에 사용
- 네이버 뉴스: 기사 재작성보다 **변경 감지**에 사용
- Search Console: 내 사이트가 이미 노출되는 **실제 기회**를 우선 발견
- 카페·지식iN·커뮤니티: 사실 근거가 아니라 **불편·질문 표현** 탐색
- 공식기관·제조사 자료: **사실 검증**에 사용
- 같은 검색 의도는 한 페이지로 클러스터링
- 웹서핑한 내용을 직접 체험한 것처럼 쓰지 않음
- 60점 미만 후보는 자동으로 “제작 보류” 상태로 판단

## 실행

```bash
npm install
npm run dev
```

## NAVER API HUB 설정

이 프로젝트는 2026년 NAVER API HUB 기준으로 다음 Application API를 사용합니다.

- 검색어트렌드
- 뉴스
- 블로그
- 지식iN
- 카페
- 웹문서

NAVER Cloud Platform의 **NAVER API HUB > Application > 인증 정보**에서 Client ID와 Client Secret을 확인한 뒤 프로젝트 루트에 `.env.local`을 만듭니다.

```env
NAVER_API_HUB_CLIENT_ID=...
NAVER_API_HUB_CLIENT_SECRET=...
```

기존 NAVER Developers의 `X-Naver-Client-Id` / `X-Naver-Client-Secret` 방식이 아니라 NAVER API HUB의 다음 인증 헤더와 엔드포인트를 사용합니다.

- API 도메인: `https://naverapihub.apigw.ntruss.com`
- Client ID 헤더: `X-NCP-APIGW-API-KEY-ID`
- Client Secret 헤더: `X-NCP-APIGW-API-KEY`
- 검색: `/search/v1/*`
- 검색어트렌드: `/search-trend/v1/search`

> Client ID와 Client Secret은 브라우저 코드에 넣지 않습니다. Next.js Route Handler에서만 읽도록 구성되어 있습니다.

## NAVER 검색어트렌드 사용 방식

앱에서 최대 5개 키워드를 비교할 수 있습니다. API가 반환하는 `ratio` 값은 절대 검색량이 아니라 요청한 기간·검색어 집합 안에서 정규화된 상대 지수이므로, **주제 결정용 절대 검색량이 아니라 수요·계절성·발행 시기 신호**로만 사용합니다.

- 최근 90일: 주간 단위
- 최근 1년: 월간 단위
- 저장 시 최근 4개 구간의 평균 상대지수를 `trendScore`로 기록

## 데이터 보관

현재 버전은 개인용 리서치 도구를 전제로 브라우저 `localStorage`에 신호와 후보를 저장합니다. 서버 DB가 필요하면 Supabase/Firebase/Postgres 등으로 저장 레이어만 교체할 수 있습니다.

## Search Console 가져오기

Performance 화면에서 CSV를 내보낸 뒤 앱의 `Search Console CSV` 영역에서 업로드합니다. 다음과 같은 헤더를 자동 인식합니다.

- Query / 검색어 / 쿼리
- Clicks / 클릭수
- Impressions / 노출수
- CTR
- Position / 게재순위 / 평균 게재순위

## 빌드

```bash
npm run build
```

## 원클릭 자동 탐색

첫 화면의 **오늘의 자동 탐색 시작** 버튼은 키워드 입력 없이 동작합니다.

- 현재 월/계절과 서비스 기본 방향(생활 문제 해결 · 디지털 생활)을 기준으로 매일 5개의 시드 주제를 자동 선택합니다.
- NAVER 지식iN, 카페, 블로그에서 실제 불편과 질문 표현을 찾습니다.
- NAVER 뉴스는 변경 감지용으로 조회합니다.
- NAVER 웹문서에서는 공식 기관·제조사 도메인을 우선 식별해 근거 후보로 저장합니다.
- NAVER 검색어트렌드는 최근 90일 상대 검색지수로 수요와 발행 시기를 보조 평가합니다.
- 수집한 신호를 주제별로 묶어 Candidate와 품질 점수를 자동 생성합니다.
- 직접 경험 자료가 없는 후보는 조사·검증형 또는 비교·분석형으로 생성하며, 직접 체험한 것처럼 서술하지 않도록 프롬프트에 명시합니다.

한 번 탐색한 뒤 **다른 주제 5개 찾기**를 누르면 날짜 기반 시드 풀을 회전해 다음 후보군을 조사합니다. 수동 검색 UI는 자동 탐색에서 빠진 주제를 추가 조사할 때만 사용하면 됩니다.
