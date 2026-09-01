"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Bot, Music, GraduationCap,
  TrendingUp, Play, Award, Star,
  Camera, PlayCircle, MessageCircle,
  Menu, X, ChevronDown,
  Heart, Mic2,
  Hand, Sun, Moon, Shuffle, Headphones,
  Layers, Waves, RotateCcw,
  Zap, BarChart2, Gamepad2, Clock,
  Video, BookOpen,
  Check,
} from "lucide-react";
import Logo from "@/components/Logo";
import BuyModal from "@/components/BuyModal";
import PointCarousel from "@/components/PointCarousel";
import InstructorBioCarousel from "@/components/InstructorBioCarousel";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/track-event";
import { motion } from "framer-motion";


const POINTS = [
  { n: 1, title: "零基礎也能輕鬆上手" },
  { n: 2, title: "系統掌握 24 個三和弦" },
  { n: 3, title: "兩種伴奏技法一次學會" },
  { n: 4, title: "遊戲讓練習不枯燥" },
  { n: 5, title: "學完就能彈出喜歡的歌" },
];

const POINT1_SLIDES = [
  {
    title: "認識鍵盤與音名",
    sub: ["七個基本音名，一次記住——", "先學會在鍵盤上找到它們。"],
    topLabel: "白鍵 7 音 · 黑鍵 5 音",
    visual: {
      type: "keyboard",
      keys: [
        { label: "C", active: true, tint: true },
        { label: "D" }, { label: "E" }, { label: "F" },
        { label: "G" }, { label: "A" }, { label: "B" },
      ],
    },
    caption: <>黑鍵以 <b>2 ＋ 3</b> 分組，<span className="hl">C</span> 永遠在「兩個黑鍵」的左邊</>,
  },
  {
    title: "唱名 Do-Re-Mi",
    sub: ["跟著旋律唱出完整音階——", "把位置變成會唱的聲音。"],
    topLabel: "低音 → 高音",
    visual: {
      type: "keyboard",
      keys: [
        { label: "Do", active: true, tint: true },
        { label: "Re" }, { label: "Mi" }, { label: "Fa" },
        { label: "So" }, { label: "La" }, { label: "Si" },
      ],
    },
    caption: <><b>音名</b>記位置、<b>唱名</b>記聲音——同一顆鍵，兩種叫法</>,
  },
  {
    title: "基本坐姿與手型",
    sub: ["從第一課就養成好習慣——", "坐對、手對，彈久也不累。"],
    visual: { type: "photo", src: "/points/p1_posture.jpg", alt: "正確的鋼琴坐姿與手型" },
    caption: <>坐姿自然、肩頸放鬆，讓手臂的重量沉到指尖</>,
  },
  {
    title: "C 大調音階",
    sub: ["五指接力——", "順順爬完一個八度。"],
    topLabel: "右手指法 1 → 5",
    visual: {
      type: "keyboard",
      keys: [
        { label: "1" }, { label: "2" }, { label: "3" },
        { label: "1", active: true, tint: true },
        { label: "2" }, { label: "3" }, { label: "4" },
      ],
    },
    caption: <>彈到 <span className="hl">F</span> 時，大拇指 <b>(1)</b> 從下方穿過，往上接續</>,
  },
];

const C_BRAND = "#2563eb";
const C_NAVY = "#172554";
const C_MUTED = "#64748b";

const POINT2_SLIDES = [
  {
    title: "12 個大三和弦",
    sub: ["開朗、明亮的音色——", "大三度＋小三度，套用到 12 個音。"],
    visual: {
      type: "chords",
      variant: "major",
      tintKeys: [0, 2, 4],
      markers: [
        { white: 0, label: "C", color: C_BRAND },
        { white: 2, label: "E", color: C_BRAND },
        { white: 4, label: "G", color: C_BRAND },
      ],
      intervals: [
        { from: 0, to: 2, label: "大三度" },
        { from: 2, to: 4, label: "小三度" },
      ],
      badge: { text: "× 12 個", color: C_BRAND },
    },
    caption: <>往上疊 <b>大三度</b> ＋ <b>小三度</b>，就是明亮的大三和弦</>,
  },
  {
    title: "12 個小三和弦",
    sub: ["柔和、憂鬱的情感——", "小三度＋大三度，套用到 12 個音。"],
    visual: {
      type: "chords",
      variant: "minor",
      tintKeys: [1, 3, 5],
      markers: [
        { white: 1, label: "D", color: C_NAVY },
        { white: 3, label: "F", color: C_NAVY },
        { white: 5, label: "A", color: C_NAVY },
      ],
      intervals: [
        { from: 1, to: 3, label: "小三度" },
        { from: 3, to: 5, label: "大三度" },
      ],
      badge: { text: "× 12 個", color: C_NAVY },
    },
    caption: <>往上疊 <b>小三度</b> ＋ <b>大三度</b>，就是憂鬱的小三和弦</>,
  },
  {
    title: "大小和弦快速切換",
    sub: ["不用重學指法——", "同一個和弦，只動中間一個音。"],
    visual: {
      type: "chords",
      variant: "switch",
      tintKeys: [2],
      markers: [
        { white: 0, label: "C", color: C_MUTED },
        { white: 2, label: "E", color: C_BRAND, big: true },
        { white: 4, label: "G", color: C_MUTED },
      ],
      float: { after: 1, label: "E♭", color: C_NAVY, tag: "小和弦" },
      bottomLabels: [
        { white: 0, text: "根音 · 不動" },
        { white: 2, text: "大和弦", color: C_BRAND, strong: true },
        { white: 4, text: "五音 · 不動" },
      ],
    },
    caption: <>根音 C、五音 G 不動，只把中間的三度音移動<b>半音</b> ── 大和弦 ⇄ 小和弦</>,
  },
  {
    title: "和弦耳訓練習",
    sub: ["不只是會彈——", "還要能「聽出」大和小。"],
    visual: { type: "ear" },
    caption: <>不靠看譜，<b>用耳朵分辨明亮與陰暗</b>，就能聽出是大和弦還是小和弦</>,
  },
];

const POINT3_SLIDES = [
  {
    title: "柱式和弦",
    tag: "BLOCK CHORD",
    sub: ["最厚實的和弦彈法——", "三個音，疊成一根音柱。"],
    visual: { type: "technique", mode: "stack" },
    caption: <>三個音同時彈下、像一根「音柱」立起來 ── 這就是 <b>柱式和弦</b></>,
  },
  {
    title: "分解和弦",
    tag: "ARPEGGIO",
    sub: ["把音柱拆開——", "一個一個、流動著彈。"],
    visual: { type: "technique", mode: "stairs" },
    caption: <>把和弦音 <b>一個一個依序彈出</b>，旋律就流動起來 ── 這就是 <b>分解和弦</b></>,
  },
  {
    title: "卡農萬用進行",
    tag: "CANON PROGRESSION",
    sub: ["一套和弦走向——", "背起來，能彈很多歌。"],
    visual: { type: "progression" },
    caption: <>學會這一套 <b>卡農和弦進行</b>，就能伴奏無數流行歌 ── 萬用骨架</>,
  },
  {
    title: "左右手配合",
    tag: "BOTH HANDS",
    sub: ["右手旋律、左手和弦——", "兩隻手，同時配合。"],
    visual: { type: "staff" },
    caption: <>左手按卡農和弦、右手彈旋律，<b>兩手一合</b> ── 就是你聽過的那首《卡農》</>,
  },
];

const POINT4_SLIDES = [
  {
    title: "音名快閃",
    tag: "NOTE FLASH",
    sub: ["鍵盤閃一下——", "限時選音名、連對狂飆。"],
    visual: { type: "noteflash" },
    caption: <>琴鍵一閃就選音名，<b>連續答對衝高連擊</b> ── 反應越練越快</>,
  },
  {
    title: "唱名階梯",
    tag: "SOLFEGE STAIRS",
    sub: ["聽音點唱名——", "一階一階往上爬。"],
    visual: { type: "solfege" },
    caption: <>聽到一個音，<b>點對唱名就往上爬一階</b> ── 音感越練越準</>,
  },
  {
    title: "和弦俄羅斯",
    tag: "CHORD BLOCKS",
    sub: ["和弦往下掉——", "拼滿一行就消除。"],
    visual: { type: "tetris" },
    caption: <>和弦方塊往下掉，<b>拼滿一整行就消除</b> ── 全部和弦邊玩邊記住</>,
  },
  {
    title: "節奏打點",
    tag: "RHYTHM TAP",
    sub: ["拍子打正中——", "不搶拍、不落拍。"],
    visual: { type: "rhythm" },
    caption: <>拍子落在正中圈就是 <b>Perfect</b> ── 練到不搶拍、不落拍</>,
  },
];

const POINT5_SLIDES = [
  {
    title: "曲目實戰",
    tag: "REAL SONGS",
    sub: ["10 首真歌——", "學完就能上手彈。"],
    visual: {
      type: "musiccard",
      variant: "playlist",
      label: "播放清單 · PLAYLIST",
      title: "可彈曲目",
      sub: "10 首流行曲目 · 入門到進階",
      tracks: [
        { wave: true, title: "流行抒情曲", status: "正在練習" },
        { n: "02", title: "經典流行曲", time: "4:01" },
      ],
    },
    caption: <>一首接一首解鎖，<b>學完就能彈出喜歡的歌</b> ── 真歌實戰，不只是練習曲</>,
  },
  {
    title: "錄製成果",
    tag: "RECORDING",
    sub: ["完整錄下成果——", "累積成你的作品。"],
    visual: {
      type: "musiccard",
      variant: "studio",
      label: "錄音室 · STUDIO",
      title: "我的學習成果",
      sub: "完整錄下你彈的每一首",
      tracks: [
        { wave: true, title: "我的第一首完整作品", status: "已儲存" },
        { n: "02", title: "卡農 · 完整版", time: "03:24" },
      ],
    },
    caption: <>你彈的每一首都被完整錄下，<b>累積成你自己的作品</b> ── 看得見的學習成果</>,
  },
  {
    title: "看懂和弦譜",
    tag: "CHORD CHART",
    sub: ["和弦標在詞上——", "看著就能彈。"],
    visual: { type: "chordchart" },
    caption: <>和弦就標在歌詞上方，<b>看著譜就能彈出整首歌</b> ── 看得懂，就會彈</>,
  },
  {
    title: "完整演奏",
    tag: "TO PERFORM",
    sub: ["從單手——", "到雙手完整演奏。"],
    visual: { type: "handslevel" },
    caption: <>從單手旋律，<b>練到雙手能完整演奏一首歌</b> ── 基礎扎實，自然往演奏走</>,
  },
];

const PLANS = [
  {
    plan: "course",
    label: "鋼琴自學全課程",
    pillLabel: "從零學起",
    price: 3800,
    desc: "10 章節完整課程，一次買斷、永久觀看。",
    features: ["10 章節系統化課程", "10 首簡易歌曲實戰", "完整樂譜下載", "無限次重複觀看"],
    cta: "購買課程",
  },
  {
    plan: "bundle",
    label: "學琴全攻略",
    pillLabel: "最超值全配",
    price: 3999,
    features: ["完整 10 章節課程", "課程時數 8 小時", "全部互動遊戲永久使用", "10 首簡易歌曲實戰", "完整樂譜下載", "無限次重複觀看"],
    featured: true,
    ribbon: "最推薦",
    cta: "購買課程包",
  },
];

// 2026-08-30 依正式課綱改版：章名與單元清單與教室（chapters/videos 表）一致；
// desc 依單元內容改寫；song/game 只保留仍吻合新章主題的舊欄位，缺者不顯示、不硬湊。
const MODULES = [
  { n: 1,  title: "踏上黑白鍵的第一步",             desc: "認識鍵盤與起始音 Do 的位置，建立正確坐姿、手型與手指編號，打好彈琴的第一步基礎。",
    units: ["1-1 認識鋼琴鍵盤", "1-2 尋找起始音 Do", "1-3 彈鋼琴的坐姿", "1-4 手型與觸鍵", "1-5 認識手指編號 (指法)"],
    song: "音階單音練習", games: ["Do 給你找 — 畫面隨機顯示鍵盤，限時找出並點擊起始音 Do 的位置"], img: "photo-1520523839897-bd0b52f945a0" },
  { n: 2,  title: "音符的語言—音名與唱名",         desc: "學會音名 C～B 與唱名 Do～Si 的對照，搞懂半音、全音與升降記號，聽懂音樂的共同語言。",
    units: ["2-1 認識音名 C、D、E、F、G、A、B", "2-2 認識唱名 Do、Re、Mi、Fa、Sol、La、Si", "2-3 音名與唱名的對照", "2-4 半音與全音", "2-5 升降與等音異名"],
    song: "唱名歌曲跟彈練習", games: ["音名快閃 — 畫面隨機顯示琴鍵位置，限時點擊正確音名", "唱名階梯 — 畫面隨機顯示琴鍵位置，限時點擊正確唱名"], img: "photo-1507838153414-b4b713384a76" },
  { n: 3,  title: "看懂樂譜—五線譜與簡譜",         desc: "從五線譜、高低音譜號到簡譜，一步步對照鍵盤位置，完成基礎視譜練習，樂譜不再是天書。",
    units: ["3-1 認識五線譜", "3-2 認識高音譜號", "3-3 認識低音譜號", "3-4 認識簡譜", "3-5 五線譜、簡譜與鍵盤的位置對照", "3-6 基礎視譜練習"],
    img: "photo-1520523839897-bd0b52f945a0" },
  { n: 4,  title: "掌握音樂的腳步—節奏與拍子",     desc: "認識拍子、小節與常見音符時值，搭配節拍器練出穩定節奏，讓雙手開始協調合作。",
    units: ["4-1 認識拍子與小節", "4-2 認識全音符、二分音符與四分音符", "4-3 認識八分音符", "4-4 認識休止符", "4-5 使用節拍器練習", "4-6 雙手節奏協調"],
    games: ["節奏打點師 — 跟隨節拍器，在正確時機點擊螢幕練習穩定性"], img: "photo-1514119412350-e174d90d280e" },
  { n: 5,  title: "音階的階梯—建立指法基礎",       desc: "從全音與半音出發認識大調音階，學會 C 大調音階與左右手指法，完成雙手音階練習。",
    units: ["5-1 認識全音與半音", "5-2 認識大調音階", "5-3 學習 C 大調音階", "5-4 右手音階指法", "5-5 左手音階指法", "5-6 雙手音階練習"],
    img: "photo-1552422535-c45813c61732" },
  { n: 6,  title: "和弦的基石—認識大三和弦",       desc: "認識和弦的組成（根音、三音、五音）與大三和弦公式，掌握常用大三和弦，開始用和弦幫歌曲伴奏。",
    units: ["6-1 什麼是和弦？", "6-2 認識根音、三音與五音", "6-3 大三和弦的組成公式", "6-4 認識常用大三和弦", "6-5 大三和弦轉換練習", "6-6 用大三和弦伴奏歌曲"],
    song: "《Happy Birthday to You》（C、F、G 和弦進行）", games: ["和弦辨識家 — 辨認大三與小三和弦，辨認和弦的組成音"], img: "photo-1520523839897-bd0b52f945a0" },
  { n: 7,  title: "情感的色彩—認識小三和弦",       desc: "聽出大、小三和弦的情緒差異，掌握小三和弦公式與快速辨認，用和弦表現歌曲的情緒。",
    units: ["7-1 大三和弦與小三和弦的聽感差異", "7-2 小三和弦的組成公式", "7-3 認識常用小三和弦", "7-4 大、小三和弦的快速辨認", "7-5 小三和弦轉換練習", "7-6 運用和弦表現歌曲情緒"],
    song: "流行歌曲簡化版和弦進行", games: ["情緒調色盤 — 聆聽大、小三和弦，判斷情緒感受（開心／難過）"], img: "photo-1514119412350-e174d90d280e" },
  { n: 8,  title: "左手的魔法—基礎伴奏技巧",       desc: "看懂和弦記號，學會根音、柱式與分解和弦三種伴奏法，搭配常見節奏完成左右手合奏。",
    units: ["8-1 認識和弦記號", "8-2 根音伴奏", "8-3 柱式和弦伴奏", "8-4 分解和弦伴奏", "8-5 常見伴奏節奏", "8-6 左右手合奏練習"],
    song: "抒情歌曲右手旋律＋左手分解和弦", games: ["分解和弦連連看 — 將和弦組成音按正確分解順序連接"], img: "photo-1507838153414-b4b713384a76" },
  { n: 9,  title: "流行音樂的萬用公式",             desc: "認識和弦進行與級數概念，拆解流行歌背後的共同密碼，為旋律配上和弦、完成一首流行歌曲。",
    units: ["9-1 認識和弦進行", "9-2 認識級數和弦", "9-3 常見四和弦進行", "9-4 不同歌曲的和弦比較", "9-5 為旋律搭配和弦", "9-6 完成一首流行歌曲"],
    song: "卡農和弦進行歌曲片段串燒", games: ["和弦神預測 — 聆聽前三個和弦，預測並彈出第四個"], img: "photo-1552422535-c45813c61732" },
  { n: 10, title: "你的第一場個人發表會",            desc: "從選曲、拆解段落到安排練習進度，加入力度與情感，完成屬於你的錄音或演出。",
    units: ["10-1 選擇適合自己的曲目", "10-2 拆解歌曲的段落", "10-3 安排練習進度", "10-4 改善容易出錯的段落", "10-5 加入力度與情感", "10-6 完成錄音或演出"],
    song: "流行歌曲完整彈奏（成果發表曲）", games: ["自由創作坊 — 自由搭配旋律與伴奏並可錄製分享"], img: "photo-1514119412350-e174d90d280e" },
  { n: "a1", isAppendix: true, appendixLabel: "附錄一", title: "如何更有效率地練琴？",    desc: "分段練習、慢速練習、節拍器使用技巧，幫助學員建立良好練習習慣，讓每次練習的效果最大化。", img: "photo-1507838153414-b4b713384a76" },
  { n: "a2", isAppendix: true, appendixLabel: "附錄二", title: "給初學者的器材選購建議", desc: "不同預算下的電鋼琴、電子琴選購指南，以及實用 App 和軟體推薦，幫助你找到最適合自己的學習工具。", img: "photo-1552422535-c45813c61732" },
];


const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } };

// 早鳥倒數格式化（純函式、無 Date.now）：ms → "N 天 HH:MM:SS"
function fmtCountdown(ms) {
  let d = Math.max(0, ms);
  const days = Math.floor(d / 86400000); d -= days * 86400000;
  const h = Math.floor(d / 3600000); d -= h * 3600000;
  const m = Math.floor(d / 60000); d -= m * 60000;
  const s = Math.floor(d / 1000);
  const p = n => String(n).padStart(2, "0");
  return `${days} 天 ${p(h)}:${p(m)}:${p(s)}`;
}

function useCountUp(target, duration = 1800, decimals = 0) {
  const [value, setValue] = useState(0);
  const [inView, setInView] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Re-run the count animation whenever the target changes (e.g. async
  // /api/stats data arriving after first paint) once the element is in view.
  useEffect(() => {
    if (!inView) return;
    let raf;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      const raw = (1 - Math.pow(1 - p, 3)) * target;
      const f = 10 ** decimals;
      setValue(decimals > 0 ? Math.round(raw * f) / f : Math.round(raw));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, decimals]);
  return [value, ref];
}

function RevealSection({ className = "", ...props }) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    />
  );
}

function StatItem({ value, suffix, en, label, decimals = 0 }) {
  const [count, ref] = useCountUp(value ?? 0, 1800, decimals);
  const shown = decimals > 0 ? Number(count).toFixed(decimals) : count.toLocaleString();
  return (
    <span className={styles.stat} ref={ref} title={label}>
      <span className={styles.statKey}>{en}</span>
      <strong>{value != null ? `${shown}${suffix}` : "—"}</strong>
    </span>
  );
}

export default function HomeClient({ sale }) {
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fanChoice, setFanChoice] = useState("direct");   // 粉絲卡選項
  const [fanProofMode, setFanProofMode] = useState(false); // 傳給 BuyModal
  const [fanAutoCoupon, setFanAutoCoupon] = useState(null); // 直接購買 $3,999 自動套用的粉絲固定價券
  const [fanSerialEntry, setFanSerialEntry] = useState(false); // 序號輸入流程（保留機制；粉絲卡 $3,999 現走 autoCoupon 直購，已無入口）
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [stats, setStats] = useState(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [photoHover, setPhotoHover] = useState(false);
  const [nowMs, setNowMs] = useState(null); // 早鳥倒數：mounted 後才有值 → SSR/client 初次都不渲染倒數（hydration-safe）
  const termRef = useRef(null);
  const musicCursorRef = useRef(null);
  const heroRef = useRef(null);
  const heroPhotoRef = useRef(null);
  const heroContentRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(data => { if (data.ok) setStats(data); })
      .catch(() => {});
  }, []);

  // 早鳥倒數 ticker：只在 client 執行，每秒更新 nowMs（server 端不跑 → 無 hydration 問題）
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 高音譜記號游標：預設用原生游標；只有「按下（點擊）」時才變成高音譜記號並跟隨，
  // 放開即恢復原生游標（音符留在點擊處淡出）。觸控裝置由 CSS @media(hover:none) 停用。
  useEffect(() => {
    const cursor = musicCursorRef.current;
    if (!cursor) return;
    let pressed = false;
    const place = (e) => { cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; };
    const down = (e) => {
      pressed = true;
      place(e);
      cursor.style.opacity = "1";
      document.documentElement.classList.add("music-cursor");   // 按住期間隱藏原生游標
    };
    const move = (e) => { if (pressed) place(e); };
    const up = () => {
      pressed = false;
      cursor.style.opacity = "0";
      document.documentElement.classList.remove("music-cursor"); // 放開即恢復原生游標
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      document.documentElement.classList.remove("music-cursor");
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      const desc = params.get("error_description") || "登入發生問題，請重試";
      setAuthError(decodeURIComponent(desc.replace(/\+/g, " ")));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Hero 視差入場（桌機）：捲離 hero 時，照片微放大＋下移、內容上移＋淡出（GSAP ScrollTrigger scrub）。
  // 只在 ≥981px 且未要求減少動態時啟用；matchMedia 條件不符自動不掛/revert，useGSAP 於卸載自動清理。
  // GSAP 改為「符合條件才動態載入」：手機與 reduced-motion 完全不下載這包（首頁 JS 大幅瘦身）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 981px) and (prefers-reduced-motion: no-preference)");
    if (!mq.matches) return;
    let ctx, cancelled = false;
    (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !heroRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.timeline({
          scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: true },
        })
          .to(heroPhotoRef.current, { yPercent: 6, scale: 1.1, ease: "none" }, 0)
          .to(heroContentRef.current, { y: -60, opacity: 0.3, ease: "none" }, 0);
      }, heroRef);
    })();
    return () => { cancelled = true; ctx?.revert(); };
  }, []);

  // 定價區進入視窗打一次漏斗事件 ViewContent（Meta/GA4）
  useEffect(() => {
    const el = document.getElementById("pricing");
    if (!el) return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired) {
          fired = true;
          trackEvent("ViewContent", { contentIds: ["bundle"], contentName: "學琴全攻略（課程包）", value: sale?.plans?.bundle?.price, currency: "TWD" });
          io.disconnect();
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    setMenuOpen(false);
  }

  function startBuy(plan, opts = {}) {
    if (!user?.email) { window.location.href = "/classroom/login"; return; }
    setSelectedPlan(plan);
    setFanProofMode(!!opts.fanProof);
    setFanAutoCoupon(opts.autoCoupon || null);
    setFanSerialEntry(!!opts.serialEntry);
    setBuyOpen(true);
  }

  // 只賣粉絲方案：購買 CTA 一律捲動到方案區（粉絲限定方案卡）
  function scrollToPricing() {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  }


  const fanProofOpen = sale.fanProofOpen;
  // 早鳥倒數：mounted 後(nowMs != null)才算；截止(<=0)或無截止時不顯示
  const fanCountdownMs = (nowMs != null && sale.fanPlan?.deadlineMs) ? sale.fanPlan.deadlineMs - nowMs : 0;
  const showFanCountdown = fanCountdownMs > 0;
  const fanDeadlineLabel = new Date(sale.fanPlan.deadlineMs).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
  // 課程上架時間（第一批）：固定台灣時區顯示，供 hero CTA 提示；未設 open_at 則不顯示。
  // ⚠️ 末尾 .replace 把日期與時間之間的分隔空白正規化為一般空格：Node(伺服器) 的 ICU 在 zh-TW
  //    會插入 U+2009 細空格、瀏覽器 ICU 用一般空格(U+0020) → 不正規化 → SSR 與 client 文字不符
  //    → React hydration mismatch(#425/#418/#423)。含「時:分」的格式才會中鏢，純 M/D 不受影響。

  // 預售期間：教室內容鎖站（見 middleware.js），登入後不顯示「進入教室」死連結
  const presaleMode = !sale.classroomOpen;

  // 短版購買鈕文案（粉絲卡用）
  const buyShort = sale.classroomOpen ? "立即購買" : "立即預購";
  // Hero 優惠卡綁定主推方案（bundle）的波段定價
  const offer = sale.plans[PLANS[1].plan];
  // 粉絲方案是否仍在賣（後台開關 且 未過截止，salePhase 已合併進 enabled）。
  // 關閉後 hero 卡／sticky bar／FAQ 一律退回一般課程包的波段定價，不再露出 FAN3999 直購價。
  const fanOn = !!sale.fanPlan?.enabled;
  const heroPrice = fanOn ? sale.fanPlan.directPrice : offer.price;

  const fanRowStyle = (on) => ({
    display: "flex", justifyContent: "space-between", alignItems: "center",
    border: `1.5px solid ${on ? "#2563eb" : "#bcd4f5"}`, background: on ? "#eef4ff" : "transparent",
    borderRadius: 12, padding: "11px 14px", cursor: "pointer", fontSize: 14,
  });

  return (
    <>
      {/* 高音譜記號自訂游標（滑入 Hero 時顯示並跟隨） */}
      <div ref={musicCursorRef} className={styles.musicCursor} aria-hidden="true">𝄞</div>
      {/* NAV */}
      <header className={`${styles.nav} ${showStickyBar ? styles.navSolid : styles.navTransparent}`}>
        <div className={styles.container + " " + styles.navInner}>
          <a href="/" aria-label="InRecord"><Logo white={!showStickyBar} /></a>
          <nav className={styles.navLinks}>
            <a href="#intro">課程介紹</a>
            <a href="#curriculum">課程大綱</a>
            <a href="#instructor">講師介紹</a>
            <a href="#pricing">課程方案</a>
          </nav>
          <div className={styles.navActions}>
            {user
              ? (presaleMode
                  ? <span className={`${styles.btnLogin} ${styles.navBtn}`} style={{ opacity: .55, cursor: "default" }} title="開課將以 Email 通知">課程準備中</span>
                  : <a href="/classroom" className={`${styles.btnLogin} ${styles.navBtn}`}>進入教室</a>)
              : <a href="/classroom/login" className={`${styles.btnLogin} ${styles.navBtn}`}>學員登入</a>}
            {user && <button className={`${styles.btnLogin} ${styles.navBtn}`} onClick={handleLogout} style={{ cursor: "pointer" }}>登出</button>}
            <button className={`${styles.btnPrimary} ${styles.navBtn}`} onClick={scrollToPricing} style={{ wordBreak: "keep-all", lineBreak: "strict" }}>{buyShort}</button>
          </div>
          <button className={styles.hamburger} onClick={() => setMenuOpen(o => !o)} aria-label="選單">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className={styles.mobileMenu}>
            {[["#intro","課程介紹"],["#curriculum","課程大綱"],["#instructor","講師介紹"],["#pricing","課程方案"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a href="/demo" onClick={() => setMenuOpen(false)}>課程試看</a>
            {user
              ? (presaleMode
                  ? <span style={{ opacity: .55 }}>課程準備中（開課將以 Email 通知）</span>
                  : <a href="/classroom" onClick={() => setMenuOpen(false)}>進入教室</a>)
              : <a href="/classroom/login" onClick={() => setMenuOpen(false)}>學員登入</a>}
            {user && <button onClick={handleLogout} style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left", padding: 0 }}>登出</button>}
          </div>
        )}
      </header>

      {authError && (
        <div style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "10px 20px", textAlign: "center", fontSize: 14, color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span>⚠️ 登入失敗：{authError}</span>
          <a href="/classroom/login" style={{ fontWeight: 700, color: "#dc2626", textDecoration: "underline" }}>重新登入</a>
          <button onClick={() => setAuthError("")} style={{ background: "none", border: 0, cursor: "pointer", color: "#dc2626", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}

      <main id="top">
        {/* HERO — 分欄：左 大標＋副標＋限時優惠卡 / 右 演奏照出血 */}
        <section ref={heroRef} className={styles.hero}>
          <div ref={heroPhotoRef} className={styles.heroPhoto} aria-hidden="true" />
          <div
            className={styles.heroPhotoZone}
            aria-hidden="true"
            onMouseEnter={() => setPhotoHover(true)}
            onMouseLeave={() => setPhotoHover(false)}
            onMouseMove={(e) => {
              const term = termRef.current;
              if (!term) return;
              const z = e.currentTarget.getBoundingClientRect();
              const x = Math.max(8, Math.min(e.clientX - z.left - term.offsetWidth / 2, z.width - term.offsetWidth - 8));
              const y = Math.max(8, Math.min(e.clientY - z.top + 20, z.height - term.offsetHeight - 8));
              term.style.transform = `translate(${x}px, ${y}px)`;
            }}
          >
            {/* 終端機：跟著游標在右側照片區內浮現移動（觸控裝置隱藏） */}
            <div ref={termRef} className={`${styles.statsCard} ${photoHover ? styles.statsShow : ""}`}>
              <div className={styles.termBar}>
                <span className={styles.termDot} /><span className={styles.termDot} /><span className={styles.termDot} />
                <span className={styles.termTitle}>inrecord — stats.sh</span>
              </div>
              <div className={styles.termBody}>
                <div className={styles.termLn}>
                  <span className={styles.termP}>›</span>
                  <StatItem value={stats ? stats.purchases : null}                              suffix="+" en="members"  label="學員加入學習" />
                  <StatItem value={stats && stats.rating != null ? Number(stats.rating) : null} suffix=""  en="rating"   label="學員平均評分" decimals={1} />
                </div>
                <div className={styles.termLn}>
                  <span className={styles.termP}>›</span>
                  <StatItem value={10} suffix=""  en="chapters" label="系統化章節" />
                  <StatItem value={10} suffix=""  en="songs"    label="流行曲目實戰" />
                  <span className={styles.termCur} />
                </div>
              </div>
            </div>
          </div>
          <div ref={heroContentRef} className={styles.heroGrid}>
            <motion.div className={styles.heroIntro} variants={stagger} initial="hidden" animate="visible">
              <motion.span variants={fadeUp} className={styles.heroSeries}>Crossoverick Vol.1</motion.span>
              <motion.h1 variants={fadeUp}>從零開始學<span>鋼琴</span></motion.h1>
              <motion.p variants={fadeUp} className={styles.heroSub}>了解三和弦與基礎伴奏</motion.p>
              <motion.p variants={fadeUp} className={styles.heroLead}>10 章節系統化學習，搭配互動遊戲練習，<br/>讓學鋼琴變得有趣、能追蹤成效，看見進步。</motion.p>
              {stats && (stats.rating != null || stats.purchases > 0) && (
                <motion.div variants={fadeUp} className={styles.heroProof}>
                  {stats.rating != null && (
                    <span className={styles.heroProofRating}>
                      <Star size={15} fill="currentColor" strokeWidth={0} />{Number(stats.rating).toFixed(1)}
                    </span>
                  )}
                  {stats.purchases > 0 && (
                    <span className={styles.heroProofMembers}>已有 <strong>{stats.purchases.toLocaleString()}+</strong> 位學員加入</span>
                  )}
                </motion.div>
              )}
              <motion.div variants={fadeUp} className={styles.offerCard}>
                <span className={styles.offerPill}>{fanOn ? "粉絲限定方案·超早鳥預購" : offer.isEarlyBird ? `${PLANS[1].label}·限時早鳥` : PLANS[1].label}</span>
                <div className={styles.offerPriceRow}>
                  <span className={styles.offerPrice}>NT${heroPrice.toLocaleString()}</span>
                  {offer.originalPrice > heroPrice && <span className={styles.offerWas}>NT${offer.originalPrice.toLocaleString()}</span>}
                </div>
                <div className={styles.offerLaunch}>📅 9/30 課程正式上架</div>
                {fanOn && showFanCountdown && (
                  <div className={styles.offerCountdown}>⏳ 粉絲早鳥價剩 <strong>{fmtCountdown(fanCountdownMs)}</strong></div>
                )}
                <div className={styles.offerBtns}>
                  <button className={styles.btnPrimary} onClick={scrollToPricing}>{buyShort}</button>
                  <a href="/demo" className={styles.btnOutline}>
                    <Play size={16} />課程 Demo 體驗
                  </a>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* INTRO — editorial "polished symmetric" */}
        <RevealSection id="intro" className={styles.introSection}>
          <div className={styles.container}>
            <div className={styles.introHeader}>
              <div className={styles.introEyebrow}>Course Design</div>
              <h2 className={styles.introHead}>課程設計與說明</h2>
              <div className={styles.introRule} />
              <p className={styles.introSubline}>10 章節循序漸進，從零基礎到能彈出自己喜歡的歌。</p>
            </div>
            <motion.div
              className={styles.introIndex}
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
            >
              {[
                ["零基礎友善",   "從鍵盤、中央 C、音名開始，不需要會看五線譜才能學。"],
                ["互動遊戲",  "音名快閃、唱名階梯、和弦辨識家，讓練習變有趣。"],
                ["流行曲目實戰", "用熟悉歌曲練習，提升成就感與持續學習動機。"],
                ["成果導向",     "最後完成一首完整曲目，建立下一階段學習基礎。"],
              ].map(([title, desc], i) => (
                <motion.div key={title} className={styles.introIx} variants={fadeUp}>
                  <div className={styles.introIxNo}>{String(i + 1).padStart(2, "0")}</div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </motion.div>
              ))}
            </motion.div>
            <div className={styles.introGrid}>
              <div className={styles.introCopy}>
                <small>課程定位與目標</small>
                <h2>專為零基礎學員設計<br/>學完就能彈出喜歡的歌</h2>
                <p>從認識鍵盤、音名與基本樂理開始，循序漸進掌握流行音樂中最重要的元素：三和弦。</p>
                <ul className={styles.outcomes}>
                  {[
                    "獨立辨識鋼琴上的所有音名（ABCDEFG）",
                    "理解並彈奏全部 12 個大三和弦與 12 個小三和弦",
                    "看懂簡易的流行歌曲和弦譜",
                    "用基本伴奏方式，為自己喜愛的歌曲彈奏和弦",
                    "建立扎實基礎，為下一階段的進階學習做好準備",
                  ].map(o => <li key={o}>{o}</li>)}
                </ul>
              </div>
              <div className={styles.pianoPhoto} />
            </div>
          </div>
        </RevealSection>

        {/* POINTS */}
        <section id="points" className={styles.pointsSection}>
          <div className={styles.container}>
            {POINTS.map(pt => (
              <RevealSection key={pt.n} className={styles.pointBlock}>
                <div className={styles.pointBadge}>POINT {pt.n}</div>
                <h2 className={styles.pointTitle}>{pt.title}</h2>
                {pt.n === 1 ? (
                  <PointCarousel slides={POINT1_SLIDES} point={1} />
                ) : pt.n === 2 ? (
                  <PointCarousel slides={POINT2_SLIDES} point={2} />
                ) : pt.n === 3 ? (
                  <PointCarousel slides={POINT3_SLIDES} point={3} />
                ) : pt.n === 4 ? (
                  <PointCarousel slides={POINT4_SLIDES} point={4} />
                ) : (
                  <PointCarousel slides={POINT5_SLIDES} point={5} />
                )}
              </RevealSection>
            ))}
          </div>
        </section>

        {/* CURRICULUM */}
        <RevealSection id="curriculum" className={styles.curriculum}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程大綱</small>
              <h2>10 章節 ＋ 2 附錄系統化學習<br/>從基礎到實戰，穩扎穩打</h2>
            </div>
            <div className={styles.moduleList}>
              {/* 表格式手風琴：左箭頭＋章名、右側單元數；展開後每單元一列（播放 icon＋分隔線） */}
              {MODULES.map(m => (
                <details key={m.n} className={styles.module}>
                  <summary className={styles.moduleSummary}
                    style={{ gridTemplateColumns: "18px 1fr auto", alignItems: "center", gap: 14, padding: "18px 20px", background: "#f8fafc" }}>
                    <span className={styles.chevron} style={{ marginTop: 0, color: "#64748b" }}><ChevronDown size={17} strokeWidth={2.2} /></span>
                    <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.5, wordBreak: "keep-all", lineBreak: "strict" }}>
                      {m.isAppendix ? `${m.appendixLabel}：${m.title}` : `Ch${m.n} ${m.title}`}
                    </h3>
                    {m.units?.length > 0 && (
                      <span style={{ fontSize: 13.5, color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap" }}>共 {m.units.length} 個單元</span>
                    )}
                  </summary>
                  <div className={styles.moduleBody} style={{ padding: 0 }}>
                    {m.units?.length > 0 ? (
                      <>
                        {m.units.map(u => (
                          <div key={u} style={{
                            display: "flex", alignItems: "center", gap: 14,
                            padding: "16px 20px 16px 24px", borderTop: "1px solid #eef2f6",
                            fontSize: 15.5, color: "#1e293b", wordBreak: "keep-all", lineBreak: "strict",
                          }}>
                            <span style={{ width: 26, height: 20, borderRadius: 5, background: "#eceff3", display: "grid", placeItems: "center", flexShrink: 0, color: "#a6b0bd" }}>
                              <Play size={10} fill="currentColor" strokeWidth={0} />
                            </span>
                            {u}
                          </div>
                        ))}
                        {/* 實戰曲目／互動遊戲：同列式呈現，藍色 icon 方塊區隔內容類型 */}
                        {m.song && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 14,
                            padding: "16px 20px 16px 24px", borderTop: "1px solid #eef2f6",
                            fontSize: 15, color: "#475569", lineHeight: 1.6, wordBreak: "keep-all", lineBreak: "strict",
                          }}>
                            <span style={{ width: 26, height: 20, borderRadius: 5, background: "#e8efff", display: "grid", placeItems: "center", flexShrink: 0, color: "#2563eb" }}>
                              <Music size={11} strokeWidth={2.2} />
                            </span>
                            <span><b style={{ color: "#1e293b" }}>實戰曲目</b>｜{m.song}</span>
                          </div>
                        )}
                        {m.games && m.games.map((g, gi) => (
                          <div key={gi} style={{
                            display: "flex", alignItems: "center", gap: 14,
                            padding: "16px 20px 16px 24px", borderTop: "1px solid #eef2f6",
                            fontSize: 15, color: "#475569", lineHeight: 1.6, wordBreak: "keep-all", lineBreak: "strict",
                          }}>
                            <span style={{ width: 26, height: 20, borderRadius: 5, background: "#e8efff", display: "grid", placeItems: "center", flexShrink: 0, color: "#2563eb" }}>
                              <Gamepad2 size={12} strokeWidth={2.2} />
                            </span>
                            <span><b style={{ color: "#1e293b" }}>互動遊戲</b>｜{g}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p style={{ margin: 0, padding: "16px 20px", borderTop: "1px solid #eef2f6", color: "var(--muted)", fontSize: 15, lineHeight: 1.75 }}>{m.desc}</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* INSTRUCTOR */}
        <RevealSection id="instructor" className={styles.instructorSection}>
          <div className={styles.container + " " + styles.instructorGrid}>
            <Image className={styles.instructorPhoto} src="/rick.jpg" alt="跨界鋼琴家張育瑞（Rick Chang）演奏形象照" width={800} height={1200} sizes="(max-width: 980px) 100vw, 420px" />
            <div className={styles.instructorCopy}>
              <small>講師介紹</small>
              <h2>Rick Chang<br/><span>張育瑞老師</span></h2>
              <p className={styles.instructorRole}>跨界鋼琴家・音樂製作人・流行鋼琴老師</p>
              <InstructorBioCarousel slides={[
                <>以獨樹一格的「瑞式」古典搖滾風格深受樂迷喜愛，是樂壇少見能將古典優雅與流行爆發力完美結合的跨界鋼琴家。畢業於美國伯克利音樂學院（Berklee College of Music），取得演奏與音樂製作碩士學位；現為碩樂國際娛樂（Showing Music Entertainment）簽約鋼琴家、環球音樂（Universal Music Publishing Group）專屬詞曲創作者。</>,
                <>首張跨界鋼琴專輯《Fire!》登上博客來「品味」類排行榜第一，並榮獲美國全球音樂獎（Global Music Awards）「新銳藝術家」與「器樂演奏家」銅牌。作品在社群亦極具渲染力——2024 年為台灣奧運創作的歌曲 48 小時內突破 200 萬觀看，與布達佩斯配樂交響樂團合作的鋼琴協奏曲《黑暗世界》發布一個月即破十萬點閱。</>,
                <>2024 年，受 YAMAHA 山葉鋼琴與采盟免稅集團之邀，於桃園國際機場策劃快閃演奏會，並獲德國頂級 <span style={{ whiteSpace: "nowrap" }}>C.Bechstein</span> 貝希斯坦鋼琴邀請舉辦個人演奏會；2025 年，擔綱嘉義大學藝術節揭幕演出；2026 年，更受統一 <span style={{ whiteSpace: "nowrap" }}>7-ELEVEn</span> 獅之邀，於台南亞太國際棒球場連續擔綱兩場賽後演出嘉賓，持續在不同場域拓展鋼琴的新可能。</>,
              ]} />
              <ul className={styles.instructorCreds}>
                {[
                  [GraduationCap, "美國伯克利音樂學院（Berklee）演奏與音樂製作碩士"],
                  [Mic2,          "碩樂國際娛樂簽約鋼琴家・環球音樂專屬詞曲創作者"],
                  [Award,         "跨界專輯《Fire!》博客來「品味」榜冠軍・全球音樂獎雙銅牌"],
                  [Video,         "2024 奧運創作曲 48 小時破 200 萬觀看・《黑暗世界》協奏曲月破十萬"],
                  [BookOpen,      "受邀師大附中、嘉義大學等多校音樂系講座與大師班"],
                ].map(([Icon, text]) => (
                  <li key={text}>
                    <span className={styles.credIcon}><Icon size={15} strokeWidth={2} /></span>
                    <span className={styles.credText}>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </RevealSection>

        {/* PRICING */}
        <RevealSection id="pricing" className={styles.pricingSection}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程方案</small>
              <h2>選擇最適合你的方案</h2>
              <p>一次購買，永久擁有。課程與遊戲皆為買斷制，無訂閱、無月費。</p>
            </div>
            <motion.div className={styles.plansRow} style={{ gridTemplateColumns: "minmax(0, 360px)" }} variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }}>
              {/* 粉絲限定方案：enabled（後台開關 且 未過 deadline）控整卡；截止後整個方案關、FAN3999 也拒收。
                  停用時 fallback 顯示標準課程包卡，避免方案區整個變空、CTA 捲到空白。 */}
              {sale.fanPlan.enabled ? (
              <motion.div className={[styles.planCard, styles.planCardFeatured].join(" ")} variants={fadeUp}>
                <div className={styles.planRibbon}>★ 粉絲限定</div>
                <h3 className={styles.planName}>粉絲限定方案</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 14px" }} role="radiogroup" aria-label="粉絲限定購買方式">
                  <label style={fanRowStyle(fanChoice === "direct" || !fanProofOpen)} onClick={() => setFanChoice("direct")} role="radio" aria-checked={fanChoice === "direct" || !fanProofOpen} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("direct"); } }}>
                    <span>直接購買</span>
                    <strong>NT${sale.fanPlan.directPrice.toLocaleString()}</strong>
                  </label>
                  {fanProofOpen && (
                  <label style={fanRowStyle(fanChoice === "proof")} onClick={() => setFanChoice("proof")} role="radio" aria-checked={fanChoice === "proof"} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("proof"); } }}>
                    <span>上傳憑證</span>
                    <strong>NT${sale.fanPlan.proofPrice.toLocaleString()}</strong>
                  </label>
                  )}
                </div>
                {fanProofOpen && (
                <div style={{ fontSize: 12.5, color: "#566180", background: "#eef4ff", border: "1px solid #cdddf8", borderRadius: 10, padding: "10px 12px", margin: "2px 0 14px", lineHeight: 1.75, wordBreak: "keep-all", lineBreak: "strict" }}>
                  ※ 購買演奏會門票、專輯或樂譜者，上傳憑證後即可享 NT${sale.fanPlan.proofPrice.toLocaleString()} 優惠價購買。
                </div>
                )}
                <ul className={styles.planFeatures}>
                  {PLANS[1].features.map(f => <li key={f}><Check size={14} strokeWidth={2.5} />{f}</li>)}
                </ul>
                <button className={`${styles.planBtn} ${styles.planBtnFeatured}`}
                  onClick={() => (fanChoice === "proof" && fanProofOpen) ? startBuy(PLANS[1], { fanProof: true }) : startBuy(PLANS[1], { autoCoupon: "FAN3999" })}>
                  {(fanChoice === "proof" && fanProofOpen) ? `上傳憑證並${buyShort}　NT$${sale.fanPlan.proofPrice.toLocaleString()}` : `${buyShort}　NT$${sale.fanPlan.directPrice.toLocaleString()}`}
                </button>
                {fanProofOpen && <span style={{ fontSize: 11.5, color: "#6a5b48", marginTop: 8, display: "block", textAlign: "center" }}>粉絲價申請至 {fanDeadlineLabel} 截止</span>}
                {/* 現場/活動序號兌換入口：serialEntry 模式的 BuyModal 收任何 type=price 序號券 */}
                <button type="button" onClick={() => startBuy(PLANS[1], { serialEntry: true })}
                  style={{ background: "none", border: "none", padding: 0, marginTop: 6, display: "block", width: "100%", textAlign: "center", fontSize: 12.5, color: "#566180", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit" }}>
                  有序號？點此兌換
                </button>
              </motion.div>
              ) : (
              <motion.div className={[styles.planCard, styles.planCardFeatured].join(" ")} variants={fadeUp}>
                <div className={styles.planRibbon}>★ 最超值全配</div>
                <h3 className={styles.planName}>{PLANS[1].label}</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 14px" }}>
                  <strong style={{ fontSize: 32, lineHeight: 1 }}>NT${offer.price.toLocaleString()}</strong>
                  {offer.originalPrice > offer.price && <span style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: 16 }}>NT${offer.originalPrice.toLocaleString()}</span>}
                </div>
                <ul className={styles.planFeatures}>
                  {PLANS[1].features.map(f => <li key={f}><Check size={14} strokeWidth={2.5} />{f}</li>)}
                </ul>
                <button className={`${styles.planBtn} ${styles.planBtnFeatured}`} onClick={() => startBuy(PLANS[1])} disabled={!sale.onSale}>
                  {sale.onSale ? `${buyShort}　NT$${offer.price.toLocaleString()}` : "即將開賣"}
                </button>
              </motion.div>
              )}
            </motion.div>
            <p className={styles.buySecurity}>🔒 透過 PAYUNi 安全金流付款・課程永久有效</p>
            {/* 消保告知：條款有寫、購買頁也要出現（告知充分性） */}
            <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", margin: "6px 0 0", lineHeight: 1.7, wordBreak: "keep-all", lineBreak: "strict" }}>
              本課程為數位內容商品，購買前已提供試看；依法不適用七日無條件解除權，
              退費依「<a href="/terms" style={{ color: "#64748b", textDecoration: "underline", textUnderlineOffset: 2 }}>服務條款</a>」退費政策辦理（預售訂單自 9/30 正式開課日起算）。
            </p>
          </div>
        </RevealSection>

        {/* FAQ */}
        <RevealSection id="faq" className={styles.faqSection}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>常見問題</small>
              <h2>購買前你可能會想知道</h2>
            </div>
            <div className={styles.faq}>
              {[
                ["完全零基礎可以上嗎？",         "可以。課程從鍵盤佈局、音名、唱名與基本坐姿開始，循序漸進進入三和弦與伴奏，不需要任何音樂基礎。"],
                ["什麼時候可以上課？",           <>課程於 <b>9/30 正式上架</b>，屆時所有購課學員皆可觀看全部章節。<br/>9/9（含）前購課的早鳥學員，可依上架進度搶先開始上課：<br/>・9/2（20:00 起）— 第一章<br/>・9/9 — 第二章<br/>・9/16 — 第三章<br/>・9/23 — 第四章<br/>・9/30 — 全部章節上架完畢</>],
                ["我需要準備鋼琴嗎？",           "互動遊戲有免鍵盤的互動練習，但建議準備鋼琴、電鋼琴或電子琴來練習曲目，效果更好。"],
                ["這門課會教五線譜嗎？",         "本課程重點在鍵盤音名、唱名、三和弦與和弦譜閱讀，讓你快速彈出流行歌曲伴奏，不以五線譜為主。"],
                ...(fanOn ? [["直接購買和上傳憑證有什麼差別？", `兩者都是一次買斷、永久擁有完整課程與全部互動遊戲。直接購買可用 NT$${sale.fanPlan.directPrice.toLocaleString()} 購買；若你購買過演奏會門票、專輯或樂譜，上傳憑證即可享 NT$${sale.fanPlan.proofPrice.toLocaleString()} 優惠價。`]] : []),
                ["課程有效期多久？",             "課程購買後永久有效，無觀看次數限制。只要平台持續運營，你隨時都可以回來複習。"],
                ["可以在手機或平板上看嗎？",     "可以。課程支援電腦、手機、平板等所有裝置，只要有瀏覽器和網路連線即可觀看。"],
                ["付款方式有哪些？",             "目前支援信用卡（Visa、Mastercard、JCB）、簽帳金融卡、ATM 轉帳及超商代碼繳費，透過 PAYUNi 金流安全處理。"],
              ].map(([q, a]) => (
                <details key={q} className={styles.faqItem}>
                  <summary className={styles.faqSummary}>
                    <span>{q}</span>
                    <ChevronDown size={18} strokeWidth={2} className={styles.faqArrow} />
                  </summary>
                  <div className={styles.faqContent}><p>{a}</p></div>
                </details>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* CTA */}
        <RevealSection className={styles.ctaSection}>
          <div className={styles.container}>
            <div className={styles.cta}>
              <span className={styles.ctaEyebrow}>START NOW</span>
              <h2>現在開始，<span>彈出你的<wbr />第一首流行歌曲</span></h2>
              <p>從零基礎開始，透過系統化課程與互動遊戲，建立真正彈得出來的鋼琴能力。</p>
              <button className={`${styles.btnPrimary} ${styles.btnPulse}`} onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                {buyShort}課程
              </button>
            </div>
          </div>
        </RevealSection>
      </main>

      <div className={`${styles.stickyBuyBar} ${showStickyBar ? styles.stickyBuyBarShow : ""}`}>
        <div className={styles.stickyBuyInfo}>
          <span className={styles.stickyBuyPrice}>NT${heroPrice.toLocaleString()}</span>
          <span className={styles.stickyBuyLabel}>{fanOn ? "粉絲限定方案" : PLANS[1].label}</span>
        </div>
        <button className={styles.stickyBuyBtn} onClick={scrollToPricing}>
          {buyShort}
        </button>
      </div>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span onDoubleClick={() => { window.location.href = "/admin"; }} style={{ cursor: "default" }}><Logo white size={28} /></span>
            <div className={styles.footerSocial}>
              {[
                // url 為 null 者尚未提供連結，先不顯示（待補上 YouTube／Line 後填入）
                [Camera,        "Instagram", "https://www.instagram.com/inrecord.music"],
                [PlayCircle,    "YouTube",   null],
                [MessageCircle, "Line",      null],
              ].filter(([, , url]) => url).map(([Icon, label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className={styles.socialBtn} aria-label={label}>
                  <Icon size={18} />
                </a>
              ))}
            </div>
            <p className={styles.footerCopy}>© InRecord｜音樂刻</p>
            <div className={styles.footerLinks}>
              <a href="/privacy">隱私權政策</a>
              <a href="/terms">服務條款</a>
              <a href="/contact">聯絡我們</a>
            </div>
          </div>
        </div>
      </footer>

      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} plan={selectedPlan} email={user?.email} pricing={selectedPlan ? sale.plans[selectedPlan.plan] : undefined} onSale={sale.onSale} fanProof={fanProofMode} autoCoupon={fanAutoCoupon} serialEntry={fanSerialEntry} fanProofPrice={sale.fanPlan.proofPrice} fanDirectPrice={sale.fanPlan.directPrice} />
    </>
  );
}
