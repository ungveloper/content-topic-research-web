import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Topic Research",
  description: "수요·불편·공식 근거를 모아 게시할 가치가 있는 콘텐츠 주제를 선별하는 리서치 도구",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
