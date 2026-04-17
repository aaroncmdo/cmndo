// AAR-449: Meine-Fälle-Karte mit 4 Zonen (Header, Identifier, Nächster Termin,
// Action-Hint, Footer). Ersetzt die alten Mini-Cards auf /kunde und
// /kunde/faelle. Nutzt getKundenJetztZuTun (AAR-432) als Single-Source
// für Action-Hints und CSS-Tokens var(--brand-*) für Whitelabeling.

import Link from 'next/link'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

export type FallKarteTermin = {
  typ: 'sv_begutachtung' | 'kb_beratung'
  start_zeit: string
  kanal: string | null
  video_link: string | null
  adresse: string | null
  sv_unterwegs_seit: string | null
  sv_angekommen_am: string | null
  sv_eta_minuten: number | null
}

export type FallKarteProps = {
  fall: {
    id: string
    fall_nummer: string | null
    status: string | null
    kennzeichen: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    schadens_datum: string | null
  }
  aktion: KundeAktion | null
  nextTermin: FallKarteTermin | null
  lastUpdate: string | null
  ungeleseneNachrichten?: number
}

function fmtTerminKompakt(iso: string): string {
  try {
    const d = new Date(iso)
    const datum = d.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    })
    const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    return `${datum} · ${zeit} Uhr`
  } catch {
    return iso
  }
}

function fmtRelativUpdate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    if (diff < 0) return 'gerade eben'
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'gerade eben'
    if (min < 60) return `vor ${min} Min.`
    const h = Math.floor(min / 60)
    if (h < 24) return `vor ${h} Std.`
    const tage = Math.floor(h / 24)
    if (tage < 30) return `vor ${tage} Tag${tage === 1 ? '' : 'en'}`
    const monate = Math.floor(tage / 30)
    return `vor ${monate} Monat${monate === 1 ? '' : 'en'}`
  } catch {
    return ''
  }
}

// Welche Aktions-Typen rechtfertigen einen prominenten Action-Hint?
const HINT_AKTIONSTYPEN = new Set([
  'onboarding-offen',
  'pflichtdokumente-offen',
  'polizeibericht-fehlt',
  'daten-an-kanzlei',
  'vollmacht-unterschreiben',
  'termin-bestaetigen',
])

function statusPillStyle(status: string | null): { bg: string; color: string; label: string } {
  const s = (status ?? '').toLowerCase()
  if (s === 'abgeschlossen') {
    return {
      bg: 'var(--brand-success-soft, #ecfdf5)',
      color: 'var(--brand-success, #16a34a)',
      label: 'abgeschlossen',
    }
  }
  if (s === 'storniert') {
    return {
      bg: 'var(--brand-surface-muted, #f3f4f6)',
      color: 'var(--brand-text-secondary, #6b7280)',
      label: 'storniert',
    }
  }
  if (s.startsWith('vs-') || s === 'anschlussschreiben-versendet') {
    return {
      bg: 'var(--brand-warning-soft, #fffbeb)',
      color: 'var(--brand-warning, #d97706)',
      label: status ?? '',
    }
  }
  return {
    bg: 'var(--brand-primary-soft, #eff6ff)',
    color: 'var(--brand-accent, #4573A2)',
    label: status ?? '—',
  }
}

export default function FallKarte({
  fall,
  aktion,
  nextTermin,
  lastUpdate,
  ungeleseneNachrichten,
}: FallKarteProps) {
  const fahrzeug = [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ')
  const statusPill = statusPillStyle(fall.status)
  const abgeschlossen = (fall.status ?? '').toLowerCase() === 'abgeschlossen'

  const showHint = !!aktion && HINT_AKTIONSTYPEN.has(aktion.state) && !abgeschlossen

  const isVideoTermin = nextTermin?.typ === 'kb_beratung' || nextTermin?.kanal === 'video'
  const svLive = nextTermin?.sv_unterwegs_seit || nextTermin?.sv_angekommen_am

  return (
    <Link
      href={`/kunde/faelle/${fall.id}`}
      className={`block rounded-xl border shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] ${abgeschlossen ? 'opacity-75' : ''}`}
      style={{
        background: 'var(--brand-surface, #ffffff)',
        borderColor: 'var(--brand-border, #e5e7eb)',
      }}
    >
      <div className="p-4 space-y-3">
        {/* Zone 1: Header — Fall-Nummer + Status-Pill */}
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
          >
            {fall.fall_nummer ?? fall.id.slice(0, 8)}
          </p>
          <div className="flex items-center gap-1.5">
            {typeof ungeleseneNachrichten === 'number' && ungeleseneNachrichten > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: 'var(--brand-accent, #4573A2)',
                  color: 'var(--brand-text-on-primary, #ffffff)',
                }}
              >
                {ungeleseneNachrichten}
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: statusPill.bg, color: statusPill.color }}
            >
              {statusPill.label}
            </span>
          </div>
        </div>

        {/* Zone 2: Identifier — Fahrzeug + Kennzeichen + Schadens-Datum */}
        <div
          className="space-y-0.5 text-sm"
          style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
        >
          {(fahrzeug || fall.kennzeichen) && (
            <p className="flex items-center gap-1.5">
              <span aria-hidden>🚗</span>
              <span>
                {fahrzeug}
                {fahrzeug && fall.kennzeichen ? ' · ' : ''}
                {fall.kennzeichen ?? ''}
              </span>
            </p>
          )}
          {fall.schadens_datum && (
            <p
              className="text-xs"
              style={{ color: 'var(--brand-text-muted, #9ca3af)' }}
            >
              Unfall: {new Date(fall.schadens_datum).toLocaleDateString('de-DE')}
            </p>
          )}
        </div>

        {/* Zone 3: Nächster Termin — kompakt */}
        {nextTermin && (
          <div
            className="rounded-md border px-3 py-2 text-xs"
            style={{
              borderColor: 'var(--brand-border, #e5e7eb)',
              background: 'var(--brand-surface-muted, #f8f9fb)',
            }}
          >
            {svLive ? (
              <p
                className="flex items-center gap-1.5 font-medium"
                style={{ color: 'var(--brand-success, #16a34a)' }}
              >
                <span className="relative inline-flex h-2 w-2">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                    style={{ background: 'var(--brand-success, #16a34a)' }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ background: 'var(--brand-success, #16a34a)' }}
                  />
                </span>
                {nextTermin.sv_angekommen_am
                  ? 'Gutachter ist vor Ort'
                  : `Gutachter unterwegs${nextTermin.sv_eta_minuten ? ` · ETA ${nextTermin.sv_eta_minuten} Min.` : ''}`}
              </p>
            ) : (
              <>
                <p
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
                >
                  <span aria-hidden>{isVideoTermin ? '🎥' : '📅'}</span>
                  {isVideoTermin ? 'Videocall · ' : 'Nächster Termin · '}
                  {fmtTerminKompakt(nextTermin.start_zeit)}
                </p>
                {!isVideoTermin && nextTermin.adresse && (
                  <p
                    className="mt-0.5 truncate"
                    style={{ color: 'var(--brand-text-secondary, #6b7280)' }}
                  >
                    {nextTermin.adresse}
                  </p>
                )}
                {isVideoTermin && nextTermin.video_link && (
                  <p
                    className="mt-0.5 truncate"
                    style={{ color: 'var(--brand-accent, #4573A2)' }}
                  >
                    Meet-Link im Fall hinterlegt
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Zone 4: Action-Hint */}
        {showHint && aktion && (
          <div
            className="rounded-md border px-3 py-2 text-xs"
            style={{
              background: 'var(--brand-warning-soft, #fffbeb)',
              borderColor: 'var(--brand-warning, #d97706)',
              color: 'var(--brand-warning, #92400e)',
            }}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <span aria-hidden>⚠️</span>
              Aktion erforderlich
            </p>
            <p className="mt-0.5">{aktion.titel}</p>
          </div>
        )}

        {/* Footer: zuletzt aktualisiert */}
        {lastUpdate && (
          <p
            className="text-[11px]"
            style={{ color: 'var(--brand-text-muted, #9ca3af)' }}
          >
            Zuletzt aktualisiert {fmtRelativUpdate(lastUpdate)}
          </p>
        )}
      </div>
    </Link>
  )
}
