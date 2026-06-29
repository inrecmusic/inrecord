import { mdToHtml } from "@/lib/newsletter";

// 把受限 Markdown（#/##/### 標題、**粗** *斜*、- 清單、--- 分隔線）渲染為樣式化內容區。
// 用於 DB 驅動的法律頁（隱私權/服務條款）。內容為後台管理者撰寫（信任來源），mdToHtml 已跳脫。
export default function MarkdownContent({ md }) {
  return (
    <>
      <style>{`
        .legal-md h1{font-family:var(--type-display);font-size:30px;font-weight:400;color:#0f172a;margin:0 0 6px;letter-spacing:-.02em}
        .legal-md h2{font-size:16px;font-weight:800;color:#0f172a;margin:24px 0 8px;padding-bottom:7px;border-bottom:1px solid #f1f5f9}
        .legal-md h3{font-size:14px;font-weight:800;color:#1e293b;margin:14px 0 5px}
        .legal-md p{font-size:14px;color:#475569;line-height:1.85;margin:0 0 10px}
        .legal-md ul{margin:6px 0 14px;padding-left:22px;display:grid;gap:5px}
        .legal-md li{font-size:14px;color:#475569;line-height:1.75}
        .legal-md strong{color:#0f172a}
        .legal-md hr{border:none;border-top:1px solid #e2e8f0;margin:16px 0}
      `}</style>
      <div className="legal-md" dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />
    </>
  );
}
