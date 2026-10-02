// lib/public-games.js — 公開試玩遊戲的白名單與 HTML 注入（純函式，可測）。
//
// ⚠️ 只有列在 PUBLIC_GAMES 的遊戲可以免登入玩。其餘六款仍鎖在教室裡（需購課＋裝置上限），
// 這裡刻意用「slug → 遊戲標題」對應，而不是讓呼叫端傳 id —— 傳 id 等於開一個可以撈任何
// 付費遊戲 HTML 的洞。要新增試玩遊戲就在這張表加一列。
export const PUBLIC_GAMES = {
  do: {
    title: "Do 給你找",
    name: "Do 給你找",
    blurb: "畫面隨機顯示鍵盤，限時找出並點擊起始音 Do 的位置。",
    chapter: "第一章",
  },
  flash: {
    title: "音名快閃",
    name: "音名快閃",
    blurb: "畫面隨機顯示琴鍵位置，限時點擊正確的音名。",
    chapter: "第二章",
  },
};

export function publicGame(slug) {
  return PUBLIC_GAMES[String(slug || "").toLowerCase()] || null;
}

// 遊戲 HTML 原本是教室內用的，不會回報「這局結束了」。
// 這段注入用 MutationObserver 盯 #scr-result 的 class —— 比去 patch 內部函式穩，
// 遊戲改版只要結果畫面還是這個 id 就不會壞；真的壞了外層還有時間保底。
export const END_SIGNAL = "inrec:game-end";

export function injectEndSignal(html, signal = END_SIGNAL) {
  const script = `<script>(function(){try{
var el=document.getElementById('scr-result');if(!el)return;
var sent=false;
new MutationObserver(function(){
  var on=el.classList.contains('on');
  if(on&&!sent){sent=true;parent.postMessage({type:${JSON.stringify(signal)}},'*');}
  if(!on){sent=false;}
}).observe(el,{attributes:true,attributeFilter:['class']});
}catch(e){}})();</script>`;
  const s = String(html || "");
  if (!s.trim()) return s;
  const i = s.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? s + script : s.slice(0, i) + script + s.slice(i);
}
