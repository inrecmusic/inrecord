// 品牌字標（襯線 InRecord＋牛眼 o）。深色底用 white 版；與教室三頁共用同一組 PNG。
export default function Logo({ size = 26, white = false }) {
  return (
    <img
      src={white ? "/logo-wordmark-white.png" : "/logo-wordmark.png"}
      alt="InRecord"
      style={{ height: size, width: "auto", display: "block" }}
    />
  );
}
