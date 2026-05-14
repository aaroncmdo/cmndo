'use client'

import Link from 'next/link'
import type { TriageLeadPin } from '@/lib/dispatch/karte/types'

function alterInTagen(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function alterLabel(createdAt: string): string {
  const tage = alterInTagen(createdAt)
  if (tage === 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `${tage} Tage alt`
  if (tage < 30) return `${Math.floor(tage / 7)} Wochen alt`
  return `${Math.floor(tage / 30)} Monate alt`
}

function leadName(pin: TriageLeadPin): string {
  if (pin.firma_name) return pin.firma_name
  const parts = [pin.vorname, pin.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unbekannt'
}

export default function LeadPopup({ pin }: { pin: TriageLeadPin }) {
  return (
    <div className="min-w-[220px] text-claimondo-navy">
      <div className="text-sm font-semibold">{leadName(pin)}</div>
      <div className="mt-1 text-xs text-claimondo-navy/70">
        {pin.schadentyp ?? 'Schadenstyp unbekannt'}
        {' · '}
        {pin.plz ?? '?'} {pin.ort ?? ''}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-claimondo-shield">
        {alterLabel(pin.created_at)}
      </div>
      <Link
        href={`/dispatch/leads/${pin.id}`}
        className="mt-3 inline-block rounded-ios-sm bg-claimondo-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-claimondo-navy/90"
      >
        Details öffnen
      </Link>
    </div>
  )
}
