self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {
    title: 'Twitch Kulcsszó Figyelő',
    body: 'Új értesítés érkezett.',
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Twitch Kulcsszó Figyelő', {
      body: data.body || '',
      icon: data.icon || '/icon.svg',
      badge: data.badge || '/icon-dark-32x32.png',
      tag: data.tag,
      requireInteraction: Boolean(data.requireInteraction),
      vibrate: data.vibrate || [200, 100, 200, 100, 400],
      data: { url: data.url || '/' },
      silent: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client)
      if (existing) {
        existing.focus()
        return existing.navigate(url)
      }
      return self.clients.openWindow(url)
    }),
  )
})
