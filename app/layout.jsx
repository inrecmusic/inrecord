import { Cormorant_Garamond, Noto_Serif_TC, Inter, Noto_Sans_TC, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// v3 Two-tier type system —
//   Layer 1 · Main-visual serif (Hero only): Cormorant Garamond + Noto Serif TC
//   Layer 2 · Content sans (黑體, everywhere else): Inter + Noto Sans TC

// Layer 1 · Main-visual — Latin serif (English 中庸 = 500)
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});

// Layer 1 · Main-visual — Chinese serif (中文 厚重 = 600)
const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-noto-serif",
});

// Layer 2 · Content — Latin sans + numerals
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

// Layer 2 · Content — Chinese sans (黑體)
const notoSans = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans",
});

// 技術標籤 — JetBrains Mono（金色膠囊標籤、導覽小字）
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata = {
  title: "InRecord｜流行鋼琴零基礎入門課",
  description: "從零基礎開始，透過系統化課程與 AI 互動遊戲，學會彈出你喜歡的流行歌曲。",
  openGraph: {
    title: "InRecord｜流行鋼琴零基礎入門課",
    description: "10 章節 × 流行曲目實戰 × AI 互動遊戲",
    images: ["https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=1200&q=80"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="zh-Hant"
      className={`${cormorant.variable} ${notoSerif.variable} ${inter.variable} ${notoSans.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
