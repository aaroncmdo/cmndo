'use client'

// AAR-162 / W2: Fallakte-Sidebar (340px, sticky).
// Zeigt Kurzinfo + Flags + Ansprechpartner. Die Stubs QuickActions + SlaAlerts
// sind Platzhalter für W4 (Prozess-Triggers) bzw. einen künftigen Timer-Service.
// Der alte Monolith-Aside hatte mehr Funktionalität — die wichtigen Teile
// (Finanzen, Pflichtdokumente-Status) leben dort weiterhin und werden beim
// Monolith-Retirement (W3+) extrahiert.

import { MailIcon, UserIcon } from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import { useFall } from '../FallContext'
import QuickActions from './QuickActions'
import FallRueckrufSection from './FallRueckrufSection'
import EskalationCard from './EskalationCard'
import TerminListeClient from '@/components/termine/TerminListeClient'
// AAR-754 (Phase C): Shared FallKontakteCard statt handgerollter
// Ansprechpartner-Block.
import { FallKontakteCard } from '@/components/shared/fall-kontakte'

type Kontakt = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

type SvDaten = {
  id: string
  paket: string
  profile: {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null
} | null

export default function FallSidebar({
  kundenbetreuer,
  sv,
}: {
  kundenbetreuer: Kontakt
  sv: SvDaten
}) {
  const { fall, lead } = useFall()

  return (
    <aside className="w-full lg:w-[340px] shrink-0 bg-claimondo-bg border-l border-claimondo-border overflow-y-auto p-4 space-y-3">
      {/* Quick Actions (phase-abhängig) */}
      <QuickActions />

      {/* Eskalation an Admin (Hartfall) */}
      <EskalationCard
        fallId={fall.id}
        initialAdminId={(fall.eskaliert_an_admin_id as string | null) ?? null}
        initialAdminName={null}
      />

      {/* Rückruf (AAR-637) */}
      <FallRueckrufSection fallId={fall.id} />

      {/* Termine (AAR-643): alle admin_termine + gutachter_termine zum Fall */}
      <TerminListeClient
        fallId={fall.id}
        leadId={lead?.id ?? undefined}
        variant="compact"
        limit={10}
      />

      {/* Kunde Kurzinfo */}
      <div className="bg-white rounded-xl border border-claimondo-border p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-claimondo-navy">
          <UserIcon className="w-3.5 h-3.5 text-claimondo-ondo/70" /> Kunde
        </div>
        <p className="text-sm font-medium text-claimondo-navy">
          {[lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || '—'}
        </p>
        {lead?.telefon && (
          <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} className="text-[11px]" />
        )}
        {lead?.email && (
          <a href={`mailto:${lead.email}`} className="text-[11px] text-claimondo-ondo hover:underline flex items-center gap-1 truncate">
            <MailIcon className="w-3 h-3" /> {lead.email}
          </a>
        )}
      </div>

      {/* Fahrzeug Kurzinfo */}
      <div className="bg-white rounded-xl border border-claimondo-border p-3 space-y-1">
        <p className="text-[9px] font-semibold text-claimondo-ondo uppercase">Fahrzeug</p>
        <p className="text-sm font-medium text-claimondo-navy">
          {[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || '—'}
        </p>
        <p className="text-[10px] text-claimondo-ondo">
          {(fall.kennzeichen as string | null) ?? '—'}
        </p>
      </div>

      {/* Ansprechpartner — AAR-754 via shared FallKontakteCard */}
      <FallKontakteCard
        rolle="admin"
        kundenbetreuer={kundenbetreuer}
        sv={
          sv?.profile
            ? {
                vorname: sv.profile.vorname,
                nachname: sv.profile.nachname,
                email: sv.profile.email,
                telefon: sv.profile.telefon,
                paket: sv.paket,
                detailHref: `/admin/sachverstaendige/${sv.id}`,
              }
            : null
        }
      />
      {!kundenbetreuer && !sv?.profile && (
        <div className="bg-white rounded-ios-md border border-claimondo-border p-3">
          <p className="text-[10px] text-claimondo-ondo italic">
            Noch keine Ansprechpartner zugewiesen
          </p>
        </div>
      )}
    </aside>
  )
}
