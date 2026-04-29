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
      className={`rounded-2xl bg-white border border-claimondo-border overflow-hidden ${className}`}
    >
      <div className="flex flex-col sm:flex-row min-h-0">

        {/* ── Links: Fahrzeug-Panel ── */}
        <div className="sm:w-[168px] shrink-0 flex flex-col items-center gap-3 px-4 py-5 border-b sm:border-b-0 sm:border-r border-claimondo-border/60 bg-claimondo-navy/[0.025]">
          <FahrzeugRenderImage
            hersteller={hersteller}
            modell={modell}
            lackfarbe={lack}
            width={136}
          />

          {/* Modell + Kennzeichen + Farbe */}
          <div className="w-full text-center space-y-1.5">
            {(hersteller || modell) && (
              <p className="text-xs font-semibold text-claimondo-navy leading-snug">
                {[hersteller, modell].filter(Boolean).join(' ')}
              </p>
            )}
            {kennzeichen && (
              <div className="flex justify-center">
                <span className="inline-flex items-center rounded-md border-2 border-claimondo-navy bg-white px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-claimondo-navy">
                  {kennzeichen}
                </span>
              </div>
            )}
            {lack && (
              <p className="text-[11px] text-claimondo-ondo">{LACKFARBE_LABEL[lack]}</p>
            )}
          </div>

          {/* Baujahr · FIN · Fahrbereit */}
          {hasFahrzeugDetails && (
            <div className="w-full space-y-1.5 pt-2.5 border-t border-claimondo-border/50">
              {baujahr && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 shrink-0">
                    Baujahr
                  </span>
                  <span className="text-[11px] font-medium text-claimondo-navy">{baujahr}</span>
                </div>
              )}
              {fin && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 shrink-0">
                    FIN
                  </span>
                  <span className="text-[10px] font-mono text-claimondo-navy truncate">{fin}</span>
                </div>
              )}
              {fahrbereit !== null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/60 shrink-0">
                    Fahrbereit
                  </span>
                  {fahrbereit ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700">
                      <CheckCircle2Icon className="w-3 h-3" /> Ja
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-rose-700">
                      <XCircleIcon className="w-3 h-3" /> Nein
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
                className={`px-3 py-2.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px shrink-0 ${
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
