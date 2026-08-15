'use client'

import { ExternalLink, Radar, Trash2 } from 'lucide-react'

export type Hit = {
  id: string
  channel: string
  user: string
  color?: string
  message: string
  keywords: string[]
  time: number
  channels?: string[]
  kind?: 'keyword' | 'repeat'
}

type HitLogProps = {
  hits: Hit[]
  onClear: () => void
  onOpenChat: (channel: string) => void
}

function highlight(message: string, keywords: string[]) {
  if (keywords.length === 0) return message
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = message.split(regex)
  return parts.map((part, i) =>
    escaped.some((k) => new RegExp(`^${k}$`, 'i').test(part)) ? (
      <mark
        key={i}
        className="rounded bg-accent/25 px-1 font-semibold text-accent"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function HitLog({ hits, onClear, onOpenChat }: HitLogProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Radar className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Találatok</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {hits.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={hits.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
          Ürítés
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {hits.length === 0 ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Radar className="size-8 opacity-40" />
            <p className="max-w-xs text-balance text-sm">
              Még nincs találat. Indítsd el a figyelést, és itt jelennek meg a
              kulcsszavakat tartalmazó üzenetek.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1">
            {hits.map((hit) => (
              <li
                key={hit.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenChat(hit.channel)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpenChat(hit.channel)
                }}
                className="cursor-pointer rounded-lg border border-transparent px-3 py-2 font-mono text-sm leading-relaxed transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {formatTime(hit.time)}
                  </span>
                  {hit.kind === 'repeat' && (
                    <span className="rounded bg-chart-4/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-chart-4">
                      Ismétlődő üzenet
                    </span>
                  )}
                  {(hit.channels ?? [hit.channel]).map((channel) => (
                    <span key={channel} className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      <button type="button" onClick={(event) => { event.stopPropagation(); onOpenChat(channel) }} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" title={`${channel} chatjének megnyitása`}>#{channel}</button>
                      <a href={`https://twitch.tv/${channel}`} target="_blank" rel="noopener noreferrer" aria-label={`${channel} Twitch-oldalának megnyitása`} onClick={(event) => event.stopPropagation()} className="text-primary/70 hover:text-primary"><ExternalLink className="size-3" /></a>
                    </span>
                  ))}
                  <span
                    className="font-semibold"
                    style={hit.color ? { color: hit.color } : undefined}
                  >
                    {hit.user}
                  </span>
                </div>
                <p className="mt-0.5 break-words text-foreground/90">
                  {highlight(hit.message, hit.keywords)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
