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
// 這段注入用 MutationObserver 盯兩個元素的 class：
//   #scr-result 亮起＝一局玩完；#pauseMask 亮起＝玩家按了暫停（想休息＝願意看別的東西）。
// 比去 patch 遊戲內部函式穩，改版只要這兩個 id 還在就不會壞；真的壞了外層還有時間保底。
// 訊息帶 reason（result／pause），外層據此決定文案與要不要每次都彈（見 components/PlayTrial.jsx）。
export const END_SIGNAL = "inrec:game-end";
export const WATCH = { "scr-result": "result", pauseMask: "pause" };

export function injectEndSignal(html, signal = END_SIGNAL) {
  const script = `<script>(function(){try{
var ids=${JSON.stringify(WATCH)};
Object.keys(ids).forEach(function(id){
  var el=document.getElementById(id);if(!el)return;
  var sent=false;
  new MutationObserver(function(){
    var on=el.classList.contains('on');
    if(on&&!sent){sent=true;parent.postMessage({type:${JSON.stringify(signal)},reason:ids[id]},'*');}
    if(!on){sent=false;}
  }).observe(el,{attributes:true,attributeFilter:['class']});
});
}catch(e){}})();</script>`;
  const s = String(html || "");
  if (!s.trim()) return s;
  const i = s.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? s + script : s.slice(0, i) + script + s.slice(i);
}
