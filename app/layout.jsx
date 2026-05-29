import { Noto_Sans_TC, Noto_Serif_TC, Cormorant } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
  variable: "--font-sans",
});

const notoSerif = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["300"],
  display: "swap",
  variable: "--font-serif",
});

const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["300"],
  style: ["italic"],
  display: "swap",
  variable: "--font-cormorant",
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
      className={`${notoSans.variable} ${notoSerif.variable} ${cormorant.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
