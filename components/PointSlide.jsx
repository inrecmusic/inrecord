"use client";

import PianoKeyboard from "./PianoKeyboard";
import ChordKeyboard from "./ChordKeyboard";
import EarTraining from "./EarTraining";
import ChordTechnique from "./ChordTechnique";
import ChordProgression from "./ChordProgression";
import StaffDuet from "./StaffDuet";
import NoteFlash from "./NoteFlash";
import SolfegeStairs from "./SolfegeStairs";
import ChordTetris from "./ChordTetris";
import RhythmTap from "./RhythmTap";
import MusicCard from "./MusicCard";
import ChordChart from "./ChordChart";
import HandsLevel from "./HandsLevel";
import styles from "./PointSlide.module.css";

/** Render the right-hand visual for a slide based on its `visual.type`. */
function SlideVisual({ visual, title }) {
  switch (visual.type) {
    case "keyboard":
      return <PianoKeyboard keys={visual.keys} ariaLabel={title} />;
    case "chords":
      return <ChordKeyboard {...visual} ariaLabel={title} />;
    case "ear":
      return <EarTraining ariaLabel={title} />;
    case "technique":
      return <ChordTechnique mode={visual.mode} ariaLabel={title} />;
    case "progression":
      return <ChordProgression ariaLabel={title} />;
    case "staff":
      return <StaffDuet ariaLabel={title} />;
    case "noteflash":
      return <NoteFlash ariaLabel={title} />;
    case "solfege":
      return <SolfegeStairs ariaLabel={title} />;
    case "tetris":
      return <ChordTetris ariaLabel={title} />;
    case "rhythm":
      return <RhythmTap ariaLabel={title} />;
    case "musiccard":
      return <MusicCard {...visual} ariaLabel={title} />;
    case "chordchart":
      return <ChordChart ariaLabel={title} />;
    case "handslevel":
      return <HandsLevel ariaLabel={title} />;
    default:
      return (
        <div className={styles.photoWrap}>
          <img
            src={visual.src}
            alt={visual.alt}
            className={styles.photo}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
      );
  }
}

/**
 * One natively-rebuilt POINT slide. Mirrors the original SVG layout —
 * left info column · divider · right visual · brand footer — but as real,
 * responsive, selectable DOM (no <img> of text). Shared by every POINT
 * carousel via the `point` prop, which drives the eyebrow and footer numbering.
 */
export default function PointSlide({ slide, index, total, point = 1 }) {
  const num = String(index + 1).padStart(2, "0");
  const pointNum = String(point).padStart(2, "0");

  return (
    <div className={styles.slide}>
      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.eyebrow}>POINT {pointNum}</div>
          <h3 className={styles.title}>{slide.title}</h3>
          <div className={styles.underline} />
          {slide.tag && <div className={styles.tag}>{slide.tag}</div>}
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
          <SlideVisual visual={slide.visual} title={slide.title} />
          <p className={styles.caption}>{slide.caption}</p>
        </div>
      </div>

      <div className={styles.footer}>
        <span>InRecord ｜ 流行鋼琴零基礎入門課</span>
        <span>Point {point} · 課程設計</span>
      </div>
    </div>
  );
}
