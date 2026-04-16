'use client'

// AAR-289: Kompakte Stammdaten-Übersicht für die rechte Spalte. Detail-Edit
// findet weiter im Akte-Drawer / Admin-Portal statt — diese Card ist read-only.
// AAR-311: SV kann Cardentity Typ-B (15€) nach dem Termin manuell triggern
// wenn er bei der Vor-Ort-Besichtigung Vorschadenhinweise gefunden hat.

import { UserIcon, CarIcon, ShieldIcon, MailIcon, PhoneIcon } from 'lucide-react'
import { CardentityTypBButton } from '@/components/cardentity/CardentityTypBButton'
import { requestCardentityTypBForFallSv } from '../cardentity-actions'

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  fin?: string | null
  vorschaden_typ_b_bericht?: Record<string, unknown> | null
  vorschaden_vorhanden?: boolean | null
  vorschaden_anzahl?: number | null
  vorschaden_letzter_datum?: string | null
  cardentity_abfrage_am?: string | null
} | null

type Kundenbetreuer = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

export function StammdatenCard({
  lead,
  fall,
  kundenbetreuer,
}: {
  lead: Lead
  fall: Record<string, unknown>
  kundenbetreuer: Kundenbetreuer
}) {
  const kundenName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
  const kbName = kundenbetreuer
    ? `${kundenbetreuer.vorname ?? ''} ${kundenbetreuer.nachname ?? ''}`.trim()
    : null

  const fahrzeug = [
    fall.fahrzeug_hersteller,
    fall.fahrzeug_modell,
    fall.fahrzeug_baujahr,
  ]
    .filter(Boolean)
    .join(' ')

  const kennzeichen = (fall.kennzeichen as string | null) ?? '—'
  const fin = (fall.fin_vin as string | null) ?? '—'
  const gegnerKz = (fall.gegner_kennzeichen as string | null) ?? '—'
  const gegnerVS = (fall.gegner_versicherung as string | null) ?? '—'
  const ort = (fall.schadens_ort as string | null) ?? '—'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Stammdaten
      </h3>

      {/* Kunde */}
      <div className="flex items-start gap-3">
        <UserIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{kundenName}</p>
          <div className="text-[11px] text-gray-500 space-y-0.5 mt-0.5">
            {lead?.telefon && (
              <p className="flex items-center gap-1">
                <PhoneIcon className="w-3 h-3" />
                <a href={`tel:${lead.telefon}`} className="hover:text-[#4573A2]">
                  {lead.telefon}
                </a>
              </p>
            )}
            {lead?.email && (
              <p className="flex items-center gap-1">
                <MailIcon className="w-3 h-3" />
                <span className="truncate">{lead.email}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Fahrzeug */}
      <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
        <CarIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-xs space-y-2">
          <div>
            <p className="text-gray-900 font-medium">{fahrzeug || '—'}</p>
            <p className="text-gray-500 mt-0.5">
              KZ: <span className="font-mono">{kennzeichen}</span>
              {fin !== '—' && (
                <>
                  {' · '}FIN: <span className="font-mono text-[10px]">{fin}</span>
                </>
              )}
            </p>
            <p className="text-gray-500">Schadensort: {ort}</p>
          </div>
          {/* AAR-311: Cardentity-Typ-B-Trigger (SV kann Vorschaden-Bericht
              nach Termin abrufen wenn Verdacht besteht). */}
          <CardentityTypBButton
            action={() => requestCardentityTypBForFallSv(fall.id as string)}
            finVorhanden={fin !== '—' || !!lead?.fin}
            initial={{
              fetchedAt: lead?.cardentity_abfrage_am ?? null,
              vorschadenVorhanden: lead?.vorschaden_vorhanden ?? null,
              vorschadenAnzahl: lead?.vorschaden_anzahl ?? null,
              letzterVorschadenDatum: lead?.vorschaden_letzter_datum ?? null,
            }}
          />
        </div>
      </div>

      {/* Gegner */}
      <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
        <ShieldIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-xs">
          <p className="text-gray-900">
            Gegner-KZ: <span className="font-mono">{gegnerKz}</span>
          </p>
          <p className="text-gray-500 mt-0.5 truncate">VS: {gegnerVS}</p>
        </div>
      </div>

      {/* KB */}
      {kbName && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <UserIcon className="w-4 h-4 text-[#4573A2] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-gray-500">Kundenbetreuer</p>
            <p className="text-gray-900 font-medium">{kbName}</p>
            <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
              {kundenbetreuer?.telefon && (
                <a
                  href={`tel:${kundenbetreuer.telefon}`}
                  className="flex items-center gap-1 hover:text-[#4573A2]"
                >
                  <PhoneIcon className="w-3 h-3" />
                  {kundenbetreuer.telefon}
                </a>
              )}
              {kundenbetreuer?.email && (
                <a
                  href={`mailto:${kundenbetreuer.email}`}
                  className="flex items-center gap-1 hover:text-[#4573A2]"
                >
                  <MailIcon className="w-3 h-3" />
                  <span className="truncate">{kundenbetreuer.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
