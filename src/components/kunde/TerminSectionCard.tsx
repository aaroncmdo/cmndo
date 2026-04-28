// AAR-448: Vollwertige Termin-Detail-Card für das Kunden-Portal.
// Zeigt SV-Begutachtung ODER KB-Videotermin mit allen Metadaten und
// Quick-Actions (Anrufen, Navigieren, Verschieben, Absagen, ICS-Export).

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import TerminReschedulingModal from './TerminReschedulingModal'
import { toInitials } from '@/components/shared/KundeAvatar'
import { createClient } from '@/lib/supabase/client'

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
    return new Date(iso).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtZeitRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return ''
  try {
    const s = new Date(startIso)
    const sTxt = s.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    if (!endIso) return `${sTxt} Uhr`
    const e = new Date(endIso)
    const eTxt = e.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    return `${sTxt} — ${eTxt} Uhr`
  } catch {
    return ''
  }
}

function fmtRelativ(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso).getTime()
    const diff = d - Date.now()
    const min = Math.round(diff / 60000)
    const h = Math.round(diff / 3_600_000)
    const tage = Math.round(diff / 86_400_000)
    if (diff < 0) {
      const absTage = Math.abs(tage)
      if (absTage >= 1) return `vor ${absTage} Tag${absTage === 1 ? '' : 'en'}`
      const absH = Math.abs(h)
      if (absH >= 1) return `vor ${absH} Std.`
      return `vor ${Math.abs(min)} Min.`
    }
    if (tage >= 1) return `in ${tage} Tag${tage === 1 ? '' : 'en'}`
    if (h >= 1) return `in ${h} Std.`
    return `in ${Math.max(1, min)} Min.`
  } catch {
    return ''
  }
}

type StatusConfig = { label: string; cls: string }

function getStatusConfig(termin: TerminSectionProps['termin']): StatusConfig {
  const now = Date.now()
  const startMs = termin.start_zeit ? new Date(termin.start_zeit).getTime() : NaN
  const endMs = termin.end_zeit ? new Date(termin.end_zeit).getTime() : startMs + 60 * 60 * 1000

  if (termin.sv_angekommen_am) return { label: 'Läuft gerade', cls: 'bg-emerald-50 text-emerald-700' }
  if (termin.sv_unterwegs_seit) return { label: 'Auf dem Weg', cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
  if (termin.status === 'reserviert' || termin.status === 'gegenvorschlag')
    return { label: 'Vorgeschlagen', cls: 'bg-amber-50 text-amber-700' }
  if (termin.status === 'bestaetigt') {
    if (!Number.isNaN(startMs) && now >= startMs && now <= endMs)
      return { label: 'Läuft gerade', cls: 'bg-emerald-50 text-emerald-700' }
    if (!Number.isNaN(startMs) && startMs > now && startMs - now < 2 * 3_600_000)
      return { label: 'In Kürze', cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
    if (!Number.isNaN(startMs) && endMs < now)
      return { label: 'Vergangen', cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
    return { label: 'Bestätigt', cls: 'bg-emerald-50 text-emerald-700' }
  }
  if (termin.status === 'abgesagt' || termin.status === 'storniert')
    return { label: 'Abgesagt', cls: 'bg-red-50 text-red-600' }
  if (termin.status === 'verschoben')
    return { label: 'Verschoben', cls: 'bg-amber-50 text-amber-700' }
  return { label: termin.status, cls: 'bg-[#f8f9fb] text-claimondo-ondo' }
}

export default function TerminSectionCard({ termin, gegenueber }: TerminSectionProps) {
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
    const channel = supabase
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
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [termin.id, termin.typ])

  const liveTermin = { ...termin, ...liveTracking }

  const isVideo = termin.typ === 'kb_beratung' || termin.kanal === 'video'
  const headerTitel = isVideo ? 'Videoberatungstermin' : 'SV-Termin'

  const mapsHref = useMemo(() => {
    if (isVideo || !termin.adresse) return null
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(termin.adresse)}`
  }, [termin.adresse, isVideo])

  const icsHref = `/api/kunde/termin/ics/${termin.id}`
  const showAktionen = !['abgesagt', 'storniert', 'abgeschlossen'].includes(localStatus)

  function handleAbsagen() {
    if (!window.confirm('Sind Sie sicher, dass Sie den Termin absagen möchten? Ihr Betreuer wird informiert.')) return
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
          setLocalError(json?.error ?? 'Fehler beim Absagen.')
          return
        }
        setLocalStatus('abgesagt')
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : 'Netzwerkfehler')
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

  const relativ = fmtRelativ(termin.start_zeit)
  const isLive = !!liveTermin.sv_angekommen_am || !!liveTermin.sv_unterwegs_seit
  const { label: statusLabel, cls: statusCls } = getStatusConfig({ ...liveTermin, status: localStatus })

  return (
    <section
      className="relative glass-light border border-claimondo-border rounded-ios-md shadow-ios-sm px-4 py-4"
      aria-labelledby={`termin-${termin.id}-title`}
    >
      {isLive && (
        <span aria-hidden className="absolute top-3 right-3 inline-flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-emerald-500" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
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
            {fmtZeitRange(termin.start_zeit, termin.end_zeit)}
            {relativ && (
              <span className="ml-2 text-xs text-claimondo-ondo">· {relativ}</span>
            )}
          </p>
        </div>
      )}

      {/* Live-Info (ETA) — CMM-36 Realtime: tickt sobald sv_eta_minuten/_*-Felder
          auf gutachter_termine geändert werden. */}
      {liveTermin.sv_unterwegs_seit && !liveTermin.sv_angekommen_am && (
        <p className="mt-2 text-xs font-medium text-claimondo-ondo">
          {gegenueber?.name ? `${gegenueber.name.split(' ')[0]} ist unterwegs` : 'Ihr Gutachter ist unterwegs'}
          {liveTermin.sv_eta_minuten != null && ` — Ankunft in ca. ${liveTermin.sv_eta_minuten} Min.`}
        </p>
      )}
      {liveTermin.sv_angekommen_am && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          {gegenueber?.name ? `${gegenueber.name.split(' ')[0]} ist vor Ort.` : 'Ihr Gutachter ist vor Ort.'}
        </p>
      )}

      {/* Ort oder Video-Link */}
      {isVideo && termin.video_link ? (
        <div className="mt-4 space-y-2">
          <a
            href={termin.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm px-4 text-sm font-medium bg-claimondo-navy text-white hover:bg-claimondo-ondo transition-colors"
          >
            <span aria-hidden>🎥</span> Videocall beitreten
          </a>
          <button
            type="button"
            onClick={handleCopyMeet}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-ios-sm border border-claimondo-border px-3 text-xs ml-0 md:ml-2 text-claimondo-ondo hover:text-claimondo-navy"
          >
            {copyLinkOk ? 'Link kopiert!' : 'Link kopieren'}
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
              Route in Maps öffnen →
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
              {gegenueber.name ?? (gegenueber.rolle === 'sachverstaendiger' ? 'Ihr Gutachter' : 'Ihr Betreuer')}
            </p>
            <p className="text-[11px] text-claimondo-ondo">
              {gegenueber.rolle === 'sachverstaendiger' ? 'Ihr Kfz-Sachverständiger' : 'Ihr Kundenbetreuer'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gegenueber.telefon && (
              <a
                href={`tel:${gegenueber.telefon}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
                aria-label={`${gegenueber.name ?? 'Kontakt'} anrufen`}
              >
                <span aria-hidden>📞</span> Anrufen
              </a>
            )}
            {gegenueber.email && (
              <a
                href={`mailto:${gegenueber.email}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
                aria-label="E-Mail schreiben"
              >
                <span aria-hidden>✉️</span> E-Mail
              </a>
            )}
          </div>
        </div>
      )}

      {/* Vorbereitung */}
      {isVideo ? (
        <ul className="mt-3 space-y-1 text-xs text-claimondo-ondo">
          <li>• Kamera und Mikrofon vor dem Termin testen</li>
          <li>• Ruhige Umgebung mit guter Beleuchtung wählen</li>
        </ul>
      ) : (
        <ul className="mt-3 space-y-1 text-xs text-claimondo-ondo">
          <li>• Alle Schäden am Fahrzeug zugänglich machen</li>
          <li>• Kennzeichen und Fahrzeugschein bereithalten</li>
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
            <span aria-hidden>📅</span> Verschieben
          </button>
          <button
            type="button"
            onClick={handleAbsagen}
            disabled={absagenPending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-rose-300 px-3 text-xs font-medium text-rose-600 disabled:opacity-60 hover:bg-rose-50"
          >
            {absagenPending ? 'Wird abgesagt…' : 'Absagen'}
          </button>
          <a
            href={icsHref}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-ios-sm border border-claimondo-border px-3 text-xs font-medium text-claimondo-ondo hover:bg-claimondo-bg"
          >
            <span aria-hidden>📥</span> Zum Kalender hinzufügen
          </a>
        </div>
      )}

      {localStatus === 'abgesagt' && (
        <p className="mt-3 text-xs font-medium text-rose-600">
          Termin abgesagt. Ihr Betreuer wurde informiert und meldet sich bei Ihnen.
        </p>
      )}
      {localError && (
        <p className="mt-3 text-xs text-rose-600">{localError}</p>
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
