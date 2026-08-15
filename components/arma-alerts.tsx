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
    <section className="rounded-xl border-2 border-chart-5/60 bg-chart-5/10 p-4 shadow-[0_0_0_1px_theme(colors.chart-5/20%)]">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-chart-5/25 text-chart-5">
            <Zap className="size-4 fill-current" />
          </span>
          <h2 className="text-sm font-bold tracking-tight">
            ArmaGedonSx riasztás · lehet, hogy nyertél!
          </h2>
          <span className="rounded-full bg-chart-5/25 px-2 py-0.5 font-mono text-xs font-semibold text-chart-5">
            {hits.length}
          </span>
        </div>
        {hits.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-chart-5/15 hover:text-foreground"
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
              <div role="button" tabIndex={0} onClick={() => onOpenChat(hit.channel)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenChat(hit.channel) }} className="group flex cursor-pointer items-center gap-3 rounded-lg border border-chart-5/40 bg-background/60 px-3 py-3 transition-colors hover:border-chart-5 hover:bg-chart-5/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenChat(hit.channel) }} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-chart-5/20 px-2.5 py-1.5 text-xs font-semibold text-chart-5 transition-colors group-hover:bg-chart-5 group-hover:text-background">Chat megnyitása <ExternalLink className="size-3.5" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
