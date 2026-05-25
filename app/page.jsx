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
} from "lucide-react";
import Logo from "@/components/Logo";
import PreviewModal from "@/components/PreviewModal";
import BuyModal from "@/components/BuyModal";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";

const POINTS = [
  {
    n: 1,
    title: "零基礎也能輕鬆開始",
    items: [
      { icon: Music2,       label: "認識鍵盤與音名",  sub: "七個基本音名，一次記住" },
      { icon: Mic2,         label: "唱名 Do-Re-Mi",   sub: "跟著旋律唱出完整音階" },
      { icon: Hand,         label: "基本坐姿與手型",  sub: "從第一課建立良好習慣" },
      { icon: BarChart2,    label: "C 大調音階練習",  sub: "右手流暢指法入門" },
    ],
  },
  {
    n: 2,
    title: "系統掌握全部 24 個三和弦",
    items: [
      { icon: Sun,        label: "12 個大三和弦",    sub: "開朗明亮的音色" },
      { icon: Moon,       label: "12 個小三和弦",    sub: "柔和憂鬱的情感" },
      { icon: Shuffle,    label: "大小和弦快速切換", sub: "豐富歌曲音樂層次" },
      { icon: Headphones, label: "和弦耳訓練習",     sub: "聽聲辨弦，立刻反應" },
    ],
  },
  {
    n: 3,
    title: "兩種伴奏技法全面學會",
    items: [
      { icon: Layers,    label: "Block Chord 全和弦", sub: "穩定扎實的節奏感" },
      { icon: Waves,     label: "分解和弦 Arpeggio",  sub: "讓音樂流動起來" },
      { icon: RotateCcw, label: "卡農萬用進行",        sub: "解鎖流行歌背後的共同密碼" },
      { icon: Heart,     label: "左右手完美配合",      sub: "彈出有感情的完整旋律" },
    ],
  },
  {
    n: 4,
    title: "AI 互動遊戲，練習不枯燥",
    items: [
      { icon: Zap,        label: "音名快閃",       sub: "鍵盤反應速度大幅提升" },
      { icon: TrendingUp, label: "唱名階梯",       sub: "音感訓練遊戲化" },
      { icon: Gamepad2,   label: "和弦俄羅斯方塊", sub: "邊玩邊記住全部和弦" },
      { icon: Clock,      label: "節奏打點師",     sub: "穩定節拍，不再搶拍落拍" },
    ],
  },
  {
    n: 5,
    title: "學完就能彈出喜歡的歌",
    items: [
      { icon: Music,        label: "20+ 首流行曲目實戰", sub: "學完即能開口唱彈" },
      { icon: Video,        label: "完整錄製學習成果",   sub: "留下屬於你的第一首錄音" },
      { icon: BookOpen,     label: "看得懂和弦譜",       sub: "自學更多歌曲不求人" },
      { icon: GraduationCap,label: "扎實基礎銜接進階",   sub: "為下一階段學習鋪路" },
    ],
  },
];

const PLANS = [
  { plan: "fan1",   price: 2200, originalPrice: 3500, savings: 1300, label: "粉絲限定【1】",     discount: "6.9折", pillLabel: "粉絲專屬", ribbon: "最高折扣", desc: "提供專輯、演奏會購買憑證即可享有優惠資格", spots: 5,  featured: true },
  { plan: "fan2",   price: 2400, originalPrice: 3500, savings: 1100, label: "粉絲限定【2】",     discount: "7.5折", pillLabel: "粉絲專屬",                    desc: "提供樂譜購買憑證即可享有優惠資格",         spots: 8  },
  { plan: "early1", price: 2800, originalPrice: 3500, savings:  700, label: "第一波｜早鳥【1】", discount: "8.1折", pillLabel: "早鳥方案",  dark: true,        desc: "限量名額，課程上線初期最低優惠，先訂先學",  spots: 12 },
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
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - t0) / duration, 1);
          setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);
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

function StatItem({ icon: Icon, value, suffix, label }) {
  const [count, ref] = useCountUp(value ?? 0);
  return (
    <div className={styles.stat} ref={ref}>
      <div className={styles.statIcon}><Icon size={26} strokeWidth={1.5} /></div>
      <strong>{value != null ? `${count.toLocaleString()}${suffix}` : "—"}</strong>
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
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });

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
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      const desc = params.get("error_description") || "登入發生問題，請重試";
      setAuthError(decodeURIComponent(desc.replace(/\+/g, " ")));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const DEADLINE_KEY = "inrecord_earlybird_deadline";
    if (!localStorage.getItem(DEADLINE_KEY)) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      localStorage.setItem(DEADLINE_KEY, d.toISOString());
    }
    const deadline = new Date(localStorage.getItem(DEADLINE_KEY));
    function tick() {
      const diff = Math.max(0, deadline.getTime() - Date.now());
      setCountdown({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
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

  function onPreviewSuccess() { setPreviewOpen(false); }

  return (
    <>
      {/* NAV */}
      <header className={styles.nav}>
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
            ? <a href="/classroom"       className={`${styles.btnLogin} ${styles.navBtn}`}>進入教室</a>
            : <a href="/classroom/login" className={`${styles.btnLogin} ${styles.navBtn}`}>學員登入</a>}
          <button className={`${styles.btnRed} ${styles.navBtn}`} onClick={() => { selectPlan(PLANS[2]); setBuyOpen(true); }}>立即購買課程</button>
          <button className={styles.hamburger} onClick={() => setMenuOpen(o => !o)} aria-label="選單">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className={styles.mobileMenu}>
            {[["#intro","課程介紹"],["#curriculum","課程大綱"],["#instructor","講師介紹"],["#pricing","課程方案"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a href="#" onClick={e => { e.preventDefault(); setMenuOpen(false); setPreviewOpen(true); }}>課程試看</a>
            {user
              ? <a href="/classroom"       onClick={() => setMenuOpen(false)}>進入教室</a>
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
        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.container + " " + styles.heroGrid}>
            <motion.div variants={stagger} initial="hidden" animate="visible">
              <motion.div variants={fadeUp} className={styles.eyebrow}>流行鋼琴零基礎入門課</motion.div>
              <motion.h1 variants={fadeUp}>從零開始彈出<br/>你喜歡的<span>流行歌曲</span></motion.h1>
              <motion.p variants={fadeUp} className={styles.heroLead}>10 章節系統化學習，搭配 AI 互動遊戲練習，讓學鋼琴變得有趣、有效、看得見進步。</motion.p>
              <motion.div variants={fadeUp} className={styles.heroCtas}>
                <button className={`${styles.btnRed} ${styles.btnPulse}`} onClick={openBuy}>立即購買課程</button>
                <button className={styles.btnOutline} onClick={() => setPreviewOpen(true)}>
                  <Play size={16} />觀看試看影片
                </button>
              </motion.div>
              <motion.div variants={fadeUp} className={styles.heroFeatures}>
                {[
                  [Music2,        "零基礎可學",   "從認識鍵盤開始"],
                  [Bot,           "AI 互動遊戲",  "學習不再枯燥"],
                  [Music,         "流行曲目實戰", "學完就能彈歌"],
                  [GraduationCap, "打好扎實基礎", "銜接進階更輕鬆"],
                ].map(([Icon, title, sub]) => (
                  <div key={title} className={styles.heroFeature}>
                    <div className={styles.heroIcon}><Icon size={28} strokeWidth={1.5} /></div>
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>
            <motion.aside
              className={styles.videoCard}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.videoThumb} onClick={() => setPreviewOpen(true)} role="button" tabIndex={0}>
                <div className={styles.play}><Play size={22} fill="currentColor" /></div>
              </div>
              <h3>課程介紹影片</h3>
              <ul className={styles.checkList}>
                {["10 章節完整課程","20+ 首流行歌曲實戰","AI 互動遊戲強化學習","樂譜下載","無限次觀看，隨時學習","專屬學員社群，老師答疑"].map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
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
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <StatItem icon={Users}    value={stats ? stats.purchases : null}                               suffix="+" label="學員加入學習" />
              <StatItem icon={Star}     value={stats && stats.rating != null ? Number(stats.rating) : null}  suffix=" / 5" label="學員平均評分" />
              <StatItem icon={BookOpen} value={10}  suffix=""  label="系統化章節" />
              <StatItem icon={Music}    value={20}  suffix="+" label="流行曲目實戰" />
            </motion.div>
          </div>
        </section>

        {/* INTRO */}
        <RevealSection id="intro" className={styles.introSection}>
          <div className={styles.container}>
            <div className={styles.sectionHead} style={{ marginBottom: "32px" }}>
              <h2>課程設計與說明</h2>
            </div>
            <motion.div
              className={styles.featureGrid}
              style={{ marginBottom: "56px" }}
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
            >
              {[
                [Music2, "零基礎友善",   "從鍵盤、中央 C、音名開始，不跳步、不硬塞。"],
                [Bot,    "AI 互動遊戲",  "音名快閃、唱名階梯、和弦辨識家，讓練習變有趣。"],
                [Music,  "流行曲目實戰", "用熟悉歌曲練習，提升成就感與持續學習動機。"],
                [Award,  "成果導向",     "最後完成一首完整曲目，建立下一階段學習基礎。"],
              ].map(([Icon, title, desc]) => (
                <motion.div key={title} className={styles.featureCard} variants={fadeUp}>
                  <div className={styles.featureIcon}><Icon size={22} strokeWidth={1.5} /></div>
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
                <motion.div
                  className={styles.pointGrid}
                  variants={stagger}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-40px" }}
                >
                  {pt.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <motion.div key={item.label} className={styles.pointCard} variants={fadeUp}>
                        <div className={styles.pointCardIcon}><Icon size={28} strokeWidth={1.5} /></div>
                        <strong>{item.label}</strong>
                        <span>{item.sub}</span>
                      </motion.div>
                    );
                  })}
                </motion.div>
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
                          <div className={styles.meta}><Bot size={14} className={styles.metaIcon} />AI 遊戲：{m.game}</div>
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
              <p>美國波士頓 Berklee College of Music 音樂碩士，簽約碩樂國際娛樂（Universal Music Publishing 台灣授權公司），首張個人專輯《Fire!》登上 iTunes 流行榜冠軍。榮獲 Global Music Awards 銅獎；2024 巴黎奧運主題歌曲累計超過 200 萬次觀看；與布達佩斯交響樂團合作錄製管弦樂作品。</p>
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
              <h2>立即搶佔限量名額</h2>
              <p>三種方案，名額有限。一次購買，永久擁有課程，無限次重複觀看。</p>
            </div>
            <div className={styles.countdownWrap}>
              距離早鳥截止&nbsp;
              <strong>{String(countdown.d).padStart(2,"0")}天</strong>&nbsp;
              <strong>{String(countdown.h).padStart(2,"0")}時</strong>&nbsp;
              <strong>{String(countdown.m).padStart(2,"0")}分</strong>&nbsp;
              <strong>{String(countdown.s).padStart(2,"0")}秒</strong>
            </div>
            <motion.div
              className={styles.plansRow}
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
            >
              {PLANS.map(p => (
                <motion.div
                  key={p.plan}
                  className={[styles.planCard, p.dark ? styles.planCardDark : "", p.featured ? styles.planCardFeatured : "", selectedPlan?.plan === p.plan ? styles.planCardSelected : ""].join(" ")}
                  onClick={() => selectPlan(p)}
                  role="button"
                  tabIndex={0}
                  variants={fadeUp}
                >
                  {p.ribbon && <div className={styles.planRibbon}>{p.ribbon}</div>}
                  <div className={styles.planHeaderRow}>
                    <div className={`${styles.planPill} ${p.dark ? styles.planPillDark : ""}`}>
                      {p.dark && <span className={styles.planPillDot} />}
                      {p.pillLabel}
                    </div>
                    <div className={`${styles.planDiscountTag} ${p.dark ? styles.planDiscountTagDark : ""}`}>{p.discount}</div>
                  </div>
                  <h3 className={styles.planName}>{p.label}</h3>
                  <div className={styles.planPriceBlock}>
                    <span className={styles.planPrice}>${p.price.toLocaleString()}</span>
                    <div className={styles.planPriceOriginalRow}>
                      <span className={styles.planOriginal}>原價 ${p.originalPrice.toLocaleString()}</span>
                      <span className={`${styles.planSavingsTag} ${p.dark ? styles.planSavingsTagDark : ""}`}>省 ${p.savings.toLocaleString()}</span>
                    </div>
                  </div>
                  <p className={styles.planDesc}>{p.desc}</p>
                  <div className={`${styles.planSpotsRow} ${p.dark ? styles.planSpotsRowDark : ""}`}>
                    <span className={styles.planSpots}>🔥 僅剩 {p.spots} 個名額</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
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
                ["我需要準備鋼琴嗎？",           "AI 互動遊戲有免鍵盤的互動練習，但建議準備鋼琴、電鋼琴或電子琴來練習曲目，效果更好。"],
                ["這門課會教五線譜嗎？",         "本課程重點在鍵盤音名、唱名、三和弦與和弦譜閱讀，讓你快速彈出流行歌曲伴奏，不以五線譜為主。"],
                ["學完後可以彈哪些歌？",         "課程實戰練習包含《Do-Re-Mi》、《Happy Birthday》、《稻香》、《告白氣球》、《刻在我心底的名字》、《Always With Me》等 20+ 首。"],
                ["粉絲限定方案如何驗證資格？",   "購買後我們會寄送確認 Email，請提供購買專輯、音樂會或樂譜的憑證（照片或訂單截圖均可），審核通過後開通課程。"],
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
              <p>從零基礎開始，透過系統化課程與 AI 互動遊戲，建立真正彈得出來的鋼琴能力。</p>
              <button className={`${styles.btnRed} ${styles.btnPulse}`} onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                立即購買課程
              </button>
            </div>
          </div>
        </RevealSection>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <Logo white size={28} />
            <div className={styles.footerSocial}>
              {[
                [Camera,        "Instagram"],
                [PlayCircle,    "YouTube"],
                [MessageCircle, "Line"],
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
