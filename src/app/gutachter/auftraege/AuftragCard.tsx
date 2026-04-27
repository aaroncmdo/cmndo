'use client'

// AAR-408 / CMM-25: Eine Card pro SV-Auftrag. CMM-25 hat den Erstvorschlag-
// Pfad entfernt — Dispatcher blockt den Slot, SA-Unterschrift bestätigt
// final. SV kann nur per TerminActionsPanel in der Fallakte den Termin
// ablehnen oder einen Gegenvorschlag senden.
//
// Card-Zustände:
//   • reserviert  → „Geblockt am X – wartet auf SA-Unterschrift" (Fall öffnen)
//   • bestaetigt  → „Fest am X" (Fall öffnen)
//   • kein Termin → sollte selten sein (Dispatcher hat noch nicht zugewiesen);
//                   Fallback „Fall öffnen"

import Link from 'next/link'
import {
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  ClockIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ChevronRightIcon,
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

type PrimaryAction =
  | { type: 'geblockt'; datum: string; href: string }
  | { type: 'bestaetigt'; datum: string; href: string }
  | { type: 'sv-gegenvorschlag-offen'; datum: string; href: string }
  | { type: 'offen'; label: string; href: string }

function derivePrimary(props: AuftragCardProps): PrimaryAction {
  const t = props.aktiverTermin
  const href = `/gutachter/fall/${props.fall.id}`

  // CMM-25: Kein Termin oder Termin abgelehnt/storniert → SV soll keinen
  // Erstvorschlag mehr machen. Dispatcher muss neu zuweisen. Card öffnet
  // nur den Fall — die Fallakte zeigt dann den passenden Hinweis.
  if (!t || t.status === 'storniert' || t.status === 'abgelehnt') {
    return { type: 'offen', label: 'Fall öffnen', href }
  }

  // CMM-25: SV hat selber einen Gegenvorschlag rausgeschickt → wartet auf
  // Dispatcher-Antwort. Card zeigt Status, Fallakte hat die Details.
  if (t.status === 'gegenvorschlag' && t.gegenvorschlag_von === 'sv') {
    return {
      type: 'sv-gegenvorschlag-offen',
      datum: t.vorgeschlagenes_datum ?? t.start_zeit ?? '',
      href,
    }
  }

  // CMM-25: Reserviert = Dispatcher hat geblockt, SA-Unterschrift steht aus.
  // Auch alte 'gegenvorschlag'-Rows vom Kunden landen hier (Kunden-Gegenvorschlag-
  // Pfad ist mit CMM-25 abgeschafft, Dispatcher kümmert sich um Klärung).
  if (t.status === 'reserviert' || t.status === 'gegenvorschlag') {
    return {
      type: 'geblockt',
      datum: t.start_zeit ?? '',
      href,
    }
  }

  if (t.status === 'bestaetigt') {
    return { type: 'bestaetigt', datum: t.start_zeit ?? '', href }
  }

  return { type: 'offen', label: 'Fall öffnen', href }
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

  const action = derivePrimary(props)

  return (
    <div className="relative bg-white rounded-2xl border border-claimondo-border p-4 sm:p-5 space-y-3 hover:border-claimondo-ondo transition-colors group">
      {/* CMM-24: Stretched-Link über die ganze Card. Action-Buttons + interne
          Links bekommen relative z-10, damit sie ihre eigenen Klick-Handler
          behalten. */}
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
      </div>

      {/* Action Zone — CMM-25: nur read-only Termin-Status + Fall-öffnen-Link.
          Der Stretched-Link auf der ganzen Card öffnet bereits den Fall, der
          sichtbare Pfeil hier ist nur visuell affordance. */}
      <div className="relative z-10 pt-2 border-t border-claimondo-border">
        {action.type === 'geblockt' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <ClockIcon className="w-4 h-4 text-amber-700 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Termin geblockt</p>
                <p className="mt-0.5 truncate">
                  {fmtDateShort(action.datum)} — wartet auf Sicherungsabtretung
                </p>
              </div>
            </div>
            <ChevronRightIcon className="w-4 h-4 shrink-0" />
          </div>
        )}

        {action.type === 'sv-gegenvorschlag-offen' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-xs pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircleIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Gegenvorschlag gesendet</p>
                <p className="mt-0.5 truncate">
                  {fmtDateShort(action.datum)} — wartet auf Dispatch
                </p>
              </div>
            </div>
            <ChevronRightIcon className="w-4 h-4 shrink-0" />
          </div>
        )}

        {action.type === 'bestaetigt' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2Icon className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Fest bestätigt</p>
                <p className="mt-0.5 truncate">{fmtDateShort(action.datum)}</p>
              </div>
            </div>
            <ChevronRightIcon className="w-4 h-4 shrink-0" />
          </div>
        )}

        {action.type === 'offen' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-claimondo-border text-claimondo-navy text-sm font-medium pointer-events-none">
            <span>{action.label}</span>
            <ChevronRightIcon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  )
}
