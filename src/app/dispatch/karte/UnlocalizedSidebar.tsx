'use client'

import Link from 'next/link'
import type { UnlocalizedLead } from '@/lib/dispatch/karte/types'

function leadName(lead: UnlocalizedLead): string {
  if (lead.firma_name) return lead.firma_name
  const parts = [lead.vorname, lead.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unbekannt'
}

export default function UnlocalizedSidebar({ leads }: { leads: UnlocalizedLead[] }) {
  if (leads.length === 0) return null
  return (
    <div className="glass-light absolute right-3 top-3 z-10 max-h-[60vh] w-72 overflow-y-auto rounded-ios-md p-3 shadow-ios-md">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-claimondo-shield">
        Nicht lokalisierbar ({leads.length})
      </div>
      <ul className="space-y-1.5">
        {leads.map((lead) => (
          <li key={lead.id}>
            <Link
              href={`/dispatch/leads/${lead.id}`}
              className="block rounded-ios-sm px-2 py-1.5 text-sm text-claimondo-navy hover:bg-claimondo-bg"
            >
              <div className="font-medium">{leadName(lead)}</div>
              <div className="text-xs text-claimondo-navy/60">
                {lead.schadentyp ?? '—'} · PLZ {lead.plz ?? '?'}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
