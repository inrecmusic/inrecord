// components/ReviewMarquee.jsx — 首頁 hero 正下方的「課程評價」跑馬燈（純展示，資料由 page.jsx 伺服端帶入）。
// 卡片無文字就留空白（星星＋暱稱＋日期），不補字。cards 不足 3 張整段不渲染。
import styles from "./ReviewMarquee.module.css";
import { shouldShowMarquee, fillLoop } from "@/lib/featured-reviews";

const STAR = "★";
const Stars = ({ score, className }) => (
  <span className={className} aria-label={`${score} 顆星`} role="img">{STAR.repeat(Math.max(0, Math.min(5, Math.round(score))))}</span>
);

// dup：補圈多出來的重複卡（fillLoop 超過原始張數的部分）——視覺上補滿循環，但對輔助科技隱藏、
// reduced-motion 時由 CSS 整張不顯示，讓螢幕閱讀器與不跑動畫的人只看到一份。
function Card({ c, dup = false }) {
  return (
    <article className={styles.card} data-testid="review-card" data-has-text={c.text ? "true" : "false"}
      {...(dup ? { "data-dup": "true", "aria-hidden": "true" } : {})}>
      <Stars score={c.score} className={styles.cardStars} />
      {c.text && <p className={styles.text}>{c.text}</p>}
      <div className={styles.meta}><b>{c.name}</b> · {c.date}</div>
    </article>
  );
}

export default function ReviewMarquee({ cards = [], rating = null, ratingCount = 0 }) {
  if (!shouldShowMarquee(cards)) return null;
  const loop = fillLoop(cards);
  const showRating = rating != null && Number.isFinite(Number(rating)) && ratingCount >= 3;
  // 每張約 4 秒；兩份 track 平移 -50% 就是一輪
  const duration = `${Math.max(24, loop.length * 4)}s`;

  return (
    <section id="reviews" className={styles.section} aria-label="課程評價">
      <div className={styles.head}>
        <h2 className={styles.title}>課程評價</h2>
        {showRating && (
          <>
            <span className={styles.avg}>{Number(rating).toFixed(1)}</span>
            <Stars score={rating} className={styles.stars} />
            <span className={styles.count}>{ratingCount} 則學員評價</span>
          </>
        )}
        <span className={styles.hint}>滑鼠移上暫停</span>
      </div>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ "--marquee-duration": duration }}>
          {loop.map((c, i) => <Card key={`a-${c.id}-${i}`} c={c} dup={i >= cards.length} />)}
          {/* 第二份只為無縫循環，對輔助科技隱藏；reduced-motion 時 CSS 直接 display:none */}
          <div className={styles.clone} data-track="clone" aria-hidden="true">
            {loop.map((c, i) => <Card key={`b-${c.id}-${i}`} c={c} dup />)}
          </div>
        </div>
      </div>
      <p className={styles.foot}>評價皆由已購課學員在教室內留下，未經改寫。</p>
    </section>
  );
}
