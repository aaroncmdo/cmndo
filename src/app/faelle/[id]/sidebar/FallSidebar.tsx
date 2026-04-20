'use client'

// AAR-162 / W2: Fallakte-Sidebar (340px, sticky).
// Zeigt Kurzinfo + Flags + Ansprechpartner. Die Stubs QuickActions + SlaAlerts
// sind Platzhalter für W4 (Prozess-Triggers) bzw. einen künftigen Timer-Service.
// Der alte Monolith-Aside hatte mehr Funktionalität — die wichtigen Teile
// (Finanzen, Pflichtdokumente-Status) leben dort weiterhin und werden beim
// Monolith-Retirement (W3+) extrahiert.

import { PhoneIcon, MailIcon, UserIcon, HardHatIcon, BriefcaseIcon } from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import Link from 'next/link'
import { useFall } from '../FallContext'
import QuickActions from './QuickActions'
import SlaAlerts from './SlaAlerts'
import FallRueckrufSection from './FallRueckrufSection'

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
    <aside className="w-full lg:w-[340px] shrink-0 bg-[#f8f9fb] border-l border-gray-200 overflow-y-auto p-4 space-y-3">
      {/* Quick Actions (phase-abhängig) */}
      <QuickActions />

      {/* SLA-Alerts (Countdown-Timer) */}
      <SlaAlerts />

      {/* Rückruf (AAR-637) */}
      <FallRueckrufSection fallId={fall.id} />

      {/* Kunde Kurzinfo */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <UserIcon className="w-3.5 h-3.5 text-gray-400" /> Kunde
        </div>
        <p className="text-sm font-medium text-gray-900">
          {[lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || '—'}
        </p>
        {lead?.telefon && (
          <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} className="text-[11px]" />
        )}
        {lead?.email && (
          <a href={`mailto:${lead.email}`} className="text-[11px] text-[#4573A2] hover:underline flex items-center gap-1 truncate">
            <MailIcon className="w-3 h-3" /> {lead.email}
          </a>
        )}
      </div>

      {/* Fahrzeug Kurzinfo */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-1">
        <p className="text-[9px] font-semibold text-gray-500 uppercase">Fahrzeug</p>
        <p className="text-sm font-medium text-gray-900">
          {[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || '—'}
        </p>
        <p className="text-[10px] text-gray-500">
          {(fall.kennzeichen as string | null) ?? '—'}
        </p>
      </div>

      {/* Ansprechpartner */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-[9px] font-semibold text-gray-500 uppercase">Ansprechpartner</p>
        {kundenbetreuer && (
          <div className="flex items-start gap-2 text-[11px]">
            <BriefcaseIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-gray-700">
                {[kundenbetreuer.vorname, kundenbetreuer.nachname].filter(Boolean).join(' ')}
              </p>
              <p className="text-gray-400 text-[10px]">KB</p>
            </div>
          </div>
        )}
        {sv?.profile && (
          <Link
            href={`/admin/sachverstaendige/${sv.id}`}
            className="flex items-start gap-2 text-[11px] hover:bg-gray-50 -m-1 p-1 rounded"
          >
            <HardHatIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-gray-700">
                {[sv.profile.vorname, sv.profile.nachname].filter(Boolean).join(' ')}
              </p>
              <p className="text-gray-400 text-[10px]">SV · {sv.paket}</p>
            </div>
          </Link>
        )}
        {!kundenbetreuer && !sv?.profile && (
          <p className="text-[10px] text-gray-400 italic">Noch keine Ansprechpartner zugewiesen</p>
        )}
      </div>
    </aside>
  )
}
