'use client'

// P2d-4 Task 7: DispatchSidebar — de-phase-context Call-Sidebar Composer.
// Komposiert alle 6 Sidebar-Widgets aus bestehenden Prop-basierten Komponenten.
// Phasen-Kontext wird NICHT genutzt — alle Daten kommen direkt als Props.

import GespraechsleitfadenTimer from '../GespraechsleitfadenTimer'
import KundenMatchCard from '../_sidebar/KundenMatchCard'
import RueckrufTerminPanel from '../RueckrufTerminPanel'
import TerminListeClient from '@/components/termine/TerminListeClient'
import { DispatchGespraechshilfe } from './DispatchGespraechshilfe'
import { DispatchEinwandKarten } from './DispatchEinwandKarten'
import { ChevronDownIcon, UserCheckIcon, PhoneIcon, CalendarIcon } from 'lucide-react'

type LeadRow = Record<string, unknown> & { id: string }

export function DispatchSidebar({
  lead,
  leadId,
  values,
}: {
  lead: LeadRow
  leadId: string
  values: Record<string, unknown>
}) {
  return (
    <div className="space-y-3">
      {/* 1. Timer — immer sichtbar */}
      <GespraechsleitfadenTimer
        leadId={leadId}
        gestartetAm={(lead.gespraech_gestartet_am as string | null) ?? null}
        beendetAm={(lead.gespraech_beendet_am as string | null) ?? null}
        dauerSekunden={(lead.gespraech_dauer_sekunden as number | null) ?? null}
      />

      {/* 2. Gesprächshilfe — verwaltet eigene open/collapsed <details>-Panels */}
      <DispatchGespraechshilfe values={values} />

      {/* 3. Einwände — ist selbst ein <details> */}
      <DispatchEinwandKarten />

      {/* 4. Bestehender Kunde? — collapsed <details> */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3 group">
        <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
          <UserCheckIcon className="w-4 h-4 text-claimondo-ondo" />
          <span>Bestehender Kunde?</span>
          <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2">
          <KundenMatchCard
            leadId={leadId}
            initialMatchedKundeId={(lead.kunde_id as string | null) ?? null}
          />
        </div>
      </details>

      {/* 5. Rückruf / Anruf-Historie — collapsed <details> */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3 group">
        <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
          <PhoneIcon className="w-4 h-4 text-claimondo-ondo" />
          <span>Rückruf / Anruf-Historie</span>
          <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2">
          <RueckrufTerminPanel
            leadId={leadId}
            initial={{
              anrufVersuche: (lead.anruf_versuche as number | null) ?? 0,
              letzterAnrufAm: (lead.letzter_anruf_am as string | null) ?? null,
              letzterAnrufStatus: (lead.letzter_anruf_status as string | null) ?? null,
            }}
          />
        </div>
      </details>

      {/* 6. Termine zum Lead — collapsed <details> */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3 group">
        <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
          <CalendarIcon className="w-4 h-4 text-claimondo-ondo" />
          <span>Termine zum Lead</span>
          <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2">
          <TerminListeClient
            leadId={leadId}
            variant="compact"
            title="Termine zum Lead"
            dispatchLinks
            limit={8}
          />
        </div>
      </details>
    </div>
  )
}
