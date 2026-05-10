// AAR-843: Einzel-Event-Card in der TimelineView

import { getEventDisplay, eventLabel, KATEGORIE_LABEL, type TimelineEventKategorie } from '../timeline-event-mappings'
import type { ClaimTimelineEvent } from '@/lib/claims/timeline-queries'

type Props = {
  event: ClaimTimelineEvent
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde'
  showKategorieBadge?: boolean
}

const TONE_BG: Record<string, string> = {
  neutral: 'bg-claimondo-bg',
  info:    'bg-claimondo-light-blue/15',
  success: 'bg-emerald-50',
  warning: 'bg-amber-50',
  danger:  'bg-rose-50',
  brand:   'bg-claimondo-navy/10',
  ondo:    'bg-claimondo-ondo/15',
}

const TONE_TEXT: Record<string, string> = {
  neutral: 'text-claimondo-light-blue',
  info:    'text-claimondo-ondo',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger:  'text-rose-700',
  brand:   'text-claimondo-navy',
  ondo:    'text-claimondo-ondo',
}

function formatRelativeOrDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs   = now.getTime() - d.getTime()
  const diffMin  = Math.floor(diffMs / 60000)
  const diffH    = Math.floor(diffMs / 3600000)
  const diffD    = Math.floor(diffMs / 86400000)

  if (diffMin < 1)  return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min`
  if (diffH < 24)   return `vor ${diffH} Std`
  if (diffD < 7)    return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`

  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
}

export function TimelineEventCard({ event, viewerRole, showKategorieBadge = false }: Props) {
  const display = getEventDisplay(event.event_typ)
  const Icon    = display.icon
  const label   = eventLabel(event.event_typ, event.payload_jsonb, viewerRole)

  return (
    <div className="flex gap-3 py-3 border-b border-[#E2E8F3] last:border-0">
      <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${TONE_BG[display.tone] ?? TONE_BG.neutral}`}>
        <Icon className={`w-4 h-4 ${TONE_TEXT[display.tone] ?? TONE_TEXT.neutral}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-claimondo-navy">{label}</span>
          {showKategorieBadge && (
            <span className="text-[10px] uppercase tracking-wide text-claimondo-light-blue">
              {KATEGORIE_LABEL[display.kategorie as TimelineEventKategorie] ?? display.kategorie}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-claimondo-light-blue mt-0.5">
          <span>{formatRelativeOrDate(event.event_at)}</span>
          {event.actor_rolle && event.actor_rolle !== 'system' && (
            <>
              <span>·</span>
              <span className="capitalize">{event.actor_rolle}</span>
            </>
          )}
        </div>
        {event.detail_url_path && (
          <a
            href={event.detail_url_path}
            className="inline-block mt-1 text-xs text-claimondo-ondo hover:underline"
          >
            Details ansehen →
          </a>
        )}
      </div>
    </div>
  )
}
