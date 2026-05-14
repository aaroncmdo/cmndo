'use client'

import Link from 'next/link'
import type { SVPin } from '@/lib/dispatch/karte/types'

function svName(pin: SVPin): string {
  if (pin.firmenname) return pin.firmenname
  const parts = [pin.vorname, pin.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Sachverständiger'
}

export default function SVPopup({ pin }: { pin: SVPin }) {
  const sterne = pin.bewertungs_durchschnitt
    ? `★ ${pin.bewertungs_durchschnitt.toFixed(1)} (${pin.bewertungs_anzahl ?? 0})`
    : null

  return (
    <div className="min-w-[240px] text-claimondo-navy">
      <div className="text-sm font-semibold">{svName(pin)}</div>
      <div className="mt-1 text-xs text-claimondo-navy/70">
        {pin.ort ?? 'Standort unbekannt'}
        {pin.paket ? ` · ${pin.paket}` : null}
      </div>
      {sterne ? (
        <div className="mt-1 text-[11px] font-medium text-claimondo-shield">{sterne}</div>
      ) : null}
      {pin.spezifikationen_top3.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {pin.spezifikationen_top3.map((s) => (
            <span
              key={s}
              className="rounded-ios-sm bg-claimondo-bg px-2 py-0.5 text-[10px] font-medium text-claimondo-ondo"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Link
          href={`/dispatch/sachverstaendige/${pin.id}`}
          className="rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-1.5 text-xs font-medium text-claimondo-navy hover:bg-claimondo-border"
        >
          Details
        </Link>
        <Link
          href={`/dispatch/kalender?sv_id=${pin.id}&mode=create`}
          className="rounded-ios-sm bg-claimondo-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-claimondo-navy/90"
        >
          Termin einplanen
        </Link>
      </div>
    </div>
  )
}
