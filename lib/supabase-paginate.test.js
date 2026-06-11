import { describe, it, expect } from "vitest";
import { selectAll, PAGE_SIZE } from "./supabase-paginate.js";

// 假 supabase：依 range(from,to) 回傳對應切片；記錄被請求的範圍
function fakeClient(rows){
  const calls=[];
  const builder={
    _from:0,_to:0,
    select(){return this;},
    order(){return this;},
    range(from,to){this._from=from;this._to=to;calls.push([from,to]);return this;},
    then(resolve){resolve({data:rows.slice(this._from,this._to+1),error:null});},
  };
  return {calls,from(){return builder;}};
}

describe("selectAll", () => {
  it("跨頁累積，最後一頁不足 PAGE_SIZE 即停", async () => {
    const rows=Array.from({length:PAGE_SIZE+5},(_,i)=>({i}));
    const sb=fakeClient(rows);
    const out=await selectAll(sb,"orders");
    expect(out).toHaveLength(PAGE_SIZE+5);
    expect(sb.calls[0]).toEqual([0,PAGE_SIZE-1]);
    expect(sb.calls[1]).toEqual([PAGE_SIZE,PAGE_SIZE*2-1]);
    expect(sb.calls).toHaveLength(2);
  });
  it("剛好整除時，會多撈一頁拿到空陣列才停", async () => {
    const rows=Array.from({length:PAGE_SIZE},(_,i)=>({i}));
    const sb=fakeClient(rows);
    const out=await selectAll(sb,"orders");
    expect(out).toHaveLength(PAGE_SIZE);
    expect(sb.calls).toHaveLength(2); // 第二頁回空
  });
  it("error 時拋出", async () => {
    const sb={from(){return {select(){return this;},order(){return this;},range(){return this;},then(r){r({data:null,error:{message:"boom"}});}};}};
    await expect(selectAll(sb,"orders")).rejects.toThrow("boom");
  });
});
