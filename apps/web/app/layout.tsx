import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Production Spec Graph",
  description: "AI Product Spec Engine canvas MVP"
};

/**
 * Next.js 应用路由的根文档布局。这里刻意保持很薄：只加载全局 CSS，
 * 产品行为继续放在画布外壳和库模块边界里。
 */
export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
