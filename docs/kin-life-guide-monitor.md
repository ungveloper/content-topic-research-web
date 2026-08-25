# 네이버 지식iN → Notion 생활 가이드 모니터

이 기능은 GitHub Actions가 10분마다 네이버 지식iN 최신 검색 결과를 확인하고, 규칙 기반 1차 검토를 통과한 질문만 Notion 데이터 소스에 등록합니다.

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
- `발견일` — Date
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
- `MONITOR_SEEDS_PER_RUN` — 기본 `8`

탐색어는 10분마다 일부만 순환합니다. 기본 설정에서는 28개 탐색어를 8개씩 조회하므로 전체 탐색 범위는 약 40분 안에 한 바퀴 돕니다. 10분마다 8회만 지식iN Search API를 호출하므로 하루 약 1,152회 수준입니다.

## 스케줄 주의

워크플로는 `*/10 * * * *`로 설정되어 있습니다. GitHub Actions 예약 실행은 목표 시간이지만 서버 부하 등에 따라 실제 시작이 몇 분 늦어질 수 있으므로 실시간 감시 용도로 보지는 않습니다.

## 수동 테스트

GitHub의 Actions → `KIN Life Guide Monitor` → `Run workflow`로 즉시 한 번 실행할 수 있습니다.

성공 로그 예시:

```text
[KIN monitor] 8개 탐색어 조회 · 기준점수 8
[KIN monitor] Notion 등록: ... · 10.3점
[KIN monitor] 완료 · 원시 400건 / 1차 통과 47건 / 점수 통과 8건 / 신규 등록 3건
```
