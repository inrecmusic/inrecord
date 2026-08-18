import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import { verifyAdminToken, getJwtSecret } from "./adminAuth.js";

const SECRET = "test-jwt-secret-at-least-16-chars";

function makeReq(token) {
  return { headers: { get: (k) => (k.toLowerCase() === "authorization" && token ? `Bearer ${token}` : null) } };
}

async function sign(payload, { secret = SECRET, exp = "1h" } = {}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

describe("getJwtSecret（金鑰防呆）", () => {
  afterEach(() => { process.env.JWT_SECRET = SECRET; });

  it("未設或過短 → null（拒絕以弱金鑰簽發/驗證）", () => {
    delete process.env.JWT_SECRET;
    expect(getJwtSecret()).toBeNull();
    process.env.JWT_SECRET = "short";
    expect(getJwtSecret()).toBeNull();
  });

  it("足夠長度 → 回 Uint8Array 金鑰", () => {
    process.env.JWT_SECRET = SECRET;
    expect(getJwtSecret()).toBeInstanceOf(Uint8Array);
  });
});

describe("verifyAdminToken", () => {
  beforeEach(() => { process.env.JWT_SECRET = SECRET; });

  it("有效 admin token → 回 payload", async () => {
    const token = await sign({ email: "admin@x.com", role: "admin" });
    const payload = await verifyAdminToken(makeReq(token));
    expect(payload?.email).toBe("admin@x.com");
    expect(payload?.role).toBe("admin");
  });

  it("無 Authorization header → null", async () => {
    expect(await verifyAdminToken(makeReq(null))).toBeNull();
  });

  it("role 不是 admin → null（縱深防禦，2026-08 新增）", async () => {
    const token = await sign({ email: "u@x.com", role: "user" });
    expect(await verifyAdminToken(makeReq(token))).toBeNull();
  });

  it("缺 role claim → null", async () => {
    const token = await sign({ email: "u@x.com" });
    expect(await verifyAdminToken(makeReq(token))).toBeNull();
  });

  it("以別的金鑰簽的 token（偽造）→ null", async () => {
    const token = await sign({ email: "a@x.com", role: "admin" }, { secret: "another-secret-16-chars-xx" });
    expect(await verifyAdminToken(makeReq(token))).toBeNull();
  });

  it("過期 token → null", async () => {
    const token = await sign({ email: "a@x.com", role: "admin" }, { exp: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyAdminToken(makeReq(token))).toBeNull();
  });

  it("JWT_SECRET 未設時，即使帶有效 token 也一律拒絕", async () => {
    const token = await sign({ email: "a@x.com", role: "admin" });
    delete process.env.JWT_SECRET;
    expect(await verifyAdminToken(makeReq(token))).toBeNull();
  });
});
