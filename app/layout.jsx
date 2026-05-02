import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
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
    <html lang="zh-Hant" className={noto.className}>
      <body>{children}</body>
    </html>
  );
}
