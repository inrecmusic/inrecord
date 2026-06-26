import { defineConfig } from "vitest/config";

// 預設 node 環境（lib/ 純函式測試沿用）；元件測試於檔案頂端加
// `// @vitest-environment jsdom` 切換到 jsdom（Vitest 4 已移除 environmentMatchGlobs）。
// esbuild automatic JSX：讓 .jsx 不需 `import React` 也能在測試中轉譯。
export default defineConfig({
  esbuild: { jsx: "automatic" },
});
