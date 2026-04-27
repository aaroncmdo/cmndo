'use client'

// AAR-408 / CMM-25: Eine Card pro SV-Auftrag. CMM-25 hat den Erstvorschlag-
// Pfad entfernt — Dispatcher blockt den Slot, SA-Unterschrift bestätigt
// final. SV kann nur per TerminActionsPanel in der Fallakte den Termin
// ablehnen oder einen Gegenvorschlag senden.
//
// CMM-25 Follow-Up: Action-Zone (Tile mit „Fall öffnen"-Pfeil + read-only
// Status-Tiles) entfernt — Card-Click öffnet die Fallakte über den
// Stretched-Link. Termin-Status wandert als gefärbte Meta-Zeile in den
// Body, damit der SV auf einen Blick sieht, ob ein Termin geblockt /
// bestätigt ist, ohne sichtbaren Button.

import Link from 'next/link'
import {
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  ClockIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  FileTextIcon,
} from 'lucide-react'
import { formatDatum } from '@/lib/format'

export type AuftragCardProps = {
  fall: {
    id: string
    fall_nummer: string | null
    status: string
    schadens_ursache: string | null
    schadens_ort: string | null
    schadens_datum: string | null
  }
  kunde: {
    vorname: string | null
    nachname: string | null
  } | null
  aktiverTermin: {
    id: string
    status: string
    start_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: 'sv' | 'kunde' | null
  } | null
  ursacheLabel: string
  statusLabel: string
  /** CMM-24: Anzahl offener Pflicht-Dokumente — gelber Badge wenn >0. */
  offeneDokumente?: number
}

type TerminMeta =
  | { kind: 'geblockt'; datum: string }
  | { kind: 'bestaetigt'; datum: string }
  | { kind: 'sv-gegenvorschlag'; datum: string }
  | null

function deriveTerminMeta(t: AuftragCardProps['aktiverTermin']): TerminMeta {
  if (!t || t.status === 'storniert' || t.status === 'abgelehnt') return null
  if (t.status === 'gegenvorschlag' && t.gegenvorschlag_von === 'sv') {
    return { kind: 'sv-gegenvorschlag', datum: t.vorgeschlagenes_datum ?? t.start_zeit ?? '' }
  }
  if (t.status === 'reserviert' || t.status === 'gegenvorschlag') {
    return { kind: 'geblockt', datum: t.start_zeit ?? '' }
  }
  if (t.status === 'bestaetigt') {
    return { kind: 'bestaetigt', datum: t.start_zeit ?? '' }
  }
  return null
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AuftragCard(props: AuftragCardProps) {
  const kundeName =
    props.kunde?.vorname || props.kunde?.nachname
      ? `${props.kunde.vorname ?? ''} ${props.kunde.nachname ?? ''}`.trim()
      : '—'

  const terminMeta = deriveTerminMeta(props.aktiverTermin)

  return (
    <div className="relative bg-white rounded-2xl border border-claimondo-border p-4 sm:p-5 space-y-3 hover:border-claimondo-ondo transition-colors group">
      {/* CMM-25: Stretched-Link über die ganze Card. Card-Click ist die
          einzige Aktion — der SV öffnet seinen Auftrag, sonst nichts. */}
      <Link
        href={`/gutachter/fall/${props.fall.id}`}
        aria-label={`Fall ${props.fall.fall_nummer ?? ''} öffnen`}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0 flex-1">
          <span className="text-[var(--brand-secondary)] font-mono text-xs">
            {props.fall.fall_nummer ?? props.fall.id.slice(0, 8)}
          </span>
          <p className="text-sm font-semibold text-[var(--brand-primary)] mt-0.5 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0" />
            <span className="truncate">{kundeName}</span>
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-[#f8f9fb] text-claimondo-ondo whitespace-nowrap">
          {props.statusLabel}
        </span>
      </div>

      {/* CMM-24: Mitteilungs-Slot — gelber Badge bei offenen Doku-Anforderungen */}
      {(props.offeneDokumente ?? 0) > 0 && (
        <div className="relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium pointer-events-none">
          <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600" />
          <span>
            {props.offeneDokumente}{' '}
            {props.offeneDokumente === 1 ? 'Dokument fehlt' : 'Dokumente fehlen'}
          </span>
        </div>
      )}

      {/* Meta */}
      <div className="relative z-10 text-xs text-claimondo-ondo space-y-1 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <FileTextIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0" />
          <span>{props.ursacheLabel}</span>
        </div>
        {props.fall.schadens_ort && (
          <div className="flex items-center gap-1.5">
            <MapPinIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0" />
            <span className="truncate">{props.fall.schadens_ort}</span>
          </div>
        )}
        {props.fall.schadens_datum && (
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 shrink-0" />
            <span>Schaden: {formatDatum(props.fall.schadens_datum)}</span>
          </div>
        )}

        {/* CMM-25: Termin als gefärbte Meta-Zeile, kein Button. Klickfläche
            ist die ganze Card. */}
        {terminMeta?.kind === 'geblockt' && (
          <div className="flex items-center gap-1.5 text-amber-800">
            <ClockIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">
              Termin geblockt: {fmtDateShort(terminMeta.datum)} — wartet auf SA-Unterschrift
            </span>
          </div>
        )}
        {terminMeta?.kind === 'bestaetigt' && (
          <div className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Termin: {fmtDateShort(terminMeta.datum)}</span>
          </div>
        )}
        {terminMeta?.kind === 'sv-gegenvorschlag' && (
          <div className="flex items-center gap-1.5 text-claimondo-navy">
            <AlertCircleIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
            <span className="truncate">
              Gegenvorschlag gesendet: {fmtDateShort(terminMeta.datum)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
