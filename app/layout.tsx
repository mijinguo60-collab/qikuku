import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企库库 QiKuKu AI Brain - 企业AI知识库系统",
  description: "企业AI知识库 + 管理Skill增强问答 + AI做图。把企业知识变成可调用的AI大脑。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
