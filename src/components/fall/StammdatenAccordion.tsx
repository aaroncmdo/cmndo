'use client'

// CMM-32: Stammdaten-Block — links Fahrzeug-Panel, rechts Tabs (Historie /
// Dokumente / Kunde / Gegner / Schaden). Ein einziger Card-Block mit
// vertikalem Trenner zwischen den beiden Hälften.

import { useState } from 'react'
import {
  ClockIcon,
  FileTextIcon,
  UserIcon,
  ShieldIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'lucide-react'
import FahrzeugRenderImage from '@/components/fahrzeug/FahrzeugRenderImage'
import { LACKFARBE_LABEL, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
import StammdatenDetail from './StammdatenDetail'

export type StammdatenCategory =
  | 'fahrzeug'
  | 'historie'
  | 'dokumente'
  | 'kunde'
  | 'gegner'
  | 'schaden'

export type StammdatenAccordionData = {
  fall: Record<string, unknown>
  lead: {
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
    hat_vorschaeden?: boolean | null
  } | null
  parteien?: Array<Record<string, unknown>>
  /** Anzahl Dokumente am Fall — wird in der Tab-Summary gezeigt. */
  dokumenteAnzahl?: number
}

type TabKey = Exclude<StammdatenCategory, 'fahrzeug'>

const TABS: { key: TabKey; label: string }[] = [
  { key: 'historie',  label: 'Historie'  },
  { key: 'dokumente', label: 'Dokumente' },
  { key: 'kunde',     label: 'Kunde'     },
  { key: 'gegner',    label: 'Gegner'    },
  { key: 'schaden',   label: 'Schaden'   },
]

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

type Props = {
  data: StammdatenAccordionData
  /** Optionaler Slot für den Dokumente-Tab (WeitereDokumenteCard o. ä.) */
  dokumenteSlot?: React.ReactNode
  className?: string
}

export default function StammdatenAccordion({
  data,
  dokumenteSlot,
  className = '',
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('historie')

  const { fall } = data
  const hersteller = str(fall.fahrzeug_hersteller)
  const modell     = str(fall.fahrzeug_modell)
  const lack       = (str(fall.lackfarbe_code) as LackfarbeCode | null) ?? null
  const kennzeichen = str(fall.kennzeichen)
  const baujahr    = str(fall.fahrzeug_baujahr)
  const fin        = str(fall.fin_vin)
  const fahrbereit =
    fall.fahrzeug_fahrbereit === true
      ? true
      : fall.fahrzeug_fahrbereit === false
        ? false
        : null

  const hasFahrzeugDetails = baujahr || fin || fahrbereit !== null

  return (
    <div
      className={`w-full rounded-2xl bg-white border border-claimondo-border overflow-hidden ${className}`}
    >
      <div className="flex flex-col sm:flex-row min-h-0">

        {/* ── Links: Fahrzeug-Panel ── */}
        <div className="sm:w-[300px] shrink-0 flex flex-col items-center gap-4 px-6 py-6 border-b sm:border-b-0 sm:border-r border-claimondo-border/60 bg-claimondo-navy/[0.025]">
          <FahrzeugRenderImage
            hersteller={hersteller}
            modell={modell}
            lackfarbe={lack}
            width={260}
          />

          {/* Modell + Kennzeichen + Farbe */}
          <div className="w-full text-center space-y-2">
            {(hersteller || modell) && (
              <p className="text-base font-semibold text-claimondo-navy leading-snug">
                {[hersteller, modell].filter(Boolean).join(' ')}
              </p>
            )}
            {kennzeichen && (
              <div className="flex justify-center">
                <span className="inline-flex items-center rounded-md border-2 border-claimondo-navy bg-white px-2.5 py-1 font-mono text-sm tracking-wide text-claimondo-navy">
                  {kennzeichen}
                </span>
              </div>
            )}
            {lack && (
              <p className="text-sm text-claimondo-ondo">{LACKFARBE_LABEL[lack]}</p>
            )}
          </div>

          {/* Baujahr · FIN · Fahrbereit */}
          {hasFahrzeugDetails && (
            <div className="w-full space-y-2.5 pt-4 border-t border-claimondo-border/50">
              {baujahr && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70 shrink-0">
                    Baujahr
                  </span>
                  <span className="text-sm font-medium text-claimondo-navy">{baujahr}</span>
                </div>
              )}
              {fin && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70 shrink-0">
                    FIN
                  </span>
                  <span className="text-xs font-mono text-claimondo-navy truncate">{fin}</span>
                </div>
              )}
              {fahrbereit !== null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70 shrink-0">
                    Fahrbereit
                  </span>
                  {fahrbereit ? (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                      <CheckCircle2Icon className="w-3.5 h-3.5" /> Ja
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-rose-700">
                      <XCircleIcon className="w-3.5 h-3.5" /> Nein
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Rechts: Tabs + Detail ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Tab-Leiste */}
          <div className="flex border-b border-claimondo-border/60 overflow-x-auto">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-5 py-4 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0 ${
                  activeTab === key
                    ? 'border-claimondo-navy text-claimondo-navy'
                    : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab-Inhalt */}
          <div className="flex-1 min-h-0">
            <StammdatenDetail
              category={activeTab}
              data={data}
              onClose={() => {}}
              dokumenteSlot={dokumenteSlot}
              inline
            />
          </div>
        </div>

      </div>
    </div>
  )
}
