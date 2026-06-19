import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { isClassroomOpen } from "@/lib/sale";

let _saleCache = { value: null, at: 0 };
async function readSaleSettingsCached() {
  if (Date.now() - _saleCache.at < 60_000 && _saleCache.value !== null) return _saleCache.value;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(
      `${url}/rest/v1/sale_settings?id=eq.default&select=open_at,lock_override`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
    );
    const rows = await res.json();
    _saleCache = { value: Array.isArray(rows) ? (rows[0] || null) : null, at: Date.now() };
  } catch {
    // 刷新失敗：沿用舊值；無舊值則維持 null（→ 鎖站，與「未設開課日」一致）
  }
  return _saleCache.value;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 預售鎖站：依 sale_settings.open_at / lock_override 自動切換。
  // 快取 60 秒（module-scope），用 anon REST 讀取（public SELECT policy）。
  const settings = await readSaleSettingsCached();
  const presaleMode = !isClassroomOpen(settings, new Date());
  if (presaleMode) {
    const isClassroomLogin =
      pathname === "/classroom/login" || pathname.startsWith("/classroom/login/");
    const isLockedClassroom =
      pathname.startsWith("/classroom") && !isClassroomLogin;

    if (isLockedClassroom) {
      // 管理員後門：帶 ?preview=<密鑰> 或已有對應 cookie 者放行。
      // 密鑰存於非公開環境變數 PRESALE_BYPASS_TOKEN（不外洩到前端）。
      const bypassToken = process.env.PRESALE_BYPASS_TOKEN;
      const queryToken = request.nextUrl.searchParams.get("preview");
      const cookieToken = request.cookies.get("inrec_preview")?.value;
      const hasBypass =
        !!bypassToken && (queryToken === bypassToken || cookieToken === bypassToken);

      if (!hasBypass) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }

      // 首次用網址參數帶密鑰：種 cookie（7 天）並導到乾淨網址
      if (queryToken === bypassToken && cookieToken !== bypassToken) {
        const url = request.nextUrl.clone();
        url.searchParams.delete("preview");
        const res = NextResponse.redirect(url);
        res.cookies.set({
          name: "inrec_preview",
          value: bypassToken,
          httpOnly: true,
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });
        return res;
      }
    }
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (n) => request.cookies.get(n)?.value,
        set: (n, v, o) => response.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => response.cookies.set({ name: n, value: "", ...o }),
      },
    }
  );
  await supabase.auth.getSession();
  return response;
}

export const config = {
  matcher: ["/classroom/:path*", "/auth/:path*"],
};
