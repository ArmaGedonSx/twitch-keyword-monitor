import { NextRequest, NextResponse } from 'next/server'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

type TwitchToken = { access_token: string; refresh_token: string; expires_in: number }
type Session = TwitchToken & { user_id: string; expires_at: number }

function encryptionKey() {
  const secret = process.env.TWITCH_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('Hiányzik a TWITCH_TOKEN_ENCRYPTION_KEY.')
  return createHash('sha256').update(secret).digest()
}

function seal(session: Session) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get('twitch_oauth_state')?.value
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  if (!stateCookie || !code || !stateCookie.startsWith(`${state}:`)) {
    return NextResponse.json({ error: 'Érvénytelen Twitch OAuth állapot.' }, { status: 400 })
  }

  const [, returnTo = '/'] = stateCookie.split(':')
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  const redirectUri = process.env.TWITCH_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri || !process.env.TWITCH_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'Hiányos Twitch OAuth szerverbeállítás.' }, { status: 500 })
  }

  try {
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
      cache: 'no-store',
    })
    if (!tokenResponse.ok) throw new Error('A Twitch token kérés sikertelen.')
    const token = (await tokenResponse.json()) as TwitchToken
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${token.access_token}` },
      cache: 'no-store',
    })
    const userData = (await userResponse.json()) as { data?: { id: string }[] }
    const userId = userData.data?.[0]?.id
    if (!userId) throw new Error('A Twitch felhasználó azonosítása sikertelen.')

    const response = NextResponse.redirect(new URL(returnTo, request.url))
    response.cookies.delete('twitch_oauth_state')
    response.cookies.set('twitch_chat_session', seal({ ...token, user_id: userId, expires_at: Date.now() + token.expires_in * 1000 }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Twitch OAuth hiba.' }, { status: 502 })
  }
}
