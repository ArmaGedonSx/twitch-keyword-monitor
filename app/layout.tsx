import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const themeScript = `
  (() => {
    try {
      const stored = localStorage.getItem('twitch-watcher-theme');
      const dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
    } catch {}
  })();
`

export const metadata: Metadata = {
  title: 'Twitch Kulcsszó Figyelő',
  description:
    'Figyeld több Twitch csatorna chatjét egyszerre, és kapj azonnali értesítést a megadott kulcsszavakról (drop, kód, nyeremény).',
  applicationName: 'Twitch Figyelő',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Twitch Figyelő',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1c1e' },
  ],
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="hu" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
