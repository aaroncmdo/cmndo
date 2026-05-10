'use client'

import { useState, useTransition } from 'react'
import { PhoneIcon, CheckCircleIcon, ClockIcon, PenSquareIcon, UserIcon, MapPinIcon, CalendarIcon, FileSignatureIcon, AlertCircleIcon } from 'lucide-react'
import type { GutachterFinderAnfrage } from './actions'
import { aktualisiereAnfrageStatus } from './actions'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Offen — anrufen', color: 'bg-orange-100 text-orange-800' },
  neu: { label: 'Neu', color: 'bg-amber-100 text-amber-800' },
  in_bearbeitung: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-700' },
  sv_kontaktiert: { label: 'SV kontaktiert', color: 'bg-claimondo-ondo/10 text-claimondo-ondo' },
  termin_bestaetigt: { label: 'Termin bestätigt', color: 'bg-green-100 text-green-700' },
  abgeschlossen: { label: 'Abgeschlossen', color: 'bg-gray-100 text-gray-500' },
  storniert: { label: 'Storniert', color: 'bg-red-50 text-red-500' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABEL[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function formatDatum(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', opts ?? {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function AnfrageKarte({ anfrage }: { anfrage: GutachterFinderAnfrage }) {
  const [, startTransition] = useTransition()
  const [lokalerStatus, setLokalerStatus] = useState(anfrage.status)

  const svName = anfrage.sv_name ?? anfrage.sv_lead_name ?? null
  const svTelefon = anfrage.sv_telefon ?? anfrage.sv_lead_telefon ?? null
  const istOffen = lokalerStatus === 'entwurf' || lokalerStatus === 'neu' || lokalerStatus === 'in_bearbeitung'

  function wechsleStatus(neuerStatus: string) {
    setLokalerStatus(neuerStatus)
    startTransition(() => {
      aktualisiereAnfrageStatus(anfrage.id, neuerStatus)
    })
  }

  return (
    <div className={`bg-white rounded-ios-lg shadow-ios-md overflow-hidden border-l-4 ${istOffen ? 'border-claimondo-ondo' : 'border-claimondo-border'}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-claimondo-shield flex items-center justify-center shrink-0">
            <UserIcon className="w-4 h-4 text-claimondo-light-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-claimondo-navy truncate">
              {anfrage.vorname} {anfrage.nachname}
            </p>
            <p className="text-xs text-claimondo-ondo/70 truncate">{anfrage.email}</p>
            {anfrage.telefon && (
              <a
                href={`tel:${anfrage.telefon}`}
                className="text-xs text-claimondo-ondo hover:underline"
              >
                {anfrage.telefon}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={lokalerStatus} />
          <span className="text-[10px] text-gray-400">{formatDatum(anfrage.erstellt_am)}</span>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600 col-span-2">
          <PenSquareIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
          <span className="font-medium">{anfrage.schadentyp}</span>
          {anfrage.kennzeichen && <span className="text-gray-400">· {anfrage.kennzeichen}</span>}
        </div>
        {anfrage.schadenort && (
          <div className="flex items-center gap-1.5 text-gray-500 col-span-2">
            <MapPinIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
            <span className="truncate">{anfrage.schadenort}</span>
          </div>
        )}
        {anfrage.wunschtermin && (
          <div className="flex items-center gap-1.5 text-gray-500 col-span-2">
            <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
            <span>
              Wunschtermin:{' '}
              <strong className="text-claimondo-navy">
                {formatDatum(anfrage.wunschtermin, {
                  weekday: 'short', day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
              </strong>
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 col-span-2">
          <FileSignatureIcon className={`w-3.5 h-3.5 shrink-0 ${anfrage.sa_unterzeichnet_am ? 'text-green-600' : 'text-amber-500'}`} />
          {anfrage.sa_unterzeichnet_am ? (
            <span className="text-green-700">SA unterzeichnet am {formatDatum(anfrage.sa_unterzeichnet_am)}</span>
          ) : (
            <span className="text-amber-600 font-medium">SA noch nicht unterzeichnet</span>
          )}
        </div>
      </div>

      {/* Entwurf-Banner — Wizard nicht abgeschlossen, nur Telefon vorhanden */}
      {lokalerStatus === 'entwurf' && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-ios-sm bg-orange-50 border border-orange-200 flex items-center gap-2">
          <PhoneIcon className="w-4 h-4 text-orange-600 shrink-0" />
          <span className="text-xs font-semibold text-orange-800">Wizard abgebrochen — bitte anrufen und Daten aufnehmen</span>
        </div>
      )}

      {/* Anruf-Banner für Lead-Fallback — SV muss manuell kontaktiert werden */}
      {anfrage.matching_typ === 'lead_fallback' && lokalerStatus !== 'sv_kontaktiert' && lokalerStatus !== 'termin_bestaetigt' && lokalerStatus !== 'abgeschlossen' && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-ios-sm bg-amber-50 border border-amber-200 flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-800">DAT-SV — bitte manuell anrufen!</span>
        </div>
      )}

      {/* SV-Block — zeigt wen wir anrufen müssen */}
      {svName && (
        <div className="mx-4 mb-3 px-3 py-2.5 rounded-ios-sm bg-claimondo-bg border border-claimondo-border">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-semibold mb-1">
            Zugeordneter {anfrage.matching_typ === 'sv_lead' ? 'DAT-Expert' : 'Sachverständiger'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-claimondo-navy">{svName}</p>
            {svTelefon && (
              <a
                href={`tel:${svTelefon}`}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-claimondo-ondo hover:bg-claimondo-shield px-3 py-1.5 rounded-full transition-colors"
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                {svTelefon}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Aktions-Buttons */}
      {istOffen && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          <button
            onClick={() => wechsleStatus('sv_kontaktiert')}
            className="flex items-center gap-1.5 text-xs font-semibold text-claimondo-ondo border border-claimondo-ondo hover:bg-claimondo-ondo hover:text-white px-3 py-1.5 rounded-full transition-colors"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            SV kontaktiert
          </button>
          <button
            onClick={() => wechsleStatus('termin_bestaetigt')}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-600 hover:bg-green-600 hover:text-white px-3 py-1.5 rounded-full transition-colors"
          >
            <CheckCircleIcon className="w-3.5 h-3.5" />
            Termin bestätigt
          </button>
          <button
            onClick={() => wechsleStatus('abgeschlossen')}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors"
          >
            <ClockIcon className="w-3.5 h-3.5" />
            Abschließen
          </button>
        </div>
      )}
    </div>
  )
}

export default function GutachterFinderUebersichtClient({
  anfragen,
}: {
  anfragen: GutachterFinderAnfrage[]
}) {
  const [filter, setFilter] = useState<'offen' | 'anruf' | 'alle'>('offen')

  const anrufNoetig = anfragen.filter(
    (a) => a.matching_typ === 'lead_fallback' && a.status !== 'sv_kontaktiert' && a.status !== 'termin_bestaetigt' && a.status !== 'abgeschlossen' && a.status !== 'storniert',
  )

  const sichtbare =
    filter === 'offen'
      ? anfragen.filter((a) => a.status === 'entwurf' || a.status === 'neu' || a.status === 'in_bearbeitung' || a.status === 'sv_kontaktiert')
      : filter === 'anruf'
      ? anrufNoetig
      : anfragen

  return (
    <div className="space-y-4">
      {/* Filter-Tabs */}
      <div className="flex gap-2">
        {(['offen', 'alle'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
              filter === tab
                ? 'bg-claimondo-navy text-white'
                : 'bg-white text-claimondo-navy border border-claimondo-border hover:bg-claimondo-bg'
            }`}
          >
            {tab === 'offen' ? 'Offen' : 'Alle'}
          </button>
        ))}
      </div>

      {sichtbare.length === 0 ? (
        <div className="bg-white rounded-ios-lg shadow-ios-md px-5 py-12 text-center text-sm text-claimondo-ondo/70">
          {filter === 'offen' ? 'Keine offenen Anfragen' : 'Noch keine Anfragen'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sichtbare.map((a) => (
            <AnfrageKarte key={a.id} anfrage={a} />
          ))}
        </div>
      )}
    </div>
  )
}
