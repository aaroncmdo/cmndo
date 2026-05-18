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
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  claim_nummer: string | null
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
    cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border',
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
    cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border',
    icon: ClockIcon,
  }
  const StatusIcon = status.icon

  // Realtime: Besichtigung-läuft-Trigger live abrufen, damit der Kunde die
  // Seite offen halten kann und den Statuswechsel ohne Reload sieht.
  const [besichtigungLaeuft, setBesichtigungLaeuft] = useState(false)
  const [svAngekommenAm, setSvAngekommenAm] = useState(termin.sv_angekommen_am)
  const [svUnterwegsSeit, setSvUnterwegsSeit] = useState(termin.sv_unterwegs_seit)
  useEffect(() => {
    const supabase = createClient()
    void supabase
      .from('gutachter_termine')
      .select('besichtigung_gestartet_am, sv_angekommen_am, sv_unterwegs_seit')
      .eq('id', termin.id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as {
          besichtigung_gestartet_am: string | null
          sv_angekommen_am: string | null
          sv_unterwegs_seit: string | null
        } | null
        if (row?.besichtigung_gestartet_am) setBesichtigungLaeuft(true)
        if (row?.sv_angekommen_am) setSvAngekommenAm(row.sv_angekommen_am)
        if (row?.sv_unterwegs_seit) setSvUnterwegsSeit(row.sv_unterwegs_seit)
      })
    const channel = supabase
      .channel(`kunde-termin-detail-${termin.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `id=eq.${termin.id}`,
        },
        (payload) => {
          const row = payload.new as {
            besichtigung_gestartet_am: string | null
            sv_angekommen_am: string | null
            sv_unterwegs_seit: string | null
          }
          if (row.besichtigung_gestartet_am) setBesichtigungLaeuft(true)
          setSvAngekommenAm(row.sv_angekommen_am)
          setSvUnterwegsSeit(row.sv_unterwegs_seit)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [termin.id])

  const isUnterwegs = !!svUnterwegsSeit && !svAngekommenAm
  const mapsEmbedSrc = fall.adresse
    ? `https://www.google.com/maps?q=${encodeURIComponent(fall.adresse)}&output=embed`
    : null
  const mapsRouteHref = fall.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fall.adresse)}`
    : null

  return (
    <div className="w-full px-4 md:px-8 pt-5 pb-10 max-w-2xl mx-auto space-y-5">
      {besichtigungLaeuft && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
          <CheckCircle2Icon className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900">Besichtigung läuft</p>
            <p className="text-xs text-emerald-800/80">
              Ihr Sachverständiger dokumentiert das Fahrzeug.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div>
        <Link
          href="/kunde/termine"
          className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-ondo mb-3"
        >
          <ArrowLeftIcon className="w-3 h-3" /> Meine Termine
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
              Gutachter-Termin
            </p>
            <h1 className="text-xl md:text-2xl font-bold text-claimondo-navy mt-1">{datum}</h1>
            <p className="text-sm text-claimondo-ondo mt-0.5">
              <CalendarIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-claimondo-ondo" />
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

        {fall.claim_nummer && (
          <p className="text-xs text-claimondo-ondo mt-2">
            Fall {fall.claim_nummer}
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
        <div className="rounded-2xl border border-claimondo-border bg-white p-4 md:p-5">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-3">
            Ihr Sachverständiger
          </p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-claimondo-ondo text-white flex items-center justify-center shrink-0 overflow-hidden">
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
                <p className="text-base font-semibold text-claimondo-navy truncate">{sv.name}</p>
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
                  className="text-sm text-claimondo-ondo hover:underline inline-flex items-center gap-1 mt-0.5"
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
        <div className="rounded-2xl border border-claimondo-border bg-white overflow-hidden">
          <div className="p-4 md:p-5 border-b border-claimondo-border">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-1">
              Besichtigungsort
            </p>
            <p className="text-sm text-claimondo-navy flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 text-claimondo-ondo mt-0.5 shrink-0" />
              <span>{fall.adresse}</span>
            </p>
          </div>
          {mapsEmbedSrc && (
            <div className="aspect-video w-full bg-claimondo-bg">
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
                className="inline-flex w-full items-center justify-center gap-2 min-h-[44px] rounded-ios-xl border border-claimondo-ondo text-claimondo-ondo text-sm font-semibold hover:bg-claimondo-ondo/5"
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
          className="inline-flex w-full items-center justify-center gap-2 min-h-[48px] rounded-ios-xl bg-claimondo-ondo text-white text-sm font-semibold hover:bg-claimondo-shield transition-colors"
        >
          <CarIcon className="w-4 h-4" />
          Zur Fallakte
        </Link>
      </div>
    </div>
  )
}
