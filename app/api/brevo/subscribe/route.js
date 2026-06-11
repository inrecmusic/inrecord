import { NextResponse } from "next/server";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 公開端點：每 IP 每分鐘 5 次，擋訂閱濫發 / 信箱轟炸（全域，缺 Redis 時記憶體保底）
const limiter = createDistributedLimiter({ limit: 5, windowMs: 60_000, prefix: "rl:brevo-subscribe" });

export async function POST(req) {
  try {
    const rl = await limiter(clientIp(req))
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const body = await req.json()
    const rawEmail = body?.email

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!rawEmail || typeof rawEmail !== 'string' || rawEmail.length > 254 || !emailRe.test(rawEmail.trim())) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    const email = rawEmail.trim().toLowerCase()

    const listId = Number(process.env.BREVO_LIST_ID)
    if (!listId) return NextResponse.json({ error: 'missing_BREVO_LIST_ID' }, { status: 500 })
    if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: 'missing_BREVO_API_KEY' }, { status: 500 })

    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true
      })
    })

    const data = await res.json().catch(() => ({}))
    console.log('[brevo result]', res.status, JSON.stringify(data))

    if (res.ok || res.status === 204) {
      return NextResponse.json({ ok: true })
    }

    // 聯絡人已存在也算成功
    if (res.status === 400 && data.code === 'duplicate_parameter') {
      return NextResponse.json({ ok: true, existing: true })
    }

    console.error('[brevo] unexpected status', res.status, data)
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 })

  } catch (err) {
    console.error('[brevo error]', err.message)
    return NextResponse.json({ error: 'subscribe_failed' }, { status: 500 })
  }
}
