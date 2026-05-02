"use client";
import styles from "./Logo.module.css";

export default function Logo({ size = 26, white = false }) {
  return (
    <span className={`${styles.wordmark} ${white ? styles.white : ""}`} style={{ fontSize: size }}>
      <span>InRec</span>
      <svg className={styles.record} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <circle cx="12" cy="12" r="4.6" fill="#ff2028">
          <animate attributeName="r" values="4.1;5;4.1" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.75;1;0.75" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span>rd</span>
    </span>
  );
}
