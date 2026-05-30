import { Newsreader, Spectral, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

// Modern Literary type system — Newsreader + Spectral + Noto Serif TC

// Latin headings + italic accents
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader",
});

// Latin body text + numerals
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-spectral",
});

// All Chinese — body and headings
const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
  variable: "--font-serif",
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
      className={`${newsreader.variable} ${spectral.variable} ${notoSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
