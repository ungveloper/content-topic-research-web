import type { Candidate, Signal } from "@/lib/types";
import { defaultCandidate, makeId } from "@/lib/research";

export function createSampleData(): { signals: Signal[]; candidates: Candidate[] } {
  const now = new Date().toISOString();
  const signals: Signal[] = [
    {
      id: makeId("signal"),
      kind: "google-trends",
      title: "에어컨 냄새",
      query: "에어컨 냄새",
      snippet: "여름 후반 반복 수요를 확인한 시기 신호",
      sourceLabel: "Google Trends 수동 기록",
      createdAt: now,
      metrics: { trendScore: 82 },
    },
    {
      id: makeId("signal"),
      kind: "community",
      title: "필터를 청소했는데도 켜자마자 쉰내가 난다는 질문이 반복됨",
      query: "에어컨 냄새",
      snippet: "‘청소했는데도’, ‘켜자마자’, ‘송풍할 때만’ 같은 조건 표현을 주목",
      sourceLabel: "커뮤니티 관찰",
      createdAt: now,
    },
    {
      id: makeId("signal"),
      kind: "official",
      title: "제조사별 필터·건조 관리 안내 비교 필요",
      query: "에어컨 필터 관리",
      snippet: "삼성/LG 등 제조사 공식 관리 자료에서 세척 가능 여부와 건조 기준 확인",
      sourceLabel: "제조사 공식 지원",
      createdAt: now,
    },
  ];

  const candidate = defaultCandidate(signals[0]);
  candidate.title = "에어컨 냄새가 나는 시점별 확인 순서";
  candidate.problem = "필터를 청소했는데도 냄새가 나는 사용자가 무엇부터 확인해야 하는지 모른다.";
  candidate.sourceSignalIds = signals.map((signal) => signal.id);
  candidate.contentMode = "comparison-analysis";
  candidate.uniqueOutput = "켜자마자 / 냉방 중 / 송풍 중으로 나눠 제조사 안내와 사용자 증상 패턴을 비교한 판단표";
  candidate.verificationPlan = "제조사 공식 문서에서 필터 세척·건조·자동건조 안내를 확인하고 커뮤니티 사례는 증상 표현 탐색에만 사용";
  candidate.scoreInputs = {
    siteFit: 5,
    problemSpecificity: 5,
    demand: 4,
    officialEvidence: 5,
    originalValue: 5,
    evergreen: 5,
  };
  candidate.penalties.aiCommodity = false;

  return { signals, candidates: [candidate] };
}
