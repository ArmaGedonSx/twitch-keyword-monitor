import { NextRequest, NextResponse } from 'next/server'
import { createDecipheriv, createHash } from 'node:crypto'

export const dynamic = 'force-dynamic'

type Session = { access_token: string; refresh_token: string; user_id: string; expires_at: number }

function encryptionKey() {
  const secret = process.env.TWITCH_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('Hiányzik a TWITCH_TOKEN_ENCRYPTION_KEY.')
  return createHash('sha256').update(secret).digest()
}

function open(value: string): Session {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')) as Session
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get('twitch_chat_session')?.value
  if (!sessionCookie) return NextResponse.json({ error: 'Twitch engedélyezés szükséges.', authRequired: true }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { channel?: string; message?: string } | null
  const channel = body?.channel?.trim().toLowerCase()
  const message = body?.message?.trim()
  if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel)) return NextResponse.json({ error: 'Érvénytelen streamer.' }, { status: 400 })
  if (!message || message.length > 500) return NextResponse.json({ error: 'Az üzenet 1–500 karakter lehet.' }, { status: 400 })

  const clientId = process.env.TWITCH_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'Hiányzik a TWITCH_CLIENT_ID.' }, { status: 500 })
  try {
    const session = open(sessionCookie)
    if (session.expires_at <= Date.now()) return NextResponse.json({ error: 'A Twitch engedélyezés lejárt, engedélyezd újra.', authRequired: true }, { status: 401 })
    const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers: { 'Client-Id': clientId, Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
    const userData = (await userResponse.json()) as { data?: { id: string }[] }
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return NextResponse.json({ error: 'A streamer nem található.' }, { status: 404 })
    const sendResponse = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: session.user_id, message }),
      cache: 'no-store',
    })
    const sendData = (await sendResponse.json().catch(() => null)) as {
      data?: Array<{ is_sent?: boolean; drop_reason?: { message?: string } }>
      message?: string
    } | null
    if (!sendResponse.ok) {
      return NextResponse.json({ error: sendData?.message || 'A Twitch nem fogadta el az üzenetet. Lehet, hogy nincs jogosultságod ebben a chatben.' }, { status: sendResponse.status })
    }
    const result = sendData?.data?.[0]
    if (result?.is_sent === false) {
      return NextResponse.json(
        { error: result.drop_reason?.message || 'A Twitch nem küldte el az üzenetet.' },
        { status: 429 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Üzenetküldési hiba.' }, { status: 500 })
  }
}
