import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addLeadContact, listLeadEmails, removeLeadContact } from "./brevo-contacts.js";

const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

describe("brevo-contacts（官網潛客清單）", () => {
  beforeEach(() => { process.env.BREVO_API_KEY = "k"; process.env.BREVO_LIST_ID = "7"; });
  afterEach(() => { delete process.env.BREVO_API_KEY; delete process.env.BREVO_LIST_ID; });

  it("缺 BREVO_LIST_ID → missing_brevo_config，不打 API", async () => {
    delete process.env.BREVO_LIST_ID;
    const f = vi.fn();
    expect(await addLeadContact({ email: "a@x.com" }, { fetchImpl: f })).toEqual({ ok: false, error: "missing_brevo_config" });
    expect(f).not.toHaveBeenCalled();
  });

  it("addLeadContact：POST /contacts 帶清單 id、updateEnabled、屬性；201（新建）與 204（已存在更新）皆 ok", async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(201, { id: 1 })).mockResolvedValueOnce(jsonRes(204, {}));
    expect(await addLeadContact({ email: "a@x.com", attributes: { SOURCE: "website" } }, { fetchImpl: f })).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual({ email: "a@x.com", listIds: [7], updateEnabled: true, attributes: { SOURCE: "website" } });
    expect(await addLeadContact({ email: "b@x.com" }, { fetchImpl: f })).toEqual({ ok: true });
  });

  it("屬性在 Brevo 不存在被拒（400 提到 attribute）→ 去掉屬性重試一次，名單不能因屬性而收不到人", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes(400, { code: "invalid_parameter", message: "Attribute UTM_X does not exist" }))
      .mockResolvedValueOnce(jsonRes(201, {}));
    expect(await addLeadContact({ email: "a@x.com", attributes: { UTM_X: "1" } }, { fetchImpl: f })).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).attributes).toBeUndefined();
  });

  it("其他錯誤 → ok:false 帶狀態碼；fetch 丟錯也不炸", async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(401, { message: "Key not found" }));
    expect(await addLeadContact({ email: "a@x.com" }, { fetchImpl: f })).toMatchObject({ ok: false, error: "brevo_401" });
    const g = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await addLeadContact({ email: "a@x.com" }, { fetchImpl: g })).toMatchObject({ ok: false, error: "boom" });
  });

  it("listLeadEmails：分頁取完、跳過黑名單（Brevo 端退訂者）", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes(200, { contacts: [{ email: "a@x.com" }, { email: "b@x.com", emailBlacklisted: true }], count: 3 }))
      .mockResolvedValueOnce(jsonRes(200, { contacts: [{ email: "c@x.com" }], count: 3 }));
    expect(await listLeadEmails({ fetchImpl: f, pageSize: 2 })).toEqual(["a@x.com", "c@x.com"]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe("https://api.brevo.com/v3/contacts/lists/7/contacts?limit=2&offset=0");
    expect(f.mock.calls[1][0]).toContain("offset=2");
  });

  it("listLeadEmails：API 失敗直接丟錯（群發不可用半份名單）；缺設定也丟錯", async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(500, {}));
    await expect(listLeadEmails({ fetchImpl: f })).rejects.toThrow(/brevo_500/);
    delete process.env.BREVO_LIST_ID;
    await expect(listLeadEmails({ fetchImpl: vi.fn() })).rejects.toThrow(/missing_brevo_config/);
  });

  it("removeLeadContact：POST …/contacts/remove；失敗只回 ok:false 不丟錯", async () => {
    const f = vi.fn().mockResolvedValueOnce(jsonRes(201, {}));
    expect(await removeLeadContact("a@x.com", { fetchImpl: f })).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe("https://api.brevo.com/v3/contacts/lists/7/contacts/remove");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ emails: ["a@x.com"] });
    const g = vi.fn().mockResolvedValueOnce(jsonRes(400, { message: "Contact not in list" }));
    expect(await removeLeadContact("a@x.com", { fetchImpl: g })).toMatchObject({ ok: false, error: "brevo_400" });
    const h = vi.fn().mockRejectedValue(new Error("net"));
    expect(await removeLeadContact("a@x.com", { fetchImpl: h })).toMatchObject({ ok: false, error: "net" });
  });
});
