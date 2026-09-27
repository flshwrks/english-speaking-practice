import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Zen_Kaku_Gothic_New } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// 英文 UI: Geist、和文: 骨格のはっきりした角ゴシック、見出しの英字と大きな数字: セリフ体、小さなラベル: 等幅
const sans = Geist({ variable: "--font-sans-latin", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-latin", subsets: ["latin"], weight: ["400", "500"] });
const serif = Instrument_Serif({ variable: "--font-serif-latin", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const kaku = Zen_Kaku_Gothic_New({ variable: "--font-kaku", weight: ["400", "500", "700"], preload: false });

export const metadata: Metadata = {
  title: { default: "Speaking Practice", template: "%s | Speaking Practice" },
  description: "ビジネス英語スピーキングの自分専用トレーニング",
  appleWebApp: { capable: true, title: "Speaking", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0d" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${mono.variable} ${serif.variable} ${kaku.variable} antialiased`}>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
