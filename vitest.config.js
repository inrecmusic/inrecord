import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 預設 node 環境（lib/ 純函式測試沿用）；元件測試於檔案頂端加
// `// @vitest-environment jsdom` 切換到 jsdom（Vitest 4 已移除 environmentMatchGlobs）。
// esbuild automatic JSX：讓 .jsx 不需 `import React` 也能在測試中轉譯。
// alias "@"：頁面元件內部以 `@/lib/...` import，測試要載入頁面就得跟 jsconfig.json 對齊。
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
