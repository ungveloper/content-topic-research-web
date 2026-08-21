import { NextRequest, NextResponse } from "next/server";
import {
  getNaverApiHubCredentials,
  naverApiHubErrorMessage,
  naverApiHubHeaders,
  naverApiHubUrl,
  readNaverApiHubResponse,
} from "@/lib/naver-api-hub";

const TYPE_PATHS = {
  blog: "blog",
  cafe: "cafearticle",
  kin: "kin",
  news: "news",
  web: "webkr",
} as const;

type SearchType = keyof typeof TYPE_PATHS;

const SORTABLE_TYPES = new Set<SearchType>(["blog", "cafe", "kin", "news"]);

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const type = (request.nextUrl.searchParams.get("type") || "blog") as SearchType;
  const display = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("display") || 20)));
  const sort = request.nextUrl.searchParams.get("sort") === "date" ? "date" : "sim";

  if (!query) {
    return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
  }

  if (!(type in TYPE_PATHS)) {
    return NextResponse.json({ error: "지원하지 않는 검색 유형입니다." }, { status: 400 });
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

  const endpoint = naverApiHubUrl(`/search/v1/${TYPE_PATHS[type]}`);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("display", String(display));
  endpoint.searchParams.set("start", "1");
  endpoint.searchParams.set("format", "json");
  if (SORTABLE_TYPES.has(type)) endpoint.searchParams.set("sort", sort);

  try {
    const response = await fetch(endpoint, {
      headers: naverApiHubHeaders(credentials),
      cache: "no-store",
    });

    const data = await readNaverApiHubResponse(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: naverApiHubErrorMessage(data, "NAVER API HUB 검색 요청에 실패했습니다."),
          status: response.status,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      type,
      query,
      total: typeof data.total === "number" ? data.total : 0,
      items: Array.isArray(data.items) ? data.items : [],
    });
  } catch {
    return NextResponse.json({ error: "NAVER API HUB 검색 API에 연결할 수 없습니다." }, { status: 502 });
  }
}
