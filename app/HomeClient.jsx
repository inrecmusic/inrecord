"use client";
import { useState, useEffect, useRef } from "react";
import {
  Music2, Bot, Music, GraduationCap,
  Users, TrendingUp, Play, Award, Star,
  Camera, PlayCircle, MessageCircle,
  Menu, X, ChevronDown,
  ShoppingCart, Heart, Mic2,
  Hand, Sun, Moon, Shuffle, Headphones,
  Layers, Waves, RotateCcw,
  Zap, BarChart2, Gamepad2, Clock,
  Video, BookOpen,
  Check,
} from "lucide-react";
import Logo from "@/components/Logo";
import BuyModal from "@/components/BuyModal";
import { isFanProofOpen } from "@/lib/fan-proof";
import Countdown from "@/components/Countdown";
import PointCarousel from "@/components/PointCarousel";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";
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
    sub: ["20+ 首真歌——", "學完就能上手彈。"],
    visual: {
      type: "musiccard",
      variant: "playlist",
      label: "播放清單 · PLAYLIST",
      title: "可彈曲目",
      sub: "20+ 首流行曲目 · 入門到進階",
      tracks: [
        { wave: true, title: "流行抒情曲", status: "正在練習" },
        { n: "02", title: "經典流行金曲", time: "4:01" },
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
    features: ["10 章節系統化課程", "10+ 首簡易歌曲實戰", "完整樂譜下載", "無限次重複觀看"],
    cta: "購買課程",
  },
  {
    plan: "bundle",
    label: "學琴全攻略",
    pillLabel: "最超值全配",
    price: 3999,
    desc: "課程 + 互動遊戲，永久使用、一次擁有全部。",
    features: ["完整 10 章節課程", "課程時數 8 小時", "全部互動遊戲永久使用", "10+ 首簡易歌曲實戰", "完整樂譜下載", "無限次重複觀看"],
    featured: true,
    ribbon: "最推薦",
    cta: "購買課程包",
  },
];

const MODULES = [
  { n: 1,  title: "踏上黑白鍵的第一步",           desc: "認識七個基本音名（A, B, C, D, E, F, G）、鍵盤布局與基本坐姿手型，建立你的第一個鋼琴地圖。",                                           song: "音階單音練習",                                   game: "音名快閃 — 畫面隨機顯示琴鍵位置，限時點擊正確音名",     img: "photo-1520523839897-bd0b52f945a0" },
  { n: 2,  title: "音符的語言 — 唱名與音階",       desc: "C 大調音階的組成與指法練習，學習 Do Re Mi Fa Sol La Si 唱名系統，搭配音樂跟著彈音階與《小蜜蜂》。",                                    song: "《Do-Re-Mi》（電影《真善美》插曲）",              game: "唱名階梯 — 畫面隨機顯示琴鍵位置，限時點擊正確唱名",     img: "photo-1507838153414-b4b713384a76" },
  { n: 3,  title: "和弦的基石 — 大三和弦",         desc: "大三和弦定義（根音＋大三度＋純五度），掌握 C、F、G 三個最常用大三和弦，辨認和弦組成音。",                                                song: "《Happy Birthday to You》（C、F、G 和弦進行）",  game: "和弦辨識家 — 辨認大三與小三和弦，辨認和弦的組成音",      img: "photo-1520523839897-bd0b52f945a0" },
  { n: 4,  title: "情感的色彩 — 小三和弦",         desc: "Am、Em 常用小三和弦的指法與辨識，感受大、小和弦截然不同的情緒色彩，練習土耳其進行曲左手伴奏。",                                          song: "《稻香》（周杰倫）簡化版和弦進行",                game: "情緒調色盤 — 聆聽大、小三和弦，判斷情緒感受（開心／難過）", img: "photo-1514119412350-e174d90d280e" },
  { n: 5,  title: "12 金鑰 — 認識所有大三和弦",    desc: "升降記號（Sharp #、Flat b）在和弦中的應用，系統性學習全部 12 個大三和弦。",                                                              song: "《學貓叫》和弦進行練習",                          game: "和弦俄羅斯 — 從天而降的和弦方塊，彈出正確和弦消除",      img: "photo-1552422535-c45813c61732" },
  { n: 6,  title: "12 種溫柔 — 認識所有小三和弦",  desc: "大小和弦的快速轉換技巧，系統性學習全部 12 個小三和弦，並與大三和弦對比練習。",                                                            song: "《說好不哭》（周杰倫）副歌和弦進行",              game: "和弦變身術 — 顯示大三和弦，快速彈出對應的小三和弦",      img: "photo-1520523839897-bd0b52f945a0" },
  { n: 7,  title: "左手的魔法 — 基礎伴奏（一）",   desc: "拍子與節奏入門，四四拍全和弦 Block Chord 穩定伴奏法，右手單音旋律搭配左手伴奏。",                                                          song: "《告白氣球》（周杰倫）右手旋律＋左手全和弦伴奏",  game: "節奏打點師 — 跟隨節拍器，在正確時機點擊螢幕練習穩定性", img: "photo-1514119412350-e174d90d280e" },
  { n: 8,  title: "讓音樂動起來 — 基礎伴奏（二）", desc: "分解和弦（Arpeggio）伴奏法，音型如 1-5-3-5，讓音樂更具流動感與層次。",                                                                  song: "《刻在我心底的名字》（盧廣仲）右手旋律＋左手分解和弦", game: "分解和弦連連看 — 將和弦組成音按正確分解順序連接",    img: "photo-1507838153414-b4b713384a76" },
  { n: 9,  title: "流行音樂的萬用公式",             desc: "卡農和弦進行（C-G-Am-Em-F-C-F-G），和弦級數概念（I-V-vi-iii-IV-I-IV-V），解鎖流行歌曲背後的共同密碼。",                                   song: "《那些年》、《情非得已》等經典歌曲片段串燒",      game: "和弦神預測 — 聆聽前三個和弦，預測並彈出第四個",          img: "photo-1552422535-c45813c61732" },
  { n: 10, title: "你的第一場個人發表會",            desc: "複習所有三和弦與兩種基本伴奏型態，綜合運用所學，完整彈奏一首流行歌曲，正式展現你的學習成果。",                                              song: "《Always With Me》（神隱少女片尾曲）完整版",      game: "自由創作坊 — 自由搭配旋律與伴奏並可錄製分享",            img: "photo-1514119412350-e174d90d280e" },
  { n: "a1", isAppendix: true, appendixLabel: "附錄一", title: "如何更有效率地練琴？",    desc: "分段練習、慢速練習、節拍器使用技巧，幫助學員建立良好練習習慣，讓每次練習的效果最大化。", img: "photo-1507838153414-b4b713384a76" },
  { n: "a2", isAppendix: true, appendixLabel: "附錄二", title: "給初學者的器材選購建議", desc: "不同預算下的電鋼琴、電子琴選購指南，以及實用 App 和軟體推薦，幫助你找到最適合自己的學習工具。", img: "photo-1552422535-c45813c61732" },
];

const CH = ["一","二","三","四","五","六","七","八","九","十"];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.12 } } };

function useCountUp(target, duration = 1800) {
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
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);
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

function StatItem({ value, suffix, en, label }) {
  const [count, ref] = useCountUp(value ?? 0);
  return (
    <span className={styles.stat} ref={ref} title={label}>
      <span className={styles.statKey}>{en}</span>
      <strong>{value != null ? `${count.toLocaleString()}${suffix}` : "—"}</strong>
    </span>
  );
}

export default function HomeClient({ sale }) {
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fanChoice, setFanChoice] = useState("direct");   // 粉絲卡選項
  const [fanProofMode, setFanProofMode] = useState(false); // 傳給 BuyModal
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [stats, setStats] = useState(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [photoHover, setPhotoHover] = useState(false);
  const termRef = useRef(null);
  const musicCursorRef = useRef(null);
  const heroRef = useRef(null);

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

  function startBuy(plan, opts = {}) {
    if (!user?.email) { window.location.href = "/classroom/login"; return; }
    setSelectedPlan(plan);
    setFanProofMode(!!opts.fanProof);
    setBuyOpen(true);
  }

  function openBuy() {
    startBuy(selectedPlan || PLANS[1]);
  }


  // 預售期間：教室內容鎖站（見 middleware.js），登入後不顯示「進入教室」死連結
  const presaleMode = !sale.classroomOpen;

  // 購買鈕三態文案：開賣前 → 即將開賣；波段 → 立即預購；牌價（教室已開）→ 立即購買
  const buyLabel = !sale.onSale ? "即將開賣" : (sale.classroomOpen ? "立即購買課程" : "立即預購課程");
  // 短版購買鈕文案（粉絲卡用）
  const buyShort = sale.classroomOpen ? "立即購買" : "立即預購";
  // Hero 優惠卡綁定主推方案（bundle）的波段定價
  const offer = sale.plans[PLANS[1].plan];

  const fanRowStyle = (on) => ({
    display: "flex", justifyContent: "space-between", alignItems: "center",
    border: `1.5px solid ${on ? "#9c3540" : "#d8c9ad"}`, background: on ? "#fbf3ef" : "transparent",
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
            <a href="/demo">課程試看</a>
          </nav>
          {user
            ? (presaleMode
                ? <span className={`${styles.btnLogin} ${styles.navBtn}`} style={{ opacity: .55, cursor: "default" }} title="開課將以 Email 通知">課程準備中</span>
                : <a href="/classroom" className={`${styles.btnLogin} ${styles.navBtn}`}>進入教室</a>)
            : <a href="/classroom/login" className={`${styles.btnLogin} ${styles.navBtn}`}>學員登入</a>}
          <button className={`${styles.btnRed} ${styles.navBtn}`} onClick={() => startBuy(PLANS[1])} disabled={!sale.onSale} style={!sale.onSale ? { opacity: .55, cursor: "default", wordBreak: "keep-all", lineBreak: "strict" } : { wordBreak: "keep-all", lineBreak: "strict" }}>{buyLabel}</button>
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
          <div className={styles.heroPhoto} aria-hidden="true" />
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
                  <StatItem value={stats && stats.rating != null ? Number(stats.rating) : null} suffix=""  en="rating"   label="學員平均評分" />
                </div>
                <div className={styles.termLn}>
                  <span className={styles.termP}>›</span>
                  <StatItem value={10} suffix=""  en="chapters" label="系統化章節" />
                  <StatItem value={20} suffix="+" en="songs"    label="流行曲目實戰" />
                  <span className={styles.termCur} />
                </div>
              </div>
            </div>
          </div>
          <div className={styles.heroGrid}>
            <motion.div className={styles.heroIntro} variants={stagger} initial="hidden" animate="visible">
              <motion.span variants={fadeUp} className={styles.heroSeries}>Crossoverick Vol.1</motion.span>
              <motion.h1 variants={fadeUp}>從零開始學<span>鋼琴</span></motion.h1>
              <motion.p variants={fadeUp} className={styles.heroSub}>了解三和弦與基礎伴奏</motion.p>
              <motion.p variants={fadeUp} className={styles.heroLead}>10 章節系統化學習，搭配互動遊戲練習，<br/>讓學鋼琴變得有趣、有效、看得見進步。</motion.p>
              <motion.div variants={fadeUp} className={styles.offerCard}>
                <span className={styles.offerPill}>
                  {offer.isEarlyBird ? "早鳥優惠" : "課程方案"}
                  {offer.isEarlyBird && sale.nextIncreaseAt && <Countdown to={sale.nextIncreaseAt} prefix=" · 漲價倒數 " />}
                </span>
                <div className={styles.offerPriceRow}>
                  <span className={styles.offerPrice}>NT${offer.price.toLocaleString()}</span>
                  {offer.isEarlyBird && <span className={styles.offerWas}>NT${offer.originalPrice.toLocaleString()}</span>}
                </div>
                <div className={styles.offerBtns}>
                  <button className={styles.btnRed} onClick={openBuy} disabled={!sale.onSale} style={!sale.onSale ? { opacity: .55, cursor: "default" } : undefined}>{buyLabel}</button>
                  <a href="/demo" className={styles.btnOutline}>
                    <Play size={16} />課程 Demo 體驗
                  </a>
                </div>
                <span className={styles.offerGuard}><Check size={13} strokeWidth={3} />7 天不滿意，全額退費保證</span>
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
                ["零基礎友善",   "從鍵盤、中央 C、音名開始，不跳步、不硬塞。"],
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
              {MODULES.map(m => (
                <details key={m.n} className={styles.module}>
                  <summary className={styles.moduleSummary}>
                    <div className={`${styles.num} ${m.isAppendix ? styles.numAppendix : ""}`}>
                      {m.isAppendix ? "附" : m.n}
                    </div>
                    <h3>{m.isAppendix ? `${m.appendixLabel}：${m.title}` : `第 ${CH[m.n - 1]} 章：${m.title}`}</h3>
                    <span className={styles.chevron}><ChevronDown size={18} strokeWidth={2} /></span>
                  </summary>
                  <div className={styles.moduleBody}>
                    <div className={styles.moduleImg} style={{ backgroundImage: `url(https://images.unsplash.com/${m.img}?auto=format&fit=crop&w=500&q=80)` }} />
                    <div>
                      <p>{m.desc}</p>
                      {!m.isAppendix && (
                        <div className={styles.moduleMetaRow}>
                          <div className={styles.meta}><Music size={14} className={styles.metaIcon} />實戰曲目：{m.song}</div>
                          <div className={styles.meta}><Bot size={14} className={styles.metaIcon} />遊戲：{m.game}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </RevealSection>

        {/* INSTRUCTOR */}
        <RevealSection id="instructor" className={styles.instructorSection}>
          <div className={styles.container + " " + styles.instructorGrid}>
            <div className={styles.instructorPhoto} />
            <div className={styles.instructorCopy}>
              <small>講師介紹</small>
              <h2>Rick Chang<br/><span>張育瑞老師</span></h2>
              <p className={styles.instructorRole}>音樂製作人・鋼琴演奏者・流行鋼琴老師</p>
              <p>美國波士頓 <span style={{ whiteSpace: "nowrap" }}>Berklee College of Music</span> 音樂碩士，簽約碩樂國際娛樂（<span style={{ whiteSpace: "nowrap" }}>Universal Music Publishing</span> 台灣授權公司），首張個人專輯《Fire!》登上 iTunes 流行榜冠軍。</p>
              <p>榮獲 <span style={{ whiteSpace: "nowrap" }}>Global Music Awards</span> 銅獎，2024 巴黎奧運主題歌曲累計超過 200 萬次觀看，並與布達佩斯交響樂團合作錄製管弦樂作品。</p>
              <ul className={styles.instructorCreds}>
                {[
                  [GraduationCap, "Berklee College of Music 音樂碩士"],
                  [Award,         "iTunes 流行榜冠軍《Fire!》・Global Music Awards 銅獎"],
                  [Mic2,          "2024 奧運主題曲 200 萬+ 觀看・布達佩斯交響樂團合作"],
                  [Music2,        "Yamaha・桃園機場・Bechstein・誠品・衛武營 演奏會"],
                  [Users,         "線上課程累積超過 500 位學員"],
                ].map(([Icon, text]) => (
                  <li key={text}>
                    <span className={styles.credIcon}><Icon size={15} strokeWidth={2} /></span>
                    {text}
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
            <motion.div className={styles.plansRow} variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }}>
              {/* 學琴全攻略（bundle） */}
              <motion.div className={styles.planCard} variants={fadeUp}>
                <div className={styles.planHeaderRow}>
                  <div className={styles.planPill}><span className={styles.planPillDot} />最超值全配</div>
                </div>
                <h3 className={styles.planName}>學琴全攻略</h3>
                <div className={styles.planPriceBlock}><div className={styles.planPriceRow}>
                  <span className={styles.planCurrency}>NT$</span>
                  <span className={styles.planPrice}>{sale.plans[PLANS[1].plan].price.toLocaleString()}</span>
                  <span className={styles.planUnit}>／永久</span>
                </div></div>
                <p className={styles.planDesc}>課程 + 互動遊戲，永久使用、一次擁有全部。</p>
                <ul className={styles.planFeatures}>
                  {PLANS[1].features.map(f => <li key={f}><Check size={14} strokeWidth={2.5} />{f}</li>)}
                </ul>
                <button className={styles.planBtn} onClick={() => startBuy(PLANS[1])} disabled={!sale.onSale}
                  style={!sale.onSale ? { opacity: .55, cursor: "default" } : undefined}>
                  <ShoppingCart size={17} />{sale.onSale ? `${buyLabel}　NT$${sale.plans[PLANS[1].plan].price.toLocaleString()}` : buyLabel}
                </button>
              </motion.div>

              {/* 粉絲限定方案（卡內兩選項） */}
              <motion.div className={[styles.planCard, styles.planCardFeatured].join(" ")} variants={fadeUp}>
                <div className={styles.planRibbon}>★ 粉絲限定</div>
                <h3 className={styles.planName}>粉絲限定方案</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 14px" }} role="radiogroup" aria-label="粉絲限定購買方式">
                  <label style={fanRowStyle(fanChoice === "direct")} onClick={() => setFanChoice("direct")} role="radio" aria-checked={fanChoice === "direct"} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("direct"); } }}>
                    <span>直接購買</span>
                    <strong>NT$3,999</strong>
                  </label>
                  {isFanProofOpen() && (
                    <label style={fanRowStyle(fanChoice === "proof")} onClick={() => setFanChoice("proof")} role="radio" aria-checked={fanChoice === "proof"} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("proof"); } }}>
                      <span>上傳憑證 · 粉絲價</span>
                      <strong>NT$3,499</strong>
                    </label>
                  )}
                </div>
                {isFanProofOpen() && (
                  <p style={{ fontSize: 12.5, color: "#6a5b48", margin: "-2px 0 14px", lineHeight: 1.6 }}>
                    ※ 購買演奏會門票、專輯或樂譜者，上傳憑證後即可用 NT$3,499 購買。
                  </p>
                )}
                <ul className={styles.planFeatures}>
                  {PLANS[1].features.map(f => <li key={f}><Check size={14} strokeWidth={2.5} />{f}</li>)}
                </ul>
                <button className={`${styles.planBtn} ${styles.planBtnFeatured}`}
                  onClick={() => startBuy(PLANS[1], { fanProof: fanChoice === "proof" })}
                  disabled={!sale.onSale} style={!sale.onSale ? { opacity: .55, cursor: "default" } : undefined}>
                  <ShoppingCart size={17} />
                  {!sale.onSale ? buyLabel : fanChoice === "proof" ? `上傳憑證並${buyShort}　NT$3,499` : `${buyLabel}　NT$3,999`}
                </button>
                {isFanProofOpen() && <span style={{ fontSize: 11.5, color: "#6a5b48", marginTop: 8, display: "block", textAlign: "center" }}>粉絲價申請至 9/3 截止</span>}
              </motion.div>
            </motion.div>
            <p className={styles.buySecurity}>🔒 透過 PAYUNi 安全金流付款・購買後立即開通・永久有效</p>
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
                ["我需要準備鋼琴嗎？",           "互動遊戲有免鍵盤的互動練習，但建議準備鋼琴、電鋼琴或電子琴來練習曲目，效果更好。"],
                ["這門課會教五線譜嗎？",         "本課程重點在鍵盤音名、唱名、三和弦與和弦譜閱讀，讓你快速彈出流行歌曲伴奏，不以五線譜為主。"],
                ["學完後可以彈哪些歌？",         "課程實戰練習包含《Do-Re-Mi》、《Happy Birthday》、《稻香》、《告白氣球》、《刻在我心底的名字》、《Always With Me》等 20+ 首。"],
                ["課程包和單買有什麼差別？",     "學琴全攻略（NT$3,999）一次擁有完整課程與全部互動遊戲，最超值；也可只買鋼琴自學全課程（NT$3,800），兩者皆為一次買斷、永久使用。"],
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
              <h2>現在開始，彈出你的第一首流行歌曲</h2>
              <p>從零基礎開始，透過系統化課程與互動遊戲，建立真正彈得出來的鋼琴能力。</p>
              <button className={`${styles.btnRed} ${styles.btnPulse}`} onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                立即購買課程
              </button>
            </div>
          </div>
        </RevealSection>
      </main>

      <div className={`${styles.stickyBuyBar} ${showStickyBar ? styles.stickyBuyBarShow : ""}`}>
        <div className={styles.stickyBuyInfo}>
          <span className={styles.stickyBuyPrice}>NT${offer.price.toLocaleString()}</span>
          <span className={styles.stickyBuyLabel}>學琴全攻略</span>
        </div>
        <button className={styles.stickyBuyBtn} onClick={() => startBuy(PLANS[1])} disabled={!sale.onSale} style={!sale.onSale ? { opacity: .55, cursor: "default" } : undefined}>
          <ShoppingCart size={17} />{!sale.onSale ? "即將開賣" : "立即購買"}
        </button>
      </div>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span onDoubleClick={() => { window.location.href = "/admin"; }} style={{ cursor: "default" }}><Logo white size={28} /></span>
            <div className={styles.footerSocial}>
              {[
                // url 為 null 者尚未提供連結，先不顯示（待補上 YouTube／Line 後填入）
                [Camera,        "Instagram", "https://www.instagram.com/inrec.music"],
                [PlayCircle,    "YouTube",   null],
                [MessageCircle, "Line",      null],
              ].filter(([, , url]) => url).map(([Icon, label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className={styles.socialBtn} aria-label={label}>
                  <Icon size={18} />
                </a>
              ))}
            </div>
            <p className={styles.footerCopy}>© InRecord｜流行鋼琴零基礎入門課</p>
            <div className={styles.footerLinks}>
              <a href="/privacy">隱私權政策</a>
              <a href="/terms">服務條款</a>
              <a href="/contact">聯絡我們</a>
            </div>
          </div>
        </div>
      </footer>

      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} plan={selectedPlan} email={user?.email} pricing={selectedPlan ? sale.plans[selectedPlan.plan] : undefined} onSale={sale.onSale} fanProof={fanProofMode} />
    </>
  );
}
