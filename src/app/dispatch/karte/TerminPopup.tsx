'use client'

import Link from 'next/link'
import type { TerminPin } from '@/lib/dispatch/karte/types'

function statusLabel(status: string): string {
  switch (status) {
    case 'vorgeschlagen':
      return 'Vorgeschlagen'
    case 'bestaetigt':
      return 'Bestätigt'
    case 'sv_unterwegs':
      return 'SV unterwegs'
    case 'sv_angekommen':
      return 'SV vor Ort'
    case 'abgeschlossen':
      return 'Abgeschlossen'
    case 'abgesagt':
      return 'Abgesagt'
    case 'no_show':
      return 'No-Show'
    default:
      return status
  }
}

function uhrzeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export default function TerminPopup({ pin }: { pin: TerminPin }) {
  const detailHref = pin.fall_id
    ? `/admin/faelle/${pin.fall_id}`
    : pin.lead_id
      ? `/dispatch/leads/${pin.lead_id}`
      : null

  return (
    <div className="min-w-[220px] text-claimondo-navy">
      <div className="text-sm font-semibold">
        {uhrzeit(pin.start_zeit)} · {pin.kunde_name ?? 'Termin'}
      </div>
      <div className="mt-1 text-xs text-claimondo-navy/70">
        {pin.fall_nummer ?? '—'}
        {pin.sv_initialen ? ` · SV ${pin.sv_initialen}` : null}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-claimondo-shield">
        {statusLabel(pin.status)}
      </div>
      {detailHref ? (
        <Link
          href={detailHref}
          className="mt-3 inline-block rounded-ios-sm bg-claimondo-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-claimondo-navy/90"
        >
          Fall öffnen
        </Link>
      ) : null}
    </div>
  )
}
