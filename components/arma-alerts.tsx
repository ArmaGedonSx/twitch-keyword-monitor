'use client'

import { Zap, ExternalLink, Trash2 } from 'lucide-react'
import type { Hit } from '@/components/hit-log'

type ArmaAlertsProps = {
  hits: Hit[]
  onClear: () => void
  onOpenChat: (channel: string) => void
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ArmaAlerts({ hits, onClear, onOpenChat }: ArmaAlertsProps) {
  return (
    <section className="surface-shadow rounded-3xl border border-chart-5/30 bg-card p-4 sm:p-5">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-chart-5 text-white shadow-sm">
            <Zap className="size-5 fill-current" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug tracking-tight sm:text-base">ArmaGedonSx riasztás</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Lehet, hogy nyertél · {hits.length} riasztás</p>
          </div>
        </div>
        {hits.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-chart-5/15 hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
            Ürítés
          </button>
        )}
      </header>

      {hits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Amint egy streamer chatjében megjelenik az{' '}
          <span className="font-mono font-semibold text-chart-5">
            ArmaGedonSx
          </span>{' '}
          neved (pl. nyertesként kihirdetve), itt villan fel egy kattintható
          riasztás, hogy azonnal a csatornára ugorhass.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {hits.map((hit) => (
            <li key={hit.id}>
              <div role="button" tabIndex={0} onClick={() => onOpenChat(hit.channel)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenChat(hit.channel) }} className="group flex cursor-pointer items-center gap-3 rounded-2xl bg-chart-5/8 px-3 py-3 transition-colors hover:bg-chart-5/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {(hit.channels ?? [hit.channel]).map((channel) => (
                      <span key={channel} className="inline-flex items-center gap-1">
                        <button type="button" onClick={(event) => { event.stopPropagation(); onOpenChat(channel) }} className="font-semibold text-chart-5 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">#{channel}</button>
                        <a href={`https://twitch.tv/${channel}`} target="_blank" rel="noopener noreferrer" aria-label={`${channel} Twitch-oldalának megnyitása`} onClick={(event) => event.stopPropagation()} className="text-chart-5/70 hover:text-chart-5"><ExternalLink className="size-3" /></a>
                      </span>
                    ))}
                    <span
                      className="font-mono text-sm font-semibold"
                      style={hit.color ? { color: hit.color } : undefined}
                    >
                      {hit.user}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground/70">
                      {formatTime(hit.time)}
                    </span>
                  </div>
                  <p className="truncate font-mono text-sm text-foreground/90">
                    {hit.message}
                  </p>
                </div>
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenChat(hit.channel) }} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-chart-5/15 px-3 text-xs font-semibold text-chart-5 transition-colors group-hover:bg-chart-5 group-hover:text-white">Chat <ExternalLink className="size-3.5" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
