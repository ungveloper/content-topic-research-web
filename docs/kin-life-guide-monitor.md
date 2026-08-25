# 네이버 지식iN → Notion 생활 가이드 모니터

이 기능은 GitHub Actions가 30분마다 네이버 지식iN 최신 검색 결과를 확인하고, 규칙 기반 1차 검토를 통과한 질문만 Notion 데이터 소스에 등록합니다.

## 역할 분리

이 모니터는 **발행 주제 최종 선정기**가 아니라 **놓치기 아까운 새 질문을 모아두는 Inbox**입니다.

스크립트가 담당하는 것:
- 생활 가이드 범위 1차 판별
- 의료·건강 / 법률·분쟁 / 금융·재정 / 전문 안전 작업 하드 제외
- 최신순 검색을 통한 신규 발견 힌트
- URL·정규화 제목 중복 제거
- 유사 질문 클러스터링과 독립 URL 수 기반 반복 수요 힌트
- 안정적인 문제 유형의 에버그린 힌트
- Notion 원문 URL 중복 검사

기존 앱 + ChatGPT Pro가 계속 담당해야 하는 것:
- 실제 검색 의도 판단
- 공식 1차 출처 검증
- 검색 결과 포화도 및 독창성 판단
- WordPress 기존 글과 중복/통합 판단
- Search Console 성과 반영
- 최종 게시/보류 결정

즉 규칙 기반 점수는 `검토 우선순위`일 뿐이며, 점수가 높다고 자동 발행하지 않습니다.

## GitHub Secrets

Repository → Settings → Secrets and variables → Actions → Secrets에 아래 4개를 등록합니다.

- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`
- `NOTION_API_KEY`
- `NOTION_DATA_SOURCE_ID`

`NOTION_DATA_SOURCE_ID`는 최신 Notion API의 data source ID입니다. 데이터베이스 ID와 구분됩니다.

## Notion 데이터 소스 최소 속성

최소 두 속성이 필요합니다.

1. 아무 이름의 `Title` 속성
2. `원문 URL`이라는 이름의 `URL` 속성

URL 속성명이 다르면 GitHub Repository Variable에 아래 값을 추가합니다.

- `NOTION_URL_PROPERTY` = 실제 URL 속성명

추가하면 자동으로 채울 수 있는 선택 속성:
- `발견일시` — Date (`발견일`, `발견 일시`도 자동 인식)
- `점수` — Number
- `에버그린` — Number
- `유사 질문` — Number
- `질문 요약` — Rich text
- `카테고리` — Select, `생활 가이드` 옵션이 이미 있을 때만 입력
- `내부 분류` — Select, `디지털 생활 / 생활 행정 / 집 관리 / 정리·보관 / 제품 사용` 옵션이 이미 있을 때만 입력
- `상태` — Select 또는 Status, `검토 전` 옵션이 이미 있을 때만 입력

Notion Integration에는 대상 데이터 소스 접근 권한과 읽기/삽입 권한이 필요합니다.

## 선택 Repository Variables

등록하지 않으면 기본값을 사용합니다.

- `MONITOR_SCORE_THRESHOLD` — 기본 `8`
- `MONITOR_MAX_PAGES_PER_RUN` — 기본 `5`
- `MONITOR_SEEDS_PER_RUN` — 기본 `28`

기본 설정에서는 28개 탐색어를 한 실행에서 모두 확인합니다. GitHub Actions가 30분마다 실행되므로 전체 탐색 범위를 매 실행마다 한 바퀴 확인합니다. 지식iN Search API 호출은 하루 약 1,344회 수준입니다. `MONITOR_SEEDS_PER_RUN`을 낮추면 여러 실행에 나누어 순환합니다.

## 스케줄 주의

워크플로는 서울 시간 기준 매시 `07분/37분`에 실행되도록 설정되어 있습니다. GitHub Actions 예약 실행은 목표 시간이지만 서버 부하 등에 따라 실제 시작이 몇 분 늦어질 수 있으므로 실시간 감시 용도로 보지는 않습니다.

## 수동 테스트

GitHub의 Actions → `KIN Life Guide Monitor` → `Run workflow`로 즉시 한 번 실행할 수 있습니다.

성공 로그 예시:

```text
[KIN monitor] 8개 탐색어 조회 · 기준점수 8
[KIN monitor] Notion 등록: ... · 10.3점
[KIN monitor] 완료 · 원시 400건 / 1차 통과 47건 / 점수 통과 8건 / 신규 등록 3건
```


## 2026-08-25 보완 사항

- GitHub Actions 예약 실행은 서울 시간 기준 매시 `07분/37분`에 실행합니다. 30분 간격을 유지하면서 매시 정각의 Actions 혼잡을 피합니다. GitHub 예약 작업은 서버 부하에 따라 몇 분 지연되거나 드물게 누락될 수 있으므로 정확한 실시간 스케줄러로 보지는 않습니다.
- Notion의 Title 속성 이름은 자유롭습니다. `질문`을 `제목`으로 바꿔도 코드가 속성 타입(`title`)으로 자동 인식합니다.
- `내부 분류` 속성은 선택 사항입니다. 삭제해도 모니터는 정상 동작하며, 내부 분류 계산 자체는 스크립트 필터에만 계속 사용됩니다.
- NAVER 지식iN 검색 API의 `description`은 질문 본문이 아니라 답변 스니펫일 수 있습니다. 이제 최종 Notion 등록 직전에 실제 지식iN 원문 페이지를 다시 확인해 `questionDetail` 계열 영역에서 질문 본문을 추출합니다. 원문을 읽지 못한 경우 답변 스니펫으로 대체하지 않고 ‘원문 확인 필요’로 표시합니다.
- 지식iN URL은 `answerNo`를 제거하고 `dirId + docId` 기준 질문 URL로 정규화하여 같은 질문의 여러 답변 링크가 중복 등록되지 않게 합니다.


## 2026-08-25 질문 본문 추출 추가 보완

- 질문 원문은 데스크톱 URL 하나만 요청하지 않고 `m.kin.naver.com/qna/dirs/{dirId}/docs/{docId}` 모바일 URL을 우선 확인한 뒤 데스크톱 URL을 순차적으로 확인합니다.
- `questionDetail`이 class 속성의 첫 번째 클래스일 때 기존 정규식이 놓칠 수 있던 문제를 수정했습니다.
- 질문 본문은 JSON-LD의 `Question`, `questionDetail`/`c-heading__content` 계열 HTML, 마지막으로 메타 description 순서로 확인합니다.
- 검색 API의 답변 스니펫은 질문 본문 대체값으로 사용하지 않습니다.
- Notion Date 속성명 `발견일시`를 기본 인식하며 기존 `발견일`, `발견 일시`도 호환합니다.
- 내부 규칙 기반 raw score는 이론상 최대 14.5점이며 기본 등록 기준은 raw 8점입니다. Notion의 `점수` 속성에는 이를 0~100으로 환산한 값이 저장됩니다. 예: raw 11.5점은 약 79/100입니다.
- Notion의 `에버그린` 속성도 내부 0~3점을 0~100으로 환산해 저장합니다. 예: 2/3은 약 67/100, 3/3은 100/100입니다.


## 2026-08-25 전체 질문 본문·100점 환산·30분 주기 보완

- `질문 요약`은 공유용 meta description을 사용하지 않습니다. meta description은 네이버가 중간에 `...`로 줄일 수 있기 때문입니다. JSON-LD 또는 실제 질문 본문 DOM을 확인한 경우에만 저장합니다.
- 질문 본문 요소 안에 중첩 `div`가 있어도 첫 닫는 태그에서 잘리지 않도록 동일 태그 깊이를 계산해 전체 본문을 추출합니다.
- Notion Rich text의 한 조각 길이 제한 때문에 내용이 잘리지 않도록 질문 본문을 여러 rich-text 조각으로 나누어 저장합니다. 일반적인 지식iN 질문은 끝까지 보존하며 비정상적으로 큰 입력만 8,000자로 안전 제한합니다.
- `점수`와 `에버그린`은 Notion에서 보기 쉽게 0~100 점수로 저장합니다. 필터 기준 자체는 기존 raw score를 그대로 사용하므로 후보 선정 튜닝은 변하지 않습니다.
- 기본 모니터 실행은 30분 간격(`07/37분`)이며, 기본 28개 탐색어를 매 실행에서 모두 확인합니다.
