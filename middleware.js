import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request) {
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
