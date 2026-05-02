"use client";
import { useState, useEffect, useRef } from "react";
import {
  Music2, Bot, Music, GraduationCap,
  Users, TrendingUp, Play, Award,
  Camera, PlayCircle, MessageCircle,
  Menu, X, Check, ChevronDown,
  ShoppingCart, Heart, Mic2,
} from "lucide-react";
import Logo from "@/components/Logo";
import PreviewModal from "@/components/PreviewModal";
import BuyModal from "@/components/BuyModal";
import styles from "./page.module.css";

const PLANS = [
  { plan: "fan1",   price: 2200, label: "粉絲限定【1】", discount: "6.9 折", desc: "有購買專輯、音樂會資格", featured: true },
  { plan: "fan2",   price: 2400, label: "粉絲限定【2】", discount: "7.5 折", desc: "有購買樂譜資格",         featured: true },
  { plan: "early1", price: 2800, label: "第一波｜早鳥【1】", discount: "8.1 折" },
];

const MODULES = [
  { n: 1,  title: "踏上黑白鍵的第一步",     desc: "認識鍵盤布局、中央 C 位置、基本坐姿與手型，認識七個基本音名。",         song: "音階單音練習",       game: "音名快閃",       img: "photo-1520523839897-bd0b52f945a0" },
  { n: 2,  title: "音符的語言－唱名與音階",  desc: "學習 Do Re Mi Fa Sol La Si 唱名系統與 C 大調音階。",                 song: "Do-Re-Mi",           game: "唱名階梯",       img: "photo-1507838153414-b4b713384a76" },
  { n: 3,  title: "和弦的基石－大三和弦",    desc: "理解根音＋大三度＋純五度，掌握 C、F、G 三個常用大三和弦。",           song: "Happy Birthday",     game: "和弦辨識家",     img: "photo-1520523839897-bd0b52f945a0" },
  { n: 4,  title: "情感的色彩－小三和弦",    desc: "認識小三和弦的憂鬱、溫柔聽感，練習 Am、Em 常用小三和弦。",           song: "稻香",               game: "情緒調色盤",     img: "photo-1514119412350-e174d90d280e" },
  { n: 5,  title: "12 金鑰－所有大三和弦",   desc: "透過規律與口訣，系統性學習全部 12 個大三和弦。",                     song: "學貓叫",             game: "和弦俄羅斯",     img: "photo-1552422535-c45813c61732"   },
  { n: 6,  title: "12 種溫柔－所有小三和弦", desc: "系統性學習全部 12 個小三和弦，並與大三和弦對比練習。",               song: "說好不哭",           game: "和弦變身術",     img: "photo-1520523839897-bd0b52f945a0" },
  { n: 7,  title: "左手的魔法－基礎伴奏（一）", desc: "學習全和弦 Block Chord 伴奏法與四四拍穩定伴奏。",                song: "告白氣球",           game: "節奏打點師",     img: "photo-1514119412350-e174d90d280e" },
  { n: 8,  title: "讓音樂動起來－基礎伴奏（二）", desc: "學習分解和弦 Arpeggio 伴奏法，讓音樂更具流動感。",             song: "刻在我心底的名字",   game: "分解和弦連連看", img: "photo-1507838153414-b4b713384a76" },
  { n: 9,  title: "流行音樂的萬用公式",      desc: "介紹經典卡農和弦進行 C-G-Am-Em-F-C-F-G。",                         song: "那些年、情非得已",   game: "和弦神預測",     img: "photo-1552422535-c45813c61732"   },
  { n: 10, title: "你的第一場個人發表會",    desc: "綜合運用所學，完整彈奏一首流行歌曲。",                               song: "Always With Me",     game: "自由創作坊",     img: "photo-1514119412350-e174d90d280e" },
];

const STATS = [
  { icon: Users,       value: 500,  suffix: "+", label: "學員加入學習" },
  { icon: TrendingUp,  value: 98,   suffix: "%", label: "學員滿意度"   },
  { icon: Play,        value: 40,   suffix: "+", label: "課程影片總數" },
  { icon: Award,       value: 300,  suffix: "+", label: "學員完成課程" },
];

const CH = ["一","二","三","四","五","六","七","八","九","十"];

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

function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function RevealSection({ as: Tag = "section", className = "", ...props }) {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`${className} ${styles.reveal} ${visible ? styles.revealed : ""}`}
      {...props}
    />
  );
}

function StatItem({ icon: Icon, value, suffix, label }) {
  const [count, ref] = useCountUp(value);
  return (
    <div className={styles.stat} ref={ref}>
      <div className={styles.statIcon}><Icon size={26} strokeWidth={1.5} /></div>
      <strong>{count.toLocaleString()}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [demoActive, setDemoActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const [timerDone, setTimerDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef(null);

  function selectPlan(p) { setSelectedPlan(p); }

  function openBuy() {
    if (!selectedPlan) {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setBuyOpen(true);
  }

  function onPreviewSuccess() {
    setDemoActive(true);
    setTimeLeft(180);
    setTimerDone(false);
    setTimeout(() => document.getElementById("courseDemo")?.scrollIntoView({ behavior: "smooth" }), 200);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setTimerDone(true); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");

  return (
    <>
      {/* NAV */}
      <header className={styles.nav}>
        <div className={styles.container + " " + styles.navInner}>
          <a href="/admin" aria-label="InRecord"><Logo /></a>
          <nav className={styles.navLinks}>
            <a href="#intro">課程介紹</a>
            <a href="#curriculum">課程大綱</a>
            <a href="#instructor">講師介紹</a>
            <a href="#features">課程特色</a>
            <a href="#pricing">課程方案</a>
            <a href="#" onClick={e => { e.preventDefault(); setPreviewOpen(true); }}>課程試看</a>
          </nav>
          <button className={`${styles.btnRed} ${styles.navBtn}`} onClick={openBuy}>立即購買課程</button>
          <button className={styles.hamburger} onClick={() => setMenuOpen(o => !o)} aria-label="選單">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className={styles.mobileMenu}>
            {[["#intro","課程介紹"],["#curriculum","課程大綱"],["#instructor","講師介紹"],["#features","課程特色"],["#pricing","課程方案"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a href="#" onClick={e => { e.preventDefault(); setMenuOpen(false); setPreviewOpen(true); }}>課程試看</a>
          </div>
        )}
      </header>

      <main id="top">
        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.container + " " + styles.heroGrid}>
            <div>
              <div className={styles.eyebrow}>流行鋼琴零基礎入門課</div>
              <h1>從零開始彈出<br/>你喜歡的<span>流行歌曲</span></h1>
              <p className={styles.heroLead}>10 章節系統化學習，搭配 AI 互動遊戲練習，讓學鋼琴變得有趣、有效、看得見進步。</p>
              <div className={styles.heroCtas}>
                <button className={`${styles.btnRed} ${styles.btnPulse}`} onClick={openBuy}>立即購買課程</button>
                <button className={styles.btnOutline} onClick={() => setPreviewOpen(true)}>
                  <Play size={16} />觀看試看影片
                </button>
              </div>
              <div className={styles.heroFeatures}>
                {[
                  [Music2,       "零基礎可學",   "從認識鍵盤開始"],
                  [Bot,          "AI 互動遊戲",  "學習不再枯燥"],
                  [Music,        "流行曲目實戰", "學完就能彈歌"],
                  [GraduationCap,"打好扎實基礎", "銜接進階更輕鬆"],
                ].map(([Icon, title, sub]) => (
                  <div key={title} className={styles.heroFeature}>
                    <div className={styles.heroIcon}><Icon size={28} strokeWidth={1.5} /></div>
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </div>
                ))}
              </div>
            </div>
            <aside className={styles.videoCard}>
              <div className={styles.videoThumb} onClick={() => setPreviewOpen(true)} role="button" tabIndex={0}>
                <div className={styles.play}><Play size={22} fill="currentColor" /></div>
              </div>
              <h3>課程介紹影片</h3>
              <ul className={styles.checkList}>
                {["10 章節完整課程","20+ 首流行歌曲實戰","AI 互動遊戲強化學習","樂譜下載","無限次觀看，隨時學習","專屬學員社群，老師答疑"].map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        {/* STATS */}
        <section className={styles.stats}>
          <div className={styles.container}>
            <div className={styles.statsCard}>
              {STATS.map(s => <StatItem key={s.label} {...s} />)}
            </div>
          </div>
        </section>

        {/* INTRO */}
        <section id="intro" className={styles.introSection} data-reveal>
          <div className={styles.container + " " + styles.introGrid}>
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
        </section>

        {/* CURRICULUM */}
        <section id="curriculum" className={styles.curriculum} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程大綱</small>
              <h2>10 章節系統化學習<br/>從基礎到實戰，穩扎穩打</h2>
            </div>
            <div className={styles.moduleList}>
              {MODULES.map(m => (
                <details key={m.n} className={styles.module}>
                  <summary className={styles.moduleSummary}>
                    <div className={styles.num}>{m.n}</div>
                    <h3>第 {CH[m.n - 1]} 章：{m.title}</h3>
                    <span className={styles.chevron}><ChevronDown size={18} strokeWidth={2} /></span>
                  </summary>
                  <div className={styles.moduleBody}>
                    <div className={styles.moduleImg} style={{ backgroundImage: `url(https://images.unsplash.com/${m.img}?auto=format&fit=crop&w=500&q=80)` }} />
                    <div>
                      <p>{m.desc}</p>
                      <div className={styles.moduleMetaRow}>
                        <div className={styles.meta}><Music size={14} className={styles.metaIcon} />實戰曲目：{m.song}</div>
                        <div className={styles.meta}><Bot size={14} className={styles.metaIcon} />AI 遊戲：{m.game}</div>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* INSTRUCTOR */}
        <section id="instructor" className={styles.instructorSection} data-reveal>
          <div className={styles.container + " " + styles.instructorGrid}>
            <div className={styles.instructorPhoto} />
            <div className={styles.instructorCopy}>
              <small>講師介紹</small>
              <h2>Rick Chang<br/><span>張育瑞老師</span></h2>
              <p className={styles.instructorRole}>音樂製作人・流行鋼琴老師</p>
              <p>從小接受古典鋼琴訓練，後轉型為流行音樂製作人，擁有超過 10 年的鋼琴教學經驗。相信每一位零基礎學員，只要找到對的方法，都能彈出自己喜歡的歌曲。</p>
              <ul className={styles.instructorCreds}>
                {[
                  [Mic2,        "10 年以上鋼琴教學經驗"],
                  [Music2,      "流行音樂專輯製作人"],
                  [Users,       "線上課程累積超過 500 位學員"],
                  [GraduationCap,"擅長系統化拆解流行音樂元素"],
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

        {/* FEATURES */}
        <section id="features" className={styles.featuresSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>課程特色</small>
              <h2>為零基礎學員設計的學習體驗</h2>
              <p>從音名、唱名、和弦到伴奏，每一步都搭配實戰曲目與互動練習。</p>
            </div>
            <div className={styles.featureGrid}>
              {[
                [Music2,       "零基礎友善",   "從鍵盤、中央 C、音名開始，不跳步、不硬塞。"],
                [Bot,          "AI 互動遊戲",  "音名快閃、唱名階梯、和弦辨識家，讓練習變有趣。"],
                [Music,        "流行曲目實戰", "用熟悉歌曲練習，提升成就感與持續學習動機。"],
                [Award,        "成果導向",     "最後完成一首完整曲目，建立下一階段學習基礎。"],
              ].map(([Icon, title, desc]) => (
                <div key={title} className={styles.featureCard}>
                  <div className={styles.featureIcon}><Icon size={22} strokeWidth={1.5} /></div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className={styles.pricingSection} data-reveal>
          <div className={styles.container + " " + styles.pricingGrid}>
            <div className={styles.pricingCopy}>
              <small>課程方案</small>
              <h2>選擇適合你的方案</h2>
              <p>粉絲限定名額有限，把握優惠價格，開始你的流行鋼琴學習之旅。</p>
            </div>
            <aside className={styles.pricePanel}>
              <div className={styles.plansGrid}>
                <div className={styles.planCol}>
                  <div className={styles.planColLabel}>粉絲限定</div>
                  {PLANS.filter(p => p.featured).map(p => (
                    <div
                      key={p.plan}
                      className={`${styles.priceRow} ${styles.featured} ${selectedPlan?.plan === p.plan ? styles.selected : ""}`}
                      onClick={() => selectPlan(p)}
                      role="button" tabIndex={0}
                    >
                      <div>
                        <strong>{p.label}</strong>
                        <span className={styles.fanBadge}>粉絲專屬</span>
                        {p.desc && <><br /><small>{p.desc}</small></>}
                      </div>
                      <div className={styles.discount}>{p.discount}</div>
                      <div className={styles.amount}>
                        {selectedPlan?.plan === p.plan
                          ? <span className={styles.priceRowCheck}><Check size={18} strokeWidth={2.5} /></span>
                          : `$${p.price.toLocaleString()}`}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.planCol}>
                  <div className={styles.planColLabel}>早鳥方案</div>
                  {PLANS.filter(p => !p.featured).map(p => (
                    <div
                      key={p.plan}
                      className={`${styles.priceRow} ${selectedPlan?.plan === p.plan ? styles.selected : ""}`}
                      onClick={() => selectPlan(p)}
                      role="button" tabIndex={0}
                    >
                      <div><strong>{p.label}</strong></div>
                      <div className={styles.discount}>{p.discount}</div>
                      <div className={styles.amount}>
                        {selectedPlan?.plan === p.plan
                          ? <span className={styles.priceRowCheck}><Check size={18} strokeWidth={2.5} /></span>
                          : `$${p.price.toLocaleString()}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className={`${styles.btnRed} ${styles.buyBtn}`} onClick={openBuy} disabled={!selectedPlan}>
                <ShoppingCart size={18} />
                {selectedPlan ? `購買 ${selectedPlan.label} — NT$${selectedPlan.price.toLocaleString()}` : "請先選擇方案"}
              </button>
              {!selectedPlan && <p className={styles.selectHint}>點選上方方案即可購買</p>}
              <p className={styles.buyNote}><Heart size={13} />無限次觀看・永久有效</p>
            </aside>
          </div>
        </section>

        {/* DEMO SECTION */}
        {demoActive && (
          <section id="courseDemo" className={styles.demoSection}>
            <div className={styles.container}>
              <div className={styles.demoCard}>
                <div className={styles.demoVideo}>
                  <div className={styles.demoPlay}><Play size={30} fill="currentColor" /></div>
                  <h2>第一章試看：踏上黑白鍵的第一步</h2>
                  <p>認識鍵盤佈局、中央 C、音名 ABCDEFG，建立你的第一個鋼琴地圖。</p>
                </div>
                <div className={styles.demoSide}>
                  <div className={styles.demoTimer}>
                    {timerDone ? "Demo 試看已結束｜請加入完整課程" : `Demo 試看已開啟｜${mins}:${secs}`}
                  </div>
                  <h2>試看後，開始完整學習</h2>
                  <p>完整課程包含 10 章節、流行曲目實戰、AI 互動遊戲，以及 12 個大三和弦與 12 個小三和弦練習。</p>
                  <button className={styles.btnRed} onClick={openBuy}>查看課程方案</button>
                  {timerDone && (
                    <div className={styles.demoConversion}>
                      <strong>Demo 試看時間已到</strong>
                      <p>如果你想繼續完整學習，可以直接加入課程。</p>
                      <button className={styles.btnRed} style={{ width: "100%", marginTop: 10 }} onClick={openBuy}>立即購買課程</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="faq" className={styles.faqSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <small>常見問題</small>
              <h2>購買前你可能會想知道</h2>
            </div>
            <div className={styles.faq}>
              {[
                ["完全零基礎可以上嗎？",         "可以。課程從鍵盤佈局、音名、唱名與基本坐姿開始，循序漸進進入三和弦與伴奏。"],
                ["我需要準備鋼琴嗎？",           "AI 互動遊戲有免鍵盤練習，但建議準備鋼琴、電鋼琴或電子琴練習曲目。"],
                ["這門課會教五線譜嗎？",         "本課程重點在鍵盤音名、唱名、三和弦與和弦譜閱讀，先讓初學者能彈出流行歌曲伴奏。"],
                ["學完後可以彈哪些歌？",         "課程練習 Do-Re-Mi、Happy Birthday、稻香、告白氣球、刻在我心底的名字、Always With Me 等歌曲。"],
                ["粉絲限定方案如何驗證資格？",   "購買後我們會寄送確認 Email，請提供購買專輯、音樂會或樂譜的憑證，審核通過後開通課程。"],
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
        </section>

        {/* CTA */}
        <section className={styles.ctaSection} data-reveal>
          <div className={styles.container}>
            <div className={styles.cta}>
              <h2>現在開始，彈出你的第一首流行歌曲</h2>
              <p>從零基礎開始，透過系統化課程與 AI 互動遊戲，建立真正彈得出來的鋼琴能力。</p>
              <button className={`${styles.btnRed} ${styles.btnPulse}`} onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                立即購買課程
              </button>
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
                [Camera,       "Instagram", "https://instagram.com"],
                [PlayCircle,   "YouTube",   "https://youtube.com"],
                [MessageCircle,"Line",      "https://line.me"],
              ].map(([Icon, label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={styles.socialBtn} aria-label={label}>
                  <Icon size={18} />
                </a>
              ))}
            </div>
            <p className={styles.footerCopy}>© InRecord｜流行鋼琴零基礎入門課</p>
            <div className={styles.footerLinks}>
              <a href="#">隱私權政策</a>
              <a href="#">服務條款</a>
              <a href="#">聯絡我們</a>
            </div>
          </div>
        </div>
      </footer>

      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} onSuccess={onPreviewSuccess} />
      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} plan={selectedPlan} />
    </>
  );
}
