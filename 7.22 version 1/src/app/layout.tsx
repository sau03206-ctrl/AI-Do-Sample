import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-Do-Sample — 발전소 운영관리 웹 스위트",
  description: "열원설비 고장이력 관리 + 발전소 오버홀 공정관리 통합 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout applies to every route; next/font doesn't support the Material Symbols icon font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Hanken+Grotesk:wght@600;700&family=JetBrains+Mono&display=swap"
          rel="stylesheet"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body-md text-on-surface antialiased">{children}</body>
    </html>
  );
}
