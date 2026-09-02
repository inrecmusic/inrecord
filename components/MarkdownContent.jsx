import { mdToHtml } from "@/lib/newsletter";

// 把受限 Markdown（#/##/### 標題、**粗** *斜*、- 清單、--- 分隔線）渲染為樣式化內容區。
// 用於法律頁（隱私權/服務條款）。內容為後台管理者撰寫（信任來源），mdToHtml 已跳脫。
// plain 模式＝不吃 email 的 inline style（inline style 會蓋過下面的 class CSS）。
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
        .legal-md table{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 16px}
        .legal-md th{text-align:left;padding:8px 12px;border:1px solid #e2e8f0;font-weight:800;color:#0f172a;background:#f8fafc}
        .legal-md td{padding:8px 12px;border:1px solid #e2e8f0;color:#475569}
        .legal-md a{color:#2563eb}
        .legal-md h1+p{font-size:13px;color:#94a3b8;margin:0 0 32px}
      `}</style>
      <div className="legal-md" dangerouslySetInnerHTML={{ __html: mdToHtml(md, { plain: true }) }} />
    </>
  );
}
