import { NextRequest, NextResponse } from 'next/server'
import {
  clearTwitchSessionCookie,
  openTwitchSession,
  refreshTwitchSession,
  setTwitchSessionCookie,
  TWITCH_SESSION_COOKIE,
  type TwitchChatSession,
} from '@/lib/twitch-chat-session'

export const dynamic = 'force-dynamic'

const REFRESH_EARLY_MS = 60_000

type TwitchSendData = {
  data?: Array<{ is_sent?: boolean; drop_reason?: { message?: string } }>
  message?: string
}

type SendAttempt = {
  status: number
  data: TwitchSendData | null
}

async function sendToTwitch(
  session: TwitchChatSession,
  clientId: string,
  channel: string,
  message: string,
): Promise<SendAttempt> {
  const userResponse = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`,
    {
      headers: {
        'Client-Id': clientId,
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: 'no-store',
    },
  )
  if (!userResponse.ok) {
    const data = (await userResponse.json().catch(() => null)) as TwitchSendData | null
    return { status: userResponse.status, data }
  }

  const userData = (await userResponse.json()) as { data?: { id: string }[] }
  const broadcasterId = userData.data?.[0]?.id
  if (!broadcasterId) return { status: 404, data: { message: 'A streamer nem található.' } }

  const sendResponse = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: session.user_id,
      message,
    }),
    cache: 'no-store',
  })
  const data = (await sendResponse.json().catch(() => null)) as TwitchSendData | null
  return { status: sendResponse.status, data }
}

function authenticationRequired(message: string) {
  const response = NextResponse.json(
    { error: message, authRequired: true },
    { status: 401 },
  )
  clearTwitchSessionCookie(response)
  return response
}

function jsonWithUpdatedSession(
  body: object,
  init: ResponseInit,
  session: TwitchChatSession,
  refreshed: boolean,
) {
  const response = NextResponse.json(body, init)
  if (refreshed) setTwitchSessionCookie(response, session)
  return response
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(TWITCH_SESSION_COOKIE)?.value
  if (!sessionCookie) {
    return NextResponse.json(
      { error: 'Twitch engedélyezés szükséges.', authRequired: true },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as {
    channel?: string
    message?: string
  } | null
  const channel = body?.channel?.trim().toLowerCase()
  const message = body?.message?.trim()
  if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel)) {
    return NextResponse.json({ error: 'Érvénytelen streamer.' }, { status: 400 })
  }
  if (!message || message.length > 500) {
    return NextResponse.json(
      { error: 'Az üzenet 1–500 karakter lehet.' },
      { status: 400 },
    )
  }

  const clientId = process.env.TWITCH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'Hiányzik a TWITCH_CLIENT_ID.' },
      { status: 500 },
    )
  }

  let session: TwitchChatSession
  try {
    session = openTwitchSession(sessionCookie)
  } catch {
    return authenticationRequired('A Twitch munkamenet érvénytelen. Engedélyezd újra.')
  }

  let refreshed = false
  let refreshAttempted = false
  try {
    if (session.expires_at <= Date.now() + REFRESH_EARLY_MS) {
      refreshAttempted = true
      session = await refreshTwitchSession(session)
      refreshed = true
    }

    let attempt = await sendToTwitch(session, clientId, channel, message)
    if (attempt.status === 401 && !refreshed) {
      refreshAttempted = true
      session = await refreshTwitchSession(session)
      refreshed = true
      attempt = await sendToTwitch(session, clientId, channel, message)
    }

    if (attempt.status === 401) {
      return authenticationRequired(
        'A Twitch engedély nem frissíthető. Engedélyezd újra egyszer.',
      )
    }
    if (attempt.status < 200 || attempt.status >= 300) {
      return jsonWithUpdatedSession(
        {
          error:
            attempt.data?.message ||
            'A Twitch nem fogadta el az üzenetet. Lehet, hogy nincs jogosultságod ebben a chatben.',
        },
        { status: attempt.status },
        session,
        refreshed,
      )
    }

    const result = attempt.data?.data?.[0]
    if (result?.is_sent === false) {
      return jsonWithUpdatedSession(
        {
          error:
            result.drop_reason?.message || 'A Twitch nem küldte el az üzenetet.',
        },
        { status: 429 },
        session,
        refreshed,
      )
    }

    const response = NextResponse.json({ ok: true, authRefreshed: refreshed })
    if (refreshed) setTwitchSessionCookie(response, session)
    return response
  } catch (error) {
    if (refreshAttempted) {
      return authenticationRequired(
        error instanceof Error
          ? `${error.message} Engedélyezd újra egyszer.`
          : 'A Twitch engedély nem frissíthető. Engedélyezd újra egyszer.',
      )
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Üzenetküldési hiba.',
      },
      { status: 500 },
    )
  }
}
