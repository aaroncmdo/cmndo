'use client'

// AAR-698: Termin-Detail-View — Mobile-first, vier Sektionen:
//   1. Header mit Datum/Status-Badge
//   2. Gutachter-Karte (Avatar, Name, Verifiziert, Click-to-Call)
//   3. Adresse + Karte (Google-Maps Embed) + „Route öffnen" Button
//   4. Live-Tracking-Hinweis wenn SV unterwegs (Link auf bestehende
//      Public-Tracking-Page mit Realtime)
//   5. „Zur Fallakte"-CTA
//
// Keine eigene Realtime-Logik — wir verlinken auf die bestehende
// /kunde/termin/<token>-Seite, die bereits SV-Live-Position rendert.

import Link from 'next/link'
import {
  CalendarIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
  CarIcon,
  RouteIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ClockIcon,
} from 'lucide-react'

type Termin = {
  id: string
  status: string
  start_zeit: string
  end_zeit: string
  kanal: string | null
  typ: string | null
  kunden_tracking_token: string | null
  ablehnen_token: string | null
  sv_unterwegs_seit: string | null
  sv_eta_minuten: number | null
  sv_angekommen_am: string | null
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
}

type Fall = {
  id: string
  fall_nummer: string | null
  kennzeichen: string | null
  fahrzeug: string | null
  adresse: string | null
}

type Sv = {
  name: string | null
  telefon: string | null
  avatarUrl: string | null
  verifiziert: boolean
}

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: typeof CheckCircle2Icon }> = {
  reserviert: {
    label: 'Reserviert — wartet auf SV-Bestätigung',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: ClockIcon,
  },
  bestaetigt: {
    label: 'Termin bestätigt',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2Icon,
  },
  gegenvorschlag: {
    label: 'Neuer Vorschlag — Antwort nötig',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertCircleIcon,
  },
  abgelehnt: {
    label: 'Abgelehnt',
    cls: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertCircleIcon,
  },
  abgesagt: {
    label: 'Abgesagt',
    cls: 'bg-gray-50 text-gray-600 border-gray-200',
    icon: AlertCircleIcon,
  },
  abgeschlossen: {
    label: 'Durchgeführt',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2Icon,
  },
}

export default function KundeTerminDetailClient({
  termin,
  fall,
  sv,
}: {
  termin: Termin
  fall: Fall
  sv: Sv
}) {
  const start = new Date(termin.start_zeit)
  const ende = termin.end_zeit ? new Date(termin.end_zeit) : null

  const datum = start.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const uhrzeit = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const endzeit = ende?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

  const status = STATUS_LABEL[termin.status] ?? {
    label: termin.status,
    cls: 'bg-gray-50 text-gray-600 border-gray-200',
    icon: ClockIcon,
  }
  const StatusIcon = status.icon

  const isUnterwegs = !!termin.sv_unterwegs_seit && !termin.sv_angekommen_am
  const mapsEmbedSrc = fall.adresse
    ? `https://www.google.com/maps?q=${encodeURIComponent(fall.adresse)}&output=embed`
    : null
  const mapsRouteHref = fall.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fall.adresse)}`
    : null

  return (
    <div className="w-full px-4 md:px-8 pt-5 pb-10 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/kunde/termine"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#4573A2] mb-3"
        >
          <ArrowLeftIcon className="w-3 h-3" /> Meine Termine
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4573A2]">
              Gutachter-Termin
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-[#0D1B3E] mt-1">{datum}</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              <CalendarIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-[#4573A2]" />
              {uhrzeit}{endzeit ? ` – ${endzeit}` : ''} Uhr
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${status.cls}`}
          >
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
        </div>

        {fall.fall_nummer && (
          <p className="text-xs text-gray-500 mt-2">
            Fall {fall.fall_nummer}
            {fall.kennzeichen ? ` · ${fall.kennzeichen}` : ''}
            {fall.fahrzeug ? ` · ${fall.fahrzeug}` : ''}
          </p>
        )}
      </div>

      {/* Live-Tracking-Banner (nur wenn SV unterwegs ODER bald losfährt) */}
      {isUnterwegs && termin.kunden_tracking_token && (
        <Link
          href={`/kunde/termin/${termin.kunden_tracking_token}`}
          className="block rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 hover:bg-emerald-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">
                {sv.name ?? 'Ihr Sachverständiger'} ist unterwegs
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {termin.sv_eta_minuten != null
                  ? `Ankunft in ~${termin.sv_eta_minuten} Min — Live-Karte öffnen`
                  : 'Live-Karte mit aktueller Position öffnen'}
              </p>
            </div>
            <span className="text-emerald-700 text-lg">→</span>
          </div>
        </Link>
      )}

      {/* Gutachter-Karte */}
      {sv.name && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
            Ihr Sachverständiger
          </p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#4573A2] text-white flex items-center justify-center shrink-0 overflow-hidden">
              {sv.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={sv.avatarUrl} alt={sv.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold">
                  {sv.name
                    .split(' ')
                    .map((s) => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-semibold text-[#0D1B3E] truncate">{sv.name}</p>
                {sv.verifiziert && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <ShieldCheckIcon className="w-2.5 h-2.5" />
                    Verifiziert
                  </span>
                )}
              </div>
              {sv.telefon && (
                <a
                  href={`tel:${sv.telefon}`}
                  className="text-sm text-[#4573A2] hover:underline inline-flex items-center gap-1 mt-0.5"
                >
                  <PhoneIcon className="w-3 h-3" />
                  {sv.telefon}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adresse + Karte */}
      {fall.adresse && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-4 md:p-5 border-b border-gray-100">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
              Besichtigungsort
            </p>
            <p className="text-sm text-[#0D1B3E] flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 text-[#4573A2] mt-0.5 shrink-0" />
              <span>{fall.adresse}</span>
            </p>
          </div>
          {mapsEmbedSrc && (
            <div className="aspect-video w-full bg-gray-100">
              <iframe
                src={mapsEmbedSrc}
                width="100%"
                height="100%"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="border-0 w-full h-full"
                title="Karte zum Besichtigungsort"
              />
            </div>
          )}
          {mapsRouteHref && (
            <div className="p-4">
              <a
                href={mapsRouteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 min-h-[44px] rounded-xl border border-[#4573A2] text-[#4573A2] text-sm font-semibold hover:bg-[#4573A2]/5"
              >
                <RouteIcon className="w-4 h-4" />
                Route in Google Maps öffnen
              </a>
            </div>
          )}
        </div>
      )}

      {/* Termin verwalten (Token-Flow) */}
      {termin.ablehnen_token &&
        (termin.status === 'reserviert' || termin.status === 'gegenvorschlag') && (
          <Link
            href={`/kunde/termin/${termin.kunden_tracking_token ?? termin.ablehnen_token}`}
            className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 transition-colors text-amber-900 text-sm"
          >
            {termin.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'sv'
              ? 'Der Sachverständige hat einen neuen Termin vorgeschlagen — jetzt antworten →'
              : 'Termin verwalten oder verschieben →'}
          </Link>
        )}

      {/* CTA Fallakte */}
      <div className="pt-1">
        <Link
          href={`/kunde/faelle/${fall.id}`}
          className="inline-flex w-full items-center justify-center gap-2 min-h-[48px] rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#1E3A5F] transition-colors"
        >
          <CarIcon className="w-4 h-4" />
          Zur Fallakte
        </Link>
      </div>
    </div>
  )
}
