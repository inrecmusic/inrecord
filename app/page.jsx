"use client";
import { useState, useEffect, useRef } from "react";
import {
  Music2, Bot, Music, GraduationCap,
  Users, TrendingUp, Play, Award, Star,
  Camera, PlayCircle, MessageCircle,
  ChevronDown,
  ShoppingCart, Heart, Mic2,
  Hand, Sun, Moon, Shuffle, Headphones,
  Layers, Waves, RotateCcw,
  Zap, BarChart2, Gamepad2, Clock,
  Video, BookOpen, Check,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import Logo from "@/components/Logo";
import PreviewModal from "@/components/PreviewModal";
import BuyModal from "@/components/BuyModal";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.4, 0.25, 1] },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const POINTS = [
  {
    n: 1,
    title: "就算今天才開始  也能快速上手",
    pointSub: "從鍵盤認識到彈出第一個音，比你想像的簡單。",
    items: [
      { icon: Music2,      label: "認識鍵盤與音名",  sub: "七個基本音名，一次記住" },
      { icon: Mic2,        label: "唱名 Do-Re-Mi",   sub: "跟著旋律唱出完整音階" },
      { icon: Hand,        label: "基本坐姿與手型",  sub: "從第一課建立良好習慣" },
      { icon: BarChart2,   label: "C 大調音階練習",  sub: "右手流暢指法入門" },
    ],
  },
  {
    n: 2,
    title: "一次學會 24 個和弦  解鎖所有流行歌",
    pointSub: "掌握大三和弦與小三和弦，任何歌曲都能伴奏。",
    items: [
      { icon: Sun,       label: "12 個大三和弦",    sub: "開朗明亮的音色" },
      { icon: Moon,      label: "12 個小三和弦",    sub: "柔和憂鬱的情感" },
      { icon: Shuffle,   label: "大小和弦快速切換", sub: "豐富歌曲音樂層次" },
      { icon: Headphones,label: "和弦耳訓練習",     sub: "聽聲辨弦，立刻反應" },
    ],
  },
  {
    n: 3,
    title: "兩種伴奏技法  讓你的演奏有靈魂",
    pointSub: "Block Chord 穩定扎實，Arpeggio 流動優雅。",
    items: [
      { icon: Layers,     label: "Block Chord 全和弦", sub: "穩定扎實的節奏感" },
      { icon: Waves,      label: "分解和弦 Arpeggio",  sub: "讓音樂流動起來" },
      { icon: RotateCcw,  label: "卡農萬用進行",        sub: "解鎖流行歌背後的共同密碼" },
      { icon: Heart,      label: "左右手完美配合",      sub: "彈出有感情的完整旋律" },
    ],
  },
  {
    n: 4,
    title: "AI 互動遊戲  讓練習變成享受",
    pointSub: "不再對著樂譜發呆，邊玩邊把和弦記進腦子裡。",
    items: [
      { icon: Zap,      label: "音名快閃",       sub: "鍵盤反應速度大幅提升" },
      { icon: TrendingUp,label: "唱名階梯",      sub: "音感訓練遊戲化" },
      { icon: Gamepad2, label: "和弦俄羅斯方塊", sub: "邊玩邊記住全部和弦" },
      { icon: Clock,    label: "節奏打點師",     sub: "穩定節拍，不再搶拍落拍" },
    ],
  },
  {
    n: 5,
    title: "學完就能彈  不是遙遠的夢想",
    pointSub: "20+ 首流行曲目實戰，每一章都有成就感。",
    items: [
      { icon: Music,       label: "20+ 首流行曲目實戰", sub: "學完即能開口唱彈" },
      { icon: Video,       label: "完整錄製學習成果",   sub: "留下屬於你的第一首錄音" },
      { icon: BookOpen,    label: "看得懂和弦譜",       sub: "自學更多歌曲不求人" },
      { icon: GraduationCap,label: "扎實基礎銜接進階",  sub: "為下一階段學習鋪路" },
    ],
  },
];

const PLANS = [
  { plan: "fan1",   price: 2200, originalPrice: 3500, savings: 1300, label: "粉絲限定【1】",    discount: "6.9折", pillLabel: "粉絲專屬", ribbon: "最高折扣", desc: "提供專輯、演奏會購買憑證即可享有優惠資格", spots: 5  },
  { plan: "fan2",   price: 2400, originalPrice: 3500, savings: 1100, label: "粉絲限定【2】",    discount: "7.5折", pillLabel: "粉絲專屬",                    desc: "提供樂譜購買憑證即可享有優惠資格",         spots: 8  },
  { plan: "early1", price: 2800, originalPrice: 3500, savings:  700, label: "第一波｜早鳥【1】", discount: "8.1折", pillLabel: "早鳥方案",  dark: true,        desc: "限量名額，課程上線初期最低優惠，先訂先學", spots: 12 },
];

const MODULES = [
  { n: 1,  title: "踏上黑白鍵的第一步",            theory: "七個基本音名ABCDEFG、鍵盤布局、基本坐姿",               song: "音階單音練習",                          game: "音名快閃" },
  { n: 2,  title: "音符的語言 — 唱名與音階",        theory: "C大調音階、Do Re Mi唱名系統、指法練習",                  song: "《Do-Re-Mi》真善美插曲",               game: "唱名階梯" },
  { n: 3,  title: "和弦的基石 — 大三和弦",          theory: "大三和弦定義、C F G三個常用和弦",                        song: "《Happy Birthday to You》",            game: "和弦辨識家" },
  { n: 4,  title: "情感的色彩 — 小三和弦",          theory: "Am Em小三和弦、大小和弦情緒對比",                        song: "《稻香》周杰倫簡化版",                 game: "情緒調色盤" },
  { n: 5,  title: "12 金鑰 — 認識所有大三和弦",     theory: "升降記號Sharp Flat、全部12個大三和弦",                   song: "《學貓叫》",                           game: "和弦俄羅斯" },
  { n: 6,  title: "12 種溫柔 — 認識所有小三和弦",   theory: "大小和弦快速切換、全部12個小三和弦",                     song: "《說好不哭》周杰倫副歌",               game: "和弦變身術" },
  { n: 7,  title: "左手的魔法 — 基礎伴奏（一）",    theory: "四四拍節奏、Block Chord全和弦伴奏法",                    song: "《告白氣球》周杰倫",                   game: "節奏打點師" },
  { n: 8,  title: "讓音樂動起來 — 基礎伴奏（二）",  theory: "Arpeggio分解和弦伴奏法、音型1-5-3-5",                   song: "《刻在我心底的名字》盧廣仲",           game: "分解和弦連連看" },
  { n: 9,  title: "流行音樂的萬用公式",              theory: "卡農和弦進行C-G-Am-Em-F-C-F-G、和弦級數概念",           song: "《那些年》《情非得已》串燒",           game: "和弦神預測" },
  { n: 10, title: "你的第一場個人發表會",            theory: "複習三和弦與兩種伴奏型態",                               song: "《Always With Me》神隱少女片尾曲完整版", game: "自由創作坊" },
  { n: "a1", isAppendix: true, appendixLabel: "附錄一", title: "如何更有效率地練琴？",    desc: "分段練習、慢速練習、節拍器技巧" },
  { n: "a2", isAppendix: true, appendixLabel: "附錄二", title: "給初學者的器材選購建議", desc: "電鋼琴電子琴選購指南、App推薦" },
];


const CH = ["一","二","三","四","五","六","七","八","九","十"];


function RevealSection({ as: Tag = "section", className = "", children, ...props }) {
  return (
    <Tag className={className} {...props}>
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px 0px" }}
        transition={{ duration: 0.65, ease: [0.25, 0.4, 0.25, 1] }}
      >
        {children}
      </motion.div>
    </Tag>
  );
}

function DynamicStatItem({ icon: Icon, value, suffix, label, decimalPlaces = 0 }) {
  const isReady = value !== null && value !== undefined;
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon}><Icon size={26} strokeWidth={1.5} /></div>
      <strong>
        {isReady ? (
          <>
            <NumberTicker
              value={typeof value === "string" ? parseFloat(value) : value}
              decimalPlaces={decimalPlaces}
            />
            {suffix}
          </>
        ) : "—"}
      </strong>
      <span>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [stats, setStats] = useState(null);
  const [openModule, setOpenModule] = useState(1);
  const [openFaq, setOpenFaq] = useState(null);
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const headerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (!headerRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(data => { if (data.ok) setStats(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      const desc = params.get("error_description") || "登入發生問題，請重試";
      setAuthError(decodeURIComponent(desc.replace(/\+/g, " ")));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const DEADLINE_KEY = "inrecord_earlybird_deadline";
    const stored = localStorage.getItem(DEADLINE_KEY);
    if (!stored) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      localStorage.setItem(DEADLINE_KEY, d.toISOString());
    }
    const deadline = new Date(localStorage.getItem(DEADLINE_KEY));
    function tick() {
      const diff = Math.max(0, deadline.getTime() - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({ d, h, m, s });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function selectPlan(p) { setSelectedPlan(p); }

  function openBuy() {
    if (!selectedPlan) {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setBuyOpen(true);
  }

  function onPreviewSuccess() {
    setPreviewOpen(false);
  }

  return (
    <>
      {/* NAV */}
      <header className={styles.nav} ref={headerRef}>
        <div className={styles.container + " " + styles.navInner}>
          <a href="/" aria-label="InRecord"><Logo /></a>
          <nav className={styles.navLinks}>
            <a href="#intro">課程介紹</a>
            <a href="#curriculum">課程大綱</a>
            <a href="#instructor">講師介紹</a>
            <a href="#pricing">課程方案</a>
            <a href="#" onClick={e => { e.preventDefault(); setPreviewOpen(true); }}>課程試看</a>
          </nav>
          {user
            ? <a href="/classroom" className={`${styles.btnLogin} ${styles.navBtn}`}>進入教室</a>
            : <a href="/classroom/login" className={`${styles.btnLogin} ${styles.navBtn}`}>學員登入</a>}
          <button className={`${styles.btnRed} ${styles.navBtn}`} onClick={() => { selectPlan(PLANS[2]); setBuyOpen(true); }}>立即購買課程</button>
          <button className={styles.hamburger} onClick={() => setMenuOpen(o => !o)} aria-label="選單">
            <span className={`${styles.bar} ${menuOpen ? styles.barTop : ""}`} />
            <span className={`${styles.bar} ${menuOpen ? styles.barMid : ""}`} />
            <span className={`${styles.bar} ${menuOpen ? styles.barBot : ""}`} />
          </button>
        </div>
        <div className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}>
          {[["#intro","課程介紹"],["#curriculum","課程大綱"],["#instructor","講師介紹"],["#pricing","課程方案"]].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <a href="#" onClick={e => { e.preventDefault(); setMenuOpen(false); setPreviewOpen(true); }}>課程試看</a>
          {user
            ? <a href="/classroom" onClick={() => setMenuOpen(false)}>進入教室</a>
            : <a href="/classroom/login" onClick={() => setMenuOpen(false)}>學員登入</a>}
          <div className={styles.mobileMenuBuyWrap}>
            <button className={`${styles.btnRed} ${styles.mobileMenuBuy}`} onClick={() => { setMenuOpen(false); selectPlan(PLANS[2]); setBuyOpen(true); }}>立即購買課程</button>
          </div>
        </div>
      </header>

      {authError && (
        <div style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "10px 20px", textAlign: "center", fontSize: 14, color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span>⚠️ 登入失敗：{authError}</span>
          <a href="/login" style={{ fontWeight: 700, color: "#dc2626", textDecoration: "underline" }}>重新登入</a>
          <button onClick={() => setAuthError("")} style={{ background: "none", border: 0, cursor: "pointer", color: "#dc2626", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}

      <main id="top">
        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroWatermark} aria-hidden="true">Piano</div>
          <div className={styles.container + " " + styles.heroGrid}>
            <motion.div variants={stagger} initial="hidden" animate="visible">
              <motion.div variants={fadeUp} custom={0} className={styles.eyebrow}>流行鋼琴零基礎入門課</motion.div>
              <motion.h1 variants={fadeUp} custom={1}>從零開始彈出<br/>你喜歡的<span>流行歌曲</span></motion.h1>
              <motion.p variants={fadeUp} custom={2} className={styles.heroLead}>10 章節系統化學習，搭配 AI 互動遊戲練習，讓學鋼琴變得有趣、有效、看得見進步。</motion.p>
              <motion.div variants={fadeUp} custom={3} className={styles.heroCtas}>
                <ShimmerButton onClick={openBuy}>立即購買課程</ShimmerButton>
                <button className={styles.btnOutline} onClick={() => setPreviewOpen(true)}>
                  <Play size={16} />觀看試看影片
                </button>
              </motion.div>
              <motion.div variants={stagger} className={styles.heroFeatures}>
                {[
                  [Music2,       "零基礎可學",   "從認識鍵盤開始"],
                  [Bot,          "AI 互動遊戲",  "學習不再枯燥"],
                  [Music,        "流行曲目實戰", "學完就能彈歌"],
                  [GraduationCap,"打好扎實基礎", "銜接進階更輕鬆"],
                ].map(([Icon, title, sub]) => (
                  <motion.div key={title} variants={fadeUp} className={styles.heroFeature}>
                    <div className={styles.heroIcon}><Icon size={28} strokeWidth={1.5} /></div>
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
            <motion.aside
              className={styles.videoCard}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <ul className={styles.checkList}>
                {["10 章節完整課程","20+ 首流行歌曲實戰","AI 互動遊戲強化學習","樂譜下載","無限次觀看，隨時學習","專屬學員社群，老師答疑"].map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <img
                src="/rick-concert.jpg"
                alt="Rick Chang 演奏會"
                className={styles.heroRickPhoto}
              />
            </motion.aside>
          </div>
        </section>

        {/* STATS */}
        <section className={styles.stats}>
          <div className={styles.container}>
            <motion.div
              className={styles.statsCard}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <DynamicStatItem
                icon={Users}
                value={stats ? stats.purchases : null}
                suffix="+"
                label="學員加入學習"
              />
              <DynamicStatItem
                icon={Star}
                value={stats ? (stats.rating !== null ? Number(stats.rating) : null) : null}
                suffix=" / 5"
                label="學員平均評分"
                decimalPlaces={1}
              />
              <DynamicStatItem icon={BookOpen} value={10} suffix="" label="系統化章節" />
              <DynamicStatItem icon={Music}    value={20} suffix="+" label="流行曲目實戰" />
            </motion.div>
          </div>
        </section>

        {/* INTRO */}
        <section id="intro" className={styles.introSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead} style={{ marginBottom: "32px" }}>
              <h2>課程設計與說明</h2>
            </div>
            <div className={styles.featureGrid} style={{ marginBottom: "56px" }}>
              {[
                [Music2, "零基礎友善",   "從鍵盤、中央 C、音名開始，不跳步、不硬塞。"],
                [Bot,    "AI 互動遊戲",  "音名快閃、唱名階梯、和弦辨識家，讓練習變有趣。"],
                [Music,  "流行曲目實戰", "用熟悉歌曲練習，提升成就感與持續學習動機。"],
                [Award,  "成果導向",     "最後完成一首完整曲目，建立下一階段學習基礎。"],
              ].map(([Icon, title, desc]) => (
                <div key={title} className={styles.featureCard}>
                  <div className={styles.featureIcon}><Icon size={22} strokeWidth={1.5} /></div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
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
        </section>

        {/* POINTS */}
        <section id="points" className={styles.pointsSection}>
          <div className={styles.container}>
            {POINTS.map(pt => {
              const isEven = pt.n % 2 === 0;
              return (
                <RevealSection key={pt.n} className={`${styles.pointBlock} ${isEven ? styles.pointBlockReverse : ""}`}>
                  <div className={styles.pointVisual}>
                    <div className={styles.pointGrid}>
                      {pt.items.map(item => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className={styles.pointCard}>
                            <div className={styles.pointCardIcon}><Icon size={28} strokeWidth={1.5} /></div>
                            <strong>{item.label}</strong>
                            <span>{item.sub}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={styles.pointContent}>
                    <div className={styles.pointBadge}>POINT {pt.n}</div>
                    <h2 className={styles.pointTitle}>{pt.title}</h2>
                    {pt.pointSub && <p className={styles.pointSub}>{pt.pointSub}</p>}
                  </div>
                </RevealSection>
              );
            })}
          </div>
        </section>

        {/* CURRICULUM */}
        <section id="curriculum" className={styles.curriculum} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程大綱</small>
              <h2>10 章節 ＋ 2 附錄系統化學習<br/>從基礎到實戰，穩扎穩打</h2>
            </div>
            <div className={styles.moduleList}>
              {MODULES.map(m => {
                const isOpen = openModule === m.n;
                return (
                  <div key={m.n} className={styles.module}>
                    <button
                      className={styles.moduleSummary}
                      onClick={() => setOpenModule(isOpen ? null : m.n)}
                      aria-expanded={isOpen}
                    >
                      <div className={`${styles.num} ${m.isAppendix ? styles.numAppendix : ""}`}>
                        {m.isAppendix ? "附" : m.n}
                      </div>
                      <h3>{m.isAppendix ? `${m.appendixLabel}：${m.title}` : `第 ${CH[m.n - 1]} 章：${m.title}`}</h3>
                      <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
                        <ChevronDown size={18} strokeWidth={2} />
                      </span>
                    </button>
                    <div className={`${styles.moduleBody} ${isOpen ? styles.moduleBodyOpen : ""}`}>
                      <div className={styles.moduleDetails}>
                        {m.isAppendix ? (
                          <div className={styles.moduleDetailItem}>
                            <span className={styles.moduleDetailIcon}>📖</span>
                            <div className={styles.moduleDetailText}>
                              <strong>附{String(m.n).replace("a", "")}-1　內容說明</strong>
                              <p>{m.desc}</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className={styles.moduleDetailItem}>
                              <span className={styles.moduleDetailIcon}>📖</span>
                              <div className={styles.moduleDetailText}>
                                <strong>{m.n}-1　核心樂理</strong>
                                <p>{m.theory}</p>
                              </div>
                            </div>
                            <div className={styles.moduleDetailItem}>
                              <span className={styles.moduleDetailIcon}>🎵</span>
                              <div className={styles.moduleDetailText}>
                                <strong>{m.n}-2　實戰曲目</strong>
                                <p>{m.song}</p>
                              </div>
                            </div>
                            <div className={styles.moduleDetailItem}>
                              <span className={styles.moduleDetailIcon}>🎮</span>
                              <div className={styles.moduleDetailText}>
                                <strong>{m.n}-3　AI 互動遊戲</strong>
                                <p>{m.game}</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* INSTRUCTOR */}
        <section id="instructor" className={styles.instructorSection} data-reveal>
          <div className={styles.container + " " + styles.instructorGrid}>
            <div className={styles.instructorPhotoWrap}>
              <div className={styles.instructorPhoto} />
              <p className={styles.instructorName}>Rick Chang 張育瑞</p>
            </div>
            <div className={styles.instructorCopy}>
              <small>講師介紹</small>
              <h2>Rick Chang<br/><span>張育瑞老師</span></h2>
              <p className={styles.instructorRole}>音樂製作人・鋼琴演奏者・流行鋼琴老師</p>
              <p>美國波士頓 Berklee College of Music 音樂碩士，簽約碩樂國際娛樂（Universal Music Publishing 台灣授權公司），首張個人專輯《Fire!》登上 iTunes 流行榜冠軍。榮獲 Global Music Awards 銅獎；2024 巴黎奧運主題歌曲累計超過 200 萬次觀看；與布達佩斯交響樂團合作錄製管弦樂作品。</p>
              <ul className={styles.instructorCreds}>
                {[
                  [GraduationCap, "Berklee College of Music 音樂碩士"],
                  [Award,        "iTunes 流行榜冠軍《Fire!》・Global Music Awards 銅獎"],
                  [Mic2,         "2024 奧運主題曲 200 萬+ 觀看・布達佩斯交響樂團合作"],
                  [Music2,       "Yamaha・桃園機場・Bechstein・誠品・衛武營 演奏會"],
                  [Users,        "線上課程累積超過 300 位學員"],
                ].map(([Icon, text]) => (
                  <li key={text}>
                    <span className={styles.credIcon}><Icon size={15} strokeWidth={2} /></span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className={styles.pricingSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程方案</small>
              <h2>選擇適合你的方案</h2>
              <p>粉絲限定名額有限，把握優惠價格，開始你的流行鋼琴學習之旅。</p>
            </div>
            {/* countdown — above early1 card */}
            <div className={styles.countdownWrap}>
              距離早鳥截止&nbsp;
              <strong>{String(countdown.d).padStart(2,"0")}天</strong>&nbsp;
              <strong>{String(countdown.h).padStart(2,"0")}時</strong>&nbsp;
              <strong>{String(countdown.m).padStart(2,"0")}分</strong>&nbsp;
              <strong>{String(countdown.s).padStart(2,"0")}秒</strong>
            </div>
            <div className={styles.plansRow}>
              {PLANS.map(p => (
                <div
                  key={p.plan}
                  className={[styles.planCard, p.dark ? styles.planCardDark : "", selectedPlan?.plan === p.plan ? styles.planCardSelected : ""].join(" ")}
                  onClick={() => selectPlan(p)}
                  role="button"
                  tabIndex={0}
                >
                  {p.dark && <BorderBeam colorFrom="transparent" colorTo="#60a5fa" duration={6} borderWidth={1.5} />}
                  {p.ribbon && <div className={styles.planRibbon}>{p.ribbon}</div>}
                  <div className={`${styles.planPill} ${p.dark ? styles.planPillDark : ""}`}>
                    {p.dark && <span className={styles.planPillDot} />}
                    {p.pillLabel}
                  </div>
                  <h3 className={styles.planName}>{p.label}</h3>
                  <p className={styles.planDesc}>{p.desc}</p>
                  <div className={styles.planPriceRow}>
                    <span className={styles.planPrice}>${p.price.toLocaleString()}</span>
                    <span className={styles.planOriginal}>${p.originalPrice.toLocaleString()}</span>
                  </div>
                  <div className={`${styles.planSavings} ${p.dark ? styles.planSavingsDark : ""}`}>
                    省下 ${p.savings.toLocaleString()}
                  </div>
                  <div className={styles.planDiscountRow}>
                    <div className={styles.planDiscount}>{p.discount}</div>
                    <span className={styles.planSpots}>🔥 剩餘 {p.spots} 個名額</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.planNote}>
              ＊購買憑證不限於照片或訂單編號，只要能夠證明曾購買過皆可享有優惠。
            </div>
            <div className={styles.planBuyWrap}>
              <button className={`${styles.btnRed} ${styles.buyBtn}`} onClick={openBuy}>
                <ShoppingCart size={18} />
                {`購買 ${selectedPlan.label} — NT$${selectedPlan.price.toLocaleString()}`}
              </button>
              <p className={styles.buyNote}><Heart size={13} />無限次觀看・永久有效</p>
              <p className={styles.buySecurity}>🔒 安全付款・購買後立即開通・永久有效</p>
            </div>
          </div>
        </section>

        {/* SUBSCRIPTION */}
        <section id="subscription" className={styles.subscriptionSection}>
          <div className={styles.container}>
            <motion.div
              className={styles.sectionHead}
              style={{ marginBottom: 48 }}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <small>AI 互動遊戲</small>
              <h2>AI 互動遊戲訂閱</h2>
              <p>搭配課程影片，學習效果加倍</p>
            </motion.div>

            <div className={styles.subscriptionCards}>
              {/* Monthly card */}
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: 0.05, ease: [0.25, 0.4, 0.25, 1] }}
              >
                <Card className={styles.subCard}>
                  <CardHeader className={styles.subCardHeader}>
                    <Badge className={styles.subBadgeBlue}>彈性方案</Badge>
                    <div className={styles.subPrice}>
                      NT$399<span className={styles.subPricePer}> / 月</span>
                    </div>
                    <p className={styles.subDesc}>按月訂閱，隨時可取消</p>
                  </CardHeader>
                  <CardContent className={styles.subCardContent}>
                    <ul className={styles.subFeatureList}>
                      {["全部 10 章節 AI 互動遊戲", "新遊戲持續更新", "隨時可取消"].map(item => (
                        <li key={item}>
                          <Check size={14} className={styles.subCheckIcon} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <button className={styles.subBtn} onClick={() => { window.location.href = "/classroom/login"; }}>
                      立即訂閱
                    </button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Yearly card */}
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
              >
                <Card className={styles.subCardDark}>
                  <BorderBeam colorFrom="transparent" colorTo="#F5A623" duration={5} borderWidth={1.5} />
                  <div className={styles.subRibbon}>推薦</div>
                  <CardHeader className={styles.subCardHeader}>
                    <Badge className={styles.subBadgeGold}>推薦・最划算</Badge>
                    <div className={styles.subPriceDark}>
                      NT$1,499<span className={styles.subPricePerDark}> / 年</span>
                    </div>
                    <div className={styles.subOriginalPrice}>原價 NT$4,788（12 個月 × NT$399）</div>
                    <div className={styles.subSaving}>省下 NT$3,289，相當於免費多 8 個月</div>
                  </CardHeader>
                  <CardContent className={styles.subCardContent}>
                    <ul className={styles.subFeatureListDark}>
                      {["全部 10 章節 AI 互動遊戲", "新遊戲持續更新", "比月繳省 69%"].map(item => (
                        <li key={item}>
                          <Check size={14} className={styles.subCheckIconGold} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <button className={styles.subBtnDark} onClick={() => { window.location.href = "/classroom/login"; }}>
                      立即訂閱
                    </button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <motion.div
              className={styles.subNotes}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <p>✓ 購買課程影片自動贈送 3 個月訂閱，無需另外購買</p>
              <p>✓ 訂閱到期前 7 天寄送 Email 提醒</p>
            </motion.div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={styles.faqSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>常見問題</small>
              <h2>購買前你可能會想知道</h2>
            </div>
            <div className={styles.faq}>
              {[
                ["完全零基礎可以上嗎？",         "可以。課程從鍵盤佈局、音名、唱名與基本坐姿開始，循序漸進進入三和弦與伴奏，不需要任何音樂基礎。"],
                ["我需要準備鋼琴嗎？",           "AI 互動遊戲有免鍵盤的互動練習，但建議準備鋼琴、電鋼琴或電子琴來練習曲目，效果更好。"],
                ["這門課會教五線譜嗎？",         "本課程重點在鍵盤音名、唱名、三和弦與和弦譜閱讀，讓你快速彈出流行歌曲伴奏，不以五線譜為主。"],
                ["學完後可以彈哪些歌？",         "課程實戰練習包含《Do-Re-Mi》、《Happy Birthday》、《稻香》、《告白氣球》、《刻在我心底的名字》、《Always With Me》等 20+ 首。"],
                ["粉絲限定方案如何驗證資格？",   "購買後我們會寄送確認 Email，請提供購買專輯、音樂會或樂譜的憑證（照片或訂單截圖均可），審核通過後開通課程。"],
                ["課程有效期多久？",             "課程購買後永久有效，無觀看次數限制。只要平台持續運營，你隨時都可以回來複習。"],
                ["可以在手機或平板上看嗎？",     "可以。課程支援電腦、手機、平板等所有裝置，只要有瀏覽器和網路連線即可觀看，建議使用 Wi-Fi 環境獲得最佳播放品質。"],
                ["付款方式有哪些？",             "目前支援信用卡（Visa、Mastercard、JCB）、簽帳金融卡、ATM 轉帳及超商代碼繳費，透過 PAYUNi 金流安全處理，不儲存任何卡號資訊。"],
              ].map(([q, a]) => {
                const isOpen = openFaq === q;
                return (
                  <div key={q} className={styles.faqItem}>
                    <button
                      className={`${styles.faqSummary} ${isOpen ? styles.faqSummaryOpen : ""}`}
                      onClick={() => setOpenFaq(isOpen ? null : q)}
                    >
                      <span>{q}</span>
                      <ChevronDown size={18} strokeWidth={2} className={`${styles.faqArrow} ${isOpen ? styles.faqArrowOpen : ""}`} />
                    </button>
                    <div className={`${styles.faqContent} ${isOpen ? styles.faqContentOpen : ""}`}>
                      <p>{a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.ctaSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.cta}>
              <h2>現在開始，彈出你的第一首流行歌曲</h2>
              <p>從零基礎開始，透過系統化課程與 AI 互動遊戲，建立真正彈得出來的鋼琴能力。</p>
              <ShimmerButton onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                立即購買課程
              </ShimmerButton>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <Logo white size={28} />
            <div className={styles.footerSocial}>
              {[
                [Camera,       "Instagram"],
                [PlayCircle,   "YouTube"],
                [MessageCircle,"Line"],
              ].map(([Icon, label]) => (
                <a key={label} href="#" className={styles.socialBtn} aria-label={label}>
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

      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} onSuccess={onPreviewSuccess} />
      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} plan={selectedPlan} />
    </>
  );
}
