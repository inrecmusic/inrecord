import { jwtVerify } from "jose";

// 防呆：JWT_SECRET 必須存在且夠長。漏設時若以 undefined→"undefined" 當金鑰，
// 任何人都能用同一個已知字串偽造 admin token，故一律拒絕（回 null = 未授權）。
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
}

export async function verifyAdminToken(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  const secret = getJwtSecret();
  if (!secret) {
    console.error("[adminAuth] JWT_SECRET 未設定或長度不足，拒絕所有 admin 請求");
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
