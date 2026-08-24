'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { PhoneIcon, CheckCircleIcon, ClockIcon, PenSquareIcon, UserIcon, MapPinIcon, CalendarIcon, FileSignatureIcon, AlertCircleIcon, InboxIcon, ArrowRightIcon } from 'lucide-react'
import type { GutachterFinderAnfrage } from './actions'
import { aktualisiereAnfrageStatus } from './actions'
import { STATUS_LABEL, STATUS_FALLBACK } from './constants'
import EmptyState from '@/components/shared/EmptyState'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABEL[status] ?? { label: status, color: STATUS_FALLBACK.color }
  return (
    <span className={`inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
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

// AAR-939: "verwertbar" = mit Kontakt (Telefon ODER Email). Ohne Kontakt kann der
// Dispatcher nichts tun — das filtert die kontaktlosen Funnel-Entwürfe aus der
// Arbeitsliste (Live: 2294 Entwürfe, nur ~56 mit Kontakt = der echte Vorrat).
function hatKontakt(a: GutachterFinderAnfrage): boolean {
  return Boolean(a.telefon?.trim() || a.email?.trim())
}

// Herkunfts-Badge: native Funnel (source null) bekommt keins; Monika-Quellen
// werden sichtbar markiert, damit der Dispatcher Cluster-LP/SV-Embed erkennt.
const HERKUNFT_LABEL: Record<string, { label: string; color: string }> = {
  sv_embed: { label: 'SV-Embed', color: 'bg-claimondo-shield/15 text-claimondo-navy' },
  kfz_gutachter_lp: { label: 'Cluster-LP', color: 'bg-claimondo-ondo/15 text-claimondo-ondo' },
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
    <div className={`bg-white rounded-ios-lg shadow-ios-md overflow-hidden border ${istOffen ? 'border-claimondo-ondo' : 'border-claimondo-border'}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-claimondo-shield flex items-center justify-center shrink-0">
            <UserIcon className="w-4 h-4 text-claimondo-light-blue" />
          </div>
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-claimondo-navy truncate">
              {anfrage.vorname} {anfrage.nachname}
            </p>
            <p className="text-body-xs text-claimondo-ondo/70 truncate">{anfrage.email}</p>
            {anfrage.telefon && (
              <a
                href={`tel:${anfrage.telefon}`}
                className="text-body-xs text-claimondo-ondo hover:underline"
              >
                {anfrage.telefon}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={lokalerStatus} />
          {anfrage.source && HERKUNFT_LABEL[anfrage.source] && (
            <span className={`inline-flex items-center text-caption font-semibold px-2 py-0.5 rounded-full ${HERKUNFT_LABEL[anfrage.source].color}`}>
              {HERKUNFT_LABEL[anfrage.source].label}
            </span>
          )}
          <span className="text-caption text-claimondo-ondo/70">{formatDatum(anfrage.erstellt_am)}</span>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-xs">
        <div className="flex items-center gap-1.5 text-claimondo-ondo col-span-2">
          <PenSquareIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
          <span className="font-medium">{anfrage.schadentyp}</span>
          {anfrage.kennzeichen && <span className="text-claimondo-ondo/70">· {anfrage.kennzeichen}</span>}
        </div>
        {anfrage.schadenort && (
          <div className="flex items-center gap-1.5 text-claimondo-ondo col-span-2">
            <MapPinIcon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0" />
            <span className="truncate">{anfrage.schadenort}</span>
          </div>
        )}
        {anfrage.wunschtermin && (
          <div className="flex items-center gap-1.5 text-claimondo-ondo col-span-2">
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
          <FileSignatureIcon className={`w-3.5 h-3.5 shrink-0 ${anfrage.sa_unterzeichnet_am ? 'text-success' : 'text-warning'}`} />
          {anfrage.sa_unterzeichnet_am ? (
            <span className="text-success-strong">SA unterzeichnet am {formatDatum(anfrage.sa_unterzeichnet_am)}</span>
          ) : (
            <span className="text-warning font-medium">SA noch nicht unterzeichnet</span>
          )}
        </div>
      </div>

      {/* Entwurf-Banner — Wizard nicht abgeschlossen, nur Telefon vorhanden */}
      {lokalerStatus === 'entwurf' && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-ios-sm bg-warning-soft border border-warning/30 flex items-center gap-2">
          <PhoneIcon className="w-4 h-4 text-warning shrink-0" />
          <span className="text-body-xs font-semibold text-warning-strong">Wizard abgebrochen — bitte anrufen und Daten aufnehmen</span>
        </div>
      )}

      {/* Anruf-Banner für Lead-Fallback — SV muss manuell kontaktiert werden */}
      {anfrage.matching_typ === 'lead_fallback' && lokalerStatus !== 'sv_kontaktiert' && lokalerStatus !== 'termin_bestaetigt' && lokalerStatus !== 'abgeschlossen' && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-ios-sm bg-warning-soft border border-warning/30 flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 text-warning shrink-0" />
          <span className="text-body-xs font-semibold text-warning-strong">DAT-SV — bitte manuell anrufen!</span>
        </div>
      )}

      {/* SV-Block — zeigt wen wir anrufen müssen */}
      {svName && (
        <div className="mx-4 mb-3 px-3 py-2.5 rounded-ios-sm bg-claimondo-bg border border-claimondo-border">
          <p className="text-caption uppercase tracking-wider text-claimondo-ondo font-semibold mb-1">
            {anfrage.matching_typ === 'lead_fallback' ? 'DAT-Expert (extern — anrufen!)' : 'Zugeordneter Sachverständiger'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-claimondo-navy">{svName}</p>
            {svTelefon && (
              <a
                href={`tel:${svTelefon}`}
                className="flex items-center gap-1.5 text-body-xs font-semibold text-white bg-claimondo-ondo hover:bg-claimondo-shield px-3 py-1.5 rounded-full transition-colors"
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
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          <button
            onClick={() => wechsleStatus('sv_kontaktiert')}
            className="flex items-center gap-1.5 text-body-xs font-semibold text-claimondo-ondo border border-claimondo-ondo hover:bg-claimondo-ondo hover:text-white px-3 py-1.5 rounded-full transition-colors"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            SV kontaktiert
          </button>
          <button
            onClick={() => wechsleStatus('termin_bestaetigt')}
            className="flex items-center gap-1.5 text-body-xs font-semibold text-success-strong border border-success/30 hover:bg-success hover:text-white px-3 py-1.5 rounded-full transition-colors"
          >
            <CheckCircleIcon className="w-3.5 h-3.5" />
            Termin bestätigt
          </button>
          <button
            onClick={() => wechsleStatus('abgeschlossen')}
            className="flex items-center gap-1.5 text-body-xs text-claimondo-ondo border border-claimondo-border hover:bg-claimondo-bg px-3 py-1.5 rounded-full transition-colors"
          >
            <ClockIcon className="w-3.5 h-3.5" />
            Abschließen
          </button>
        </div>
      )}

      {/* Route-Reachability-Audit 06.07.: Die Detail-Ansicht (/dispatch/gutachter-finder/[id])
          war nur per direkter URL erreichbar — die Karte verlinkte nie darauf, obwohl das
          Detail sogar einen "Zurueck zur Uebersicht"-Link hat. Discreter Footer-Link (bewusst
          NICHT die ganze Karte als <a>, sonst nesten tel:-Links + Aktions-Buttons im Anchor). */}
      <Link
        href={`/dispatch/gutachter-finder/${anfrage.id}`}
        className="flex items-center justify-center gap-1 border-t border-claimondo-border px-4 py-2.5 text-body-xs font-medium text-claimondo-ondo hover:bg-claimondo-bg hover:text-claimondo-navy transition-colors"
      >
        Details ansehen
        <ArrowRightIcon className="w-3.5 h-3.5" />
      </Link>
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

  // "Offen" = verwertbarer Arbeitsvorrat: offener Status UND mit Kontakt (Aaron
  // 31.05.: "Dispatch sieht alle verwertbaren Anfragen"). Kontaktlose Funnel-
  // Entwürfe (kein Telefon/Email) fallen raus — der "Alle"-Tab zeigt weiter alles.
  const istOffenVorrat = (a: GutachterFinderAnfrage) =>
    hatKontakt(a) &&
    (a.status === 'entwurf' || a.status === 'neu' || a.status === 'in_bearbeitung' || a.status === 'sv_kontaktiert')

  const sichtbare =
    filter === 'offen' ? anfragen.filter(istOffenVorrat) : filter === 'anruf' ? anrufNoetig : anfragen

  const stats: StatBarItem[] = [
    { label: 'Offen', value: anfragen.filter(istOffenVorrat).length, icon: InboxIcon },
    { label: 'Anruf nötig', value: anrufNoetig.length, icon: PhoneIcon, tone: anrufNoetig.length ? 'warning' : 'default' },
    { label: 'Abgeschlossen', value: anfragen.filter((a) => a.status === 'abgeschlossen').length, icon: CheckCircleIcon },
  ]

  return (
    <div className="space-y-4">
      <StatBar items={stats} />

      {/* Filter-Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'offen', label: 'Offen' },
          { key: 'anruf', label: `Anruf nötig${anrufNoetig.length > 0 ? ` (${anrufNoetig.length})` : ''}` },
          { key: 'alle', label: 'Alle' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-body-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
              filter === tab.key
                ? tab.key === 'anruf'
                  ? 'bg-warning text-white'
                  : 'bg-claimondo-navy text-white'
                : tab.key === 'anruf' && anrufNoetig.length > 0
                ? 'bg-warning-soft text-warning-strong border border-warning/30 hover:bg-warning-soft'
                : 'bg-white text-claimondo-navy border border-claimondo-border hover:bg-claimondo-bg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {sichtbare.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={filter === 'offen' ? 'Keine offenen Anfragen' : 'Noch keine Anfragen'}
          variant="compact"
        />
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
