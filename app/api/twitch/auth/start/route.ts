import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const clientId = process.env.TWITCH_CLIENT_ID
  const redirectUri = process.env.TWITCH_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Hiányzik a TWITCH_CLIENT_ID vagy TWITCH_OAUTH_REDIRECT_URI.' },
      { status: 500 },
    )
  }

  const state = randomBytes(24).toString('hex')
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/'
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  const response = NextResponse.redirect(
    `https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'user:write:chat',
      state,
    })}`,
  )
  response.cookies.set('twitch_oauth_state', `${state}:${safeReturnTo}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
