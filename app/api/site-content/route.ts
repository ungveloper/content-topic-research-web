import { NextRequest, NextResponse } from "next/server";
import { stripHtml } from "@/lib/research";
import type { SiteContentRecord } from "@/lib/types";

type WordPressPost = {
  id?: number;
  link?: string;
  slug?: string;
  date?: string;
  modified?: string;
  title?: { rendered?: string };
};

const FAST_CHANGE_MARKERS = [
  "아이폰", "iphone", "ios", "icloud", "안드로이드", "android", "갤럭시", "앱", "서비스", "계정",
  "업데이트", "버전", "설정", "백업", "복원", "동기화", "지원", "정책", "요금", "가격",
  "신청", "신고", "민원", "행정", "폐기물", "수거", "배출", "지자체", "공공서비스",
];

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normalizeSiteUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("WordPress 사이트 URL은 http 또는 https만 사용할 수 있습니다.");
  if (isPrivateHost(parsed.hostname)) throw new Error("로컬/사설 네트워크 주소는 동기화할 수 없습니다.");
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function revalidationWindowDays(title: string): 90 | 180 {
  const normalized = title.toLowerCase();
  return FAST_CHANGE_MARKERS.some((marker) => normalized.includes(marker)) ? 90 : 180;
}

function daysSince(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

export async function POST(request: NextRequest) {
  let body: { siteUrl?: string; maxPosts?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!body.siteUrl?.trim()) {
    return NextResponse.json({ error: "WordPress 사이트 URL을 입력해주세요." }, { status: 400 });
  }

  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(body.siteUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "사이트 URL 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const maxPosts = Math.max(20, Math.min(500, Math.floor(Number(body.maxPosts) || 300)));
  const perPage = 100;
  const maxPages = Math.ceil(maxPosts / perPage);
  const posts: WordPressPost[] = [];

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(`${siteUrl}/wp-json/wp/v2/posts`);
      url.searchParams.set("status", "publish");
      url.searchParams.set("per_page", String(Math.min(perPage, maxPosts - posts.length)));
      url.searchParams.set("page", String(page));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      url.searchParams.set("_fields", "id,link,slug,date,modified,title");

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });

      if (response.status === 400 && page > 1) break;
      if (!response.ok) {
        throw new Error(`WordPress REST API 응답 오류 (${response.status})`);
      }

      const pageItems = (await response.json()) as WordPressPost[];
      if (!Array.isArray(pageItems) || !pageItems.length) break;
      posts.push(...pageItems);
      if (pageItems.length < perPage || posts.length >= maxPosts) break;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? `WordPress 글 목록을 가져오지 못했습니다: ${error.message}`
          : "WordPress 글 목록을 가져오지 못했습니다.",
      },
      { status: 502 },
    );
  }

  const contents: SiteContentRecord[] = posts.slice(0, maxPosts).flatMap((post) => {
    const title = stripHtml(post.title?.rendered || "").trim();
    const url = post.link?.trim();
    if (!title || !url) return [];
    const windowDays = revalidationWindowDays(title);
    const referenceDate = post.modified || post.date;
    return [{
      id: String(post.id || url),
      title,
      url,
      slug: post.slug,
      publishedAt: post.date,
      modifiedAt: post.modified,
      revalidationWindowDays: windowDays,
      revalidationDue: daysSince(referenceDate) >= windowDays,
    }];
  });

  return NextResponse.json({
    siteUrl,
    syncedAt: new Date().toISOString(),
    total: contents.length,
    revalidationDue90: contents.filter((item) => item.revalidationWindowDays === 90 && item.revalidationDue).length,
    revalidationDue180: contents.filter((item) => item.revalidationWindowDays === 180 && item.revalidationDue).length,
    contents,
  });
}
