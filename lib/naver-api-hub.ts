const NAVER_API_HUB_BASE_URL = "https://naverapihub.apigw.ntruss.com";

export function getNaverApiHubCredentials() {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function naverApiHubHeaders(credentials: { clientId: string; clientSecret: string }) {
  return {
    "X-NCP-APIGW-API-KEY-ID": credentials.clientId,
    "X-NCP-APIGW-API-KEY": credentials.clientSecret,
  };
}

export function naverApiHubUrl(path: string) {
  return new URL(path, NAVER_API_HUB_BASE_URL);
}

export async function readNaverApiHubResponse(response: Response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export function naverApiHubErrorMessage(data: Record<string, unknown>, fallback: string) {
  const error = data.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  for (const key of ["errorMessage", "message", "raw"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return fallback;
}
