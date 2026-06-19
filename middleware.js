import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 預售鎖站：開課前一律鎖住教室內容，導回銷售頁。
  // 僅放行 /classroom/login（買課需先登入）。下週開課時把
  // NEXT_PUBLIC_PRESALE_MODE 關掉（移除或設非 "1"）並重新部署即可解鎖。
  const presaleMode = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";
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
