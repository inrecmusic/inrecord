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
 * One natively-rebuilt POINT slide: left info column · divider · right visual,
 * as real, responsive, selectable DOM (no <img> of text). The POINT number is
 * shown once by the section header above the carousel, so the slide itself
 * carries no eyebrow/footer — only a big, faint decorative numeral behind the
 * title. Position within the set is shown by the carousel dots.
 */
export default function PointSlide({ slide, index }) {
  const num = String(index + 1).padStart(2, "0");

  return (
    <div className={styles.slide}>
      <div className={styles.body}>
        <div className={styles.info}>
          <span className={styles.ghostNum} aria-hidden="true">{num}</span>
          <h3 className={styles.title}>{slide.title}</h3>
          <div className={styles.underline} />
          {slide.tag && <div className={styles.tag}>{slide.tag}</div>}
          <p className={styles.sub}>
            {slide.sub.map((line, i) => (
              <span key={i}>{line}<br /></span>
            ))}
          </p>
        </div>

        <div className={styles.divider} />

        <div className={styles.visual}>
          {slide.topLabel && <div className={styles.topLabel}>{slide.topLabel}</div>}
          <SlideVisual visual={slide.visual} title={slide.title} />
          <p className={styles.caption}>{slide.caption}</p>
        </div>
      </div>
    </div>
  );
}
