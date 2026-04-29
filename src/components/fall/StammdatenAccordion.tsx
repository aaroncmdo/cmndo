'use client'

// CMM-32: Stammdaten-Accordion — 6 Kategorien, inline aufklappend.
// Klick auf eine Zeile expandiert das Detail direkt darunter (Tab-Stil).
// Der Pfeil verschwindet wenn eine Zeile ausgewählt ist.

import { useState } from 'react'
import {
  CarIcon,
  ClockIcon,
  FileTextIcon,
  UserIcon,
  ShieldIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
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
  /** Anzahl Dokumente am Fall — wird in der Zeilen-Summary gezeigt. */
  dokumenteAnzahl?: number
}

type RowConfig = {
  key: StammdatenCategory
  label: string
  icon: typeof CarIcon
}

const ROWS: RowConfig[] = [
  { key: 'fahrzeug', label: 'Fahrzeug', icon: CarIcon },
  { key: 'historie', label: 'Historie', icon: ClockIcon },
  { key: 'dokumente', label: 'Dokumente', icon: FileTextIcon },
  { key: 'kunde', label: 'Kunde', icon: UserIcon },
  { key: 'gegner', label: 'Gegner', icon: ShieldIcon },
  { key: 'schaden', label: 'Schaden', icon: AlertTriangleIcon },
]

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function buildSummary(
  category: StammdatenCategory,
  data: StammdatenAccordionData,
): string {
  const { fall, lead, parteien, dokumenteAnzahl = 0 } = data
  switch (category) {
    case 'fahrzeug': {
      const hersteller = str(fall.fahrzeug_hersteller)
      const modell = str(fall.fahrzeug_modell)
      const lack = str(fall.lackfarbe_code) as LackfarbeCode | null
      const lackLabel = lack ? LACKFARBE_LABEL[lack] : null
      const parts = [
        [hersteller, modell].filter(Boolean).join(' ') || null,
        lackLabel,
        str(fall.kennzeichen),
      ].filter(Boolean)
      return parts.join(' · ') || '—'
    }
    case 'historie': {
      const vorschaedenAnzahl = (fall.vorschaden_anzahl as number | null) ?? null
      const hatVorschaeden = lead?.hat_vorschaeden ?? null
      if (vorschaedenAnzahl != null && vorschaedenAnzahl > 0) {
        return `${vorschaedenAnzahl} Vorschäden`
      }
      if (hatVorschaeden === true) return 'Vorschäden gemeldet'
      if (hatVorschaeden === false) return 'Keine Vorschäden'
      return 'Noch keine Angabe'
    }
    case 'dokumente':
      return dokumenteAnzahl === 0
        ? 'Keine Dokumente'
        : `${dokumenteAnzahl} ${dokumenteAnzahl === 1 ? 'Dokument' : 'Dokumente'}`
    case 'kunde': {
      const name = lead
        ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || null
        : null
      return name ?? '—'
    }
    case 'gegner': {
      const verursacher = (parteien ?? []).find(
        (p) => (p.rolle as string | null) === 'verursacher',
      )
      if (!verursacher) return 'Nicht erfasst'
      return (
        (verursacher.name as string | null) ??
        (verursacher.versicherung_name as string | null) ??
        '—'
      )
    }
    case 'schaden': {
      const datum = str(fall.schadens_datum)
      const ort = str(fall.schadens_ort)
      const ursache = str(fall.schadens_ursache)
      return [ursache, ort, datum && new Date(datum).toLocaleDateString('de-DE')]
        .filter(Boolean)
        .join(' · ') || '—'
    }
  }
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
  const [selected, setSelected] = useState<StammdatenCategory | null>(null)
  const [hovered, setHovered] = useState<StammdatenCategory | null>(null)

  function handleSelect(cat: StammdatenCategory) {
    setSelected((prev) => (prev === cat ? null : cat))
  }
  const fall = data.fall
  const hersteller = str(fall.fahrzeug_hersteller)
  const modell = str(fall.fahrzeug_modell)
  const lack = (str(fall.lackfarbe_code) as LackfarbeCode | null) ?? null
  const kennzeichen = str(fall.kennzeichen)

  return (
    <div
      className={`rounded-2xl bg-white border border-claimondo-border overflow-hidden ${className}`}
    >
      {/* Header mit Mini-Render-Bild oben */}
      {hersteller && (
        <div className="bg-claimondo-navy/[0.04] border-b border-claimondo-border px-4 py-3 flex items-center gap-3">
          <FahrzeugRenderImage
            hersteller={hersteller}
            modell={modell}
            lackfarbe={lack}
            width={96}
            className="shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-claimondo-navy truncate">
              {[hersteller, modell].filter(Boolean).join(' ')}
            </p>
            {kennzeichen && (
              <span className="inline-flex items-center mt-1 rounded-md border-2 border-claimondo-navy bg-white px-1.5 py-0.5 font-mono text-xs tracking-wide text-claimondo-navy">
                {kennzeichen}
              </span>
            )}
            {lack && (
              <p className="text-xs text-claimondo-ondo mt-1">{LACKFARBE_LABEL[lack]}</p>
            )}
          </div>
        </div>
      )}

      {/* Klickbare Tabellen-Zeilen mit Inline-Expansion */}
      <ul className="divide-y divide-claimondo-border/60">
        {ROWS.map(({ key, label, icon: Icon }) => {
          const isSelected = selected === key
          const isHovered = hovered === key
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => handleSelect(key)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-claimondo-navy/[0.06]'
                    : isHovered
                      ? 'bg-[#f8f9fb]'
                      : 'bg-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-claimondo-navy' : 'text-claimondo-ondo/70'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-claimondo-navy">{label}</p>
                  <p className="text-xs text-claimondo-ondo truncate">
                    {buildSummary(key, data)}
                  </p>
                </div>
                {/* Pfeil nur wenn nicht ausgewählt */}
                {!isSelected && (
                  <ChevronRightIcon className="w-4 h-4 shrink-0 text-claimondo-ondo/50" />
                )}
              </button>

              {/* Inline-Detail direkt unter der Zeile */}
              {isSelected && (
                <div className="border-t border-claimondo-border/60">
                  <StammdatenDetail
                    category={key}
                    data={data}
                    onClose={() => setSelected(null)}
                    dokumenteSlot={dokumenteSlot}
                    inline
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
