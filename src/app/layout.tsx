import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_JP, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// UI と和文: IBM Plex Sans JP（欧文も同じ骨格で混植が揃う）。英語の例文だけ辞書のような書体にする
const plex = IBM_Plex_Sans_JP({ variable: "--font-plex", weight: ["400", "500", "700"], preload: false });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Speaking Practice", template: "%s | Speaking Practice" },
  description: "ビジネス英語スピーキングの自分専用トレーニング",
  appleWebApp: { capable: true, title: "Speaking", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#131312" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${plex.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
