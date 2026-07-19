// AAR-448: Vollwertige Termin-Detail-Card für das Kunden-Portal.
// Zeigt SV-Begutachtung ODER KB-Videotermin mit allen Metadaten und
// Quick-Actions (Anrufen, Navigieren, Verschieben, Absagen, ICS-Export).

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import TerminReschedulingModal from './TerminReschedulingModal'
import { toInitials } from '@/components/shared/KundeAvatar'
import { createClient } from '@/lib/supabase/client'
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'

// Portal-i18n: Übersetzer-Typ für die modul-lokalen Helfer (fmtZeitRange/
// fmtRelativ/getStatusConfig). useTranslations liefert genau diese Aufruf-Form.
type Translator = ((key: string, values?: Record<string, string | number>) => string)

export type TerminSectionProps = {
  termin: {
    id: string
    typ: 'sv_begutachtung' | 'kb_beratung'
    status: string
    start_zeit: string | null
    end_zeit: string | null
    kanal: string | null
    video_link: string | null
    sv_unterwegs_seit: string | null
    sv_angekommen_am: string | null
    sv_eta_minuten: number | null
    adresse: string | null
  }
  gegenueber: {
    rolle: 'sachverstaendiger' | 'kundenbetreuer'
    name: string | null
    telefon: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

function fmtDatum(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// Portal-i18n: uhrSuffix wird aus dem `terminSection`-Namespace gereicht
// (de: " Uhr", EN leer). Default hält das de-Verhalten byte-exakt.
function fmtZeitRange(startIso: string | null, endIso: string | null, uhrSuffix = ' Uhr'): string {
  if (!startIso) return ''
  try {
    const s = new Date(startIso)
    const sTxt = s.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    if (!endIso) return `${sTxt}${uhrSuffix}`
    const e = new Date(endIso)
    const eTxt = e.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
    return `${sTxt} — ${eTxt}${uhrSuffix}`
  } catch {
    return ''
  }
}

// Portal-i18n: relative Zeit über ICU-Plurale (terminSection.relativ.*).
function fmtRelativ(iso: string | null, t: Translator): string {
  if (!iso) return ''
  try {
    const d = new Date(iso).getTime()
    const diff = d - Date.now()
    const min = Math.round(diff / 60000)
    const h = Math.round(diff / 3_600_000)
    const tage = Math.round(diff / 86_400_000)
    if (diff < 0) {
      const absTage = Math.abs(tage)
      if (absTage >= 1) return t('relativ.vorTage', { count: absTage })
      const absH = Math.abs(h)
      if (absH >= 1) return t('relativ.vorStunden', { count: absH })
      return t('relativ.vorMinuten', { count: Math.abs(min) })
    }
    if (tage >= 1) return t('relativ.inTage', { count: tage })
    if (h >= 1) return t('relativ.inStunden', { count: h })
    return t('relativ.inMinuten', { count: Math.max(1, min) })
  } catch {
    return ''
  }
}

type StatusConfig = { label: string; cls: string }

function getStatusConfig(termin: TerminSectionProps['termin'], t: Translator): StatusConfig {
  const now = Date.now()
  const startMs = termin.start_zeit ? new Date(termin.start_zeit).getTime() : NaN
  const endMs = termin.end_zeit ? new Date(termin.end_zeit).getTime() : startMs + 60 * 60 * 1000

  if (termin.sv_angekommen_am) return { label: t('status.laeuftGerade'), cls: 'bg-success-soft text-success-strong' }
  if (termin.sv_unterwegs_seit) return { label: t('status.aufDemWeg'), cls: 'bg-claimondo-bg text-claimondo-ondo' }
  if (termin.status === 'reserviert' || termin.status === 'gegenvorschlag')
    return { label: t('status.vorgeschlagen'), cls: 'bg-warning-soft text-warning-strong' }
  if (termin.status === 'bestaetigt') {
    if (!Number.isNaN(startMs) && now >= startMs && now <= endMs)
      return { label: t('status.laeuftGerade'), cls: 'bg-success-soft text-success-strong' }
    if (!Number.isNaN(startMs) && startMs > now && startMs - now < 2 * 3_600_000)
      return { label: t('status.inKuerze'), cls: 'bg-claimondo-bg text-claimondo-ondo' }
    if (!Number.isNaN(startMs) && endMs < now)
      return { label: t('status.vergangen'), cls: 'bg-claimondo-bg text-claimondo-ondo' }
    return { label: t('status.bestaetigt'), cls: 'bg-success-soft text-success-strong' }
  }
  if (termin.status === 'abgesagt' || termin.status === 'storniert')
    return { label: t('status.abgesagt'), cls: 'bg-danger-soft text-danger' }
  if (termin.status === 'verschoben')
    return { label: t('status.verschoben'), cls: 'bg-warning-soft text-warning-strong' }
  return { label: termin.status, cls: 'bg-claimondo-bg text-claimondo-ondo' }
}

export default function TerminSectionCard({ termin, gegenueber }: TerminSectionProps) {
  const t = useTranslations('terminSection')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [absagenPending, startAbsagen] = useTransition()
  const [localStatus, setLocalStatus] = useState(termin.status)
  const [localError, setLocalError] = useState<string | null>(null)
  const [copyLinkOk, setCopyLinkOk] = useState(false)
  // CMM-36: Live-Tracking-Felder spiegeln, damit das Banner ohne Page-Refresh
  // tickt sobald der SV losfährt / ETA neu rechnet / ankommt.
  const [liveTracking, setLiveTracking] = useState({
    sv_unterwegs_seit: termin.sv_unterwegs_seit,
    sv_angekommen_am: termin.sv_angekommen_am,
    sv_eta_minuten: termin.sv_eta_minuten,
  })

  useEffect(() => {
    if (termin.typ !== 'sv_begutachtung') return
    const supabase = createClient()
    return subscribeWhenAuthed(supabase, () =>
      supabase
        .channel(`termin-live-${termin.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'gutachter_termine', filter: `id=eq.${termin.id}` },
          (payload) => {
            const row = payload.new as {
              sv_unterwegs_seit: string | null
              sv_angekommen_am: string | null
              sv_eta_minuten: number | null
            }
            setLiveTracking({
              sv_unterwegs_seit: row.sv_unterwegs_seit,
              sv_angekommen_am: row.sv_angekommen_am,
              sv_eta_minuten: row.sv_eta_minuten,
            })
          },
        ),
    )
  }, [termin.id, termin.typ])

  const liveTermin = { ...termin, ...liveTracking }

  const isVideo = termin.typ === 'kb_beratung' || termin.kanal === 'video'
  const headerTitel = isVideo ? t('headerVideo') : t('headerSv')

  const mapsHref = useMemo(() => {
    if (isVideo || !termin.adresse) return null
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(termin.adresse)}`
  }, [termin.adresse, isVideo])

  const icsHref = `/api/kunde/termin/ics/${termin.id}`
  const showAktionen = !['abgesagt', 'storniert', 'abgeschlossen'].includes(localStatus)

  function handleAbsagen() {
    if (!window.confirm(t('absagenConfirm'))) return
    setLocalError(null)
    startAbsagen(async () => {
      try {
        const res = await fetch('/api/kunde/termin/absagen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ termin_id: termin.id }),
        })
        const json = await res.json()
        if (!res.ok || !json?.success) {
          setLocalError(json?.error ?? t('absagenFehler'))
          return
        }
        setLocalStatus('abgesagt')
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : t('netzwerkfehler'))
      }
    })
  }

  function handleCopyMeet() {
    if (!termin.video_link) return
    try {
      navigator.clipboard.writeText(termin.video_link)
      setCopyLinkOk(true)
      setTimeout(() => setCopyLinkOk(false), 1800)
    } catch {
      /* ignore */
    }
  }

  const relativ = fmtRelativ(termin.start_zeit, t)
  const isLive = !!liveTermin.sv_angekommen_am || !!liveTermin.sv_unterwegs_seit
  const { label: statusLabel, cls: statusCls } = getStatusConfig({ ...liveTermin, status: localStatus }, t)

  return (
    <section
      className="relative glass-light border border-claimondo-border rounded-ios-md shadow-ios-sm px-4 py-4"
      aria-labelledby={`termin-${termin.id}-title`}
    >
      {isLive && (
        <span aria-hidden className="absolute top-3 right-3 inline-flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-success" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`termin-${termin.id}-title`}
          className="flex items-center gap-2 text-sm font-semibold text-claimondo-navy"
        >
          <span aria-hidden>{isVideo ? '🎥' : '🔧'}</span>
          {headerTitel}
        </h2>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      {/* Datum + Uhrzeit */}
      {termin.start_zeit && (
        <div className="mt-3">
          <p className="text-base font-semibold text-claimondo-navy">
            {fmtDatum(termin.start_zeit)}
          </p>
          <p className="text-sm text-claimondo-ondo">
            {fmtZeitRange(termin.start_zeit, termin.end_zeit, t('uhrSuffix'))}
            {relativ && (
              <span className="ml-2 text-xs text-claimondo-ondo">· {relativ}</span>
            )}
          </p>
        </div>
      )}

      {/* CMM-36: Inline-Live-Info entfernt — der KundeSvLiveBanner ganz oben
          auf der Fallseite ist die einzige Stelle für SV-Anfahrt + Ankunft.
          Der grüne Live-Punkt rechts oben (isLive) bleibt als Mini-Indikator. */}

      {/* Ort oder Video-Link */}
      {isVideo && termin.video_link ? (
        <div className="mt-4 space-y-2">
          <a
            href={termin.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm px-4 text-sm font-medium bg-claimondo-navy text-white hover:bg-claimondo-ondo transition-colors"
          >
            <span aria-hidden>🎥</span> {t('videocallBeitreten')}
          </a>
          <button
            type="button"
            onClick={handleCopyMeet}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm border border-claimondo-border px-3 text-xs ml-0 md:ml-2 text-claimondo-ondo hover:text-claimondo-navy"
          >
            {copyLinkOk ? t('linkKopiert') : t('linkKopieren')}
          </button>
        </div>
      ) : termin.adresse ? (
        <div className="mt-4">
          <p className="text-sm text-claimondo-navy">
            <span aria-hidden>📍</span> {termin.adresse}
          </p>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm px-4 text-xs font-medium bg-claimondo-ondo text-white hover:bg-claimondo-navy transition-colors"
            >
              {t('routeInMaps')}
            </a>
          )}
        </div>
      ) : null}

      {/* Gegenüber */}
      {gegenueber && (
        <div className="mt-4 flex items-center gap-3 rounded-ios-sm border border-claimondo-border p-3 bg-claimondo-bg">
          <div className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden text-xs font-semibold bg-claimondo-navy text-white">
            {gegenueber.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gegenueber.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              toInitials(gegenueber.name) || '?'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-claimondo-navy">
              {gegenueber.name ?? (gegenueber.rolle === 'sachverstaendiger' ? t('gutachterFallback') : t('betreuerFallback'))}
            </p>
            <p className="text-[11px] text-claimondo-ondo">
              {gegenueber.rolle === 'sachverstaendiger' ? t('rolleSv') : t('rolleKb')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gegenueber.telefon && (
              <a
                href={`tel:${gegenueber.telefon}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
                aria-label={t('anrufenAria', { name: gegenueber.name ?? t('kontaktFallback') })}
              >
                <span aria-hidden>📞</span> {t('anrufen')}
              </a>
            )}
            {gegenueber.email && (
              <a
                href={`mailto:${gegenueber.email}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
                aria-label={t('emailAria')}
              >
                <span aria-hidden>✉️</span> {t('email')}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Vorbereitung */}
      {isVideo ? (
        <ul className="mt-3 space-y-1 text-xs text-claimondo-ondo">
          <li>{t('vorbereitungVideo1')}</li>
          <li>{t('vorbereitungVideo2')}</li>
        </ul>
      ) : (
        <ul className="mt-3 space-y-1 text-xs text-claimondo-ondo">
          <li>{t('vorbereitungSv1')}</li>
          <li>{t('vorbereitungSv2')}</li>
        </ul>
      )}

      {/* Quick-Actions Footer */}
      {showAktionen && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-claimondo-border pt-3">
          <button
            type="button"
            onClick={() => setRescheduleOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
          >
            <span aria-hidden>📅</span> {t('verschieben')}
          </button>
          <button
            type="button"
            onClick={handleAbsagen}
            disabled={absagenPending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-danger/30 px-3 text-xs font-medium text-danger disabled:opacity-60 hover:bg-danger-soft"
          >
            {absagenPending ? t('wirdAbgesagt') : t('absagen')}
          </button>
          <a
            href={icsHref}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-ondo hover:bg-claimondo-bg"
          >
            <span aria-hidden>📥</span> {t('zumKalender')}
          </a>
        </div>
      )}

      {localStatus === 'abgesagt' && (
        <p className="mt-3 text-xs font-medium text-danger">
          {t('abgesagtHinweis')}
        </p>
      )}
      {localError && (
        <p className="mt-3 text-xs text-danger">{localError}</p>
      )}

      <TerminReschedulingModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        terminId={termin.id}
        terminTyp={termin.typ}
      />
    </section>
  )
}
