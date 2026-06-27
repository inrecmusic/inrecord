import { describe, it, expect } from "vitest";
import { normalizeManualGrantInput, buildManualOrder, PLAN_LABELS } from "./manual-grant.js";

describe("normalizeManualGrantInput", () => {
  it("rejects missing/blank email", () => {
    expect(normalizeManualGrantInput({}).ok).toBe(false);
    expect(normalizeManualGrantInput({}).error).toBe("missing_email");
    expect(normalizeManualGrantInput({ email: "   " }).ok).toBe(false);
  });

  it("rejects invalid email format", () => {
    expect(normalizeManualGrantInput({ email: "foo" }).error).toBe("invalid_email");
    expect(normalizeManualGrantInput({ email: "foo@bar" }).error).toBe("invalid_email");
    expect(normalizeManualGrantInput({ email: "a b@c.com" }).error).toBe("invalid_email");
  });

  it("trims and lowercases email", () => {
    const r = normalizeManualGrantInput({ email: "  Foo@Bar.COM " });
    expect(r.ok).toBe(true);
    expect(r.value.email).toBe("foo@bar.com");
  });

  it("defaults plan to bundle and whitelists", () => {
    expect(normalizeManualGrantInput({ email: "a@b.co" }).value.plan).toBe("bundle");
    expect(normalizeManualGrantInput({ email: "a@b.co", plan: "course" }).value.plan).toBe("course");
    expect(normalizeManualGrantInput({ email: "a@b.co", plan: "game" }).value.plan).toBe("bundle");
    expect(normalizeManualGrantInput({ email: "a@b.co", plan: "evil" }).value.plan).toBe("bundle");
  });

  it("sendEmail defaults true; only explicit false disables", () => {
    expect(normalizeManualGrantInput({ email: "a@b.co" }).value.sendEmail).toBe(true);
    expect(normalizeManualGrantInput({ email: "a@b.co", sendEmail: true }).value.sendEmail).toBe(true);
    expect(normalizeManualGrantInput({ email: "a@b.co", sendEmail: false }).value.sendEmail).toBe(false);
  });

  it("blank phone/name become null, real values trimmed", () => {
    const v1 = normalizeManualGrantInput({ email: "a@b.co", phone: "  ", name: "" }).value;
    expect(v1.phone).toBeNull();
    expect(v1.name).toBeNull();
    const v2 = normalizeManualGrantInput({ email: "a@b.co", phone: " 0925053675 ", name: " 王小美 " }).value;
    expect(v2.phone).toBe("0925053675");
    expect(v2.name).toBe("王小美");
  });
});

describe("buildManualOrder", () => {
  const now = new Date("2026-06-27T10:00:00.000Z");

  it("builds a paid, source=manual order with amount 0", () => {
    const o = buildManualOrder({ email: "a@b.co", plan: "bundle", phone: "0925053675", name: "王小美", now });
    expect(o).toMatchObject({
      email: "a@b.co",
      plan: "bundle",
      amount: 0,
      status: "paid",
      source: "manual",
      buyer_name: "王小美",
      phone: "0925053675",
      payment_method: "manual",
    });
    expect(o.plan_label).toBe(PLAN_LABELS.bundle);
    expect(o.access_granted_at).toBe(now.toISOString());
    expect(o.mer_trade_no).toBe("MANUAL-" + now.getTime());
  });

  it("uses course plan label for course plan", () => {
    expect(buildManualOrder({ email: "a@b.co", plan: "course", now }).plan_label).toBe(PLAN_LABELS.course);
  });

  it("passes null phone/name through", () => {
    const o = buildManualOrder({ email: "a@b.co", plan: "course", now });
    expect(o.buyer_name).toBeNull();
    expect(o.phone).toBeNull();
  });

  it("accepts a timestamp number for now", () => {
    const o = buildManualOrder({ email: "a@b.co", plan: "bundle", now: now.getTime() });
    expect(o.access_granted_at).toBe(now.toISOString());
  });
});
