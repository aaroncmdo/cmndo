'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronRightIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import { TerminStatusBadge } from '@/components/shared/TerminStatusBadge'
import { TerminTypBadge } from './TerminTypBadge'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'
import { istPendingTerminStatus } from '@/lib/termine/pending-status'

export type FallInfo = { id: string; claimId: string; claim_nummer: string | null; fahrzeug: string }

// Status, auf denen Verschieben/Absagen erlaubt ist (analog kommend-Filter).
const AKTIONEN_STATUS = new Set(['reserviert', 'bestaetigt', 'gegenvorschlag'])
// Nur ECHTE gutachter_termine-Zeilen sind per termin_id aktionierbar. Nachbesichtigung
// ist ein synthetischer Eintrag (id `${rowId}:nb`, kein eigener DB-Row) -> keine Inline-
// Action (wird ueber den Nachbesichtigung-Flow verwaltet); Beratung ist kein SV-Termin.
const AKTIONIERBARE_TYPEN = new Set(['besichtigung', 'konfrontation'])
// Status mit i18n-Label (statusLabel.*). Unbekannte -> Rohwert (next-intl wirft sonst bei Missing-Key).
const KNOWN_STATUS = new Set(['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgelehnt', 'abgeschlossen', 'angefragt', 'anruf_erbeten'])
// T1/T4: Dead-Pin/noch-kein-SV (dispatch_pending/sv_gesucht) -> dasselbe "wird bestaetigt"-Label
// wie der Stepper-Badge (kunde.fall.stepper), statt Rohwert. Pending-Status = geteilte Quelle.

export function TermineRow({
  termin, fall, href, muted, showActions,
}: {
  termin: KundeTerminEntry
  fall?: FallInfo
  href: string | null
  muted?: boolean
  showActions: boolean
}) {
  const t = useTranslations('kunde.termine')
  const ts = useTranslations('kunde.fall.stepper')
  const format = useFormatter()
  const [busy, setBusy] = useState(false)

  const start = termin.start ? new Date(termin.start) : null
  const statusLabel = termin.status
    ? (istPendingTerminStatus(termin.status)
        ? ts('wirdBestaetigt')
        : (KNOWN_STATUS.has(termin.status) ? t(`statusLabel.${termin.status}`) : termin.status))
    : ''
  const kann = showActions && termin.art === 'sv' && AKTIONIERBARE_TYPEN.has(termin.terminTyp)
    && termin.status != null && AKTIONEN_STATUS.has(termin.status)

  async function post(url: string) {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termin_id: termin.id }),
      })
      if (res.ok) location.reload()
    } finally { setBusy(false) }
  }

  const inner = (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <TerminTypBadge typ={termin.terminTyp} />
          {termin.status && <TerminStatusBadge status={termin.status} label={statusLabel} />}
        </div>
        <p className="text-sm text-claimondo-navy mt-1.5">
          {start
            ? `${format.dateTime(start, { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'Europe/Berlin' })} · ${format.dateTime(start, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`
            : t('card.terminOffen')}
        </p>
        {fall && (
          <p className="text-xs text-claimondo-ondo mt-0.5">
            {t('card.fallPrefix')} {fall.claim_nummer ?? fall.claimId.slice(0, 8)} · {fall.fahrzeug}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {kann && (
            <>
              <button type="button" disabled={busy}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); post('/api/kunde/termin/verschieben') }}
                className="rounded-ios-lg border border-claimondo-border px-2.5 py-1 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-50">
                {t('actions.verschieben')}
              </button>
              <button type="button" disabled={busy}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); post('/api/kunde/termin/absagen') }}
                className="rounded-ios-lg border border-claimondo-border px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
                {t('actions.absagen')}
              </button>
            </>
          )}
          {href && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-claimondo-ondo">{t('card.detailsOeffnen')}<ChevronRightIcon className="w-3.5 h-3.5" /></span>}
        </div>
      </div>
    </div>
  )

  const card = <Card p={4}>{inner}</Card>
  return href ? (
    <Link href={href} className={`block transition hover:opacity-90 ${muted ? 'opacity-80' : ''}`}>{card}</Link>
  ) : (
    <div className={muted ? 'opacity-80' : ''}>{card}</div>
  )
}
