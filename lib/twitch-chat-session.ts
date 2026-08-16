import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import type { NextResponse } from 'next/server'

export const TWITCH_SESSION_COOKIE = 'twitch_chat_session'

export type TwitchChatSession = {
  access_token: string
  refresh_token: string
  user_id: string
  expires_at: number
}

type TwitchRefreshToken = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

function encryptionKey() {
  const secret = process.env.TWITCH_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('Hiányzik a TWITCH_TOKEN_ENCRYPTION_KEY.')
  return createHash('sha256').update(secret).digest()
}

export function sealTwitchSession(session: TwitchChatSession) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ])
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function openTwitchSession(value: string): TwitchChatSession {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Érvénytelen Twitch munkamenet.')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8'),
  ) as TwitchChatSession
}

export function setTwitchSessionCookie(
  response: NextResponse,
  session: TwitchChatSession,
) {
  response.cookies.set(TWITCH_SESSION_COOKIE, sealTwitchSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export function clearTwitchSessionCookie(response: NextResponse) {
  response.cookies.delete(TWITCH_SESSION_COOKIE)
}

export async function refreshTwitchSession(
  session: TwitchChatSession,
): Promise<TwitchChatSession> {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Hiányos Twitch OAuth szerverbeállítás.')
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: session.refresh_token,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('A Twitch engedély nem frissíthető.')
  }

  const token = (await response.json()) as TwitchRefreshToken
  if (!token.access_token || !token.expires_in) {
    throw new Error('A Twitch hibás frissítési választ adott.')
  }

  return {
    ...session,
    access_token: token.access_token,
    refresh_token: token.refresh_token || session.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  }
}
