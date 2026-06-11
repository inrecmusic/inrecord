// 分批撈取整張表，繞過 PostgREST 單次預設 1000 列上限。
// 用於需要「全部資料」的後台情境（儀表板/銷售分析全載統計）。

export const PAGE_SIZE = 1000;

// selectAll(supabase, table, buildQuery?) → 所有列陣列
// buildQuery(q) 可加 .select()/.order()/.eq() 等；預設 select("*")。
export async function selectAll(supabase, table, buildQuery) {
  const out = [];
  let page = 0;
  for (;;) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from(table);
    q = buildQuery ? buildQuery(q) : q.select("*");
    const { data, error } = await q.range(from, to);
    if (error) throw new Error(error.message);
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }
  return out;
}
