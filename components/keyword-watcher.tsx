'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client } from 'tmi.js'
import {
  Bell,
  BellOff,
  Play,
  Square,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react'
import { TagInput } from '@/components/tag-input'
import { HitLog, type Hit } from '@/components/hit-log'

type Status = 'idle' | 'connecting' | 'connected' | 'error'

const STORAGE_KEY = 'twitch-watcher-settings'
const MAX_HITS = 200

const TWITCH_ICON =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239146ff"%3E%3Cpath d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/%3E%3C/svg%3E'

export function KeywordWatcher() {
  const [channels, setChannels] = useState<string[]>([
    'streamer1',
    'streamer2',
  ])
  const [keywords, setKeywords] = useState<string[]>(['drop', 'kód', 'nyeremény'])
  const [status, setStatus] = useState<Status>('idle')
  const [joined, setJoined] = useState<string[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [scanned, setScanned] = useState(0)
  const [notify, setNotify] = useState(false)
  const [sound, setSound] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [hydrated, setHydrated] = useState(false)

  const clientRef = useRef<Client | null>(null)
  const keywordsRef = useRef(keywords)
  const soundRef = useRef(sound)
  const notifyRef = useRef(notify)
  const audioCtxRef = useRef<AudioContext | null>(null)

  keywordsRef.current = keywords
  soundRef.current = sound
  notifyRef.current = notify

  // Load persisted settings once on mount.
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
      setNotify(Notification.permission === 'granted')
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.channels)) setChannels(parsed.channels)
        if (Array.isArray(parsed.keywords)) setKeywords(parsed.keywords)
        if (typeof parsed.sound === 'boolean') setSound(parsed.sound)
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ channels, keywords, sound }),
    )
  }, [hydrated, channels, keywords, sound])

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect().catch(() => {})
    }
  }, [])

  const playBeep = useCallback(() => {
    if (!soundRef.current) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.09)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // audio not available
    }
  }, [])

  async function requestPermission() {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    setNotify(result === 'granted')
  }

  async function start() {
    if (channels.length === 0 || keywords.length === 0) return
    // Prime the audio context on user gesture so beeps work later.
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)()
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
      channels: [...channels],
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

    client.on('message', (channel, tags, message, self) => {
      if (self) return
      setScanned((n) => n + 1)
      const lower = message.toLowerCase()
      const matched = keywordsRef.current.filter((kw) => lower.includes(kw))
      if (matched.length === 0) return

      const user = tags['display-name'] || tags.username || 'ismeretlen'
      const cleanChannel = channel.replace('#', '')

      setHits((prev) =>
        [
          {
            id: `${tags.id || Date.now()}-${Math.random()}`,
            channel: cleanChannel,
            user,
            color: tags.color || undefined,
            message,
            keywords: matched,
            time: Date.now(),
          },
          ...prev,
        ].slice(0, MAX_HITS),
      )

      playBeep()

      if (notifyRef.current && Notification.permission === 'granted') {
        new Notification(`Találat: #${cleanChannel}`, {
          body: `${user}: ${message}`,
          icon: TWITCH_ICON,
          tag: cleanChannel,
        })
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
  }

  const isRunning = status === 'connecting' || status === 'connected'

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TWITCH_ICON} alt="" className="size-8" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-balance">
              Twitch Kulcsszó Figyelő
            </h1>
            <p className="text-sm text-muted-foreground">
              Több csatorna chatje egyszerre, azonnali riasztással
            </p>
          </div>
        </div>
        <StatusPill status={status} joined={joined} total={channels.length} />
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Control panel */}
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
          <TagInput
            label="Csatornák"
            placeholder="pl. pokimane, xqc"
            values={channels}
            onChange={setChannels}
            disabled={isRunning}
            accent="primary"
          />
          <TagInput
            label="Kulcsszavak"
            placeholder="pl. drop, kód, nyeremény"
            values={keywords}
            onChange={setKeywords}
            accent="accent"
          />

          <div className="flex flex-col gap-3 border-t border-border pt-4">
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
          </div>

          {isRunning ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Square className="size-4 fill-current" />
              Figyelés leállítása
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={channels.length === 0 || keywords.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
        <HitLog hits={hits} onClear={() => setHits([])} />
      </div>
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
    idle: { label: 'Leállítva', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
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
    <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium sm:self-auto">
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
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-input/30 px-3 py-2.5 text-left transition-colors hover:bg-input/50 disabled:cursor-not-allowed disabled:opacity-50"
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
        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          active ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`size-4 rounded-full bg-white transition-transform ${
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
    <div className="rounded-lg border border-border bg-input/30 px-3 py-2.5">
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
