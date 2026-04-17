// AAR-448: Vollwertige Termin-Detail-Card für das Kunden-Portal.
// Zeigt SV-Begutachtung ODER KB-Videotermin mit allen Metadaten und
// Quick-Actions (Anrufen, Navigieren, Verschieben, Absagen, ICS-Export).

'use client'

import { useMemo, useState, useTransition } from 'react'
import TerminReschedulingModal from './TerminReschedulingModal'

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

function StatusPill({ termin }: { termin: TerminSectionProps['termin'] }) {
  const now = Date.now()
  const startMs = termin.start_zeit ? new Date(termin.start_zeit).getTime() : NaN
  const endMs = termin.end_zeit ? new Date(termin.end_zeit).getTime() : startMs + 60 * 60 * 1000

  let label = ''
  let bg = 'var(--brand-surface-muted, #f3f4f6)'
  let color = 'var(--brand-text-secondary, #4b5563)'

  if (termin.sv_angekommen_am) {
    label = 'Läuft gerade'
    bg = 'var(--brand-success-soft, #ecfdf5)'
    color = 'var(--brand-success, #16a34a)'
  } else if (termin.sv_unterwegs_seit) {
    label = 'Auf dem Weg'
    bg = 'var(--brand-primary-soft, #eff6ff)'
    color = 'var(--brand-accent, #4573A2)'
  } else if (termin.status === 'reserviert' || termin.status === 'gegenvorschlag') {
    label = 'Vorgeschlagen'
    bg = 'var(--brand-warning-soft, #fffbeb)'
    color = 'var(--brand-warning, #d97706)'
  } else if (termin.status === 'bestaetigt') {
    if (!Number.isNaN(startMs) && now >= startMs && now <= endMs) {
      label = 'Läuft gerade'
      bg = 'var(--brand-success-soft, #ecfdf5)'
      color = 'var(--brand-success, #16a34a)'
    } else if (!Number.isNaN(startMs) && startMs > now && startMs - now < 2 * 3_600_000) {
      label = 'In Kürze'
      bg = 'var(--brand-primary-soft, #eff6ff)'
      color = 'var(--brand-accent, #4573A2)'
    } else if (!Number.isNaN(startMs) && endMs < now) {
      label = 'Vergangen'
    } else {
      label = 'Bestätigt'
      bg = 'var(--brand-success-soft, #ecfdf5)'
      color = 'var(--brand-success, #16a34a)'
    }
  } else if (termin.status === 'abgesagt' || termin.status === 'storniert') {
    label = 'Abgesagt'
  } else if (termin.status === 'verschoben') {
    label = 'Verschoben'
  } else {
    label = termin.status
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  )
}

export default function TerminSectionCard({ termin, gegenueber }: TerminSectionProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [absagenPending, startAbsagen] = useTransition()
  const [localStatus, setLocalStatus] = useState(termin.status)
  const [localError, setLocalError] = useState<string | null>(null)
  const [copyLinkOk, setCopyLinkOk] = useState(false)

  const isVideo = termin.typ === 'kb_beratung' || termin.kanal === 'video'
  const headerIcon = isVideo ? '🎥' : '🔧'
  const headerTitel = isVideo ? 'Videoberatungstermin' : 'SV-Termin'

  const mapsHref = useMemo(() => {
    if (isVideo || !termin.adresse) return null
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(termin.adresse)}`
  }, [termin.adresse, isVideo])

  const icsHref = `/api/kunde/termin/ics/${termin.id}`

  const effectiveStatus = localStatus
  const showAktionen = !['abgesagt', 'storniert', 'abgeschlossen'].includes(effectiveStatus)

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
  const isLive = !!termin.sv_angekommen_am || !!termin.sv_unterwegs_seit

  return (
    <section
      className="relative rounded-xl border px-4 py-4 shadow-sm"
      style={{
        background: 'var(--brand-surface, #ffffff)',
        borderColor: 'var(--brand-border, #e5e7eb)',
      }}
      aria-labelledby={`termin-${termin.id}-title`}
    >
      {isLive && (
        <span aria-hidden className="absolute top-3 right-3 inline-flex h-3 w-3">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ background: 'var(--brand-success, #16a34a)' }}
          />
          <span
            className="relative inline-flex h-3 w-3 rounded-full"
            style={{ background: 'var(--brand-success, #16a34a)' }}
          />
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`termin-${termin.id}-title`}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
        >
          <span aria-hidden>{headerIcon}</span>
          {headerTitel}
        </h2>
        <StatusPill termin={{ ...termin, status: effectiveStatus }} />
      </div>

      {/* Datum + Uhrzeit */}
      {termin.start_zeit && (
        <div className="mt-3">
          <p
            className="text-base font-semibold"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
          >
            {fmtDatum(termin.start_zeit)}
          </p>
          <p
            className="text-sm"
            style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
          >
            {fmtZeitRange(termin.start_zeit, termin.end_zeit)}
            {relativ && (
              <span
                className="ml-2 text-xs"
                style={{ color: 'var(--brand-accent, #4573A2)' }}
              >
                · {relativ}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Live-Info (ETA) */}
      {termin.sv_unterwegs_seit && !termin.sv_angekommen_am && (
        <p
          className="mt-2 text-xs font-medium"
          style={{ color: 'var(--brand-accent, #4573A2)' }}
        >
          Ihr Gutachter ist unterwegs
          {termin.sv_eta_minuten != null && ` — Ankunft in ca. ${termin.sv_eta_minuten} Min.`}
        </p>
      )}
      {termin.sv_angekommen_am && (
        <p
          className="mt-2 text-xs font-medium"
          style={{ color: 'var(--brand-success, #16a34a)' }}
        >
          Ihr Gutachter ist vor Ort.
        </p>
      )}

      {/* Ort oder Video-Link */}
      {isVideo && termin.video_link ? (
        <div className="mt-4 space-y-2">
          <a
            href={termin.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 text-sm font-medium"
            style={{
              background: 'var(--brand-primary, #0D1B3E)',
              color: 'var(--brand-text-on-primary, #ffffff)',
            }}
          >
            <span aria-hidden>🎥</span> Videocall beitreten
          </a>
          <button
            type="button"
            onClick={handleCopyMeet}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-xs ml-0 md:ml-2"
            style={{
              borderColor: 'var(--brand-border, #e5e7eb)',
              color: 'var(--brand-text-secondary, #4b5563)',
            }}
          >
            {copyLinkOk ? 'Link kopiert!' : 'Link kopieren'}
          </button>
        </div>
      ) : termin.adresse ? (
        <div className="mt-4">
          <p
            className="text-sm"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
          >
            <span aria-hidden>📍</span> {termin.adresse}
          </p>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 text-xs font-medium"
              style={{
                background: 'var(--brand-accent, #4573A2)',
                color: 'var(--brand-text-on-primary, #ffffff)',
              }}
            >
              Route in Maps öffnen →
            </a>
          )}
        </div>
      ) : null}

      {/* Gegenüber */}
      {gegenueber && (
        <div
          className="mt-4 flex items-center gap-3 rounded-md border p-3"
          style={{
            borderColor: 'var(--brand-border, #e5e7eb)',
            background: 'var(--brand-surface-muted, #f8f9fb)',
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden text-xs font-semibold"
            style={{
              background: 'var(--brand-primary, #0D1B3E)',
              color: 'var(--brand-text-on-primary, #ffffff)',
            }}
          >
            {gegenueber.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gegenueber.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (gegenueber.name ?? '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('')
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
            >
              {gegenueber.name ?? (gegenueber.rolle === 'sachverstaendiger' ? 'Ihr Gutachter' : 'Ihr Betreuer')}
            </p>
            <p
              className="text-[11px]"
              style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
            >
              {gegenueber.rolle === 'sachverstaendiger' ? 'Ihr Kfz-Sachverständiger' : 'Ihr Kundenbetreuer'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gegenueber.telefon && (
              <a
                href={`tel:${gegenueber.telefon}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 text-xs font-medium"
                style={{
                  borderColor: 'var(--brand-border, #e5e7eb)',
                  color: 'var(--brand-text-primary, #0D1B3E)',
                }}
                aria-label={`${gegenueber.name ?? 'Kontakt'} anrufen`}
              >
                <span aria-hidden>📞</span> Anrufen
              </a>
            )}
            {gegenueber.email && (
              <a
                href={`mailto:${gegenueber.email}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 text-xs font-medium"
                style={{
                  borderColor: 'var(--brand-border, #e5e7eb)',
                  color: 'var(--brand-text-primary, #0D1B3E)',
                }}
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
        <ul
          className="mt-3 space-y-1 text-xs"
          style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
        >
          <li>• Kamera und Mikrofon vor dem Termin testen</li>
          <li>• Ruhige Umgebung mit guter Beleuchtung wählen</li>
        </ul>
      ) : (
        <ul
          className="mt-3 space-y-1 text-xs"
          style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
        >
          <li>• Alle Schäden am Fahrzeug zugänglich machen</li>
          <li>• Kennzeichen und Fahrzeugschein bereithalten</li>
        </ul>
      )}

      {/* Quick-Actions Footer */}
      {showAktionen && (
        <div
          className="mt-4 flex flex-wrap gap-2 border-t pt-3"
          style={{ borderColor: 'var(--brand-border, #e5e7eb)' }}
        >
          <button
            type="button"
            onClick={() => setRescheduleOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 text-xs font-medium"
            style={{
              borderColor: 'var(--brand-border, #e5e7eb)',
              color: 'var(--brand-text-primary, #0D1B3E)',
            }}
          >
            <span aria-hidden>📅</span> Verschieben
          </button>
          <button
            type="button"
            onClick={handleAbsagen}
            disabled={absagenPending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 text-xs font-medium disabled:opacity-60"
            style={{
              borderColor: 'var(--brand-danger, #dc2626)',
              color: 'var(--brand-danger, #dc2626)',
            }}
          >
            {absagenPending ? 'Wird abgesagt…' : 'Absagen'}
          </button>
          <a
            href={icsHref}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border px-3 text-xs font-medium"
            style={{
              borderColor: 'var(--brand-border, #e5e7eb)',
              color: 'var(--brand-text-secondary, #4b5563)',
            }}
          >
            <span aria-hidden>📥</span> Zum Kalender hinzufügen
          </a>
        </div>
      )}

      {localStatus === 'abgesagt' && (
        <p
          className="mt-3 text-xs font-medium"
          style={{ color: 'var(--brand-danger, #dc2626)' }}
        >
          Termin abgesagt. Ihr Betreuer wurde informiert und meldet sich bei Ihnen.
        </p>
      )}
      {localError && (
        <p
          className="mt-3 text-xs"
          style={{ color: 'var(--brand-danger, #dc2626)' }}
        >
          {localError}
        </p>
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
