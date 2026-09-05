// 測試用的最小 supabase-js 鏈式 mock。
// 用法：makeSupabaseMock((table, ops) => result)；ops 是該次查詢鏈上依序呼叫的 [{ m, args }]，
// await 時呼叫 resolver 決定回什麼（{ data, error, count }）。calls 記錄所有查詢鏈供斷言。
import { vi } from "vitest";

export function makeSupabaseMock(resolver) {
  const calls = [];
  const from = vi.fn((table) => {
    const ops = [];
    const entry = { table, ops };
    calls.push(entry);
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") {
          return (resolve, reject) => Promise.resolve(resolver(table, ops)).then(resolve, reject);
        }
        return (...args) => { ops.push({ m, args }); return b; };
      },
    });
    return b;
  });
  const has = (entry, m) => entry.ops.some((o) => o.m === m);
  const arg = (entry, m, i = 0) => entry.ops.find((o) => o.m === m)?.args[i];
  return { from, calls, has, arg };
}
