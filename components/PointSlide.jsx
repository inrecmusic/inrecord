"use client";

import PianoKeyboard from "./PianoKeyboard";
import styles from "./PointSlide.module.css";

/**
 * One natively-rebuilt POINT 1 slide. Mirrors the original SVG layout —
 * left info column · divider · right visual · brand footer — but as real,
 * responsive, selectable DOM (no <img> of text).
 */
export default function PointSlide({ slide, index, total }) {
  const num = String(index + 1).padStart(2, "0");

  return (
    <div className={styles.slide}>
      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.eyebrow}>POINT 01</div>
          <h3 className={styles.title}>{slide.title}</h3>
          <div className={styles.underline} />
          <p className={styles.sub}>
            {slide.sub.map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </p>
          <div className={styles.progress}>
            <div className={styles.progNum}>
              <span className={styles.progNumActive}>{num}</span>
              <span> / {String(total).padStart(2, "0")}</span>
            </div>
            <div className={styles.bars}>
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`${styles.bar} ${i === index ? styles.barActive : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.visual}>
          {slide.topLabel && <div className={styles.topLabel}>{slide.topLabel}</div>}

          {slide.visual.type === "keyboard" ? (
            <PianoKeyboard keys={slide.visual.keys} ariaLabel={slide.title} />
          ) : (
            <div className={styles.photoWrap}>
              <img
                src={slide.visual.src}
                alt={slide.visual.alt}
                className={styles.photo}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </div>
          )}

          <p className={styles.caption}>{slide.caption}</p>
        </div>
      </div>

      <div className={styles.footer}>
        <span>InRecord ｜ 流行鋼琴零基礎入門課</span>
        <span>Point 1 · 課程設計</span>
      </div>
    </div>
  );
}
