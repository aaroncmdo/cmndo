'use client'

// AAR-382: Expanded Card für den aktiven Stop im Fokus-Modus.
// Enthält Kunden-Kontakt, Fahrzeug, Adresse, Slots für Briefing (AAR-385) und
// Dokumente (AAR-386 — Platzhalter), sowie die primären Aktionen Losfahren /
// Angekommen / Abschließen je nach State.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  PhoneIcon,
  NavigationIcon,
  CheckCircle2Icon,
  PlayCircleIcon,
  MapPinIcon,
} from 'lucide-react'
import BriefingStrukturSections from '@/components/fall/BriefingStrukturSections'
import { formatUhrzeit } from '@/lib/format'
import type { FeldmodusStop } from './page'
import type { SessionStatus } from '@/lib/types/field-modus'
import { startStop, markArrived, completeAndAdvance } from './actions'

export interface AktuellerStopCardProps {
  stop: FeldmodusStop
  sessionId: string
  sessionStatus: SessionStatus
  svPosition: { lat: number; lng: number } | null
  onAdvanced: (nextTerminId: string | null) => void
}

function buildGoogleMapsLink(stop: FeldmodusStop): string {
  const base = 'https://www.google.com/maps/dir/?api=1'
  if (stop.place_id) {
    return `${base}&destination=${encodeURIComponent(stop.adresse)}&destination_place_id=${stop.place_id}`
  }
  if (stop.lat != null && stop.lng != null) {
    return `${base}&destination=${stop.lat},${stop.lng}`
  }
  return `${base}&destination=${encodeURIComponent(stop.adresse)}`
}

export default function AktuellerStopCard({
  stop,
  sessionId,
  sessionStatus,
  svPosition,
  onAdvanced,
}: AktuellerStopCardProps) {
  const [pending, startTransition] = useTransition()
  const [manuelleAnkunft, setManuelleAnkunft] = useState(false)

  const losgefahren = Boolean(stop.losgefahren_am)
  const angekommen = Boolean(stop.sv_angekommen_am)

  function onLosfahren() {
    startTransition(async () => {
      const res = await startStop(sessionId, stop.termin_id)
      if (res.success) {
        toast.success(
          res.etaMinutes != null
            ? `Losgefahren · ETA ${res.etaMinutes} Min`
            : 'Losgefahren',
        )
      } else {
        toast.error(res.error ?? 'Losfahren fehlgeschlagen')
      }
    })
  }

  function onAngekommen() {
    setManuelleAnkunft(true)
    startTransition(async () => {
      const lat = svPosition?.lat ?? stop.lat ?? 0
      const lng = svPosition?.lng ?? stop.lng ?? 0
      const res = await markArrived(
        sessionId,
        stop.termin_id,
        lat,
        lng,
        'manuell',
      )
      if (res.success) {
        toast.success('Ankunft bestätigt')
      } else {
        toast.error(res.error ?? 'Ankunft fehlgeschlagen')
        setManuelleAnkunft(false)
      }
    })
  }

  function onAbschliessen() {
    startTransition(async () => {
      const res = await completeAndAdvance(sessionId, stop.termin_id)
      if (res.success) {
        toast.success(
          res.nextTerminId ? 'Abgeschlossen, nächster Stop aktiv' : 'Alle Stops erledigt',
        )
        onAdvanced(res.nextTerminId ?? null)
      } else {
        toast.error(res.error ?? 'Abschluss fehlgeschlagen')
      }
    })
  }

  const mapsLink = buildGoogleMapsLink(stop)

  return (
    <div className="rounded-xl bg-white text-gray-900 p-4 shadow-sm space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--brand-primary,#4573A2)]">
            Aktueller Stop
          </span>
          <span className="text-[11px] text-gray-500">
            {formatUhrzeit(stop.start_zeit)}
          </span>
          {stop.schadentyp && (
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-primary,#4573A2)]/10 text-[color:var(--brand-primary,#4573A2)] uppercase">
              {stop.schadentyp}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900">
          {stop.kennzeichen && (
            <span className="font-mono mr-2">{stop.kennzeichen}</span>
          )}
          {stop.fahrzeug ?? stop.kunde_name}
        </p>
        <p className="text-xs text-gray-500">{stop.kunde_name}</p>
      </div>

      {/* Adresse */}
      <div className="flex items-start gap-2 text-sm text-gray-800">
        <MapPinIcon className="w-4 h-4 text-[color:var(--brand-primary,#4573A2)] mt-0.5" />
        <p className="flex-1">{stop.adresse}</p>
      </div>

      {/* Telefonnummer */}
      {stop.kunde_telefon && (
        <a
          href={`tel:${stop.kunde_telefon}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand-primary,#4573A2)] hover:text-[#0D1B3E]"
        >
          <PhoneIcon className="w-4 h-4" />
          {stop.kunde_telefon}
        </a>
      )}

      {/* BriefingCard-Slot (AAR-385) */}
      {(stop.briefing_text || stop.briefing_struktur) && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {stop.briefing_text && (
            <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
              {stop.briefing_text}
            </p>
          )}
          <BriefingStrukturSections
            fallId={stop.fall_id}
            struktur={stop.briefing_struktur}
            canRegenerate={false}
            defaultExpanded={false}
          />
        </div>
      )}

      {/* Dokumente-Slot (AAR-386 Platzhalter) */}
      <div className="border-t border-gray-100 pt-3 text-[11px] text-gray-500 italic">
        Dokumenten-Checkliste folgt in AAR-386
      </div>

      {/* Aktionen — State-Machine-abhängig */}
      <div className="flex flex-col gap-2 pt-2">
        {!losgefahren && sessionStatus !== 'arrived' && (
          <button
            type="button"
            onClick={onLosfahren}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-primary,#4573A2)] text-white text-sm font-semibold py-2.5 hover:bg-[#3a6290] disabled:opacity-50"
          >
            <PlayCircleIcon className="w-4 h-4" />
            {pending ? 'Starte …' : 'Losfahren & Kunde informieren'}
          </button>
        )}

        {losgefahren && !angekommen && (
          <button
            type="button"
            onClick={onAngekommen}
            disabled={pending || manuelleAnkunft}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold py-2.5 hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2Icon className="w-4 h-4" />
            {pending ? 'Bestätige …' : 'Ich bin angekommen'}
          </button>
        )}

        {angekommen && sessionStatus !== 'finished' && (
          <button
            type="button"
            onClick={onAbschliessen}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0D1B3E] text-white text-sm font-semibold py-2.5 hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            <CheckCircle2Icon className="w-4 h-4" />
            {pending ? 'Schließe ab …' : 'Besichtigung abschließen'}
          </button>
        )}

        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2 hover:bg-gray-50"
        >
          <NavigationIcon className="w-4 h-4" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  )
}
