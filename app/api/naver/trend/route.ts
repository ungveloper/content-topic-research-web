import { NextRequest, NextResponse } from "next/server";
import {
  getNaverApiHubCredentials,
  naverApiHubErrorMessage,
  naverApiHubHeaders,
  naverApiHubUrl,
  readNaverApiHubResponse,
} from "@/lib/naver-api-hub";

type TrendRequest = {
  keywords?: string[];
  range?: "90d" | "1y";
};

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

export async function POST(request: NextRequest) {
  let body: TrendRequest;

  try {
    body = (await request.json()) as TrendRequest;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const keywords = Array.from(
    new Set(
      (body.keywords || [])
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);

  if (!keywords.length) {
    return NextResponse.json({ error: "트렌드를 확인할 검색어를 입력해주세요." }, { status: 400 });
  }

  const credentials = getNaverApiHubCredentials();

  if (!credentials) {
    return NextResponse.json(
      {
        error: "NAVER_API_HUB_CLIENT_ID / NAVER_API_HUB_CLIENT_SECRET 환경변수가 없습니다.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const range = body.range === "1y" ? "1y" : "90d";
  const endDate = new Date();
  const startDate = subtractDays(endDate, range === "1y" ? 365 : 90);
  const endpoint = naverApiHubUrl("/search-trend/v1/search");
  const requestBody = {
    startDate: toDateString(startDate),
    endDate: toDateString(endDate),
    timeUnit: range === "1y" ? "month" : "week",
    keywordGroups: keywords.map((keyword) => ({
      groupName: keyword,
      keywords: [keyword],
    })),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...naverApiHubHeaders(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const data = await readNaverApiHubResponse(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: naverApiHubErrorMessage(data, "NAVER API HUB 검색어 트렌드 요청에 실패했습니다."),
          status: response.status,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      range,
      startDate: data.startDate,
      endDate: data.endDate,
      timeUnit: data.timeUnit,
      results: Array.isArray(data.results) ? data.results : [],
    });
  } catch {
    return NextResponse.json({ error: "NAVER API HUB 검색어 트렌드 API에 연결할 수 없습니다." }, { status: 502 });
  }
}
