import { describe, it, expect } from "vitest";
import { groupSends, summarizeGroup, hasTag, twDay, TAG_SINCE_TW_DAY, buildSendIndex, attributeEvents } from "./email-stats.js";

// email_log 是 UTC；16:00Z = 台灣隔天 00:00
const row = (to_email, created_at, extra = {}) => ({ to_email, subject: "九月電子報", kind: "newsletter", status: "sent", created_at, ...extra });

describe("twDay", () => {
  it("以台灣時區切日，UTC 16:00 之後算隔天", () => {
    expect(twDay("2026-09-02T15:59:00Z")).toBe("2026-09-02");
    expect(twDay("2026-09-02T16:00:00Z")).toBe("2026-09-03");
  });
  it("壞值回空字串", () => {
    expect(twDay(null)).toBe("");
    expect(twDay("not-a-date")).toBe("");
  });
});

describe("groupSends", () => {
  it("同主旨＋同一台灣日算一次群發，寄出／未寄出分開計", () => {
    const g = groupSends([
      row("A@x.com", "2026-09-02T12:00:00Z"),
      row("b@x.com", "2026-09-02T12:00:05Z"),
      row("c@x.com", "2026-09-02T12:00:09Z", { status: "failed", error: "brevo_400" }),
      row("d@x.com", "2026-09-02T12:00:10Z", { status: "skipped" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: "2026-09-02|newsletter|九月電子報", subject: "九月電子報", kind: "newsletter", dateTW: "2026-09-02", sentCount: 2, failedCount: 2 });
    expect([...g[0].recipients]).toEqual(["a@x.com", "b@x.com"]); // 收件人一律小寫
  });

  it("跨台灣日的同主旨拆成兩組（UTC 16:00 為界）", () => {
    const g = groupSends([row("a@x.com", "2026-09-02T15:50:00Z"), row("b@x.com", "2026-09-02T16:10:00Z")]);
    expect(g.map((x) => x.dateTW)).toEqual(["2026-09-03", "2026-09-02"]); // 新到舊
  });

  it("同一天不同主旨各自成組，並依寄送時間新到舊排序", () => {
    const g = groupSends([
      row("a@x.com", "2026-09-02T02:00:00Z", { subject: "早上那封" }),
      row("b@x.com", "2026-09-02T09:00:00Z", { subject: "晚上那封" }),
    ]);
    expect(g.map((x) => x.subject)).toEqual(["晚上那封", "早上那封"]);
  });

  it("沒主旨的（Brevo 範本）也能成組，不會整批消失", () => {
    const g = groupSends([row("a@x.com", "2026-09-02T02:00:00Z", { subject: "" })]);
    expect(g[0].subject).toBe("（無主旨）");
  });

  it("壞掉的時間戳直接略過，不汙染分組", () => {
    expect(groupSends([row("a@x.com", null), row("b@x.com", "x")])).toEqual([]);
  });
});

describe("summarizeGroup", () => {
  const group = groupSends([
    row("a@x.com", "2026-09-02T12:00:00Z"),
    row("b@x.com", "2026-09-02T12:00:01Z"),
    row("c@x.com", "2026-09-02T12:00:02Z"),
    row("d@x.com", "2026-09-02T12:00:03Z"),
  ])[0];
  const ev = (email, event, date = "2026-09-02T13:00:00Z", extra = {}) => ({ email, event, date, ...extra });

  it("開信／點擊以 email 去重，算的是人數不是次數", () => {
    const s = summarizeGroup(group, [
      ev("a@x.com", "delivered"), ev("b@x.com", "delivered"), ev("c@x.com", "delivered"), ev("d@x.com", "delivered"),
      ev("a@x.com", "opened"), ev("a@x.com", "opened"), ev("a@x.com", "uniqueOpened"), ev("b@x.com", "opened"),
      ev("a@x.com", "clicks"), ev("a@x.com", "clicks"),
    ]);
    expect(s).toMatchObject({ delivered: 4, opened: 2, clicked: 1, proxyOpened: 0 });
    expect(s.openRate).toBeCloseTo(0.5, 5);
    expect(s.clickRate).toBeCloseTo(0.25, 5);
  });

  it("loadedByProxy（Apple Mail 自動載入）不算真人開信，單獨一欄", () => {
    const s = summarizeGroup(group, [
      ev("a@x.com", "delivered"), ev("b@x.com", "delivered"),
      ev("a@x.com", "opened"), ev("a@x.com", "loadedByProxy"), // 同一人兩種事件 → 歸代理
      ev("b@x.com", "loadedByProxy"),
    ]);
    expect(s).toMatchObject({ delivered: 2, opened: 0, proxyOpened: 2, openedAll: 2 });
    expect(s.openRate).toBe(0);
    expect(s.openRateAll).toBeCloseTo(1, 5);
  });

  it("只採計名單內的收件人，其他人的事件一律不算", () => {
    const s = summarizeGroup(group, [ev("a@x.com", "delivered"), ev("stranger@x.com", "delivered"), ev("stranger@x.com", "opened")]);
    expect(s).toMatchObject({ delivered: 1, opened: 0 });
  });

  it("早於寄送時間的事件不歸給這封（扣掉 10 分鐘寬容）", () => {
    const rows = [
      { to_email: "a@x.com", subject: "九月電子報", kind: "newsletter", status: "sent", created_at: "2026-09-02T12:00:00Z" },
      { to_email: "b@x.com", subject: "九月電子報", kind: "newsletter", status: "sent", created_at: "2026-09-02T12:00:00Z" },
    ];
    const g = groupSends(rows)[0];
    const byKey = attributeEvents(buildSendIndex(rows), [
      ev("a@x.com", "opened", "2026-09-02T11:00:00Z"),    // 早一小時 → 歸不到任何一封，丟棄
      ev("a@x.com", "delivered", "2026-09-02T11:55:00Z"), // 寄送前 5 分鐘，在寬容範圍內
      ev("b@x.com", "opened", "2026-09-02T23:00:00Z"),
      ev("b@x.com", "delivered", "2026-09-02T12:30:00Z"),
    ]);
    expect(summarizeGroup(g, byKey.get(g.key) || [])).toMatchObject({ delivered: 2, opened: 1 });
  });

  it("事件帶 tag 時精準排除其他類型信件（購買確認／試看信）", () => {
    const s = summarizeGroup(group, [
      ev("a@x.com", "delivered", "2026-09-02T13:00:00Z", { tag: "newsletter" }),
      ev("a@x.com", "opened", "2026-09-02T13:00:00Z", { tag: "newsletter" }),
      ev("b@x.com", "delivered", "2026-09-02T13:00:00Z", { tag: "purchase" }),
      ev("b@x.com", "opened", "2026-09-02T13:00:00Z", { tag: "purchase" }),
      ev("c@x.com", "opened", "2026-09-02T13:00:00Z", { tag: ["newsletter"] }), // 陣列格式也接受
    ]);
    expect(s).toMatchObject({ delivered: 1, opened: 2 });
  });

  it("沒有 tag 的舊事件照樣採計（只能用名單＋時間推算）", () => {
    const s = summarizeGroup(group, [ev("a@x.com", "delivered"), ev("a@x.com", "opened", "2026-09-02T13:00:00Z", { tag: null })]);
    expect(s).toMatchObject({ delivered: 1, opened: 1 });
  });

  it("退信與退訂分開計，hardBounces／softBounces 都算退信", () => {
    const s = summarizeGroup(group, [
      ev("a@x.com", "hardBounces"), ev("b@x.com", "softBounces"), ev("c@x.com", "unsubscribed"),
    ]);
    expect(s).toMatchObject({ bounced: 2, unsubscribed: 1 });
  });

  it("沒有送達事件時各率回 null（顯示「—」而不是 0%，避免誤讀成沒人開信）", () => {
    const s = summarizeGroup(group, [ev("a@x.com", "opened")]);
    expect(s).toMatchObject({ delivered: 0, opened: 1, openRate: null, clickRate: null, openRateAll: null });
  });

  it("recipients 傳陣列也能算（大小寫容忍）", () => {
    const s = summarizeGroup({ dateTW: "2026-09-02", kind: "newsletter", recipients: ["A@X.com"] }, [
      { email: "a@x.com", event: "delivered", date: "2026-09-02T13:00:00Z" },
    ]);
    expect(s.delivered).toBe(1);
  });

  it("事件為空時全回 0，不會丟例外", () => {
    expect(summarizeGroup(group, [])).toMatchObject({ delivered: 0, opened: 0, clicked: 0, openRate: null });
  });
});

describe("hasTag", () => {
  it("tag 生效日當天與之後算有 tag", () => {
    expect(hasTag({ dateTW: TAG_SINCE_TW_DAY })).toBe(true);
    expect(hasTag({ dateTW: "2026-10-01" })).toBe(true);
  });
  it("9/2 那批（生效日之前）沒有 tag", () => {
    expect(hasTag({ dateTW: "2026-09-02" })).toBe(false);
    expect(hasTag({})).toBe(false);
  });
});

// ── 覆驗抓到的兩個 blocker，釘死避免再犯 ────────────────────────────────
describe("事件歸屬（迴歸）", () => {
  const row = (email, subject, kind, at) => ({ to_email: email, subject, kind, status: "sent", created_at: at });
  const ev = (email, event, date, extra = {}) => ({ email, event, date, ...extra });

  it("B1：同一份名單寄第二封時，第一封不會吸收第二封的開信／退訂", () => {
    const rows = [
      ...["a", "b", "c", "d"].map((n) => row(`${n}@x.com`, "九月第一封", "newsletter", "2026-09-01T02:00:00Z")),
      ...["a", "b", "c", "d"].map((n) => row(`${n}@x.com`, "九月第二封", "newsletter", "2026-09-10T02:00:00Z")),
    ];
    const groups = groupSends(rows);
    const byKey = attributeEvents(buildSendIndex(rows), [
      // 第一封只有 a 開了
      ev("a@x.com", "opened", "2026-09-01T05:00:00Z"),
      ...["a", "b", "c", "d"].map((n) => ev(`${n}@x.com`, "delivered", "2026-09-01T02:05:00Z")),
      // 第二封四個人全開、全點、全退訂
      ...["a", "b", "c", "d"].flatMap((n) => [
        ev(`${n}@x.com`, "delivered", "2026-09-10T02:05:00Z"),
        ev(`${n}@x.com`, "opened", "2026-09-10T05:00:00Z"),
        ev(`${n}@x.com`, "clicks", "2026-09-10T05:01:00Z"),
        ev(`${n}@x.com`, "unsubscribed", "2026-09-10T05:02:00Z"),
      ]),
    ]);
    const first = groups.find((g) => g.subject === "九月第一封");
    const s1 = summarizeGroup(first, byKey.get(first.key) || []);
    expect(s1).toMatchObject({ delivered: 4, opened: 1, clicked: 0, unsubscribed: 0 });
    expect(s1.openRate).toBeCloseTo(0.25);
  });

  it("B1：同一天寄兩批，早上那批不會吃到下午那批的開信", () => {
    const rows = [
      row("a@x.com", "上午批", "newsletter", "2026-09-05T01:00:00Z"),
      row("a@x.com", "下午批", "newsletter", "2026-09-05T09:00:00Z"),
    ];
    const groups = groupSends(rows);
    const byKey = attributeEvents(buildSendIndex(rows), [
      ev("a@x.com", "delivered", "2026-09-05T01:01:00Z"),
      ev("a@x.com", "delivered", "2026-09-05T09:01:00Z"),
      ev("a@x.com", "opened", "2026-09-05T10:00:00Z"), // 只開了下午那批
    ]);
    const am = groups.find((g) => g.subject === "上午批");
    const pm = groups.find((g) => g.subject === "下午批");
    expect(summarizeGroup(am, byKey.get(am.key) || [])).toMatchObject({ opened: 0 });
    expect(summarizeGroup(pm, byKey.get(pm.key) || [])).toMatchObject({ opened: 1 });
  });

  it("B2：購買確認信的開信不會算進電子報（時間軸涵蓋所有寄信類型）", () => {
    const rows = [
      row("a@x.com", "開課倒數三天", "newsletter", "2026-09-08T02:00:00Z"),
      row("a@x.com", "購買成功，課程已開通", "purchase", "2026-09-08T06:00:00Z"),
    ];
    const groups = groupSends(rows);
    const byKey = attributeEvents(buildSendIndex(rows), [
      ev("a@x.com", "delivered", "2026-09-08T06:01:00Z"),
      ev("a@x.com", "opened", "2026-09-08T07:00:00Z"),   // 開的是購買確認信（無 tag）
      ev("a@x.com", "clicks", "2026-09-08T07:01:00Z"),
    ]);
    const nl = groups.find((g) => g.kind === "newsletter");
    expect(summarizeGroup(nl, byKey.get(nl.key) || [])).toMatchObject({ opened: 0, clicked: 0 });
  });

  it("B2：已帶 tag 的群發要求事件必須帶對 tag，沒帶的不算", () => {
    const rows = [row("a@x.com", "九月報", "newsletter", "2026-09-20T02:00:00Z")]; // 晚於 TAG_SINCE
    const g = groupSends(rows)[0];
    expect(hasTag(g)).toBe(true);
    const evs = [
      ev("a@x.com", "delivered", "2026-09-20T02:05:00Z", { tag: "newsletter" }),
      ev("a@x.com", "opened", "2026-09-20T03:00:00Z"), // 沒帶 tag → 精準模式下不採計
    ];
    expect(summarizeGroup(g, evs, { requireTag: true })).toMatchObject({ delivered: 1, opened: 0 });
    expect(summarizeGroup(g, evs, { requireTag: false })).toMatchObject({ delivered: 1, opened: 1 });
  });

  it("歸屬有上界：14 天後才發生的事件不再算給這封", () => {
    const rows = [row("a@x.com", "很久以前", "newsletter", "2026-08-01T02:00:00Z")];
    const byKey = attributeEvents(buildSendIndex(rows), [ev("a@x.com", "opened", "2026-09-01T02:00:00Z")]);
    expect(byKey.size).toBe(0);
  });
});

describe("寬容窗不可被後續信件濫用（迴歸）", () => {
  const row = (email, subject, kind, at) => ({ to_email: email, subject, kind, status: "sent", created_at: at });
  const ev = (email, event, date) => ({ email, event, date });

  it("同一人在 5 分鐘後收到第二封，第一封的送達事件不會被搶走", () => {
    const rows = [
      row("a@x.com", "電子報", "newsletter", "2026-09-02T12:00:00Z"),
      row("a@x.com", "開課通知", "launch", "2026-09-02T12:05:00Z"), // 5 分鐘後，在 10 分鐘寬容內
    ];
    const byKey = attributeEvents(buildSendIndex(rows), [
      ev("a@x.com", "delivered", "2026-09-02T12:00:30Z"), // 電子報的送達，發生在開課通知寄出「之前」
    ]);
    const nl = groupSends(rows).find((g) => g.kind === "newsletter");
    expect(summarizeGroup(nl, byKey.get(nl.key) || [])).toMatchObject({ delivered: 1 });
  });

  it("事件略早於寄送紀錄時，寬容窗仍然生效（沒有更早的寄送可對）", () => {
    const rows = [row("a@x.com", "電子報", "newsletter", "2026-09-02T12:00:00Z")];
    const byKey = attributeEvents(buildSendIndex(rows), [ev("a@x.com", "delivered", "2026-09-02T11:56:00Z")]);
    expect(byKey.size).toBe(1);
  });
});
