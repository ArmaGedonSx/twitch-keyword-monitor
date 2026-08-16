'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { ChatUserstate, Client } from 'tmi.js'
import {
  Bell,
  BellOff,
  Play,
  Square,
  Volume2,
  VolumeX,
  Radio,
  RefreshCw,
  Users,
  Send,
  X,
  ExternalLink,
  MessageCircle,
  ChevronDown,
  Moon,
  Sun,
} from 'lucide-react'
import { TagInput } from '@/components/tag-input'
import { HitLog, type Hit } from '@/components/hit-log'
import { ArmaAlerts } from '@/components/arma-alerts'
import {
  DEDUPE_WINDOW_MS,
  normalizeChatMessage,
  normalizeRepeatedMessage,
} from '@/lib/message-dedupe'

// tmi.js emits USERNOTICE announcements as `usernotice`, but @types/tmi.js
// does not declare this runtime event yet.
declare module 'tmi.js' {
  interface Events {
    usernotice(
      messageType: string,
      channel: string,
      userstate: ChatUserstate,
      message: string,
    ): void
  }
}

type Status = 'idle' | 'connecting' | 'connected' | 'error'

type Channel = {
  login: string
  name: string
  viewers: number
  title: string
}

const STORAGE_KEY = 'twitch-watcher-settings'
const MAX_HITS = 200
const ARMA_NAME = 'armagedonsx'
const REPEAT_THRESHOLD = 3
const REPEAT_WINDOW_MS = 60_000
const REPEAT_COOLDOWN_MS = 11 * 60_000
const AUTOMATIC_SEND_INTERVAL_MS = 1_600
const MESSAGE_EVENT_DEDUPE_MS = 2 * 60_000

const TWITCH_ICON =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239146ff"%3E%3Cpath d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/%3E%3C/svg%3E'

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{
    category?: string
    count?: number
    channels?: Channel[]
    error?: string
  }>)

export function KeywordWatcher() {
  const [keywords, setKeywords] = useState<string[]>(['isi'])
  const [status, setStatus] = useState<Status>('idle')
  const [joined, setJoined] = useState<string[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [armaHits, setArmaHits] = useState<Hit[]>([])
  const [scanned, setScanned] = useState(0)
  const [notify, setNotify] = useState(false)
  const [sound, setSound] = useState(true)
  const [autoRepeatReply, setAutoRepeatReply] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [hydrated, setHydrated] = useState(false)
  const [chatChannel, setChatChannel] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const {
    data,
    error: channelsError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR('/api/nextworld2-channels', fetcher, {
    refreshInterval: 120_000,
    revalidateOnFocus: false,
  })

  const liveChannels = useMemo(() => data?.channels ?? [], [data])
  const channelLogins = useMemo(
    () => liveChannels.map((c) => c.login),
    [liveChannels],
  )

  const clientRef = useRef<Client | null>(null)
  const keywordsRef = useRef(keywords)
  const soundRef = useRef(sound)
  const notifyRef = useRef(notify)
  const joinedRef = useRef<string[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const dedupeRef = useRef(new Map<string, { id: string; kind: 'keyword' | 'arma'; time: number }>())
  const repeatMessagesRef = useRef(new Map<string, number[]>())
  const repeatCooldownRef = useRef(new Map<string, number>())
  const keywordCooldownRef = useRef(new Map<string, number>())
  const seenChatMessageEventsRef = useRef(new Map<string, number>())
  const autoRepeatReplyRef = useRef(autoRepeatReply)
  const automaticMessageQueueRef = useRef<Array<{ channel: string; message: string; priority: boolean }>>([])
  const automaticMessageWorkerRef = useRef(false)
  const [autoReplyStatus, setAutoReplyStatus] = useState<string | null>(null)

  useEffect(() => { keywordsRef.current = keywords }, [keywords])
  useEffect(() => { soundRef.current = sound }, [sound])
  useEffect(() => { notifyRef.current = notify }, [notify])
  useEffect(() => { joinedRef.current = joined }, [joined])
  useEffect(() => { autoRepeatReplyRef.current = autoRepeatReply }, [autoRepeatReply])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    localStorage.setItem('twitch-watcher-theme', next)
    setTheme(next)
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js')
  }, [])

  // Load persisted settings once on mount.
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      // Browser permission is an external value that must be read after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission(Notification.permission)
      setNotify(Notification.permission === 'granted')
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
          setKeywords(parsed.keywords)
        }
        if (typeof parsed.sound === 'boolean') setSound(parsed.sound)
        if (typeof parsed.autoRepeatReply === 'boolean') setAutoRepeatReply(parsed.autoRepeatReply)
      }
    } catch {
      // ignore malformed storage
    } finally {
      setHydrated(true)
    }
  }, [])

  // Persist settings when they change (only after the initial load).
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ keywords, sound, autoRepeatReply }))
  }, [hydrated, keywords, sound, autoRepeatReply])

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect().catch(() => {})
    }
  }, [])

  // Keep the joined channels in sync with the live category while running.
  useEffect(() => {
    const client = clientRef.current
    if (!client || status !== 'connected') return
    const target = new Set(channelLogins)
    const current = new Set(joinedRef.current)

    for (const login of target) {
      if (!current.has(login)) {
        client.join(login).catch(() => {})
      }
    }
    for (const login of current) {
      if (!target.has(login)) {
        client.part(login).catch(() => {})
        setJoined((prev) => prev.filter((c) => c !== login))
      }
    }
  }, [channelLogins, status])

  const playBeep = useCallback((arma = false) => {
    if (!soundRef.current) return
    try {
      if (!audioCtxRef.current) {
        const AudioContextConstructor = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtxRef.current = new AudioContextConstructor()
      }
      const ctx = audioCtxRef.current
      const tones = arma
        ? [660, 880, 1174, 1568]
        : [880, 1174]
      const step = arma ? 0.11 : 0.09
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const t = ctx.currentTime + i * step
        osc.type = arma ? 'triangle' : 'sine'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(arma ? 0.35 : 0.25, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + step + 0.05)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + step + 0.08)
      })
    } catch {
      // audio not available
    }
  }, [])

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready.catch(() => undefined)
    }
    const result = await Notification.requestPermission()
    setPermission(result)
    setNotify(result === 'granted')
  }

  async function start() {
    if (channelLogins.length === 0 || keywords.length === 0) return
    // Prime the audio context on user gesture so beeps work later.
    try {
      if (!audioCtxRef.current) {
        const AudioContextConstructor = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtxRef.current = new AudioContextConstructor()
      }
      await audioCtxRef.current.resume()
    } catch {
      // ignore
    }

    await clientRef.current?.disconnect().catch(() => {})
    setJoined([])
    setStatus('connecting')

    const tmi = (await import('tmi.js')).default
    const client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true },
      channels: [...channelLogins],
    })
    clientRef.current = client

    client.on('connected', () => setStatus('connected'))
    client.on('disconnected', () => {
      setStatus('idle')
      setJoined([])
    })
    client.on('join', (channel, _username, self) => {
      if (self) {
        setJoined((prev) => {
          const name = channel.replace('#', '')
          return prev.includes(name) ? prev : [...prev, name]
        })
      }
    })

    const handleIncomingMessage = (
      channel: string,
      tags: ChatUserstate,
      message: string,
      self = false,
    ) => {
      if (self) return
      const cleanChannel = channel.replace('#', '')
      const senderLogin = tags.username?.toLocaleLowerCase('hu-HU') ?? ''
      // The read-only tmi.js client cannot mark API-sent messages as `self`.
      // Do not let this app react to its own ArmaGedonSx responses.
      if (senderLogin === ARMA_NAME) return

      const sourceMessageId = tags['source-id'] || tags.id
      if (sourceMessageId) {
        const eventKey = `${cleanChannel}:${sourceMessageId}`
        const eventNow = Date.now()
        const seenAt = seenChatMessageEventsRef.current.get(eventKey)
        if (seenAt && eventNow - seenAt <= MESSAGE_EVENT_DEDUPE_MS) return
        seenChatMessageEventsRef.current.set(eventKey, eventNow)
        for (const [key, timestamp] of seenChatMessageEventsRef.current) {
          if (eventNow - timestamp > MESSAGE_EVENT_DEDUPE_MS) {
            seenChatMessageEventsRef.current.delete(key)
          }
        }
      }

      setScanned((n) => n + 1)
      const lower = message.toLowerCase()
      const replyParentLogin = tags['reply-parent-user-login']?.toLocaleLowerCase('hu-HU') ?? ''
      const isArmaMention = lower.includes(ARMA_NAME) || replyParentLogin === ARMA_NAME
      const user = tags['display-name'] || tags.username || 'ismeretlen'
      const baseHit = {
        channel: cleanChannel,
        user,
        color: tags.color || undefined,
        message,
        time: Date.now(),
        channels: [cleanChannel],
      }

      const isKnownChatbot = /nightbot|streamelements|streamlabs|moobot|wizebot|fossabot|chatbot/i.test(senderLogin)
      const repeatedMessage = normalizeRepeatedMessage(message)
      const canTriggerRepeat = repeatedMessage.length > 0 && repeatedMessage.length <= 160 && !/https?:\/\//i.test(repeatedMessage) && !isKnownChatbot
      if (canTriggerRepeat) {
        const repeatKey = `${cleanChannel}:${repeatedMessage}`
        const repeatNow = Date.now()
        const cooldownUntil = repeatCooldownRef.current.get(repeatKey) ?? 0
        const recent = (repeatMessagesRef.current.get(repeatKey) ?? []).filter(
          (timestamp) => repeatNow - timestamp <= REPEAT_WINDOW_MS,
        )
        if (repeatNow >= cooldownUntil) {
          recent.push(repeatNow)
          repeatMessagesRef.current.set(repeatKey, recent)
          if (recent.length >= REPEAT_THRESHOLD) {
            repeatCooldownRef.current.set(repeatKey, repeatNow + REPEAT_COOLDOWN_MS)
            repeatMessagesRef.current.delete(repeatKey)
            const repeatHit: Hit = {
              ...baseHit,
              id: `repeat-${repeatNow}-${Math.random()}`,
              keywords: [],
              kind: 'repeat',
            }
            setHits((prev) => [repeatHit, ...prev].slice(0, MAX_HITS))
            playBeep(false)
            if (autoRepeatReplyRef.current) void sendAutomaticChatMessage(cleanChannel, message)
          }
        } else {
          repeatMessagesRef.current.set(repeatKey, recent)
        }
      }

      const dedupeKey = normalizeChatMessage(message)
      const now = Date.now()
      const addOrMerge = (hit: Hit, kind: 'keyword' | 'arma') => {
        if (!dedupeKey) return true
        const key = `${kind}:${dedupeKey}`
        const previous = dedupeRef.current.get(key)
        if (previous && now - previous.time <= DEDUPE_WINDOW_MS) {
          const merge = (items: Hit[]) => items.map((item) => item.id === previous.id
            ? { ...item, channels: Array.from(new Set([...(item.channels ?? [item.channel]), cleanChannel])) }
            : item)
          if (kind === 'arma') setArmaHits(merge)
          else setHits(merge)
          previous.time = now
          return false
        }
        const next = { id: hit.id, kind, time: now }
        dedupeRef.current.set(key, next)
        for (const [storedKey, entry] of dedupeRef.current) {
          if (now - entry.time > DEDUPE_WINDOW_MS) dedupeRef.current.delete(storedKey)
        }
        return true
      }

      // Priority: ArmaGedonSx mention (your name → possible win).
      if (isArmaMention) {
        // Every ArmaGedonSx mention gets the requested immediate response.
        // This intentionally has no 11-minute cooldown.
        void sendAutomaticChatMessage(cleanChannel, 'Raida', true)
        const armaHit: Hit = { ...baseHit, id: `arma-${tags.id || Date.now()}-${Math.random()}`, keywords: ['ArmaGedonSx'] }
        if (!addOrMerge(armaHit, 'arma')) return
        setArmaHits((prev) => [armaHit, ...prev].slice(0, MAX_HITS))
        playBeep(true)
        void showAppNotification(
          `🎉 Lehetséges nyerés — #${cleanChannel}`,
          `${user}: ${message}`,
          { tag: `arma-${cleanChannel}`, requireInteraction: true, winning: true },
        )
        return
      }

      const matched = keywordsRef.current.filter(
        (kw) => kw.length > 0 && message.includes(kw),
      )
      if (matched.length === 0) return

      const keywordNow = Date.now()
      const freshMatched = matched.filter((kw) => {
        const key = `${cleanChannel}:${kw}`
        const cooldownUntil = keywordCooldownRef.current.get(key) ?? 0
        if (keywordNow < cooldownUntil) return false
        keywordCooldownRef.current.set(key, keywordNow + REPEAT_COOLDOWN_MS)
        return true
      })
      if (freshMatched.length === 0) return

      const hit: Hit = { ...baseHit, id: `${tags.id || Date.now()}-${Math.random()}`, keywords: freshMatched }
      if (!addOrMerge(hit, 'keyword')) return
      setHits((prev) => [hit, ...prev].slice(0, MAX_HITS))

      playBeep(false)

      void showAppNotification(`Találat: #${cleanChannel}`, `${user}: ${message}`, {
        tag: cleanChannel,
      })
    }

    client.on('message', handleIncomingMessage)
    client.on('usernotice', (messageType, channel, tags, message) => {
      if (messageType === 'announcement' && message) {
        handleIncomingMessage(channel, tags as ChatUserstate, message)
      }
    })

    try {
      await client.connect()
    } catch {
      setStatus('error')
    }
  }

  async function stop() {
    await clientRef.current?.disconnect().catch(() => {})
    clientRef.current = null
    setStatus('idle')
    setJoined([])
    automaticMessageQueueRef.current = []
  }

  function sendAutomaticChatMessage(channel: string, message: string, priority = false) {
    const item = { channel, message: message.trim().slice(0, 500), priority }
    if (priority) {
      const firstNormalIndex = automaticMessageQueueRef.current.findIndex((queued) => !queued.priority)
      if (firstNormalIndex === -1) automaticMessageQueueRef.current.push(item)
      else automaticMessageQueueRef.current.splice(firstNormalIndex, 0, item)
    } else {
      automaticMessageQueueRef.current.push(item)
    }
    if (!automaticMessageWorkerRef.current) void drainAutomaticMessageQueue()
  }

  async function drainAutomaticMessageQueue() {
    if (automaticMessageWorkerRef.current) return
    automaticMessageWorkerRef.current = true
    try {
      while (automaticMessageQueueRef.current.length > 0) {
        const next = automaticMessageQueueRef.current.shift()
        if (!next) break
        try {
          const response = await fetch('/api/twitch/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          })
          const data = (await response.json().catch(() => null)) as { error?: string } | null
          if (!response.ok) {
            setAutoReplyStatus(`Automatikus válasz sikertelen: ${data?.error || 'ismeretlen Twitch-hiba'}`)
          } else {
            setAutoReplyStatus(`Automatikus válasz elküldve: #${next.channel}`)
          }
        } catch {
          setAutoReplyStatus('Automatikus válasz sikertelen: hálózati hiba.')
        }
        if (automaticMessageQueueRef.current.length > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, AUTOMATIC_SEND_INTERVAL_MS))
        }
      }
    } finally {
      automaticMessageWorkerRef.current = false
    }
  }

  async function showAppNotification(
    title: string,
    body: string,
    options: { tag: string; requireInteraction?: boolean; winning?: boolean },
  ) {
    if (!notifyRef.current || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const notificationOptions = {
      body,
      icon: TWITCH_ICON,
      badge: '/icon-dark-32x32.png',
      tag: options.tag,
      requireInteraction: options.requireInteraction ?? false,
      vibrate: options.winning ? [250, 100, 250, 100, 700] : [150, 100, 250],
      data: { url: `https://twitch.tv/${options.tag.replace(/^arma-/, '')}` },
    }
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(title, notificationOptions)
        return
      }
      const notification = new Notification(title, notificationOptions)
      notification.onclick = () => window.open(`https://twitch.tv/${options.tag.replace(/^arma-/, '')}`, '_blank')
    } catch {
      // Notifications may be unavailable or blocked by the mobile browser.
    }
  }

  const isRunning = status === 'connecting' || status === 'connected'
  const canStart = channelLogins.length > 0 && keywords.length > 0

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 overflow-visible px-3 md:gap-5 md:px-6 lg:h-full lg:min-h-0 lg:overflow-hidden">
      <header className="surface-shadow flex flex-col gap-3 rounded-2xl border border-white/40 bg-card/85 p-3 backdrop-blur-xl dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-primary shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TWITCH_ICON || '/placeholder.svg'} alt="" className="size-6 brightness-0 invert" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-balance">
              NextWorld2 Chat Figyelő
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Az összes élő NextWorld2 csatorna chatje egyszerre
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={theme === 'dark' ? 'Világos mód bekapcsolása' : 'Sötét mód bekapcsolása'}
            title={theme === 'dark' ? 'Világos mód' : 'Sötét mód'}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
          <StatusPill status={status} joined={joined} total={channelLogins.length} />
        </div>
      </header>

      {/* ArmaGedonSx — prominent, always visible */}
      <ArmaAlerts hits={armaHits} onClear={() => setArmaHits([])} onOpenChat={setChatChannel} />

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(20rem,23rem)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-5">
        {/* Control panel */}
        <div className="surface-shadow flex flex-col gap-4 rounded-3xl border border-white/50 bg-card p-4 dark:border-white/10 sm:p-5 lg:min-h-0 lg:overflow-y-auto">
          <ChannelSource
            category={data?.category}
            channels={liveChannels}
            isLoading={isLoading}
            isValidating={isValidating}
            error={channelsError ? true : data?.error}
            onRefresh={() => mutate()}
            onOpenChat={setChatChannel}
          />

          <TagInput
            label="Kulcsszavak"
            placeholder="pl. isi, drop, kód"
            values={keywords}
            onChange={setKeywords}
            accent="accent"
          />

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <ToggleRow
              icon={
                permission === 'granted' ? (
                  <Bell className="size-4" />
                ) : (
                  <BellOff className="size-4" />
                )
              }
              label="Böngésző értesítések"
              description={
                permission === 'denied'
                  ? 'Letiltva a böngészőben'
                  : permission === 'granted'
                    ? 'Engedélyezve'
                    : 'Kattints az engedélyezéshez'
              }
              active={notify && permission === 'granted'}
              onClick={() => {
                if (permission === 'granted') {
                  setNotify((v) => !v)
                } else {
                  requestPermission()
                }
              }}
              disabled={permission === 'denied'}
            />
            <ToggleRow
              icon={
                sound ? (
                  <Volume2 className="size-4" />
                ) : (
                  <VolumeX className="size-4" />
                )
              }
              label="Hangjelzés"
              description={sound ? 'Bekapcsolva' : 'Kikapcsolva'}
              active={sound}
              onClick={() => setSound((v) => !v)}
            />
            <ToggleRow
              icon={<MessageCircle className="size-4" />}
              label="Automatikus válasz ismétlődésre"
              description={autoRepeatReply ? 'Bekapcsolva · az ismételt üzenetet küldi' : 'Kikapcsolva'}
              active={autoRepeatReply}
              onClick={() => setAutoRepeatReply((v) => !v)}
            />
          </div>

          {autoReplyStatus && (
            <p className="text-xs text-muted-foreground" role="status">{autoReplyStatus}</p>
          )}

          {isRunning ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Square className="size-4 fill-current" />
              Figyelés leállítása
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="size-4 fill-current" />
              Figyelés indítása
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Vizsgált üzenet" value={scanned} />
            <Stat label="Találat" value={hits.length} accent />
          </div>
        </div>

        {/* Log */}
        <HitLog hits={hits} onClear={() => setHits([])} onOpenChat={setChatChannel} />
      </div>
      {chatChannel && <ChatComposer channel={chatChannel} onClose={() => setChatChannel(null)} />}
    </div>
  )
}

function ChatComposer({ channel, onClose }: { channel: string; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function send() {
    if (!message.trim() || state === 'sending') return
    setState('sending'); setError(''); setAuthRequired(false)
    try {
      const response = await fetch('/api/twitch/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, message }) })
      const data = (await response.json()) as { error?: string; authRequired?: boolean }
      if (!response.ok) { setError(data.error || 'Nem sikerült elküldeni.'); setAuthRequired(Boolean(data.authRequired)); setState('error'); return }
      setMessage(''); setState('success')
    } catch { setError('Hálózati hiba történt.'); setState('error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="chat-composer-title" className="safe-bottom surface-shadow w-full max-w-md rounded-t-3xl border border-border bg-popover p-5 sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div><h2 id="chat-composer-title" className="text-lg font-semibold tracking-tight">Üzenet küldése</h2><p className="mt-1 text-sm text-muted-foreground">Célchat: <span className="font-mono font-semibold text-primary">#{channel}</span></p></div>
          <button type="button" onClick={onClose} aria-label="Bezárás" className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="chat-message" className="sr-only">Chatüzenet</label>
          <input id="chat-message" ref={inputRef} value={message} onChange={(event) => { setMessage(event.target.value); if (state !== 'idle') setState('idle') }} placeholder="Kulcsszó vagy saját üzenet" maxLength={500} className="min-h-11 min-w-0 flex-1 rounded-2xl border border-input bg-input/60 px-4 py-2 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" disabled={!message.trim() || state === 'sending'} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-4" /> Küldés</button>
        </form>
        {state === 'sending' && <p className="mt-3 text-sm text-muted-foreground">Küldés…</p>}
        {state === 'success' && <p className="mt-3 text-sm text-accent" role="status">Üzenet elküldve.</p>}
        {state === 'error' && <div className="mt-3 space-y-2 text-sm text-destructive" role="alert"><p>{error}</p>{authRequired && <a href="/api/twitch/auth/start?returnTo=/" className="inline-block underline underline-offset-2">Twitch engedélyezése</a>}</div>}
        <p className="mt-3 text-xs text-muted-foreground">A küldéshez Twitch OAuth engedély kell, és csak a Küldés gomb megnyomásakor történik API-hívás.</p>
      </div>
    </div>
  )
}

function ChannelSource({
  category,
  channels,
  isLoading,
  isValidating,
  error,
  onRefresh,
  onOpenChat,
}: {
  category?: string
  channels: Channel[]
  isLoading: boolean
  isValidating: boolean
  error?: boolean | string
  onRefresh: () => void
  onOpenChat: (channel: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="live-channel-list"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
          <Users className="size-4 shrink-0 text-primary" />
          <span>Élő csatornák</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
            {channels.length}
          </span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw
            className={`size-3.5 ${isValidating ? 'animate-spin' : ''}`}
          />
          Frissítés
        </button>
      </div>

      {open && <div id="live-channel-list" className="rounded-2xl bg-input/60 p-2">
        {isLoading ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            NextWorld2 csatornák betöltése…
          </p>
        ) : error ? (
          <p className="px-1 py-2 text-xs text-destructive">
            {typeof error === 'string'
              ? error
              : 'Nem sikerült betölteni a csatornákat.'}
          </p>
        ) : channels.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Jelenleg senki sem streamel a{' '}
            <span className="font-semibold">{category ?? 'NextWorld2'}</span>{' '}
            kategóriában.
          </p>
        ) : (
          <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {channels.map((c) => (
              <li key={c.login}>
                <div className="flex min-h-10 items-center gap-2 rounded-xl px-2 py-1 text-xs transition-colors hover:bg-card">
                  <button type="button" onClick={() => onOpenChat(c.login)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <span className="truncate font-medium">{c.name}</span>
                  </button>
                  <a href={`https://twitch.tv/${c.login}`} target="_blank" rel="noopener noreferrer" aria-label={`${c.name} Twitch-oldalának megnyitása`} className="shrink-0 text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /></a>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    {c.viewers.toLocaleString('hu-HU')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  )
}

function StatusPill({
  status,
  joined,
  total,
}: {
  status: Status
  joined: string[]
  total: number
}) {
  const config: Record<Status, { label: string; dot: string; text: string }> = {
    idle: {
      label: 'Leállítva',
      dot: 'bg-muted-foreground',
      text: 'text-muted-foreground',
    },
    connecting: {
      label: 'Csatlakozás…',
      dot: 'bg-chart-4 animate-pulse',
      text: 'text-chart-4',
    },
    connected: {
      label: `Élő · ${joined.length}/${total} csatorna`,
      dot: 'bg-accent animate-pulse',
      text: 'text-accent',
    },
    error: { label: 'Hiba', dot: 'bg-destructive', text: 'text-destructive' },
  }
  const c = config[status]
  return (
    <div className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-muted px-3.5 py-1.5 text-sm font-medium sm:self-auto">
      {status === 'connected' ? (
        <Radio className={`size-4 ${c.text}`} />
      ) : (
        <span className={`size-2 rounded-full ${c.dot}`} />
      )}
      <span className={c.text}>{c.label}</span>
    </div>
  )
}

function ToggleRow({
  icon,
  label,
  description,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  description: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-input/60 px-3.5 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center gap-2.5">
        <span className={active ? 'text-primary' : 'text-muted-foreground'}>
          {icon}
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </span>
      </span>
      <span
        className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          active ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`size-5 rounded-full bg-white shadow-sm transition-transform ${
            active ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-input/60 px-3.5 py-3">
      <div
        className={`font-mono text-2xl font-bold tabular-nums ${
          accent ? 'text-accent' : 'text-foreground'
        }`}
      >
        {value.toLocaleString('hu-HU')}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
