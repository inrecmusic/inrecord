import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";

// 預設 node 環境（lib/ 純函式測試沿用）；元件測試於檔案頂端加
// `// @vitest-environment jsdom` 切換到 jsdom（Vitest 4 已移除 environmentMatchGlobs）。
// alias "@"：頁面元件內部以 `@/lib/...` import，測試要載入頁面就得跟 jsconfig.json 對齊。
// exclude：巢狀工作區（.worktrees/、.claude/worktrees/）住在 repo 裡，vitest 預設會把別的分支的測試
// 一起掃進來——用別分支的元件跑主線的 alias，就會冒出幾十個假失敗；一律排除。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    exclude: [...configDefaults.exclude, ".worktrees/**", ".claude/**"],
  },
});
