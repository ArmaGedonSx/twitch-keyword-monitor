import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CATEGORY_NAME = 'NextWorld2'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'

// Cache the app access token in module memory across requests.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAppToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Token kérés sikertelen (${res.status})`)
  }
  const data = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

async function twitchGet(
  path: string,
  clientId: string,
  token: string,
): Promise<Response> {
  return fetch(`${HELIX}${path}`, {
    headers: {
      'Client-Id': clientId,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })
}

export async function GET() {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Hiányzó Twitch API hitelesítő adatok.' },
      { status: 500 },
    )
  }

  try {
    const token = await getAppToken(clientId, clientSecret)

    // 1. Resolve the category / game id by name.
    const gameRes = await twitchGet(
      `/games?name=${encodeURIComponent(CATEGORY_NAME)}`,
      clientId,
      token,
    )
    if (!gameRes.ok) {
      throw new Error(`Kategória lekérés sikertelen (${gameRes.status})`)
    }
    const gameData = (await gameRes.json()) as {
      data: { id: string; name: string; box_art_url?: string }[]
    }
    const game = gameData.data?.[0]
    if (!game) {
      return NextResponse.json(
        {
          error: `A(z) "${CATEGORY_NAME}" kategória nem található a Twitchen.`,
          channels: [],
        },
        { status: 404 },
      )
    }

    // 2. Fetch live streams in that category (paginated, up to ~300).
    const streams: {
      user_login: string
      user_name: string
      viewer_count: number
      title: string
      thumbnail_url: string
    }[] = []
    let cursor: string | undefined
    for (let page = 0; page < 3; page++) {
      const qs = new URLSearchParams({ game_id: game.id, first: '100' })
      if (cursor) qs.set('after', cursor)
      const streamRes = await twitchGet(
        `/streams?${qs.toString()}`,
        clientId,
        token,
      )
      if (!streamRes.ok) {
        throw new Error(`Stream lekérés sikertelen (${streamRes.status})`)
      }
      const streamData = (await streamRes.json()) as {
        data: typeof streams
        pagination?: { cursor?: string }
      }
      streams.push(...streamData.data)
      cursor = streamData.pagination?.cursor
      if (!cursor || streamData.data.length === 0) break
    }

    const channels = streams
      .map((s) => ({
        login: s.user_login,
        name: s.user_name,
        viewers: s.viewer_count,
        title: s.title,
      }))
      .sort((a, b) => b.viewers - a.viewers)

    return NextResponse.json({
      category: game.name,
      count: channels.length,
      channels,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Ismeretlen hiba a Twitch API-nál.',
        channels: [],
      },
      { status: 502 },
    )
  }
}
