"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";

export default function PortalPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("courses");
  const [filter, setFilter]   = useState("all");
  const router = useRouter();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setSession(session); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login"); else setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading || !session) return (
    <div className={styles.loadingPage}><div className={styles.spinner} /></div>
  );

  const email   = session.user.email ?? "";
  const name    = email.split("@")[0];
  const initial = name[0]?.toUpperCase() ?? "U";

  async function logout() {
    await supabase?.auth.signOut();
    router.push("/");
  }

  return (
    <div className={styles.page}>
      {/* ── Left sidebar ─────────────────── */}
      <aside className={styles.sidebar}>
        <a href="/" className={styles.sidebarLogo}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#2563eb" strokeWidth="2.5"/>
            <circle cx="12" cy="12" r="4"  fill="#ff2028"/>
          </svg>
          <span>InRecord</span>
        </a>

        <div className={styles.profile}>
          <div className={styles.avatar}>{initial}</div>
          <p className={styles.profileName}>{name}</p>
          <p className={styles.profileEmail}>{email}</p>
          <span className={styles.badge}>已驗證</span>
        </div>

        <nav className={styles.nav}>
          <a href="/portal" className={`${styles.navItem} ${styles.navActive}`}>
            <NavIcon d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            我的學習
          </a>
          <a href="#" className={styles.navItem}>
            <NavIcon d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            我的收藏
          </a>
          <a href="#" className={styles.navItem}>
            <NavIcon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />
            我的優惠
          </a>
          <a href="#" className={styles.navItem}>
            <NavIcon d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
            訂單紀錄
          </a>
          <a href="#" className={styles.navItem}>
            <NavIcon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            會員資料
          </a>
        </nav>

        <button className={styles.logoutBtn} onClick={logout}>
          <NavIcon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
          登出
        </button>
      </aside>

      {/* ── Main content ─────────────────── */}
      <main className={styles.main}>
        {/* Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "courses" ? styles.tabActive : ""}`} onClick={() => setTab("courses")}>課程</button>
          <button className={`${styles.tab} ${tab === "orders"  ? styles.tabActive : ""}`} onClick={() => setTab("orders")}>訂閱</button>
        </div>

        {tab === "courses" && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                {[["all","所有課程"],["active","已開課"],["upcoming","尚未開課"]].map(([v,l]) => (
                  <button key={v} className={`${styles.filter} ${filter === v ? styles.filterOn : ""}`} onClick={() => setFilter(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.card} onClick={() => router.push("/classroom")} role="button" tabIndex={0}>
                <div className={styles.cardThumb}>
                  <img
                    src="https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=600&q=80"
                    alt="零基礎流行鋼琴入門課"
                  />
                  <div className={styles.cardHover}>
                    <div className={styles.cardPlayBtn}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.cardInstructor}>Rick Chang 張育瑞老師</p>
                  <h3 className={styles.cardTitle}>零基礎流行鋼琴入門課</h3>
                  <div className={styles.progressRow}>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: "0%" }} />
                    </div>
                    <span className={styles.progressLabel}>上課進度 <strong>0%</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "orders" && (
          <p className={styles.empty}>目前沒有訂閱項目。</p>
        )}
      </main>
    </div>
  );
}

function NavIcon({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
