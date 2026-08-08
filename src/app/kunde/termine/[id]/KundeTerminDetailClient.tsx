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
import { useTranslations, useFormatter } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'
import { istPendingTerminStatus } from '@/lib/termine/pending-status'
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
import { TerminStatusBadge } from '@/components/shared/TerminStatusBadge'
import PageHeader from '@/components/shared/PageHeader'

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
    cls: 'bg-warning-soft text-warning-strong border-warning/30',
    icon: ClockIcon,
  },
  bestaetigt: {
    label: 'Termin bestätigt',
    cls: 'bg-success-soft text-success-strong border-success/30',
    icon: CheckCircle2Icon,
  },
  gegenvorschlag: {
    label: 'Neuer Vorschlag — Antwort nötig',
    cls: 'bg-warning-soft text-warning-strong border-warning/30',
    icon: AlertCircleIcon,
  },
  abgelehnt: {
    label: 'Abgelehnt',
    cls: 'bg-danger-soft text-danger-strong border-danger/30',
    icon: AlertCircleIcon,
  },
  abgesagt: {
    label: 'Abgesagt',
    cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border',
    icon: AlertCircleIcon,
  },
  abgeschlossen: {
    label: 'Durchgeführt',
    cls: 'bg-success-soft text-success-strong border-success/30',
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
  const t = useTranslations('kunde.termine')
  const ts = useTranslations('kunde.fall.stepper')
  const format = useFormatter()
  const start = new Date(termin.start_zeit)
  const ende = termin.end_zeit ? new Date(termin.end_zeit) : null

  const datum = format.dateTime(start, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })
  const uhrzeit = format.dateTime(start, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
  const endzeit = ende ? format.dateTime(ende, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : undefined

  const status = STATUS_LABEL[termin.status] ?? {
    label: termin.status,
    cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border',
    icon: ClockIcon,
  }
  const StatusIcon = status.icon
  const statusLabel = istPendingTerminStatus(termin.status)
    ? ts('wirdBestaetigt')
    : (termin.status in STATUS_LABEL ? t(`detail.statusLabel.${termin.status}`) : termin.status)

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
    return subscribeWhenAuthed(supabase, () =>
      supabase
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
        ),
    )
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
        <div className="rounded-2xl bg-success-soft border border-success/30 px-4 py-3 flex items-center gap-3">
          <CheckCircle2Icon className="w-5 h-5 text-success flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-success-strong">{t('detail.besichtigungLaeuftTitle')}</p>
            <p className="text-xs text-success-strong/80">
              {t('detail.besichtigungLaeuftText')}
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
          <ArrowLeftIcon className="w-3 h-3" /> {t('detail.backLink')}
        </Link>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1">
          {t('detail.gutachterTermin')}
        </p>
        <PageHeader
          title={datum}
          description={
            <>
              <CalendarIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-claimondo-ondo" />
              {uhrzeit}{endzeit ? ` – ${endzeit}` : ''} {t('detail.uhrSuffix')}
            </>
          }
          actions={
            <TerminStatusBadge
              status={termin.status}
              label={statusLabel}
              icon={<StatusIcon className="w-3 h-3" />}
              className="shrink-0"
            />
          }
          size="lg"
        />

        {fall.claim_nummer && (
          <p className="text-xs text-claimondo-ondo mt-2">
            {t('detail.fallPrefix')} {fall.claim_nummer}
            {fall.kennzeichen ? ` · ${fall.kennzeichen}` : ''}
            {fall.fahrzeug ? ` · ${fall.fahrzeug}` : ''}
          </p>
        )}
      </div>

      {/* Live-Tracking-Banner (nur wenn SV unterwegs ODER bald losfährt) */}
      {isUnterwegs && termin.kunden_tracking_token && (
        <Link
          href={`/kunde/termin/${termin.kunden_tracking_token}`}
          className="block rounded-2xl border-2 border-success/30 bg-success-soft p-4 hover:bg-success/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-success-strong">
                {t('detail.svUnterwegs', { name: sv.name ?? t('detail.svFallback') })}
              </p>
              <p className="text-xs text-success-strong mt-0.5">
                {termin.sv_eta_minuten != null
                  ? t('detail.etaMitMinuten', { minuten: termin.sv_eta_minuten })
                  : t('detail.etaOhneMinuten')}
              </p>
            </div>
            <span className="text-success-strong text-lg">→</span>
          </div>
        </Link>
      )}

      {/* Gutachter-Karte */}
      {sv.name && (
        <div className="rounded-2xl border border-claimondo-border bg-white p-4 md:p-5">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-3">
            {t('detail.svHeading')}
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
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success-strong bg-success-soft border border-success/30 rounded-full px-2 py-0.5">
                    <ShieldCheckIcon className="w-2.5 h-2.5" />
                    {t('detail.verifiziert')}
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
              {t('detail.besichtigungsort')}
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
                title={t('detail.karteTitle')}
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
                {t('detail.routeOeffnen')}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Termin verwalten / Gegenvorschlag beantworten → Fall-Kalender (Verwaltungs-Flaeche).
          Fix: zeigte vorher auf die Live-Tracking-Route (/kunde/termin/[token]), die nur den
          kunden_tracking_token akzeptiert — der bei reserviert/gegenvorschlag ~immer null ist
          (lazy erst bei "SV losgefahren") → Fallback ablehnen_token matchte nie → 404. */}
      {termin.ablehnen_token &&
        (termin.status === 'reserviert' || termin.status === 'gegenvorschlag') && (
          <Link
            href={`/kunde/faelle/${fall.id}/kalender`}
            className="block rounded-2xl border border-warning/30 bg-warning-soft p-4 hover:bg-warning/15 transition-colors text-warning-strong text-sm"
          >
            {termin.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'sv'
              ? t('detail.gegenvorschlagAntworten')
              : t('detail.terminVerwalten')}
          </Link>
        )}

      {/* CTA Fallakte */}
      <div className="pt-1">
        <Link
          href={`/kunde/faelle/${fall.id}`}
          className="inline-flex w-full items-center justify-center gap-2 min-h-[48px] rounded-ios-xl bg-claimondo-ondo text-white text-sm font-semibold hover:bg-claimondo-shield transition-colors"
        >
          <CarIcon className="w-4 h-4" />
          {t('detail.zurFallakte')}
        </Link>
      </div>
    </div>
  )
}
