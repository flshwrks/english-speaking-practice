import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Zen_Maru_Gothic } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// 英文: 丸みのあるジオメトリック体、和文: 丸ゴシック（親しみやすさ）。900 は見出し（font-extrabold）の和文に使われる
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "700", "800"] });
const maru = Zen_Maru_Gothic({ variable: "--font-maru", weight: ["500", "700", "900"], preload: false });

export const metadata: Metadata = {
  title: { default: "Speaking Practice", template: "%s | Speaking Practice" },
  description: "ビジネス英語スピーキングの自分専用トレーニング",
  appleWebApp: { capable: true, title: "Speaking", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#13111d" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${display.variable} ${maru.variable} antialiased`}>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
