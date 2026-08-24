# Patch

변경 파일:
- components/research-workbench.tsx
- lib/research.ts
- lib/topic-review.ts

변경 내용:
1. NAVER Evidence Bundle 생성 완료 토스트 제거
2. 전체 심사 프롬프트 복사는 목록/검색 결과를 숨기지 않음
3. Evidence Bundle 카드를 직접 클릭하면 해당 bundle 한 개만 포함한 ChatGPT Pro 심사 프롬프트를 복사하고 현재 목록에서 해당 카드만 숨김
4. 원문 링크 클릭은 카드 복사/숨김을 발생시키지 않음
5. 직접 숨긴 카드 이후에는 전체 심사 프롬프트도 현재 남은 bundle만 포함하도록 갱신
6. 최종 WordPress 응답이 외곽 코드 블록으로 감싸지는 현상을 막기 위한 강제 정규화 규칙 강화
