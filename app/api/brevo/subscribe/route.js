import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json()
    const { email } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

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

    return NextResponse.json({ error: 'brevo_failed', detail: data }, { status: 500 })

  } catch (err) {
    console.error('[brevo error]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
